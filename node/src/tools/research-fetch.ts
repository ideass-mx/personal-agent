/**
 * research.fetch — tool MCP (PHASE 60.3).
 * Lee una URL pública HTTP(S) y devuelve texto extraído (con SSRF).
 */
import { unwrapToolBusinessInput } from "./fs-user-paths.ts";
import {
  defaultResearchBudgetStore,
  researchFetch,
  type ResearchBudgetStore,
  type ResearchFetchResult,
} from "../research/index.ts";
import type { AgentTool, ToolContext, ToolResult } from "./types.ts";

export const RESEARCH_FETCH_NAME = "research.fetch";

export const RESEARCH_FETCH_DESCRIPTION =
  "Lee el contenido textual de una URL pública (http/https) encontrada en una búsqueda. No uses localhost ni redes privadas. Devuelve texto legible para citar fuentes.";

export const RESEARCH_FETCH_INPUT_SCHEMA = {
  type: "object",
  properties: {
    url: {
      type: "string",
      description: "URL http(s) absoluta a leer.",
    },
  },
  required: ["url"],
  additionalProperties: false,
} as const;

export type ResearchFetchToolOptions = {
  readonly budget?: ResearchBudgetStore;
  readonly fetchPage?: (url: string) => Promise<ResearchFetchResult>;
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

export function createResearchFetchTool(
  options: ResearchFetchToolOptions = {},
): AgentTool {
  const budget = options.budget ?? defaultResearchBudgetStore;

  return {
    name: RESEARCH_FETCH_NAME,
    description: RESEARCH_FETCH_DESCRIPTION,
    inputSchema: RESEARCH_FETCH_INPUT_SCHEMA,
    executionMode: "automatic",
    async execute(input, context: ToolContext): Promise<ToolResult> {
      const business = unwrapToolBusinessInput(input);
      if (typeof business !== "object" || business === null) {
        return fail("invalid_input", "Se espera { url: string }.");
      }
      const rec = business as { url?: unknown };
      if (typeof rec.url !== "string" || rec.url.trim().length === 0) {
        return fail("invalid_input", "url es obligatoria.");
      }

      const conversationId = context.conversationId || "default";
      const gate = budget.tryConsume(conversationId, "fetch");
      if (!gate.ok) {
        logSafe("research_fetch_limit", { conversationId });
        return fail(
          "web_research_limit_reached",
          "Se alcanzó el límite de lecturas web de esta conversación. Continúa con lo ya obtenido.",
        );
      }

      const started = Date.now();
      const result = options.fetchPage
        ? await options.fetchPage(rec.url.trim())
        : await researchFetch({ url: rec.url.trim() });

      if (!result.ok) {
        budget.recordOutcome(conversationId, "fetch", false);
        logSafe("research_fetch", {
          conversationId,
          durationMs: Date.now() - started,
          success: false,
          errorCode: result.code,
        });
        return fail(result.code, result.message);
      }

      budget.recordOutcome(conversationId, "fetch", true, [
        result.finalUrl,
        result.url,
      ]);
      logSafe("research_fetch", {
        conversationId,
        durationMs: Date.now() - started,
        success: true,
        textChars: result.text.length,
        truncated: result.truncated,
      });

      return {
        ok: true,
        content: {
          url: result.url,
          finalUrl: result.finalUrl,
          ...(result.title ? { title: result.title } : {}),
          text: result.text,
          truncated: result.truncated,
          ...(result.contentType ? { contentType: result.contentType } : {}),
        },
      };
    },
  };
}
