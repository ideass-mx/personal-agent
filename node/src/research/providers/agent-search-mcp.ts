/**
 * Adapter experimental — agent-search-mcp (SPIKE PHASE 60.1-A).
 *
 * Usa la API programática `searchWithFallback` (NO wrap de stdout CLI).
 * Zero-key por defecto. No registra MCP ni toca AgentRuntime.
 *
 * Dependencia: optionalDependency `agent-search-mcp`.
 * Carga vía createRequire (audit 12A prohíbe import() dinámico en src/).
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  clampLimit,
  normalizeResult,
  requireQuery,
  takeResults,
} from "../normalize.ts";
import type {
  SearchProvider,
  SearchRequest,
  SearchResponse,
} from "../types.ts";
import { SearchError } from "../types.ts";

export const AGENT_SEARCH_MCP_ID = "agent-search-mcp" as const;

/** Motores zero-key razonables para ES/EN sin API keys. */
export const DEFAULT_AGENT_SEARCH_ENGINES = [
  "duckduckgo",
  "bing",
  "wikipedia",
  "startpage",
  "mojeek",
] as const;

export type AgentSearchEngineFailure = {
  readonly engine: string;
  readonly type: string;
  readonly message?: string;
};

export type AgentSearchDiagnostics = {
  readonly engines: string[];
  readonly partialFailures: AgentSearchEngineFailure[];
  readonly sourceCount: number;
  readonly failedSources: string[];
  readonly cacheHit?: boolean;
  readonly detectedLanguage?: string;
};

export type AgentSearchRawResult = {
  title?: unknown;
  url?: unknown;
  snippet?: unknown;
  evidence?: { published_at?: string | null };
  sources?: unknown;
};

export type AgentSearchRawResponse = {
  query?: unknown;
  engines?: unknown;
  results?: AgentSearchRawResult[];
  partialFailures?: Array<{
    engine?: unknown;
    type?: unknown;
    message?: unknown;
  }>;
  cache_hit?: unknown;
  detected_language?: unknown;
  meta?: { total?: unknown };
};

export type AgentSearchFn = (options: {
  query: string;
  count?: number;
  engines?: string[];
  language?: string;
  signal?: AbortSignal;
  waterfall?: boolean;
}) => Promise<AgentSearchRawResponse>;

export type AgentSearchMcpProviderOptions = {
  readonly timeoutMs?: number;
  /** Override inyectable (tests). */
  readonly searchFn?: AgentSearchFn;
  readonly engines?: readonly string[];
  readonly waterfall?: boolean;
  readonly onDiagnostics?: (diag: AgentSearchDiagnostics) => void;
};

const requireFromHere = createRequire(
  (() => {
    try {
      const url = import.meta.url;
      if (typeof url === "string" && url.length > 0 && url !== "file://") {
        return fileURLToPath(url);
      }
    } catch {
      /* CJS bundle */
    }
    // eslint-disable-next-line no-undef
    if (typeof __filename === "string" && __filename) return __filename;
    if (typeof process.argv[1] === "string" && process.argv[1]) {
      return process.argv[1];
    }
    return path.join(process.cwd(), "package.json");
  })(),
);

function loadDefaultSearchFn(): AgentSearchFn {
  try {
    const mod = requireFromHere(
      "agent-search-mcp/dist/tools/free-search.js",
    ) as {
      searchWithFallback?: AgentSearchFn;
    };
    if (typeof mod.searchWithFallback !== "function") {
      throw new Error("searchWithFallback no exportado");
    }
    return mod.searchWithFallback.bind(mod);
  } catch (err) {
    throw new SearchError(
      "provider_unavailable",
      "agent-search-mcp no instalado o API programática inaccesible",
      { provider: AGENT_SEARCH_MCP_ID, cause: err },
    );
  }
}

function mapDiagnostics(raw: AgentSearchRawResponse): AgentSearchDiagnostics {
  const failures = (raw.partialFailures ?? []).map((f) => {
    const engine = typeof f.engine === "string" ? f.engine : "unknown";
    const type = typeof f.type === "string" ? f.type : "unknown";
    const message = typeof f.message === "string" ? f.message : undefined;
    return { engine, type, ...(message ? { message } : {}) };
  });
  const engines = Array.isArray(raw.engines)
    ? raw.engines.filter((e): e is string => typeof e === "string")
    : [];
  const failedSources = [...new Set(failures.map((f) => f.engine))];
  return {
    engines,
    partialFailures: failures,
    sourceCount: engines.length,
    failedSources,
    ...(typeof raw.cache_hit === "boolean" ? { cacheHit: raw.cache_hit } : {}),
    ...(typeof raw.detected_language === "string"
      ? { detectedLanguage: raw.detected_language }
      : {}),
  };
}

export function createAgentSearchMcpProvider(
  options: AgentSearchMcpProviderOptions = {},
): SearchProvider {
  const engines = options.engines ?? DEFAULT_AGENT_SEARCH_ENGINES;
  let cachedFn: AgentSearchFn | undefined = options.searchFn;

  return {
    id: AGENT_SEARCH_MCP_ID,
    async search(request: SearchRequest): Promise<SearchResponse> {
      let query: string;
      try {
        query = requireQuery(request.query);
      } catch (err) {
        throw new SearchError(
          "invalid_input",
          err instanceof Error ? err.message : "query inválida",
          { provider: AGENT_SEARCH_MCP_ID, cause: err },
        );
      }
      const limit = clampLimit(request.limit);

      if (!cachedFn) {
        cachedFn = loadDefaultSearchFn();
      }

      const prevMode = process.env.SEARCH_PROVIDER_MODE;
      process.env.SEARCH_PROVIDER_MODE = "free_only";

      let raw: AgentSearchRawResponse;
      try {
        const timeoutMs = options.timeoutMs;
        const signal =
          request.signal ??
          (timeoutMs !== undefined
            ? AbortSignal.timeout(timeoutMs)
            : undefined);

        raw = await cachedFn({
          query,
          count: limit,
          engines: [...engines],
          language: request.language,
          signal,
          waterfall: options.waterfall ?? false,
        });
      } catch (err) {
        if (err instanceof SearchError) throw err;
        if (err instanceof RangeError) {
          throw new SearchError("invalid_input", err.message, {
            provider: AGENT_SEARCH_MCP_ID,
            cause: err,
          });
        }
        const name = err instanceof Error ? err.name : "";
        if (name === "AbortError" || name === "TimeoutError") {
          throw new SearchError("timeout", "Timeout agent-search-mcp", {
            provider: AGENT_SEARCH_MCP_ID,
            cause: err,
          });
        }
        throw new SearchError(
          "provider_unavailable",
          "Fallo en agent-search-mcp",
          { provider: AGENT_SEARCH_MCP_ID, cause: err },
        );
      } finally {
        if (prevMode === undefined) {
          delete process.env.SEARCH_PROVIDER_MODE;
        } else {
          process.env.SEARCH_PROVIDER_MODE = prevMode;
        }
      }

      const diag = mapDiagnostics(raw);
      options.onDiagnostics?.(diag);

      const list = Array.isArray(raw.results) ? raw.results : [];
      const normalized = list.map((item) => {
        const published =
          item?.evidence && typeof item.evidence.published_at === "string"
            ? item.evidence.published_at
            : undefined;
        return normalizeResult({
          title: item?.title,
          url: item?.url,
          snippet: item?.snippet,
          publishedAt: published,
        });
      });

      return {
        query,
        provider: AGENT_SEARCH_MCP_ID,
        results: takeResults(normalized, limit),
        retrievedAt: new Date().toISOString(),
      };
    },
  };
}
