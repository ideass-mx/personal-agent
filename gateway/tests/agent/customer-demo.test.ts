/**
 * 13A: el Hub descubre customer.demo por MCP; no implementa la tool.
 * Sin la extensión en el Agent, no hay fallback in-process.
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { startLocalAgent } from "../../../node/src/lifecycle.ts";
import { createDefaultExtensions } from "../../../node/src/extensions/defaults.ts";
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

async function runTurnCollecting(
  events: AsyncIterable<AgentEvent>,
): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const event of events) out.push(event);
  return out;
}

describe("13A Hub: customer.demo descubrimiento e independencia", () => {
  it("Hub src no implementa customer.demo; policy vive en tool-policy.ts", () => {
    const policyFile = path.join(repoRoot, "gateway/src/tools/policy.ts");
    for (const file of walkTs(path.join(repoRoot, "gateway/src"))) {
      const text = readFileSync(file, "utf8");
      assert.doesNotMatch(text, /customerDemoExtension/, file);
      assert.doesNotMatch(text, /customerDemoTool/, file);
      assert.doesNotMatch(text, /agent\/src\/extensions\/customer-demo/, file);
      assert.doesNotMatch(text, /agent\/src\/tools\/customer-demo/, file);
      assert.doesNotMatch(text, /PluginManager/, file);
      assert.doesNotMatch(text, /PermissionManager/, file);
      assert.doesNotMatch(text, /PolicyEngine/, file);
      if (path.resolve(file) === path.resolve(policyFile)) {
        assert.match(text, /"customer\.demo": "automatic"/);
        continue;
      }
      assert.doesNotMatch(text, /customer\.demo/, file);
    }
    assert.equal(DEFAULT_TOOL_POLICY["customer.demo"], "automatic");
  });

  it("sin customer en el Agent: Hub no inventa customer.demo ni hay fallback", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pa-13a-off-"));
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    const cfg = { filesystem: { root } };
    const without = createDefaultExtensions(cfg).filter(
      (e) => e.name !== "customer",
    );
    const agent = await startLocalAgent(serverT, {
      config: cfg,
      registry: createDefaultToolRegistry(cfg, without),
    });
    const client = new Client({ name: "hub-13a-off", version: "0.0.0" });
    await client.connect(clientT);
    try {
      const listed = await client.listTools();
      assert.equal(
        listed.tools.some((t) => t.name === "customer.demo"),
        false,
      );
      const tools = new ToolRegistry();
      const names = await registerDiscoveredAgentTools(
        tools,
        client,
        createMcpRemoteExecutor(client),
        { policy: omitToolPolicyKeys(DEFAULT_TOOL_POLICY, ["customer.demo"]) },
      );
      assert.equal(names.includes("customer.demo"), false);
      assert.equal(tools.get("customer.demo"), undefined);

      const llm = createScriptedLLM([
        () => [
          {
            type: "tool_call",
            id: "call_cust",
            name: "customer.demo",
            input: { message: "x" },
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
      const events = await runTurnCollecting(
        runtime.runTurn({
          conversationId: "c_off",
          userMessage: "demo",
        }),
      );
      assert.ok(events.some((e) => e.type === "done"));
    } finally {
      await client.close();
      await agent.shutdown();
    }
  });
});
