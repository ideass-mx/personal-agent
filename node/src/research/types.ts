/**
 * Contrato interno research.search() — PHASE Web Intelligence (capa de búsqueda).
 * Aislado del AgentRuntime / MCP / chat. Solo lectura HTTP → resultados normalizados.
 */

export type SearchProviderId =
  | "websurfx"
  | "librey"
  /** Experimental SPIKE (PHASE 60.1-A); optionalDependency. */
  | "agent-search-mcp"
  /** Experimental PHASE 60.6 — motor propio (no producción MCP todavía). */
  | "personal-agent-search"
  /** PHASE 60.12 — General Web vía Electron SERP. */
  | "electron-duckduckgo"
  /** PHASE 60.15 — etiqueta semántica del pipeline compuesto (MCP). */
  | "web";

/** Familia semántica expuesta al agente (no el provider interno). */
export type ResearchSourceFamily =
  | "web"
  | "knowledge"
  | "academic"
  | "official";

export interface SearchRequest {
  readonly query: string;
  readonly limit?: number;
  readonly language?: string;
  /** Informativo; no todos los providers lo usan. */
  readonly region?: string;
  readonly safeSearch?: boolean;
  /** Cancelación opcional (AbortSignal nativo de Node). */
  readonly signal?: AbortSignal;
}

export interface SearchResult {
  readonly title: string;
  readonly url: string;
  readonly snippet?: string;
  readonly domain?: string;
  readonly publishedAt?: string;
  /** Familia semántica (web / knowledge / academic / official). */
  readonly sourceFamily?: ResearchSourceFamily;
  /** Posición 1-based en el ranking final. */
  readonly position?: number;
  /** Cuántos providers aportaron la misma URL (si aplica). */
  readonly agreementCount?: number;
}

export interface SearchResponse {
  readonly query: string;
  readonly provider: string;
  readonly results: SearchResult[];
  readonly retrievedAt: string;
}

export interface SearchProvider {
  readonly id: SearchProviderId;
  search(request: SearchRequest): Promise<SearchResponse>;
}

export type SearchErrorCode =
  | "invalid_input"
  | "http_error"
  | "timeout"
  | "invalid_json"
  | "response_too_large"
  | "provider_unavailable"
  | "aborted"
  | "redirect_limit";

export class SearchError extends Error {
  readonly code: SearchErrorCode;
  readonly provider?: string;
  readonly status?: number;

  constructor(
    code: SearchErrorCode,
    message: string,
    options?: { provider?: string; status?: number; cause?: unknown },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "SearchError";
    this.code = code;
    this.provider = options?.provider;
    this.status = options?.status;
  }
}

/** Límites de seguridad por defecto (lectura). */
export const DEFAULT_SEARCH_LIMIT = 10;
export const MAX_SEARCH_LIMIT = 50;
export const DEFAULT_SEARCH_TIMEOUT_MS = 15_000;
export const MAX_SEARCH_RESPONSE_BYTES = 2 * 1024 * 1024;
export const MAX_SEARCH_REDIRECTS = 3;
