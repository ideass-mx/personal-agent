/**
 * 13F: Tool Policy Office — Hub ignora executionMode del Agent.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { startLocalAgent } from "../../../node/src/lifecycle.ts";
import { createDefaultExtensions } from "../../../node/src/extensions/defaults.ts";
import { createOfficeExtension } from "../../../node/src/extensions/office.ts";
import { createDefaultToolRegistry } from "../../../node/src/tools/defaults.ts";
import {
  createAgentRuntime,
  type AgentEvent,
  type TurnMemory,
} from "../../src/agents/runtime.ts";
import { createConfirmationWaiter } from "../../src/sessions/confirmation-waiter.ts";
import type { HistoryEntry, Role } from "../../src/memory/history.ts";
import type {
  LLMEvent,
  LLMProvider,
  LLMRequest,
} from "../../src/providers/types.ts";
import { HubAgentError } from "../../src/runtime/errors.ts";
import {
  OFFICE_EXCEL_MCP_TIMEOUT_MS,
  mcpTimeoutMsForOfficeExcel,
  registerDiscoveredAgentTools,
} from "../../src/tools/discover.ts";
import {
  MCP_TOOL_TIMEOUT_MS,
  createMcpRemoteExecutor,
} from "../../src/tools/mcp/executor.ts";
import { ToolRegistry } from "../../src/tools/registry.ts";
import type {
  RemoteToolExecutor,
  RemoteToolRequest,
} from "../../src/tools/remote.ts";
import {
  DEFAULT_TOOL_POLICY,
  TOOL_POLICY_ERROR,
  omitToolPolicyKeys,
} from "../../src/tools/policy.ts";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

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

async function openOfficeLoop(policy: unknown = DEFAULT_TOOL_POLICY) {
  const root = await mkdtemp(path.join(tmpdir(), "pa-13f-hub-"));
  await writeFile(
    path.join(root, "ventas.xlsx"),
    Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]),
  );
  const cfg = { filesystem: { root } };
  const extensions = [
    ...createDefaultExtensions(cfg).filter((e) => e.name !== "office"),
    createOfficeExtension(cfg, {
      writeRange: async () => ({ ok: true, rows: 1, columns: 1 }),
      readRange: async () => ({ ok: true, values: [["ok"]] }),
    }),
  ];
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const agent = await startLocalAgent(serverT, {
    config: cfg,
    registry: createDefaultToolRegistry(cfg, extensions),
  });
  const client = new Client({ name: "hub-13f", version: "0.0.0" });
  await client.connect(clientT);
  const inner = createMcpRemoteExecutor(client);
  const executor = countingExecutor(inner);
  const tools = new ToolRegistry();
  try {
    const names = await registerDiscoveredAgentTools(tools, client, executor, {
      policy,
    });
    return {
      names,
      tools,
      executor,
      close: async () => {
        await client.close();
        await agent.shutdown();
      },
    };
  } catch (err) {
    await client.close().catch(() => undefined);
    await agent.shutdown().catch(() => undefined);
    throw err;
  }
}

describe("13F Hub office policy", () => {
  it("policy: read automatic, write confirm", () => {
    assert.equal(DEFAULT_TOOL_POLICY["office.excel.read"], "automatic");
    assert.equal(DEFAULT_TOOL_POLICY["office.excel.write"], "confirm");
  });

  it("discover ignora executionMode del Agent (usa solo policy)", () => {
    const src = readFileSync(
      path.join(repoRoot, "gateway/src/tools/discover.ts"),
      "utf8",
    );
    assert.match(src, /policy\[tool\.name\]/);
    assert.doesNotMatch(src, /tool\.executionMode/);
    assert.doesNotMatch(src, /listed\.executionMode/);
  });

  it("Agent declara write automatic → Hub sigue confirm", async () => {
    const loop = await openOfficeLoop();
    try {
      assert.equal(
        loop.tools.get("office.excel.write")?.executionMode,
        "confirm",
      );
      assert.equal(
        loop.tools.get("office.excel.read")?.executionMode,
        "automatic",
      );
    } finally {
      await loop.close();
    }
  });

  it("tool no anunciada en policy no se registra", async () => {
    const loop = await openOfficeLoop(
      omitToolPolicyKeys(DEFAULT_TOOL_POLICY, ["office.excel.write"]),
    );
    try {
      assert.equal(loop.tools.get("office.excel.write"), undefined);
      assert.ok(loop.tools.get("office.excel.read"));
    } finally {
      await loop.close();
    }
  });

  it("policy de tool no anunciada aborta (no READY)", async () => {
    await assert.rejects(
      () =>
        openOfficeLoop({
          ...DEFAULT_TOOL_POLICY,
          "ghost.office": "automatic",
        }),
      (err: unknown) => {
        assert.ok(err instanceof HubAgentError);
        assert.equal(err.code, TOOL_POLICY_ERROR);
        return true;
      },
    );
  });

  it("confirmation no se bypasea en write", async () => {
    const loop = await openOfficeLoop();
    const waiter = createConfirmationWaiter({
      sessionId: "ws_13f",
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
            input: {
              workbook: "ventas.xlsx",
              sheet: "Enero",
              range: "A1",
              values: [["x"]],
            },
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
          conversationId: "c_13f",
          deviceId: "d1",
          sessionId: "ws_13f",
          userMessage: "escribe",
          confirmation: waiter.port,
        }),
        (req) => {
          waiter.respond(req.confirmationId, false);
        },
      );
      assert.equal(events.filter((e) => e.type === "confirm_request").length, 1);
      assert.equal(loop.executor.calls.length, 0);
    } finally {
      await loop.close();
    }
  });

  it("MCP timeout Office > timeout COM interno; filesystem/echo intactos", () => {
    assert.ok(mcpTimeoutMsForOfficeExcel() > 15_000);
    assert.equal(OFFICE_EXCEL_MCP_TIMEOUT_MS, 20_000);
    assert.equal(MCP_TOOL_TIMEOUT_MS, 15_000);
    const src = readFileSync(
      path.join(repoRoot, "gateway/src/tools/discover.ts"),
      "utf8",
    );
    assert.match(src, /office\.excel\.read/);
    assert.match(src, /office\.excel\.write/);
    assert.doesNotMatch(src, /filesystem\.read[\s\S]*OFFICE_EXCEL/);
  });
});
