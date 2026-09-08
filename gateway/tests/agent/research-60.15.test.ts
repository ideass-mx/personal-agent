/**
 * PHASE 60.15 — AgentRuntime → MCP → Node research.* (FakeLLM, sin Internet).
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
    sources?: unknown;
  }> = [];
  return {
    ensureConversation(conversationId?: string): string {
      const id = conversationId ?? `c_${randomUUID()}`;
      conversations.add(id);
      return id;
    },
    addMessage(conversationId, role, content, _deviceId?, sources?) {
      const id = `m_${randomUUID()}`;
      messages.push({ conversationId, role, content, sources });
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

describe("PHASE 60.15 AgentRuntime → MCP → research", () => {
  it("multi-step search→fetch→search→fetch + fuentes en respuesta", async () => {
    const budget = createResearchBudgetStore();
    const seenQueries: string[] = [];
    const seenFetches: string[] = [];

    const extensions = [
      ...createDefaultExtensions().filter((e) => e.name !== "research"),
      {
        name: "research",
        version: "1.0.0",
        tools: [
          createResearchSearchTool({
            budget,
            search: async (query) => {
              seenQueries.push(query);
              const slug = query.includes("16") ? "16" : "17";
              return {
                query,
                provider: "web",
                retrievedAt: new Date().toISOString(),
                results: [
                  {
                    title: `PostgreSQL ${slug}`,
                    url: `https://www.postgresql.org/docs/${slug}/release-${slug}.html`,
                    snippet: `novedades ${slug}`,
                    domain: "www.postgresql.org",
                    sourceFamily: "web" as const,
                    position: 1,
                  },
                ],
              };
            },
          }),
          createResearchFetchTool({
            budget,
            fetchPage: async (url) => {
              seenFetches.push(url);
              return {
                ok: true as const,
                url,
                finalUrl: url,
                title: "Release notes",
                text: `Contenido de ${url}`,
                truncated: false,
              };
            },
          }),
        ],
      },
    ];
    const registry = createDefaultToolRegistry({}, extensions);
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    const agent = await startLocalAgent(serverT, { registry });
    const client = new Client({ name: "r60.15", version: "0.0.0" });
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
            input: { query: "PostgreSQL 17 novedades" },
          },
        ],
        () => [
          {
            type: "tool_call",
            id: "tc2",
            name: "research.fetch",
            input: {
              url: "https://www.postgresql.org/docs/17/release-17.html",
            },
          },
        ],
        () => [
          {
            type: "tool_call",
            id: "tc3",
            name: "research.search",
            input: { query: "PostgreSQL 16 novedades" },
          },
        ],
        () => [
          {
            type: "tool_call",
            id: "tc4",
            name: "research.fetch",
            input: {
              url: "https://www.postgresql.org/docs/16/release-16.html",
            },
          },
        ],
        () => [
          {
            type: "text_delta",
            text:
              "PostgreSQL 17 mejora vacuum; 16 introdujo JSON_TABLE.\n\nFuentes:\n1. postgresql.org/docs/17\n2. postgresql.org/docs/16",
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
          conversationId: "conv-60.15",
          userMessage:
            "Investiga PostgreSQL 17 y compara sus principales novedades con PostgreSQL 16.",
        }),
      );

      assert.deepEqual(seenQueries, [
        "PostgreSQL 17 novedades",
        "PostgreSQL 16 novedades",
      ]);
      assert.equal(seenFetches.length, 2);
      const text = events
        .filter((e) => e.type === "text_delta")
        .map((e) => (e.type === "text_delta" ? e.text : ""))
        .join("");
      assert.match(text, /Fuentes/);
      assert.match(text, /postgresql\.org/);
      assert.ok(events.some((e) => e.type === "done"));
      const done = events.find((e) => e.type === "done");
      assert.ok(done && done.type === "done");
      assert.ok(done.sources && done.sources.length >= 2);
      assert.equal(done.sources[0]?.id, "source-1");
      assert.ok(done.sources.every((s) => s.url.startsWith("https://")));
      const snap = budget.snapshot("conv-60.15");
      assert.equal(snap.searches, 2);
      assert.equal(snap.fetches, 2);
    } finally {
      await client.close();
      await agent.shutdown();
    }
  });

  it("error de search no mata el turno (AgentRuntime continúa)", async () => {
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
              throw new Error("provider down");
            },
          }),
          createResearchFetchTool({ budget }),
        ],
      },
    ];
    const registry = createDefaultToolRegistry({}, extensions);
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    const agent = await startLocalAgent(serverT, { registry });
    const client = new Client({ name: "r60.15e", version: "0.0.0" });
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
            text: "No pude completar la búsqueda; reintento más tarde.",
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
          conversationId: "conv-err",
          userMessage: "Investiga x",
        }),
      );
      assert.ok(events.some((e) => e.type === "done"));
      assert.match(
        events
          .filter((e) => e.type === "text_delta")
          .map((e) => (e.type === "text_delta" ? e.text : ""))
          .join(""),
        /No pude/,
      );
    } finally {
      await client.close();
      await agent.shutdown();
    }
  });
});
