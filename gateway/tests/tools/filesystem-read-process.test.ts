import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import { FILESYSTEM_READ } from "../../../node/src/tools/filesystem-read.ts";
import { FILESYSTEM_WRITE } from "../../../node/src/tools/filesystem-write.ts";
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
    sessionId: "ws_fs_r",
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

function registerRemote(
  tools: ToolRegistry,
  meta: typeof FILESYSTEM_READ | typeof FILESYSTEM_WRITE,
  executor: ReturnType<typeof createMcpRemoteExecutor>,
) {
  tools.register(
    createRemoteAgentTool(
      {
        name: meta.name,
        description: meta.description,
        inputSchema: { ...meta.inputSchema },
        executionMode: meta.executionMode,
      },
      executor,
    ),
  );
}

describe("Hub no lee filesystem; registra RemoteAgentTool en tests", () => {
  it("AgentRuntime y tools del Hub no importan node:fs", () => {
    for (const rel of ["gateway/src/agents", "gateway/src/tools"]) {
      for (const file of walkTs(path.join(repoRoot, rel))) {
        const text = readFileSync(file, "utf8");
        assert.doesNotMatch(text, /from ["']node:fs/, file);
      }
    }
  });

  it("Hub productivo no registra filesystem.read ni filesystem.write", () => {
    const src = readFileSync(path.join(repoRoot, "gateway/src/index.ts"), "utf8");
    assert.doesNotMatch(src, /filesystem\.read/);
    assert.doesNotMatch(src, /filesystem\.write/);
  });
});

describe("Hub → Agent filesystem.read (automatic + MCP)", () => {
  it("automatic: una llamada MCP, sin confirm_request, resultado al FakeLLM", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pa-hub-rd-"));
    await writeFile(path.join(root, "nota.txt"), "leeme", "utf8");

    const { client, close } = await connectAgentStdioClient({
      env: { [AGENT_FILESYSTEM_ROOT_ENV]: root },
    });
    try {
      const counted = countingClient(client);
      const executor = createMcpRemoteExecutor(counted);
      const tools = new ToolRegistry();
      registerRemote(tools, FILESYSTEM_READ, executor);
      assert.equal(tools.get(FILESYSTEM_READ.name)?.executionMode, "automatic");

      const waiter = createTestWaiter();
      const memory = createFakeMemory();
      let sawResult = false;
      const llm = createScriptedLLM([
        () => [
          {
            type: "tool_call",
            id: "call_r",
            name: FILESYSTEM_READ.name,
            input: { path: "nota.txt" },
          },
          { type: "done" },
        ],
        (req) => {
          const last = req.messages[req.messages.length - 1];
          assert.ok(last && Array.isArray(last.content));
          const block = last.content.find((b) => b.type === "tool_result");
          assert.ok(block && block.type === "tool_result");
          assert.equal(block.isError, false);
          assert.match(block.content, /leeme/);
          sawResult = true;
          return [
            { type: "text_delta", text: "Leído" },
            { type: "done" },
          ];
        },
      ]);

      const runtime = createAgentRuntime({ memory, llm, tools });
      const events = await runTurnCollecting(
        runtime.runTurn({
          conversationId: "c_fr",
          sessionId: waiter.sessionId,
          deviceId: "device-1",
          userMessage: "lee",
          confirmation: waiter.port,
        }),
        () => {
          assert.fail("filesystem.read no debe emitir confirm_request");
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

  it("fuera del root: fail, sin contenido, archivo intacto", async () => {
    const base = await mkdtemp(path.join(tmpdir(), "pa-hub-rdout-"));
    const root = path.join(base, "ws");
    await mkdir(root);
    const outside = path.join(base, "secreto.txt");
    await writeFile(outside, "no-exponer", "utf8");

    const { client, close } = await connectAgentStdioClient({
      env: { [AGENT_FILESYSTEM_ROOT_ENV]: root },
    });
    try {
      const counted = countingClient(client);
      const executor = createMcpRemoteExecutor(counted);
      const tools = new ToolRegistry();
      registerRemote(tools, FILESYSTEM_READ, executor);
      const waiter = createTestWaiter();
      const memory = createFakeMemory();
      const llm = createScriptedLLM([
        () => [
          {
            type: "tool_call",
            id: "call_out",
            name: FILESYSTEM_READ.name,
            input: { path: outside },
          },
          { type: "done" },
        ],
        (req) => {
          const last = req.messages[req.messages.length - 1];
          assert.ok(last && Array.isArray(last.content));
          const block = last.content.find((b) => b.type === "tool_result");
          assert.ok(block && block.type === "tool_result");
          assert.equal(block.isError, true);
          assert.match(block.content, /path_outside_root/);
          assert.doesNotMatch(block.content, /no-exponer/);
          return [
            { type: "text_delta", text: "rechazado" },
            { type: "done" },
          ];
        },
      ]);
      const runtime = createAgentRuntime({ memory, llm, tools });
      await runTurnCollecting(
        runtime.runTurn({
          conversationId: "c_fr_out",
          sessionId: waiter.sessionId,
          deviceId: "device-1",
          userMessage: "lee fuera",
          confirmation: waiter.port,
        }),
        () => {
          assert.fail("filesystem.read no debe emitir confirm_request");
        },
      );
      assert.equal(counted.calls, 1);
      assert.equal(existsSync(outside), true);
      assert.equal(readFileSync(outside, "utf8"), "no-exponer");
    } finally {
      await close();
    }
  });

  it("regresión: filesystem.write sigue en confirm y escribe tras approve", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pa-hub-rdw-"));
    const { client, close } = await connectAgentStdioClient({
      env: { [AGENT_FILESYSTEM_ROOT_ENV]: root },
    });
    try {
      const counted = countingClient(client);
      const executor = createMcpRemoteExecutor(counted);
      const tools = new ToolRegistry();
      registerRemote(tools, FILESYSTEM_READ, executor);
      registerRemote(tools, FILESYSTEM_WRITE, executor);
      assert.equal(tools.get(FILESYSTEM_READ.name)?.executionMode, "automatic");
      assert.equal(tools.get(FILESYSTEM_WRITE.name)?.executionMode, "confirm");

      const waiter = createTestWaiter();
      const memory = createFakeMemory();
      const llm = createScriptedLLM([
        () => [
          {
            type: "tool_call",
            id: "call_w",
            name: FILESYSTEM_WRITE.name,
            input: { path: "out.txt", content: "sigue-igual" },
          },
          { type: "done" },
        ],
        (req) => {
          const last = req.messages[req.messages.length - 1];
          assert.ok(last && Array.isArray(last.content));
          const block = last.content.find((b) => b.type === "tool_result");
          assert.ok(block && block.type === "tool_result");
          assert.equal(block.isError, false);
          return [
            { type: "text_delta", text: "Escrito" },
            { type: "done" },
          ];
        },
      ]);
      const runtime = createAgentRuntime({ memory, llm, tools });
      const events = await runTurnCollecting(
        runtime.runTurn({
          conversationId: "c_wr",
          sessionId: waiter.sessionId,
          deviceId: "device-1",
          userMessage: "escribe",
          confirmation: waiter.port,
        }),
        (req) => {
          assert.equal(counted.calls, 0);
          assert.equal(waiter.respond(req.confirmationId, true), true);
        },
      );
      assert.equal(counted.calls, 1);
      assert.ok(events.some((e) => e.type === "confirm_request"));
      assert.equal(
        readFileSync(path.join(root, "out.txt"), "utf8"),
        "sigue-igual",
      );
    } finally {
      await close();
    }
  });
});
