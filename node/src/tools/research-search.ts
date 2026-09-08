/**
 * research.search — tool MCP (PHASE 60.15).
 * Contrato semántico estable. Internos (Electron/DDG, Wikipedia, OpenAlex, …)
 * no se exponen al LLM; solo familias sourceFamily + provider "web".
 */
import { createHash } from "node:crypto";
import { unwrapToolBusinessInput } from "./fs-user-paths.ts";
import {
  defaultResearchBudgetStore,
  getDefaultResearchEngine,
  SearchError,
  type ResearchBudgetStore,
  type ResearchEngine,
  type SearchResponse,
} from "../research/index.ts";
import type { AgentTool, ToolContext, ToolResult } from "./types.ts";

export const RESEARCH_SEARCH_NAME = "research.search";

export const RESEARCH_SEARCH_DESCRIPTION =
  "Busca en Internet (lectura). Devuelve títulos, URLs y snippets normalizados. Úsala para investigar; luego lee fuentes importantes con research.fetch. No inventes resultados.";

export const RESEARCH_SEARCH_INPUT_SCHEMA = {
  type: "object",
  properties: {
    query: {
      type: "string",
      description: "Consulta de búsqueda.",
    },
    limit: {
      type: "integer",
      minimum: 1,
      maximum: 20,
      description: "Máximo de resultados (default 8).",
    },
    language: {
      type: "string",
      description: "Idioma preferido (opcional, p. ej. es, en).",
    },
    region: {
      type: "string",
      description: "Región opcional (informativa).",
    },
  },
  required: ["query"],
  additionalProperties: false,
} as const;

export type ResearchSearchToolOptions = {
  readonly budget?: ResearchBudgetStore;
  readonly engine?: ResearchEngine;
  /** Inyectable en tests. */
  readonly search?: (
    query: string,
    opts: {
      limit?: number;
      language?: string;
      region?: string;
      signal?: AbortSignal;
    },
  ) => Promise<SearchResponse>;
};

function fail(code: string, message: string): ToolResult {
  return { ok: false, error: { code, message } };
}

function logSafe(event: string, fields: Record<string, unknown>): void {
  try {
    process.stderr.write(
      `${JSON.stringify({ stage: "NODE", event, ...fields })}\n`,
    );
  } catch {
    /* ignore */
  }
}

function queryHash16(q: string): string {
  return createHash("sha256").update(q, "utf8").digest("hex").slice(0, 16);
}

/** Nombre visible al LLM — no exponer providers internos. */
function llmProviderLabel(_internal: string): string {
  return "web";
}

function toLlmResults(res: SearchResponse): unknown {
  return {
    query: res.query,
    provider: llmProviderLabel(res.provider),
    retrievedAt: res.retrievedAt,
    results: res.results.map((r) => ({
      title: r.title,
      url: r.url,
      ...(r.snippet ? { snippet: r.snippet } : {}),
      ...(r.domain ? { source: r.domain, domain: r.domain } : {}),
      ...(r.sourceFamily ? { sourceFamily: r.sourceFamily } : {}),
      ...(r.position !== undefined ? { position: r.position } : {}),
      ...(r.agreementCount !== undefined
        ? { agreementCount: r.agreementCount }
        : {}),
      ...(r.publishedAt ? { publishedAt: r.publishedAt } : {}),
    })),
  };
}

export function createResearchSearchTool(
  options: ResearchSearchToolOptions = {},
): AgentTool {
  const budget = options.budget ?? defaultResearchBudgetStore;

  return {
    name: RESEARCH_SEARCH_NAME,
    description: RESEARCH_SEARCH_DESCRIPTION,
    inputSchema: RESEARCH_SEARCH_INPUT_SCHEMA,
    executionMode: "automatic",
    async execute(input, context: ToolContext): Promise<ToolResult> {
      const business = unwrapToolBusinessInput(input);
      if (typeof business !== "object" || business === null) {
        return fail("invalid_input", "Se espera { query: string }.");
      }
      const rec = business as {
        query?: unknown;
        limit?: unknown;
        language?: unknown;
        region?: unknown;
      };
      if (typeof rec.query !== "string" || rec.query.trim().length === 0) {
        return fail("invalid_input", "query es obligatoria.");
      }

      const conversationId = context.conversationId || "default";
      const gate = budget.tryConsume(conversationId, "search");
      if (!gate.ok) {
        logSafe("research_search_limit", { conversationId });
        return fail(
          "web_research_limit_reached",
          "Se alcanzó el límite de búsquedas web de esta conversación. Continúa con lo ya obtenido.",
        );
      }

      const limit =
        typeof rec.limit === "number" && Number.isFinite(rec.limit)
          ? Math.trunc(rec.limit)
          : 8;
      const language =
        typeof rec.language === "string" ? rec.language : undefined;
      const region = typeof rec.region === "string" ? rec.region : undefined;
      const qh = queryHash16(rec.query);

      const started = Date.now();
      try {
        let response: SearchResponse;
        if (options.search) {
          response = await options.search(rec.query, {
            limit,
            language,
            region,
          });
        } else {
          const engine = options.engine ?? getDefaultResearchEngine();
          response = await engine.search({
            query: rec.query,
            limit,
            language,
            region,
          });
        }

        const sources = response.results.map((r) => r.url);
        budget.recordOutcome(conversationId, "search", true, sources);
        logSafe("research_search", {
          conversationId,
          queryHash: qh,
          resultCount: response.results.length,
          durationMs: Date.now() - started,
          success: true,
          providerId: response.provider,
        });
        return { ok: true, content: toLlmResults(response) };
      } catch (err) {
        budget.recordOutcome(conversationId, "search", false);
        const code =
          err instanceof SearchError ? err.code : "provider_unavailable";
        const message =
          err instanceof SearchError
            ? err.message
            : "Investigación web no disponible";
        const providerId =
          err instanceof SearchError && err.provider ? err.provider : "unknown";
        logSafe("research_search", {
          conversationId,
          queryHash: qh,
          durationMs: Date.now() - started,
          success: false,
          errorCode: code,
          providerId,
        });
        return fail(code, message);
      }
    },
  };
}
