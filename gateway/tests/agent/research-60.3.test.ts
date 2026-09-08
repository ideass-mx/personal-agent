/**
 * PHASE 60.3 — FakeLLM itera search→fetch→answer vía AgentRuntime + MCP Node.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { startLocalAgent } from "../../../node/src/lifecycle.ts";
import { createResearchBudgetStore } from "../../../node/src/research/budget.ts";
import { createDefaultExtensions } from "../../../node/src/extensions/defaults.ts";
import { createDefaultToolRegistry } from "../../../node/src/tools/defaults.ts";
import { createResearchFetchTool } from "../../../node/src/tools/research-fetch.ts";
import { createResearchSearchTool } from "../../../node/src/tools/research-search.ts";
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
import { DEFAULT_TOOL_POLICY } from "../../src/tools/policy.ts";
import { ToolRegistry } from "../../src/tools/registry.ts";

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

async function collect(events: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const ev of events) out.push(ev);
  return out;
}

describe("PHASE 60.3 research AgentRuntime iterative", () => {
  it("descubre research.search y research.fetch", async () => {
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    const agent = await startLocalAgent(serverT);
    const client = new Client({ name: "r60-disc", version: "0.0.0" });
    await client.connect(clientT);
    try {
      const tools = new ToolRegistry();
      const names = await registerDiscoveredAgentTools(
        tools,
        client,
        createMcpRemoteExecutor(client),
        { policy: DEFAULT_TOOL_POLICY },
      );
      assert.ok(names.includes("research.search"));
      assert.ok(names.includes("research.fetch"));
      assert.equal(tools.get("research.search")?.executionMode, "automatic");
      assert.equal(tools.get("research.fetch")?.executionMode, "automatic");
    } finally {
      await client.close();
      await agent.shutdown();
    }
  });

  it("search → fetch → answer con tools inyectadas", async () => {
    const budget = createResearchBudgetStore();
    const extensions = [
      ...createDefaultExtensions().filter((e) => e.name !== "research"),
      {
        name: "research",
        version: "1.0.0",
        tools: [
          createResearchSearchTool({
            budget,
            search: async (query) => ({
              query,
              provider: "web",
              retrievedAt: new Date().toISOString(),
              results: [
                {
                  title: "MCP Guide",
                  url: "https://example.com/mcp",
                  snippet: "best practices",
                  domain: "example.com",
                },
              ],
            }),
          }),
          createResearchFetchTool({
            budget,
            fetchPage: async (url) => ({
              ok: true as const,
              url,
              finalUrl: url,
              title: "MCP Guide",
              text: "Usa tools con schemas claros y timeouts.",
              truncated: false,
            }),
          }),
        ],
      },
    ];
    const registry = createDefaultToolRegistry({}, extensions);
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    const agent = await startLocalAgent(serverT, { registry });
    const client = new Client({ name: "r60", version: "0.0.0" });
    await client.connect(clientT);

    try {
      const tools = new ToolRegistry();
      await registerDiscoveredAgentTools(
        tools,
        client,
        createMcpRemoteExecutor(client),
        { policy: DEFAULT_TOOL_POLICY },
      );

      const llm = createScriptedLLM([
        () => [
          {
            type: "tool_call",
            id: "tc1",
            name: "research.search",
            input: { query: "MCP Claude agent" },
          },
        ],
        () => [
          {
            type: "tool_call",
            id: "tc2",
            name: "research.fetch",
            input: { url: "https://example.com/mcp" },
          },
        ],
        () => [
          {
            type: "text_delta",
            text: "Según la guía MCP: schemas claros.\n\nFuentes\n1. MCP Guide\n   https://example.com/mcp",
          },
          { type: "done" },
        ],
      ]);

      const runtime = createAgentRuntime({
        llm,
        tools,
        memory: createFakeMemory(),
      });

      const events = await collect(
        runtime.runTurn({
          conversationId: "conv-research",
          userMessage: "Investiga mejores prácticas MCP con Claude",
        }),
      );
      const text = events
        .filter((e) => e.type === "text_delta")
        .map((e) => (e.type === "text_delta" ? e.text : ""))
        .join("");
      assert.match(text, /Fuentes/);
      assert.match(text, /example\.com\/mcp/);
      assert.ok(events.some((e) => e.type === "done"));
      const snap = budget.snapshot("conv-research");
      assert.equal(snap.searches, 1);
      assert.equal(snap.fetches, 1);
    } finally {
      await client.close();
      await agent.shutdown();
    }
  });

  it("provider failure en search no aborta el turno", async () => {
    const budget = createResearchBudgetStore();
    const extensions = [
      ...createDefaultExtensions().filter((e) => e.name !== "research"),
      {
        name: "research",
        version: "1.0.0",
        tools: [
          createResearchSearchTool({
            budget,
            search: async () => {
              throw new Error("down");
            },
          }),
          createResearchFetchTool({ budget }),
        ],
      },
    ];
    const registry = createDefaultToolRegistry({}, extensions);
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    const agent = await startLocalAgent(serverT, { registry });
    const client = new Client({ name: "r60b", version: "0.0.0" });
    await client.connect(clientT);
    try {
      const tools = new ToolRegistry();
      await registerDiscoveredAgentTools(
        tools,
        client,
        createMcpRemoteExecutor(client),
        { policy: DEFAULT_TOOL_POLICY },
      );
      const llm = createScriptedLLM([
        () => [
          {
            type: "tool_call",
            id: "tc1",
            name: "research.search",
            input: { query: "x" },
          },
        ],
        () => [
          {
            type: "text_delta",
            text: "No pude buscar ahora; te respondo sin web.",
          },
          { type: "done" },
        ],
      ]);
      const runtime = createAgentRuntime({
        llm,
        tools,
        memory: createFakeMemory(),
      });
      const events = await collect(
        runtime.runTurn({
          conversationId: "c-fail",
          userMessage: "busca algo",
        }),
      );
      const text = events
        .filter((e) => e.type === "text_delta")
        .map((e) => (e.type === "text_delta" ? e.text : ""))
        .join("");
      assert.match(text, /No pude buscar|sin web/i);
      assert.ok(events.some((e) => e.type === "done"));
    } finally {
      await client.close();
      await agent.shutdown();
    }
  });
});
