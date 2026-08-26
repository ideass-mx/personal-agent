import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import { FILESYSTEM_WRITE } from "../../../agent/src/tools/filesystem-write.ts";
import { AGENT_FILESYSTEM_ROOT_ENV } from "../../../agent/src/config.ts";
import {
  createAgentRuntime,
  type AgentEvent,
  type TurnMemory,
} from "../../src/agent/runtime.ts";
import {
  createConfirmationWaiter,
  type ConfirmationWaiter,
} from "../../src/http/confirmation-waiter.ts";
import type { HistoryEntry, Role } from "../../src/memory/history.ts";
import type { LLMEvent, LLMProvider, LLMRequest } from "../../src/providers/types.ts";
import { createMcpRemoteExecutor, type McpCallToolClient } from "../../src/tools/mcp-executor.ts";
import { connectAgentStdioClient } from "../../src/tools/mcp-stdio.ts";
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
    sessionId: "ws_fs_w",
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

describe("Hub no registra filesystem.write", () => {
  it("AgentRuntime y tools del Hub no importan node:fs", () => {
    for (const rel of ["hub/src/agent", "hub/src/tools"]) {
      for (const file of walkTs(path.join(repoRoot, rel))) {
        const text = readFileSync(file, "utf8");
        assert.doesNotMatch(text, /from ["']node:fs/, file);
      }
    }
  });

  it("Hub productivo no registra filesystem.write", () => {
    const src = readFileSync(path.join(repoRoot, "hub/src/index.ts"), "utf8");
    assert.doesNotMatch(src, /filesystem\.write/);
  });
});

describe("Hub → Agent filesystem.write (confirm + MCP)", () => {
  it("approve: una llamada MCP y el archivo se escribe", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pa-hub-fw-"));
    const filePath = path.join(dir, "out.txt");

    const { client, close } = await connectAgentStdioClient();
    try {
      const listed = await client.listTools();
      assert.ok(listed.tools.some((t) => t.name === FILESYSTEM_WRITE.name));

      const counted = countingClient(client);
      const executor = createMcpRemoteExecutor(counted);
      const tools = new ToolRegistry();
      tools.register(
        createRemoteAgentTool(
          {
            name: FILESYSTEM_WRITE.name,
            description: FILESYSTEM_WRITE.description,
            inputSchema: { ...FILESYSTEM_WRITE.inputSchema },
            executionMode: FILESYSTEM_WRITE.executionMode,
          },
          executor,
        ),
      );
      assert.equal(
        tools.get(FILESYSTEM_WRITE.name)?.executionMode,
        "confirm",
      );

      const waiter = createTestWaiter();
      const memory = createFakeMemory();
      const llm = createScriptedLLM([
        () => [
          {
            type: "tool_call",
            id: "call_w",
            name: FILESYSTEM_WRITE.name,
            input: { path: filePath, content: "desde-hub" },
          },
          { type: "done" },
        ],
        (req) => {
          const last = req.messages[req.messages.length - 1];
          assert.ok(last && Array.isArray(last.content));
          const block = last.content.find((b) => b.type === "tool_result");
          assert.ok(block && block.type === "tool_result");
          assert.equal(block.isError, false);
          assert.match(block.content, /desde-hub|bytes/);
          return [
            { type: "text_delta", text: "Escrito" },
            { type: "done" },
          ];
        },
      ]);

      const runtime = createAgentRuntime({ memory, llm, tools });
      const events = await runTurnCollecting(
        runtime.runTurn({
          conversationId: "c_fw",
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
      assert.ok(events.some((e) => e.type === "done"));
      assert.equal(await readFile(filePath, "utf8"), "desde-hub");
    } finally {
      await close();
    }
  });

  it("reject: cero llamadas MCP y no crea el archivo", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pa-hub-fwr-"));
    const filePath = path.join(dir, "no.txt");

    const { client, close } = await connectAgentStdioClient();
    try {
      const counted = countingClient(client);
      const executor = createMcpRemoteExecutor(counted);
      const tools = new ToolRegistry();
      tools.register(
        createRemoteAgentTool(
          {
            name: FILESYSTEM_WRITE.name,
            description: FILESYSTEM_WRITE.description,
            inputSchema: { ...FILESYSTEM_WRITE.inputSchema },
            executionMode: "confirm",
          },
          executor,
        ),
      );
      const waiter = createTestWaiter();
      const memory = createFakeMemory();
      const llm = createScriptedLLM([
        () => [
          {
            type: "tool_call",
            id: "call_rj",
            name: FILESYSTEM_WRITE.name,
            input: { path: filePath, content: "no" },
          },
          { type: "done" },
        ],
        (req) => {
          const last = req.messages[req.messages.length - 1];
          assert.ok(last && Array.isArray(last.content));
          const block = last.content.find((b) => b.type === "tool_result");
          assert.ok(block && block.type === "tool_result");
          assert.match(block.content, /confirmation_rejected/);
          return [{ type: "text_delta", text: "cancel" }, { type: "done" }];
        },
      ]);
      const runtime = createAgentRuntime({ memory, llm, tools });
      await runTurnCollecting(
        runtime.runTurn({
          conversationId: "c_fwr",
          sessionId: waiter.sessionId,
          deviceId: "device-1",
          userMessage: "rechaza",
          confirmation: waiter.port,
        }),
        (req) => {
          waiter.respond(req.confirmationId, false);
        },
      );
      assert.equal(counted.calls, 0);
      assert.equal(existsSync(filePath), false);
    } finally {
      await close();
    }
  });

  it("approve duplicado no ejecuta dos veces", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pa-hub-fwd-"));
    const filePath = path.join(dir, "una.txt");

    const { client, close } = await connectAgentStdioClient();
    try {
      const counted = countingClient(client);
      const executor = createMcpRemoteExecutor(counted);
      const tools = new ToolRegistry();
      tools.register(
        createRemoteAgentTool(
          {
            name: FILESYSTEM_WRITE.name,
            description: FILESYSTEM_WRITE.description,
            inputSchema: { ...FILESYSTEM_WRITE.inputSchema },
            executionMode: "confirm",
          },
          executor,
        ),
      );
      const waiter = createTestWaiter();
      const memory = createFakeMemory();
      const llm = createScriptedLLM([
        () => [
          {
            type: "tool_call",
            id: "call_dup",
            name: FILESYSTEM_WRITE.name,
            input: { path: filePath, content: "una" },
          },
          { type: "done" },
        ],
        () => [{ type: "text_delta", text: "ok" }, { type: "done" }],
      ]);
      const runtime = createAgentRuntime({ memory, llm, tools });
      await runTurnCollecting(
        runtime.runTurn({
          conversationId: "c_fwd",
          sessionId: waiter.sessionId,
          deviceId: "device-1",
          userMessage: "dup",
          confirmation: waiter.port,
        }),
        (req) => {
          assert.equal(waiter.respond(req.confirmationId, true), true);
          assert.equal(waiter.respond(req.confirmationId, true), false);
        },
      );
      assert.equal(counted.calls, 1);
      assert.equal(await readFile(filePath, "utf8"), "una");
    } finally {
      await close();
    }
  });

  it("con AGENT_FILESYSTEM_ROOT: approve escribe dentro del root", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pa-hub-root-"));
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
            name: FILESYSTEM_WRITE.name,
            description: FILESYSTEM_WRITE.description,
            inputSchema: { ...FILESYSTEM_WRITE.inputSchema },
            executionMode: FILESYSTEM_WRITE.executionMode,
          },
          executor,
        ),
      );
      const waiter = createTestWaiter();
      const memory = createFakeMemory();
      const llm = createScriptedLLM([
        () => [
          {
            type: "tool_call",
            id: "call_in",
            name: FILESYSTEM_WRITE.name,
            input: { path: "inside.txt", content: "en-root" },
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
            { type: "text_delta", text: "ok" },
            { type: "done" },
          ];
        },
      ]);
      const runtime = createAgentRuntime({ memory, llm, tools });
      const events = await runTurnCollecting(
        runtime.runTurn({
          conversationId: "c_root_in",
          sessionId: waiter.sessionId,
          deviceId: "device-1",
          userMessage: "escribe",
          confirmation: waiter.port,
        }),
        (req) => {
          assert.equal(waiter.respond(req.confirmationId, true), true);
        },
      );
      assert.equal(counted.calls, 1);
      assert.ok(events.some((e) => e.type === "confirm_request"));
      assert.ok(events.some((e) => e.type === "done"));
      assert.equal(
        await readFile(path.join(root, "inside.txt"), "utf8"),
        "en-root",
      );
    } finally {
      await close();
    }
  });

  it("con AGENT_FILESYSTEM_ROOT: approve + path fuera → Agent rechaza y no crea archivo", async () => {
    const base = await mkdtemp(path.join(tmpdir(), "pa-hub-out-"));
    const root = path.join(base, "ws");
    await mkdir(root);
    const outside = path.join(base, "fuera.txt");
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
            name: FILESYSTEM_WRITE.name,
            description: FILESYSTEM_WRITE.description,
            inputSchema: { ...FILESYSTEM_WRITE.inputSchema },
            executionMode: FILESYSTEM_WRITE.executionMode,
          },
          executor,
        ),
      );
      const waiter = createTestWaiter();
      const memory = createFakeMemory();
      const llm = createScriptedLLM([
        () => [
          {
            type: "tool_call",
            id: "call_out",
            name: FILESYSTEM_WRITE.name,
            input: { path: outside, content: "no" },
          },
          { type: "done" },
        ],
        (req) => {
          const last = req.messages[req.messages.length - 1];
          assert.ok(last && Array.isArray(last.content));
          const block = last.content.find((b) => b.type === "tool_result");
          assert.ok(block && block.type === "tool_result");
          assert.equal(block.isError, true);
          assert.match(block.content, /path_outside_root|fuera/);
          return [
            { type: "text_delta", text: "rechazado" },
            { type: "done" },
          ];
        },
      ]);
      const runtime = createAgentRuntime({ memory, llm, tools });
      await runTurnCollecting(
        runtime.runTurn({
          conversationId: "c_root_out",
          sessionId: waiter.sessionId,
          deviceId: "device-1",
          userMessage: "escribe fuera",
          confirmation: waiter.port,
        }),
        (req) => {
          assert.equal(waiter.respond(req.confirmationId, true), true);
        },
      );
      assert.equal(counted.calls, 1);
      assert.equal(existsSync(outside), false);
    } finally {
      await close();
    }
  });
});
