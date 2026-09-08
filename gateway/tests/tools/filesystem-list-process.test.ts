import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import { FILESYSTEM_LIST } from "../../../node/src/tools/filesystem-list.ts";
import { AGENT_FILESYSTEM_ROOT_ENV } from "../../../node/src/config.ts";
import {
  createAgentRuntime,
  type AgentEvent,
  type TurnMemory,
} from "../../src/agents/runtime.ts";
import {
  createConfirmationWaiter,
  type ConfirmationWaiter,
} from "../../src/sessions/confirmation-waiter.ts";
import type { HistoryEntry, Role } from "../../src/memory/history.ts";
import type { LLMEvent, LLMProvider, LLMRequest } from "../../src/providers/types.ts";
import { createMcpRemoteExecutor, type McpCallToolClient } from "../../src/tools/mcp/executor.ts";
import { connectAgentStdioClient } from "../../src/tools/mcp/stdio.ts";
import { createRemoteAgentTool } from "../../src/tools/remote.ts";
import { ToolRegistry } from "../../src/tools/registry.ts";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function walkTs(dir: string, files: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules") continue;
      walkTs(full, files);
      continue;
    }
    if (name.endsWith(".ts")) files.push(full);
  }
  return files;
}

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

function countingClient(inner: McpCallToolClient): McpCallToolClient & {
  calls: number;
} {
  const state = { calls: 0 };
  return {
    get calls() {
      return state.calls;
    },
    callTool: (params, schema, options) => {
      state.calls += 1;
      return inner.callTool(params, schema, options);
    },
  };
}

function createTestWaiter(): ConfirmationWaiter {
  return createConfirmationWaiter({
    sessionId: "ws_fs_l",
    deviceId: "device-1",
    timeoutMs: 5_000,
  });
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

describe("Hub no implementa filesystem.list", () => {
  it("AgentRuntime no menciona filesystem.list", () => {
    const runtime = readFileSync(
      path.join(repoRoot, "gateway/src/agents/runtime.ts"),
      "utf8",
    );
    assert.doesNotMatch(runtime, /filesystem\.list/);
  });

  it("Hub productivo no registra filesystem.list", () => {
    const src = readFileSync(path.join(repoRoot, "gateway/src/index.ts"), "utf8");
    assert.doesNotMatch(src, /filesystem\.list/);
  });
});

describe("Hub → Agent filesystem.list (automatic + MCP)", () => {
  it("automatic: una llamada MCP, sin confirm_request, resultado al FakeLLM", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pa-hub-ls-"));
    await writeFile(path.join(root, "a.txt"), "x", "utf8");
    await mkdir(path.join(root, "sub"));

    const { client, close } = await connectAgentStdioClient({
      env: { [AGENT_FILESYSTEM_ROOT_ENV]: root },
    });
    try {
      const counted = countingClient(client);
      const executor = createMcpRemoteExecutor(counted);
      const tools = new ToolRegistry();
      tools.register(
        createRemoteAgentTool(
          {
            name: FILESYSTEM_LIST.name,
            description: FILESYSTEM_LIST.description,
            inputSchema: { ...FILESYSTEM_LIST.inputSchema },
            executionMode: FILESYSTEM_LIST.executionMode,
          },
          executor,
        ),
      );
      assert.equal(tools.get(FILESYSTEM_LIST.name)?.executionMode, "automatic");

      const waiter = createTestWaiter();
      const memory = createFakeMemory();
      let sawResult = false;
      const llm = createScriptedLLM([
        () => [
          {
            type: "tool_call",
            id: "call_ls",
            name: FILESYSTEM_LIST.name,
            input: { path: "." },
          },
          { type: "done" },
        ],
        (req) => {
          const last = req.messages[req.messages.length - 1];
          assert.ok(last && Array.isArray(last.content));
          const block = last.content.find((b) => b.type === "tool_result");
          assert.ok(block && block.type === "tool_result");
          assert.equal(block.isError, false);
          assert.match(block.content, /a\.txt/);
          assert.match(block.content, /sub/);
          sawResult = true;
          return [
            { type: "text_delta", text: "Listado" },
            { type: "done" },
          ];
        },
      ]);

      const runtime = createAgentRuntime({ memory, llm, tools });
      const events = await runTurnCollecting(
        runtime.runTurn({
          conversationId: "c_ls",
          sessionId: waiter.sessionId,
          deviceId: "device-1",
          userMessage: "lista",
          confirmation: waiter.port,
        }),
        () => {
          assert.fail("filesystem.list no debe emitir confirm_request");
        },
      );
      assert.equal(counted.calls, 1);
      assert.equal(sawResult, true);
      assert.equal(events.some((e) => e.type === "confirm_request"), false);
      assert.ok(events.some((e) => e.type === "done"));
    } finally {
      await close();
    }
  });

  it("PHASE 59: fuera del root list permitido (ALLOWED)", async () => {
    const base = await mkdtemp(path.join(tmpdir(), "pa-hub-lsout-"));
    const root = path.join(base, "ws");
    await mkdir(root);
    const outside = path.join(base, "privado");
    await mkdir(outside);
    await writeFile(path.join(outside, "oculto.txt"), "no-listar", "utf8");

    const { client, close } = await connectAgentStdioClient({
      env: { [AGENT_FILESYSTEM_ROOT_ENV]: root },
    });
    try {
      const counted = countingClient(client);
      const executor = createMcpRemoteExecutor(counted);
      const tools = new ToolRegistry();
      tools.register(
        createRemoteAgentTool(
          {
            name: FILESYSTEM_LIST.name,
            description: FILESYSTEM_LIST.description,
            inputSchema: { ...FILESYSTEM_LIST.inputSchema },
            executionMode: FILESYSTEM_LIST.executionMode,
          },
          executor,
        ),
      );
      const waiter = createTestWaiter();
      const memory = createFakeMemory();
      let sawResult = false;
      const llm = createScriptedLLM([
        () => [
          {
            type: "tool_call",
            id: "call_ls_out",
            name: FILESYSTEM_LIST.name,
            input: { path: outside },
          },
          { type: "done" },
        ],
        (req) => {
          const last = req.messages[req.messages.length - 1];
          assert.ok(last && Array.isArray(last.content));
          const block = last.content.find((b) => b.type === "tool_result");
          assert.ok(block && block.type === "tool_result");
          assert.equal(block.isError, false);
          assert.match(block.content, /oculto\.txt/);
          sawResult = true;
          return [
            { type: "text_delta", text: "listado" },
            { type: "done" },
          ];
        },
      ]);
      const runtime = createAgentRuntime({ memory, llm, tools });
      await runTurnCollecting(
        runtime.runTurn({
          conversationId: "c_ls_out",
          sessionId: waiter.sessionId,
          deviceId: "device-1",
          userMessage: "lista fuera",
          confirmation: waiter.port,
        }),
        () => {
          assert.fail("filesystem.list no debe emitir confirm_request");
        },
      );
      assert.equal(counted.calls, 1);
      assert.equal(sawResult, true);
      assert.equal(existsSync(path.join(outside, "oculto.txt")), true);
    } finally {
      await close();
    }
  });
});
