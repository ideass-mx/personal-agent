/**
 * 13D.1: Hub descubre office.excel.read por MCP; no implementa Excel.
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
import { startLocalAgent } from "../../../node/src/lifecycle.ts";
import { createDefaultExtensions } from "../../../node/src/extensions/defaults.ts";
import { createOfficeExtension } from "../../../node/src/extensions/office.ts";
import { createDefaultToolRegistry } from "../../../node/src/tools/defaults.ts";
import {
  createAgentRuntime,
  type AgentEvent,
  type TurnMemory,
} from "../../src/agents/runtime.ts";
import type { HistoryEntry, Role } from "../../src/memory/history.ts";
import type {
  LLMEvent,
  LLMProvider,
  LLMRequest,
} from "../../src/providers/types.ts";
import { registerDiscoveredAgentTools } from "../../src/tools/discover.ts";
import { createMcpRemoteExecutor } from "../../src/tools/mcp/executor.ts";
import { ToolRegistry } from "../../src/tools/registry.ts";
import type {
  RemoteToolExecutor,
  RemoteToolRequest,
} from "../../src/tools/remote.ts";
import {
  DEFAULT_TOOL_POLICY,
  omitToolPolicyKeys,
} from "../../src/tools/policy.ts";

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

async function runTurnCollecting(
  events: AsyncIterable<AgentEvent>,
): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const event of events) out.push(event);
  return out;
}

describe("13D.1 Hub office.excel.read", () => {
  it("Hub src no implementa Office; policy vive en tool-policy.ts", () => {
    const policyFile = path.join(repoRoot, "gateway/src/tools/policy.ts");
    const discoverFile = path.join(repoRoot, "gateway/src/tools/discover.ts");
    for (const file of walkTs(path.join(repoRoot, "gateway/src"))) {
      const text = readFileSync(file, "utf8");
      assert.doesNotMatch(text, /createOfficeExtension/, file);
      assert.doesNotMatch(text, /readExcelRangeViaCom/, file);
      assert.doesNotMatch(text, /writeExcelRangeViaCom/, file);
      assert.doesNotMatch(text, /agent\/src\/extensions\/office/, file);
      assert.doesNotMatch(text, /agent\/src\/tools\/office-excel-read/, file);
      assert.doesNotMatch(text, /agent\/src\/tools\/office-excel-write/, file);
      assert.doesNotMatch(text, /agent\/src\/tools\/excel-com/, file);
      assert.doesNotMatch(text, /winax/, file);
      assert.doesNotMatch(text, /Excel\.Application/, file);
      if (path.resolve(file) === path.resolve(policyFile)) {
        assert.match(text, /"office\.excel\.read": "automatic"/);
        assert.match(text, /"office\.excel\.write": "confirm"/);
        continue;
      }
      if (path.resolve(file) === path.resolve(discoverFile)) {
        assert.match(text, /office\.excel\.read/);
        assert.match(text, /office\.excel\.write/);
        assert.doesNotMatch(text, /winax/);
        continue;
      }
      assert.doesNotMatch(text, /office\.excel\.read/, file);
      assert.doesNotMatch(text, /office\.excel\.write/, file);
    }
    assert.equal(DEFAULT_TOOL_POLICY["office.excel.read"], "automatic");
    assert.equal(DEFAULT_TOOL_POLICY["office.excel.write"], "confirm");
  });

  it("E2E FakeLLM: automatic, 0 confirm, 1 MCP", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pa-13d1-e2e-"));
    await writeFile(
      path.join(root, "ventas.xlsx"),
      Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]),
    );
    const cfg = { filesystem: { root } };
    const extensions = [
      ...createDefaultExtensions(cfg).filter((e) => e.name !== "office"),
      createOfficeExtension(cfg, {
        readRange: async () => ({ ok: true, values: [["Hola", 1]] }),
      }),
    ];
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    const agent = await startLocalAgent(serverT, {
      config: cfg,
      registry: createDefaultToolRegistry(cfg, extensions),
    });
    const client = new Client({ name: "hub-13d1", version: "0.0.0" });
    await client.connect(clientT);
    const inner = createMcpRemoteExecutor(client);
    const executor = countingExecutor(inner);
    const tools = new ToolRegistry();
    try {
      const names = await registerDiscoveredAgentTools(tools, client, executor);
      assert.ok(names.includes("office.excel.read"));
      assert.equal(tools.get("office.excel.read")?.executionMode, "automatic");

      const llm = createScriptedLLM([
        () => [
          {
            type: "tool_call",
            id: "call_xl",
            name: "office.excel.read",
            input: {
              workbook: "ventas.xlsx",
              worksheet: "Ventas",
              range: "A1:B1",
            },
          },
        ],
        () => [{ type: "text_delta", text: "ok" }, { type: "done" }],
      ]);
      const runtime = createAgentRuntime({
        memory: createFakeMemory(),
        llm,
        tools,
      });
      const events = await runTurnCollecting(
        runtime.runTurn({
          conversationId: "c_xl",
          userMessage: "lee excel",
        }),
      );
      assert.equal(events.filter((e) => e.type === "confirm_request").length, 0);
      assert.equal(executor.calls.length, 1);
      assert.equal(executor.calls[0]?.toolName, "office.excel.read");
      assert.ok(events.some((e) => e.type === "done"));
    } finally {
      await client.close();
      await agent.shutdown();
    }
  });

  it("sin policy: deny, 0 MCP, el Hub no inventa la tool", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pa-13d1-deny-"));
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    const agent = await startLocalAgent(serverT, {
      config: { filesystem: { root } },
    });
    const client = new Client({ name: "hub-13d1-deny", version: "0.0.0" });
    await client.connect(clientT);
    const inner = createMcpRemoteExecutor(client);
    const executor = countingExecutor(inner);
    const tools = new ToolRegistry();
    try {
      const listed = await client.listTools();
      assert.ok(listed.tools.some((t) => t.name === "office.excel.read"));
      const names = await registerDiscoveredAgentTools(tools, client, executor, {
        policy: omitToolPolicyKeys(DEFAULT_TOOL_POLICY, ["office.excel.read"]),
      });
      assert.equal(names.includes("office.excel.read"), false);
      assert.equal(tools.get("office.excel.read"), undefined);

      const llm = createScriptedLLM([
        () => [
          {
            type: "tool_call",
            id: "call_xl",
            name: "office.excel.read",
            input: { workbook: "a.xlsx", worksheet: "S", range: "A1" },
          },
        ],
        (req) => {
          const last = req.messages[req.messages.length - 1];
          assert.ok(last && Array.isArray(last.content));
          const resultBlock = last.content.find((b) => b.type === "tool_result");
          assert.ok(resultBlock && resultBlock.type === "tool_result");
          assert.equal(resultBlock.isError, true);
          return [{ type: "text_delta", text: "no" }, { type: "done" }];
        },
      ]);
      const runtime = createAgentRuntime({
        memory: createFakeMemory(),
        llm,
        tools,
      });
      await runTurnCollecting(
        runtime.runTurn({
          conversationId: "c_deny",
          userMessage: "excel",
        }),
      );
      assert.equal(executor.calls.length, 0);
    } finally {
      await client.close();
      await agent.shutdown();
    }
  });

  it("sin extensión office: MCP no la anuncia y el Hub no la sustituye", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pa-13d1-off-"));
    const cfg = { filesystem: { root } };
    const without = createDefaultExtensions(cfg).filter((e) => e.name !== "office");
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    const agent = await startLocalAgent(serverT, {
      config: cfg,
      registry: createDefaultToolRegistry(cfg, without),
    });
    const client = new Client({ name: "hub-13d1-off", version: "0.0.0" });
    await client.connect(clientT);
    try {
      const listed = await client.listTools();
      assert.equal(
        listed.tools.some((t) => t.name === "office.excel.read"),
        false,
      );
      const tools = new ToolRegistry();
      const names = await registerDiscoveredAgentTools(
        tools,
        client,
        createMcpRemoteExecutor(client),
        { policy: omitToolPolicyKeys(DEFAULT_TOOL_POLICY, ["office.excel.read", "office.excel.write"]) },
      );
      assert.equal(names.includes("office.excel.read"), false);
      assert.equal(tools.get("office.excel.read"), undefined);
    } finally {
      await client.close();
      await agent.shutdown();
    }
  });
});
