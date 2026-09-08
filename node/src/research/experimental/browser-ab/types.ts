/**
 * PHASE 60.9.2 browser-ab — tipos experimentales.
 */
export type SearchProviderId = "duckduckgo" | "mojeek";
export type ExperimentMethod = "http" | "browser";

export type ObservationStatus =
  | "success"
  | "blocked"
  | "empty"
  | "error"
  | "timeout";

export type BlockReason =
  | "captcha_or_challenge"
  | "http_403"
  | "http_429"
  | "http_202"
  | "timeout"
  | "empty"
  | "navigation_failed"
  | "unknown"
  | null;

export type SerpHit = {
  readonly position: number;
  readonly title: string;
  readonly url: string;
  readonly domain: string;
  readonly snippet?: string;
};

export type BrowserDiagnostics = {
  readonly javascriptRequired?: boolean;
  readonly cookieCount?: number;
  readonly cookieNames?: readonly string[];
  readonly redirectCount?: number;
  readonly finalUrl?: string;
  readonly contentType?: string;
  readonly httpVersion?: string;
  readonly status?: number;
  readonly requestCount?: number;
  /** Canal Playwright usado (chrome / chromium / firefox) — sin fingerprint spoofing. */
  readonly browser?: string;
};

export type Observation = {
  readonly run: number;
  readonly queryId: string;
  readonly query: string;
  readonly provider: SearchProviderId;
  readonly method: ExperimentMethod;
  readonly status: ObservationStatus;
  readonly latencyMs: number;
  readonly resultCount: number;
  readonly blocked: boolean;
  readonly blockReason: BlockReason;
  readonly error?: string;
  readonly results: readonly SerpHit[];
  readonly diagnostics?: BrowserDiagnostics;
};

export type QuerySpec = {
  readonly id: string;
  readonly query: string;
};

/** Misma matriz PHASE 60.9 / 60.9.1 */
export const QUERY_MATRIX_60_9: readonly QuerySpec[] = [
  { id: "gen-pm", query: "best project management software" },
  { id: "gen-laptop", query: "best laptop for programming" },
  { id: "gen-inflation", query: "how does inflation work" },
  { id: "mx-sat", query: "SAT declaración anual" },
  { id: "mx-inf", query: "inflación México" },
  { id: "mx-uaq", query: "Universidad Autónoma de Querétaro" },
  { id: "mx-phd", query: "doctorado en inteligencia artificial México" },
  { id: "tech-react", query: "React documentation" },
  { id: "tech-pg", query: "PostgreSQL 17 documentation" },
  { id: "tech-java", query: "Java 21 virtual threads" },
  { id: "tech-pandas", query: "Python pandas dataframe" },
  { id: "ac-llm", query: "large language models reasoning" },
  { id: "ac-qml", query: "quantum machine learning" },
  { id: "ac-agentic", query: "agentic AI research" },
  { id: "fin-sp", query: "S&P 500 valuation" },
  { id: "fin-nvda", query: "NVDA earnings" },
  { id: "fin-yield", query: "Treasury yields" },
  { id: "fin-etf", query: "ETF portfolio allocation" },
  { id: "loc-tlax", query: "restaurants in Tlaxcala" },
  { id: "loc-cdmx", query: "things to do in Mexico City" },
];
