/**
 * Evaluación real PHASE 60.3 — AgentRuntime + Claude + research.* + Internet.
 *
 *   cd gateway && LOG_LEVEL=silent npx tsx scripts/research-agent-live.ts
 *
 * Requiere ANTHROPIC_API_KEY (p. ej. gateway/.env). No imprime secretos.
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
import { createAnthropicProvider } from "../src/providers/anthropic.ts";
import { registerDiscoveredAgentTools } from "../src/tools/discover.ts";
import { createMcpRemoteExecutor } from "../src/tools/mcp/executor.ts";
import { DEFAULT_TOOL_POLICY } from "../src/tools/policy.ts";
import { ToolRegistry } from "../src/tools/registry.ts";

const CASES = [
  {
    id: "general",
    prompt:
      "¿Cuáles son las principales diferencias entre React y Vue en 2026? Usa búsqueda web y cita fuentes.",
  },
  {
    id: "mexico",
    prompt:
      "Investiga universidades mexicanas que tengan doctorados relacionados con inteligencia artificial o ciencia de datos. Cita fuentes.",
  },
  {
    id: "comparative",
    prompt:
      "Compara tres opciones de doctorado online relacionadas con IA. Analiza modalidad, duración, requisitos y costo si está disponible. Indica las fuentes.",
  },
  {
    id: "technical",
    prompt:
      "Investiga las mejores prácticas actuales para utilizar MCP con un agente basado en Claude. Cita fuentes.",
  },
  {
    id: "providers",
    prompt:
      "Investiga qué opciones existen actualmente para realizar búsqueda web sin API keys y compara sus ventajas y limitaciones. Cita fuentes.",
  },
] as const;

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

async function runOne(
  runtime: ReturnType<typeof createAgentRuntime>,
  conversationId: string,
  prompt: string,
): Promise<{
  text: string;
  latencyMs: number;
  events: AgentEvent[];
  errors: string[];
}> {
  const started = Date.now();
  const events: AgentEvent[] = [];
  const errors: string[] = [];
  let text = "";
  for await (const ev of runtime.runTurn({
    conversationId,
    userMessage: prompt,
  })) {
    events.push(ev);
    if (ev.type === "text_delta") text += ev.text;
    else if (ev.type === "error") {
      errors.push(
        `${ev.message}${ev.diagnostic ? ` [${ev.diagnostic.errorCode}]` : ""}`,
      );
    }
  }
  return { text, latencyMs: Date.now() - started, events, errors };
}

async function main(): Promise<void> {
  if (!process.env.LOG_LEVEL) process.env.LOG_LEVEL = "silent";
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("FAIL: falta ANTHROPIC_API_KEY");
    process.exitCode = 1;
    return;
  }

  // Fail-fast auth check (no secret in logs).
  {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    try {
      await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 8,
        messages: [{ role: "user", content: "ping" }],
      });
    } catch (err) {
      const status =
        err && typeof err === "object" && "status" in err
          ? (err as { status?: number }).status
          : undefined;
      console.error(
        JSON.stringify({
          fail: "anthropic_auth",
          httpStatus: status ?? null,
          hint: "ANTHROPIC_API_KEY inválida o sin crédito. Usa research-agent-live-tools.ts para evaluar tools reales.",
        }),
      );
      process.exitCode = 1;
      return;
    }
  }

  defaultResearchBudgetStore.reset();

  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const agent = await startLocalAgent(serverT);
  const client = new Client({ name: "research-live", version: "0.0.0" });
  await client.connect(clientT);

  try {
    const tools = new ToolRegistry();
    await registerDiscoveredAgentTools(
      tools,
      client,
      createMcpRemoteExecutor(client),
      { policy: DEFAULT_TOOL_POLICY },
    );

    const llm = createAnthropicProvider();
    const runtime = createAgentRuntime({
      llm,
      tools,
      memory: createFakeMemory(),
    });

    const reports: unknown[] = [];
    let ok = 0;

    for (const c of CASES) {
      defaultResearchBudgetStore.reset(c.id);
      const { text, latencyMs, errors } = await runOne(runtime, c.id, c.prompt);
      const snap = defaultResearchBudgetStore.snapshot(c.id);
      const hasSources =
        /fuentes/i.test(text) || /https?:\/\//i.test(text);
      const success =
        text.trim().length > 40 &&
        (snap.successfulSearches > 0 || /https?:\/\//i.test(text));
      if (success) ok += 1;
      reports.push({
        id: c.id,
        question: c.prompt,
        latencyMs,
        numberOfSearches: snap.searches,
        numberOfFetches: snap.fetches,
        numberOfWebOperations: snap.total,
        successfulSearches: snap.successfulSearches,
        failedSearches: snap.failedSearches,
        successfulFetches: snap.successfulFetches,
        failedFetches: snap.failedFetches,
        sourcesUsed: snap.sourcesUsed.slice(0, 12),
        hasSourcesSection: hasSources,
        answerChars: text.length,
        answerPreview: text.slice(0, 800),
        errors,
        success,
      });
      console.log(
        JSON.stringify({
          id: c.id,
          success,
          latencyMs,
          searches: snap.searches,
          fetches: snap.fetches,
          sources: snap.sourcesUsed.length,
          errors,
        }),
      );
    }

    type R = {
      latencyMs: number;
      numberOfSearches: number;
      numberOfFetches: number;
    };
    const rows = reports as R[];
    const avgLatency =
      rows.reduce((a, r) => a + r.latencyMs, 0) / rows.length;
    const avgSearches =
      rows.reduce((a, r) => a + r.numberOfSearches, 0) / rows.length;
    const avgFetches =
      rows.reduce((a, r) => a + r.numberOfFetches, 0) / rows.length;

    console.log(
      JSON.stringify(
        {
          summary: {
            successfulCases: `${ok}/${CASES.length}`,
            averageLatencyMs: Math.round(avgLatency),
            averageSearches: Number(avgSearches.toFixed(2)),
            averageFetches: Number(avgFetches.toFixed(2)),
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
