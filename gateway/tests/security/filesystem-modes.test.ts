import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import {
  FILESYSTEM_LIST,
} from "../../../node/src/tools/filesystem-list.ts";
import {
  FILESYSTEM_READ,
} from "../../../node/src/tools/filesystem-read.ts";
import {
  FILESYSTEM_WRITE,
} from "../../../node/src/tools/filesystem-write.ts";
import { createFilesystemListTool } from "../../../node/src/tools/filesystem-list.ts";
import { createFilesystemReadTool } from "../../../node/src/tools/filesystem-read.ts";
import { createFilesystemWriteTool } from "../../../node/src/tools/filesystem-write.ts";
import {
  createAgentRuntime,
  type AgentEvent,
  type TurnMemory,
} from "../../src/agents/runtime.ts";
import {
  createConfirmationWaiter,
} from "../../src/sessions/confirmation-waiter.ts";
import type { HistoryEntry, Role } from "../../src/memory/history.ts";
import type {
  LLMEvent,
  LLMProvider,
  LLMRequest,
} from "../../src/providers/types.ts";
import { ToolRegistry } from "../../src/tools/registry.ts";

function createFakeMemory(): TurnMemory {
  const conversations = new Set<string>();
  const messages: Array<{
    id: string;
    conversationId: string;
    role: Role;
    content: string;
  }> = [];
  return {
    ensureConversation(conversationId?: string): string {
      if (conversationId && conversations.has(conversationId)) {
        return conversationId;
      }
      const id = conversationId ?? `c_${randomUUID()}`;
      conversations.add(id);
      return id;
    },
    addMessage(conversationId, role, content): string {
      const id = `m_${randomUUID()}`;
      messages.push({ id, conversationId, role, content });
      return id;
    },
    getHistory(conversationId): HistoryEntry[] {
      return messages
        .filter((m) => m.conversationId === conversationId)
        .map((m) => ({ role: m.role, content: m.content }));
    },
  };
}

function createScriptedLLM(
  steps: Array<(request: LLMRequest) => LLMEvent[]>,
): LLMProvider {
  let index = 0;
  return {
    async *stream(request) {
      const step = steps[index];
      if (!step) throw new Error(`FakeLLM: no hay paso ${index}`);
      index += 1;
      for (const event of step(request)) yield event;
    },
  };
}

async function runTurnCollecting(
  events: AsyncIterable<AgentEvent>,
  onConfirm: (req: Extract<AgentEvent, { type: "confirm_request" }>) => void,
): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const event of events) {
    out.push(event);
    if (event.type === "confirm_request") onConfirm(event);
  }
  return out;
}

describe("7G confirmation + filesystem modes", () => {
  it("filesystem.read automatic: 0 confirm_request, 1 execute", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pa-7g-rd-"));
    await writeFile(path.join(root, "a.txt"), "hola", "utf8");
    const inner = createFilesystemReadTool({ root });
    assert.equal(inner.executionMode, "automatic");
    let executes = 0;
    const wrapped = {
      ...inner,
      async execute(input: unknown, ctx: { conversationId: string }) {
        executes += 1;
        return inner.execute(input, ctx);
      },
    };
    const tools2 = new ToolRegistry();
    tools2.register(wrapped);
    const waiter = createConfirmationWaiter({
      sessionId: "ws_rd",
      deviceId: "d1",
      timeoutMs: 5_000,
    });
    const llm = createScriptedLLM([
      () => [
        {
          type: "tool_call",
          id: "c1",
          name: FILESYSTEM_READ.name,
          input: { path: "a.txt" },
        },
        { type: "done" },
      ],
      () => [{ type: "text_delta", text: "ok" }, { type: "done" }],
    ]);
    const events = await runTurnCollecting(
      createAgentRuntime({
        memory: createFakeMemory(),
        llm,
        tools: tools2,
      }).runTurn({
        conversationId: "c",
        sessionId: waiter.sessionId,
        deviceId: "d1",
        userMessage: "lee",
        confirmation: waiter.port,
      }),
      () => {
        assert.fail("read no confirma");
      },
    );
    assert.equal(executes, 1);
    assert.equal(events.some((e) => e.type === "confirm_request"), false);
  });

  it("filesystem.list automatic: 0 confirm_request", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pa-7g-ls-"));
    await mkdir(path.join(root, "sub"));
    const tools = new ToolRegistry();
    const inner = createFilesystemListTool({ root });
    let executes = 0;
    tools.register({
      ...inner,
      async execute(input, ctx) {
        executes += 1;
        return inner.execute(input, ctx);
      },
    });
    const waiter = createConfirmationWaiter({
      sessionId: "ws_ls",
      deviceId: "d1",
      timeoutMs: 5_000,
    });
    const events = await runTurnCollecting(
      createAgentRuntime({
        memory: createFakeMemory(),
        llm: createScriptedLLM([
          () => [
            {
              type: "tool_call",
              id: "c1",
              name: FILESYSTEM_LIST.name,
              input: { path: "." },
            },
            { type: "done" },
          ],
          () => [{ type: "text_delta", text: "ok" }, { type: "done" }],
        ]),
        tools,
      }).runTurn({
        conversationId: "c",
        sessionId: waiter.sessionId,
        deviceId: "d1",
        userMessage: "lista",
        confirmation: waiter.port,
      }),
      () => {
        assert.fail("list no confirma");
      },
    );
    assert.equal(executes, 1);
    assert.equal(events.some((e) => e.type === "confirm_request"), false);
  });

  it("filesystem.write confirm: reject=0 exec; approve=1 exec", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pa-7g-wr-"));
    const inner = createFilesystemWriteTool({ root });
    let executes = 0;
    const tool = {
      ...inner,
      async execute(input: unknown, ctx: { conversationId: string }) {
        executes += 1;
        return inner.execute(input, ctx);
      },
    };
    assert.equal(tool.executionMode, "confirm");

    const run = async (approved: boolean) => {
      executes = 0;
      const tools = new ToolRegistry();
      tools.register(tool);
      const waiter = createConfirmationWaiter({
        sessionId: approved ? "ws_ok" : "ws_no",
        deviceId: "d1",
        timeoutMs: 5_000,
      });
      await runTurnCollecting(
        createAgentRuntime({
          memory: createFakeMemory(),
          llm: createScriptedLLM([
            () => [
              {
                type: "tool_call",
                id: "cw",
                name: FILESYSTEM_WRITE.name,
                input: { path: "out.txt", content: "x" },
              },
              { type: "done" },
            ],
            () => [{ type: "text_delta", text: "ok" }, { type: "done" }],
          ]),
          tools,
        }).runTurn({
          conversationId: "c",
          sessionId: waiter.sessionId,
          deviceId: "d1",
          userMessage: "escribe",
          confirmation: waiter.port,
        }),
        (req) => {
          waiter.respond(req.confirmationId, approved);
        },
      );
      return executes;
    };

    assert.equal(await run(false), 0);
    assert.equal(await run(true), 1);
  });
});
