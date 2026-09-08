/**
 * Evaluación live PHASE 60.3 sin Claude: AgentRuntime + FakeLLM iterativo
 * + research.search/fetch reales (agent-search-mcp + HTTP).
 *
 *   cd gateway && LOG_LEVEL=silent npx tsx scripts/research-agent-live-tools.ts
 *
 * Mide calidad del proveedor/tools cuando el LLM no está autenticado.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { startLocalAgent } from "../../node/src/lifecycle.ts";
import { defaultResearchBudgetStore } from "../../node/src/research/index.ts";
import {
  createAgentRuntime,
  type AgentEvent,
  type TurnMemory,
} from "../src/agents/runtime.ts";
import type { HistoryEntry, Role } from "../src/memory/types.ts";
import type {
  LLMEvent,
  LLMProvider,
  LLMRequest,
} from "../src/providers/types.ts";
import { registerDiscoveredAgentTools } from "../src/tools/discover.ts";
import { createMcpRemoteExecutor } from "../src/tools/mcp/executor.ts";
import { DEFAULT_TOOL_POLICY } from "../src/tools/policy.ts";
import { ToolRegistry } from "../src/tools/registry.ts";

const CASES = [
  {
    id: "general",
    query: "React vs Vue differences 2026",
    followUp: "Vue Composition API vs React hooks 2026",
  },
  {
    id: "mexico",
    query: "universidades México doctorado inteligencia artificial ciencia de datos",
    followUp: "UNAM IPN CINVESTAV doctorado inteligencia artificial",
  },
  {
    id: "comparative",
    query: "online PhD artificial intelligence duration cost requirements 2026",
    followUp: "online doctorate AI machine learning tuition",
  },
  {
    id: "technical",
    query: "MCP Model Context Protocol Claude agent best practices",
    followUp: "Anthropic MCP tools server agent design",
  },
  {
    id: "providers",
    query: "web search without API keys DuckDuckGo comparison",
    followUp: "self-hosted metasearch engines no API key",
  },
] as const;

function createFakeMemory(): TurnMemory {
  const messages: Array<{
    conversationId: string;
    role: Role;
    content: string;
  }> = [];
  return {
    ensureConversation(conversationId?: string): string {
      return conversationId ?? `c_${randomUUID()}`;
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

function parseToolJson(content: unknown): unknown {
  if (typeof content !== "string") return content;
  try {
    return JSON.parse(content);
  } catch {
    return content;
  }
}

function extractUrlsFromSearchResult(raw: unknown): string[] {
  const parsed = parseToolJson(raw) as {
    results?: Array<{ url?: string; title?: string }>;
  };
  if (!parsed || !Array.isArray(parsed.results)) return [];
  return parsed.results
    .map((r) => (typeof r.url === "string" ? r.url : ""))
    .filter((u) => u.startsWith("http"));
}

function createIterativeResearchLLM(
  query: string,
  followUp: string,
): LLMProvider {
  let step = 0;
  let urls: string[] = [];
  return {
    async *stream(request: LLMRequest): AsyncGenerator<LLMEvent> {
      step += 1;
      if (step === 1) {
        yield {
          type: "tool_call",
          id: "tc_search_1",
          name: "research_search",
          input: { query, limit: 5, language: "es" },
        };
        return;
      }
      if (step === 2) {
        const last = request.messages[request.messages.length - 1];
        const blocks = Array.isArray(last?.content) ? last.content : [];
        for (const b of blocks) {
          if (
            typeof b === "object" &&
            b !== null &&
            "type" in b &&
            (b as { type: string }).type === "tool_result"
          ) {
            const tr = b as { content?: unknown };
            urls = extractUrlsFromSearchResult(tr.content);
          }
        }
        const url = urls[0];
        if (url) {
          yield {
            type: "tool_call",
            id: "tc_fetch_1",
            name: "research_fetch",
            input: { url },
          };
        } else {
          yield {
            type: "tool_call",
            id: "tc_search_2",
            name: "research_search",
            input: { query: followUp, limit: 5 },
          };
        }
        return;
      }
      if (step === 3) {
        yield {
          type: "tool_call",
          id: "tc_search_2",
          name: "research_search",
          input: { query: followUp, limit: 5, language: "es" },
        };
        return;
      }
      if (step === 4) {
        const last = request.messages[request.messages.length - 1];
        const blocks = Array.isArray(last?.content) ? last.content : [];
        let nextUrls: string[] = [];
        for (const b of blocks) {
          if (
            typeof b === "object" &&
            b !== null &&
            "type" in b &&
            (b as { type: string }).type === "tool_result"
          ) {
            const tr = b as { content?: unknown };
            nextUrls = extractUrlsFromSearchResult(tr.content);
          }
        }
        const url = nextUrls.find((u) => u !== urls[0]) ?? nextUrls[0];
        if (url) {
          yield {
            type: "tool_call",
            id: "tc_fetch_2",
            name: "research_fetch",
            input: { url },
          };
          return;
        }
      }
      const sources = [...new Set([...urls])].slice(0, 5);
      const text =
        `Investigación iterativa (FakeLLM + tools reales).\n` +
        `Consultas: ${query} → ${followUp}\n` +
        `Fuentes\n` +
        sources.map((u, i) => `${i + 1}. ${u}`).join("\n");
      yield { type: "text_delta", text };
      yield { type: "done" };
    },
  };
}

async function runOne(
  runtime: ReturnType<typeof createAgentRuntime>,
  conversationId: string,
  prompt: string,
): Promise<{ text: string; latencyMs: number; errors: string[] }> {
  const started = Date.now();
  const errors: string[] = [];
  let text = "";
  for await (const ev of runtime.runTurn({
    conversationId,
    userMessage: prompt,
  }) as AsyncIterable<AgentEvent>) {
    if (ev.type === "text_delta") text += ev.text;
    else if (ev.type === "error") errors.push(ev.message);
  }
  return { text, latencyMs: Date.now() - started, errors };
}

async function main(): Promise<void> {
  if (!process.env.LOG_LEVEL) process.env.LOG_LEVEL = "silent";
  defaultResearchBudgetStore.reset();

  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const agent = await startLocalAgent(serverT);
  const client = new Client({ name: "research-live-tools", version: "0.0.0" });
  await client.connect(clientT);

  try {
    const tools = new ToolRegistry();
    await registerDiscoveredAgentTools(
      tools,
      client,
      createMcpRemoteExecutor(client),
      { policy: DEFAULT_TOOL_POLICY },
    );

    const reports: unknown[] = [];
    let ok = 0;

    for (const c of CASES) {
      defaultResearchBudgetStore.reset(c.id);
      const runtime = createAgentRuntime({
        llm: createIterativeResearchLLM(c.query, c.followUp),
        tools,
        memory: createFakeMemory(),
      });
      const { text, latencyMs, errors } = await runOne(
        runtime,
        c.id,
        `Investiga: ${c.query}`,
      );
      const snap = defaultResearchBudgetStore.snapshot(c.id);
      const success =
        snap.successfulSearches > 0 &&
        text.trim().length > 20 &&
        errors.length === 0;
      if (success) ok += 1;
      const row = {
        id: c.id,
        latencyMs,
        numberOfSearches: snap.searches,
        numberOfFetches: snap.fetches,
        successfulSearches: snap.successfulSearches,
        failedSearches: snap.failedSearches,
        successfulFetches: snap.successfulFetches,
        failedFetches: snap.failedFetches,
        sourcesUsed: snap.sourcesUsed.slice(0, 12),
        answerPreview: text.slice(0, 500),
        errors,
        success,
      };
      reports.push(row);
      console.log(
        JSON.stringify({
          id: c.id,
          success,
          latencyMs,
          searches: snap.searches,
          fetches: snap.fetches,
          okSearch: snap.successfulSearches,
          okFetch: snap.successfulFetches,
          sources: snap.sourcesUsed.length,
        }),
      );
    }

    type R = {
      latencyMs: number;
      numberOfSearches: number;
      numberOfFetches: number;
    };
    const rows = reports as R[];
    console.log(
      JSON.stringify(
        {
          mode: "fake-llm-real-tools",
          summary: {
            successfulCases: `${ok}/${CASES.length}`,
            averageLatencyMs: Math.round(
              rows.reduce((a, r) => a + r.latencyMs, 0) / rows.length,
            ),
            averageSearches: Number(
              (
                rows.reduce((a, r) => a + r.numberOfSearches, 0) / rows.length
              ).toFixed(2),
            ),
            averageFetches: Number(
              (
                rows.reduce((a, r) => a + r.numberOfFetches, 0) / rows.length
              ).toFixed(2),
            ),
          },
          cases: reports,
        },
        null,
        2,
      ),
    );
    process.exitCode = ok >= 3 ? 0 : 1;
  } finally {
    await client.close();
    await agent.shutdown();
  }
}

void main();
