/**
 * Tipos del Personal Agent Search Engine (PHASE 60.6 / 60.6.1).
 * Independientes del contrato legacy SearchProvider (adapter aparte).
 */

export type SearchFreshness = "any" | "day" | "week" | "month" | "year";

export type SearchIntent =
  | "general"
  | "research"
  | "academic"
  | "technical"
  | "news"
  | "financial"
  | "local";

export type SourceType =
  | "official"
  | "government"
  | "university"
  | "academic"
  | "documentation"
  | "news"
  | "commercial"
  | "community"
  | "blog"
  | "other";

/** Aparición de un URL en un provider (posición 1-based). */
export type ProviderHit = {
  readonly provider: string;
  readonly position: number;
};

export type ProviderStatus =
  | "success"
  | "empty"
  | "timeout"
  | "rate_limited"
  | "blocked"
  | "http_error"
  | "parse_error"
  | "unavailable"
  | "unsupported"
  | "aborted";

export type ProviderReport = {
  readonly provider: string;
  readonly status: ProviderStatus;
  readonly resultCount: number;
  readonly elapsedMs: number;
};

/** Configuración interna por provider (no expuesta al usuario). */
export type ProviderConfig = {
  readonly timeoutMs: number;
  readonly maxResults: number;
  readonly enabled: boolean;
  readonly maxRetries?: number;
};

export type PaSearchRequest = {
  readonly query: string;
  readonly limit?: number;
  readonly language?: string;
  readonly region?: string;
  readonly safeSearch?: boolean;
  readonly freshness?: SearchFreshness;
  readonly intent?: SearchIntent;
  readonly signal?: AbortSignal;
};

export type PaSearchResult = {
  readonly title: string;
  readonly url: string;
  readonly snippet?: string;
  readonly domain: string;
  readonly sourceType: SourceType;
  readonly relevanceScore?: number;
  readonly qualityScore?: number;
  readonly publishedAt?: string;
  readonly retrievedAt: string;
  readonly provider: string;
  /** Posición 1-based en la lista del provider primario. */
  readonly providerPosition?: number;
  /** Hits multi-provider tras merge (agreement + position). */
  readonly providerHits?: readonly ProviderHit[];
  readonly agreementCount?: number;
};

export type PaSearchResponse = {
  readonly query: string;
  readonly results: PaSearchResult[];
  readonly providers: string[];
  readonly elapsedMs: number;
  /** @deprecated prefer providerReports */
  readonly partialFailures: Array<{ provider: string; code: string }>;
  readonly providerReports: ProviderReport[];
  /** Plan interno (diagnóstico/benchmark; no UI). */
  readonly plan?: {
    readonly intent: SearchIntent;
    readonly language: string;
    readonly region?: string;
    readonly categories: readonly string[];
    readonly selectedProviders: readonly string[];
    readonly intentInferred: boolean;
  };
};

export type PaSearchProviderId =
  | "duckduckgo"
  | "duckduckgo-ia"
  | "mojeek"
  | "wikipedia"
  | "arxiv"
  | "openalex"
  | "crossref"
  | "hackernews"
  | "mx-official";

export type PaSearchProvider = {
  readonly id: PaSearchProviderId;
  search(request: PaSearchRequest): Promise<PaSearchResult[]>;
};

export class PaSearchError extends Error {
  readonly code:
    | "invalid_input"
    | "http_error"
    | "timeout"
    | "rate_limited"
    | "parse_error"
    | "invalid_response"
    | "unavailable"
    | "aborted"
    | "all_providers_failed";
  readonly provider?: string;

  constructor(
    code: PaSearchError["code"],
    message: string,
    options?: { provider?: string; cause?: unknown },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "PaSearchError";
    this.code = code;
    this.provider = options?.provider;
  }
}

export const DEFAULT_PA_LIMIT = 10;
export const MAX_PA_LIMIT = 30;
export const DEFAULT_PROVIDER_TIMEOUT_MS = 6_000;
export const DEFAULT_GLOBAL_TIMEOUT_MS = 7_500;

export const DEFAULT_PROVIDER_CONFIGS: Record<
  PaSearchProviderId,
  ProviderConfig
> = {
  // HTML scrapers: deshabilitados por defecto (CAPTCHA → UNSUITABLE como primario)
  duckduckgo: {
    timeoutMs: 4_500,
    maxResults: 10,
    enabled: false,
    maxRetries: 1,
  },
  mojeek: {
    timeoutMs: 4_500,
    maxResults: 10,
    enabled: false,
    maxRetries: 1,
  },
  "duckduckgo-ia": {
    timeoutMs: 4_000,
    maxResults: 10,
    enabled: true,
    maxRetries: 0,
  },
  wikipedia: { timeoutMs: 3_000, maxResults: 8, enabled: true, maxRetries: 0 },
  arxiv: { timeoutMs: 2_000, maxResults: 8, enabled: true, maxRetries: 0 },
  openalex: { timeoutMs: 4_500, maxResults: 8, enabled: true, maxRetries: 0 },
  crossref: { timeoutMs: 4_500, maxResults: 8, enabled: true, maxRetries: 0 },
  hackernews: { timeoutMs: 4_000, maxResults: 10, enabled: true, maxRetries: 0 },
  "mx-official": {
    timeoutMs: 500,
    maxResults: 10,
    enabled: true,
    maxRetries: 0,
  },
};
