/**
 * 13E: Hub descubre office.excel.write por MCP; confirm en policy; no implementa COM.
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { startLocalAgent } from "../../../agent/src/lifecycle.ts";
import { createDefaultExtensions } from "../../../agent/src/extensions/defaults.ts";
import { createOfficeExtension } from "../../../agent/src/extensions/office.ts";
import { createDefaultToolRegistry } from "../../../agent/src/tools/defaults.ts";
import {
  createAgentRuntime,
  type AgentEvent,
  type TurnMemory,
} from "../../src/agent/runtime.ts";
import { createConfirmationWaiter } from "../../src/http/confirmation-waiter.ts";
import type { HistoryEntry, Role } from "../../src/memory/history.ts";
import type {
  LLMEvent,
  LLMProvider,
  LLMRequest,
} from "../../src/providers/types.ts";
import { registerDiscoveredAgentTools } from "../../src/tools/discover.ts";
import { createMcpRemoteExecutor } from "../../src/tools/mcp-executor.ts";
import { ToolRegistry } from "../../src/tools/registry.ts";
import type {
  RemoteToolExecutor,
  RemoteToolRequest,
} from "../../src/tools/remote.ts";
import { DEFAULT_TOOL_POLICY } from "../../src/tools/tool-policy.ts";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function walkTs(dir: string, files: string[] = []): string[] {
  if (!existsSync(dir)) return files;
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
    conversationId: string;
    role: Role;
    content: string;
  }> = [];
  return {
    ensureConversation(conversationId?: string): string {
      const id = conversationId ?? `c_${randomUUID()}`;
      conversations.add(id);
      return id;
    },
    addMessage(conversationId, role, content): string {
      const id = `m_${randomUUID()}`;
      messages.push({ conversationId, role, content });
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

function countingExecutor(inner: RemoteToolExecutor): RemoteToolExecutor & {
  calls: RemoteToolRequest[];
} {
  const calls: RemoteToolRequest[] = [];
  return {
    calls,
    async execute(request) {
      calls.push(request);
      return inner.execute(request);
    },
  };
}

async function collectTurn(
  events: AsyncIterable<AgentEvent>,
  onConfirm?: (req: Extract<AgentEvent, { type: "confirm_request" }>) => void,
): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const event of events) {
    out.push(event);
    if (event.type === "confirm_request") onConfirm?.(event);
  }
  return out;
}

const writeInput = {
  workbook: "ventas.xlsx",
  sheet: "Enero",
  range: "B2:C3",
  values: [
    ["Juan", 1500],
    ["Pedro", 2300],
  ],
};

async function openWriteLoop() {
  const root = await mkdtemp(path.join(tmpdir(), "pa-13e-hub-"));
  await writeFile(
    path.join(root, "ventas.xlsx"),
    Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]),
  );
  const cfg = { filesystem: { root } };
  let writes = 0;
  const extensions = [
    ...createDefaultExtensions(cfg).filter((e) => e.name !== "office"),
    createOfficeExtension(cfg, {
      writeRange: async () => {
        writes += 1;
        return { ok: true, rows: 2, columns: 2 };
      },
    }),
  ];
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const agent = await startLocalAgent(serverT, {
    config: cfg,
    registry: createDefaultToolRegistry(cfg, extensions),
  });
  const client = new Client({ name: "hub-13e", version: "0.0.0" });
  await client.connect(clientT);
  const inner = createMcpRemoteExecutor(client);
  const executor = countingExecutor(inner);
  const tools = new ToolRegistry();
  const names = await registerDiscoveredAgentTools(tools, client, executor);
  return {
    names,
    tools,
    executor,
    writes: () => writes,
    close: async () => {
      await client.close();
      await agent.shutdown();
    },
  };
}

describe("13E Hub office.excel.write", () => {
  it("Hub src no conoce winax ni Excel.Application", () => {
    for (const file of walkTs(path.join(repoRoot, "hub/src"))) {
      const text = readFileSync(file, "utf8");
      assert.doesNotMatch(text, /winax/, file);
      assert.doesNotMatch(text, /Excel\.Application/, file);
      assert.doesNotMatch(text, /writeExcelRangeViaCom/, file);
    }
    assert.equal(DEFAULT_TOOL_POLICY["office.excel.write"], "confirm");
  });

  it("tools/list + policy: confirm", async () => {
    const loop = await openWriteLoop();
    try {
      assert.ok(loop.names.includes("office.excel.write"));
      assert.equal(loop.tools.get("office.excel.write")?.executionMode, "confirm");
    } finally {
      await loop.close();
    }
  });

  it("approve → 1 confirm, 1 MCP, 1 escritura", async () => {
    const loop = await openWriteLoop();
    const waiter = createConfirmationWaiter({
      sessionId: "ws_13e_ok",
      deviceId: "d1",
      timeoutMs: 5_000,
    });
    try {
      const llm = createScriptedLLM([
        () => [
          {
            type: "tool_call",
            id: "call_w",
            name: "office.excel.write",
            input: writeInput,
          },
        ],
        () => [{ type: "text_delta", text: "ok" }, { type: "done" }],
      ]);
      const runtime = createAgentRuntime({
        memory: createFakeMemory(),
        llm,
        tools: loop.tools,
      });
      const events = await collectTurn(
        runtime.runTurn({
          conversationId: "c_w",
          deviceId: "d1",
          sessionId: "ws_13e_ok",
          userMessage: "escribe excel",
          confirmation: waiter.port,
        }),
        (req) => {
          assert.equal(loop.executor.calls.length, 0);
          waiter.respond(req.confirmationId, true);
        },
      );
      assert.equal(events.filter((e) => e.type === "confirm_request").length, 1);
      assert.equal(loop.executor.calls.length, 1);
      assert.equal(loop.executor.calls[0]?.toolName, "office.excel.write");
      assert.equal(loop.writes(), 1);
      assert.ok(events.some((e) => e.type === "done"));
    } finally {
      await loop.close();
    }
  });

  it("reject → 0 MCP, 0 escrituras", async () => {
    const loop = await openWriteLoop();
    const waiter = createConfirmationWaiter({
      sessionId: "ws_13e_no",
      deviceId: "d1",
      timeoutMs: 5_000,
    });
    try {
      const llm = createScriptedLLM([
        () => [
          {
            type: "tool_call",
            id: "call_w",
            name: "office.excel.write",
            input: writeInput,
          },
        ],
        () => [{ type: "text_delta", text: "no" }, { type: "done" }],
      ]);
      const runtime = createAgentRuntime({
        memory: createFakeMemory(),
        llm,
        tools: loop.tools,
      });
      const events = await collectTurn(
        runtime.runTurn({
          conversationId: "c_no",
          deviceId: "d1",
          sessionId: "ws_13e_no",
          userMessage: "escribe",
          confirmation: waiter.port,
        }),
        (req) => {
          waiter.respond(req.confirmationId, false);
        },
      );
      assert.equal(events.filter((e) => e.type === "confirm_request").length, 1);
      assert.equal(loop.executor.calls.length, 0);
      assert.equal(loop.writes(), 0);
    } finally {
      await loop.close();
    }
  });

  it("timeout → 0 MCP, 0 escrituras", async () => {
    const loop = await openWriteLoop();
    const waiter = createConfirmationWaiter({
      sessionId: "ws_13e_to",
      deviceId: "d1",
      timeoutMs: 30,
    });
    try {
      const llm = createScriptedLLM([
        () => [
          {
            type: "tool_call",
            id: "call_w",
            name: "office.excel.write",
            input: writeInput,
          },
        ],
        () => [{ type: "text_delta", text: "to" }, { type: "done" }],
      ]);
      const runtime = createAgentRuntime({
        memory: createFakeMemory(),
        llm,
        tools: loop.tools,
      });
      const events = await collectTurn(
        runtime.runTurn({
          conversationId: "c_to",
          deviceId: "d1",
          sessionId: "ws_13e_to",
          userMessage: "escribe",
          confirmation: waiter.port,
        }),
      );
      assert.equal(events.filter((e) => e.type === "confirm_request").length, 1);
      assert.equal(loop.executor.calls.length, 0);
      assert.equal(loop.writes(), 0);
    } finally {
      await loop.close();
    }
  });

  it("cancel → 0 MCP, 0 escrituras", async () => {
    const loop = await openWriteLoop();
    const waiter = createConfirmationWaiter({
      sessionId: "ws_13e_ca",
      deviceId: "d1",
      timeoutMs: 5_000,
    });
    try {
      const llm = createScriptedLLM([
        () => [
          {
            type: "tool_call",
            id: "call_w",
            name: "office.excel.write",
            input: writeInput,
          },
        ],
        () => [{ type: "text_delta", text: "ca" }, { type: "done" }],
      ]);
      const runtime = createAgentRuntime({
        memory: createFakeMemory(),
        llm,
        tools: loop.tools,
      });
      const events = await collectTurn(
        runtime.runTurn({
          conversationId: "c_ca",
          deviceId: "d1",
          sessionId: "ws_13e_ca",
          userMessage: "escribe",
          confirmation: waiter.port,
        }),
        () => {
          waiter.cancelAll();
        },
      );
      assert.equal(loop.executor.calls.length, 0);
      assert.equal(loop.writes(), 0);
    } finally {
      await loop.close();
    }
  });
});
