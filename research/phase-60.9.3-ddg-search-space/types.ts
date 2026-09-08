/**
 * PHASE 60.9.3 — DuckDuckGo search-space / interaction diagnostic types.
 */
export type ExperimentMethod =
  | "manual"
  | "playwright_fill"
  | "playwright_insertText"
  | "playwright_type"
  | "http";

export type InputMode = "fill" | "insertText" | "type";

export type ObservationStatus =
  | "SUCCESS"
  | "EMPTY"
  | "CAPTCHA"
  | "CHALLENGE"
  | "HTTP_ERROR"
  | "NAVIGATION_ERROR"
  | "RUNNER_ERROR"
  | "UNKNOWN";

export type SerpHit = {
  readonly position: number;
  readonly title: string;
  readonly url: string;
  readonly domain: string;
  readonly snippet?: string;
};

/** Flags obligatorios antes de clasificar anti-bot. */
export type InteractionTrace = {
  readonly queryEntered: boolean;
  readonly querySubmitted: boolean;
  readonly navigationOccurred: boolean;
  readonly resultsPageDetected: boolean;
  readonly challengeDetected: boolean;
  readonly inputValueBeforeSubmit: string | null;
  readonly inputValueAfterSubmit: string | null;
  readonly submitTriggered: boolean;
  readonly runnerFailure: boolean;
};

export type NetworkMeta = {
  readonly documentRequests: number;
  readonly navigationRequests: number;
  readonly redirectCount: number;
  readonly resourceCount: number;
  readonly lastDocumentStatus: number | null;
  readonly contentType: string | null;
  readonly cookiesSet: boolean;
  readonly cookieCount: number;
};

export type Observation = {
  readonly run: number;
  readonly queryId: string;
  readonly query: string;
  readonly method: ExperimentMethod;
  readonly status: ObservationStatus;
  readonly latencyMs: number;
  readonly resultCount: number;
  readonly blocked: boolean;
  readonly blockReason: string | null;
  readonly error?: string;
  readonly currentUrl?: string;
  readonly pageTitle?: string;
  readonly results: readonly SerpHit[];
  readonly interaction?: InteractionTrace;
  readonly network?: NetworkMeta;
  readonly notes?: string;
};

export type QuerySpec = {
  readonly id: string;
  readonly query: string;
  readonly category: "general" | "technical" | "mexico";
};

export const QUERY_MATRIX_60_9_3: readonly QuerySpec[] = [
  { id: "q1-general", query: "React TypeScript", category: "general" },
  { id: "q2-technical", query: "PostgreSQL 17", category: "technical" },
  {
    id: "q3-mexico",
    query: "universidades doctorado inteligencia artificial México",
    category: "mexico",
  },
];
