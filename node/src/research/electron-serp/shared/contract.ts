/**
 * Contrato SERP Electron — autosuficiente (sin capa scraping).
 */
export type SerpHealth =
  | "HEALTHY"
  | "DEGRADED"
  | "BROKEN"
  | "BLOCKED"
  | "UNKNOWN";

export type BlockDetection = {
  readonly blocked: boolean;
  readonly reason?:
    | "captcha"
    | "http_403"
    | "http_429"
    | "http_challenge"
    | string;
};

export type SerpHit = {
  readonly title: string;
  readonly url: string;
  readonly snippet?: string;
  readonly provider: string;
  readonly position: number;
  readonly confidence: number;
};

export type SerpSource = {
  readonly id: string;
  readonly name: string;
  readonly endpoint: string;
  readonly enabled: boolean;
  readonly accessNotes?: string;
};

export type SerpSearchQuery = {
  readonly query: string;
  readonly limit?: number;
  readonly language?: string;
  readonly region?: string;
  readonly signal?: AbortSignal;
  readonly htmlOverride?: string;
  readonly httpStatusOverride?: number;
};

export type SerpRequestSpec = {
  readonly method: "GET" | "POST";
  readonly url: string;
  readonly headers?: Readonly<Record<string, string>>;
};

export type SerpFetchResponse = {
  readonly html: string;
  readonly status: number;
};

export type SerpSearchOutcome = {
  readonly hits: readonly SerpHit[];
  readonly health: SerpHealth;
  readonly blocked: boolean;
  readonly recovered: boolean;
  readonly latencyMs: number;
  readonly fingerprint: string;
  readonly meanConfidence: number;
  readonly html?: string;
  readonly pageTitle: string | null;
  readonly finalUrl: string | null;
};

export type SerpAdapter = {
  readonly id: string;
  readonly name: string;
  buildRequest(query: SerpSearchQuery): SerpRequestSpec;
  detectBlock(response: SerpFetchResponse): BlockDetection;
  getSource(): SerpSource;
  search(query: SerpSearchQuery): Promise<SerpSearchOutcome>;
};
