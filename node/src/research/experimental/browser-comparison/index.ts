/**
 * PHASE 60.9.4 — utilidades diagnósticas (DDG manual vs Playwright).
 * Sin evasión anti-bot.
 */

export const QUERY_60_9_4 = "PostgreSQL 17";

export type ComparisonMethod = "manual" | "playwright";

export type RunObservation = {
  readonly method: ComparisonMethod;
  readonly run: number;
  readonly query: string;
  readonly queryEntered: boolean | null;
  readonly querySubmitted: boolean | null;
  readonly finalUrl: string | null;
  readonly navigationCount: number | null;
  readonly redirectChain: readonly string[];
  readonly httpStatus: number | null;
  readonly challengeDetected: boolean | null;
  readonly organicResultsDetected: boolean | null;
  readonly resultCount: number | null;
  readonly pageTitle: string | null;
  readonly resourceCount: number | null;
  readonly cookieNames: readonly string[];
  readonly elapsedMs: number | null;
  readonly organicDomains?: readonly string[];
  readonly notes?: string;
};

/** Canónicos viven en electron-serp (prod); el lab re-exporta. */
export {
  detectChallenge,
  filterOrganicHits,
  organicResultsDetected,
} from "../../electron-serp/duckduckgo/page.ts";

import { sanitizeUrl } from "../../electron-serp/diagnostics.ts";
export { sanitizeUrl };

const SENSITIVE_URL_RE =
  /token|secret|api[_-]?key|session|credential|authorization|passwd|password/i;

export function normalizeObservation(raw: unknown): RunObservation {
  if (!raw || typeof raw !== "object") {
    throw new Error("invalid observation");
  }
  const o = raw as Record<string, unknown>;
  const method = o.method === "manual" || o.method === "playwright" ? o.method : null;
  if (!method) throw new Error("method required");
  const cookieNames = Array.isArray(o.cookieNames)
    ? o.cookieNames.filter((x): x is string => typeof x === "string").map((n) => n.slice(0, 64))
    : [];
  const redirectChain = Array.isArray(o.redirectChain)
    ? o.redirectChain
        .filter((x): x is string => typeof x === "string")
        .map((u) => sanitizeUrl(u) ?? u)
        .filter((u) => !SENSITIVE_URL_RE.test(u))
    : [];

  return {
    method,
    run: typeof o.run === "number" ? o.run : 0,
    query: typeof o.query === "string" ? o.query : QUERY_60_9_4,
    queryEntered: typeof o.queryEntered === "boolean" ? o.queryEntered : null,
    querySubmitted: typeof o.querySubmitted === "boolean" ? o.querySubmitted : null,
    finalUrl: sanitizeUrl(typeof o.finalUrl === "string" ? o.finalUrl : null),
    navigationCount: typeof o.navigationCount === "number" ? o.navigationCount : null,
    redirectChain,
    httpStatus: typeof o.httpStatus === "number" ? o.httpStatus : null,
    challengeDetected: typeof o.challengeDetected === "boolean" ? o.challengeDetected : null,
    organicResultsDetected:
      typeof o.organicResultsDetected === "boolean" ? o.organicResultsDetected : null,
    resultCount: typeof o.resultCount === "number" ? o.resultCount : null,
    pageTitle: typeof o.pageTitle === "string" ? o.pageTitle.slice(0, 200) : null,
    resourceCount: typeof o.resourceCount === "number" ? o.resourceCount : null,
    cookieNames,
    elapsedMs: typeof o.elapsedMs === "number" ? o.elapsedMs : null,
    organicDomains: Array.isArray(o.organicDomains)
      ? o.organicDomains.filter((x): x is string => typeof x === "string")
      : undefined,
    notes: typeof o.notes === "string" ? o.notes.slice(0, 400) : undefined,
  };
}

export type ComparisonSummary = {
  readonly manualEntered: string;
  readonly playwrightEntered: string;
  readonly manualSubmitted: string;
  readonly playwrightSubmitted: string;
  readonly manualNavigation: string;
  readonly playwrightNavigation: string;
  readonly manualChallenge: string;
  readonly playwrightChallenge: string;
  readonly manualOrganic: string;
  readonly playwrightOrganic: string;
  readonly manualAvgResults: number | null;
  readonly playwrightAvgResults: number | null;
  readonly manualAvgResources: number | null;
  readonly playwrightAvgResources: number | null;
  readonly manualAvgLatency: number | null;
  readonly playwrightAvgLatency: number | null;
  readonly manualSuccessRate: number;
  readonly playwrightSuccessRate: number;
  readonly manualChallengeRate: number;
  readonly playwrightChallengeRate: number;
  readonly manualOrganicResultRate: number;
  readonly playwrightOrganicResultRate: number;
  readonly deltaOrganicResultRate: number;
  readonly deltaChallengeRate: number;
  readonly caseId: "A" | "B" | "C" | "D";
  readonly caseLabel: string;
};

function rate(rows: readonly RunObservation[], pred: (o: RunObservation) => boolean): number {
  if (rows.length === 0) return 0;
  return rows.filter(pred).length / rows.length;
}

function avg(nums: readonly (number | null)[]): number | null {
  const v = nums.filter((x): x is number => typeof x === "number");
  if (v.length === 0) return null;
  return Math.round(v.reduce((a, b) => a + b, 0) / v.length);
}

function frac(rows: readonly RunObservation[], pred: (o: RunObservation) => boolean | null): string {
  const known = rows.filter((o) => pred(o) !== null);
  const ok = known.filter((o) => pred(o) === true).length;
  return `${ok}/${rows.length}`;
}

export function computeSummary(observations: readonly RunObservation[]): ComparisonSummary {
  const manual = observations.filter((o) => o.method === "manual");
  const pw = observations.filter((o) => o.method === "playwright");

  const success = (o: RunObservation) =>
    o.organicResultsDetected === true && o.challengeDetected !== true;
  const challenge = (o: RunObservation) => o.challengeDetected === true;
  const organic = (o: RunObservation) => o.organicResultsDetected === true;

  const manualSuccessRate = rate(manual, success);
  const playwrightSuccessRate = rate(pw, success);
  const manualChallengeRate = rate(manual, challenge);
  const playwrightChallengeRate = rate(pw, challenge);
  const manualOrganicResultRate = rate(manual, organic);
  const playwrightOrganicResultRate = rate(pw, organic);

  let caseId: "A" | "B" | "C" | "D";
  let caseLabel: string;
  if (manualSuccessRate >= 0.67 && playwrightSuccessRate >= 0.67) {
    caseId = "A";
    caseLabel = "MANUAL ≈ PLAYWRIGHT";
  } else if (manualSuccessRate >= 0.67 && playwrightChallengeRate >= 0.67 && playwrightSuccessRate < 0.34) {
    caseId = "B";
    caseLabel = "MANUAL SUCCESS / PLAYWRIGHT CHALLENGE";
  } else if (manualSuccessRate < 0.34 && playwrightSuccessRate < 0.34) {
    caseId = "D";
    caseLabel = "MANUAL FAIL / PLAYWRIGHT FAIL";
  } else {
    caseId = "C";
    caseLabel = "MANUAL SUCCESS / PLAYWRIGHT VARIABLE";
  }

  return {
    manualEntered: frac(manual, (o) => o.queryEntered),
    playwrightEntered: frac(pw, (o) => o.queryEntered),
    manualSubmitted: frac(manual, (o) => o.querySubmitted),
    playwrightSubmitted: frac(pw, (o) => o.querySubmitted),
    manualNavigation: frac(manual, (o) =>
      o.navigationCount === null ? null : o.navigationCount > 0,
    ),
    playwrightNavigation: frac(pw, (o) =>
      o.navigationCount === null ? null : o.navigationCount > 0,
    ),
    manualChallenge: frac(manual, (o) => o.challengeDetected),
    playwrightChallenge: frac(pw, (o) => o.challengeDetected),
    manualOrganic: frac(manual, (o) => o.organicResultsDetected),
    playwrightOrganic: frac(pw, (o) => o.organicResultsDetected),
    manualAvgResults: avg(manual.map((o) => o.resultCount)),
    playwrightAvgResults: avg(pw.map((o) => o.resultCount)),
    manualAvgResources: avg(manual.map((o) => o.resourceCount)),
    playwrightAvgResources: avg(pw.map((o) => o.resourceCount)),
    manualAvgLatency: avg(manual.map((o) => o.elapsedMs)),
    playwrightAvgLatency: avg(pw.map((o) => o.elapsedMs)),
    manualSuccessRate,
    playwrightSuccessRate,
    manualChallengeRate,
    playwrightChallengeRate,
    manualOrganicResultRate,
    playwrightOrganicResultRate,
    deltaOrganicResultRate: Math.round((manualOrganicResultRate - playwrightOrganicResultRate) * 1000) / 1000,
    deltaChallengeRate: Math.round((playwrightChallengeRate - manualChallengeRate) * 1000) / 1000,
    caseId,
    caseLabel,
  };
}

export function formatSummaryTable(s: ComparisonSummary): string {
  const cell = (a: string | number | null, b: string | number | null) =>
    `${String(a ?? "n/a").padStart(8)}  ${String(b ?? "n/a").padStart(10)}`;
  return [
    "PHASE 60.9.4",
    "                         Manual    Playwright",
    "------------------------------------------------",
    `Query entered          ${cell(s.manualEntered, s.playwrightEntered)}`,
    `Query submitted        ${cell(s.manualSubmitted, s.playwrightSubmitted)}`,
    `Navigation             ${cell(s.manualNavigation, s.playwrightNavigation)}`,
    `Challenge              ${cell(s.manualChallenge, s.playwrightChallenge)}`,
    `Organic results        ${cell(s.manualOrganic, s.playwrightOrganic)}`,
    `Avg result count       ${cell(s.manualAvgResults, s.playwrightAvgResults)}`,
    `Avg resources          ${cell(s.manualAvgResources, s.playwrightAvgResources)}`,
    `Avg latency            ${cell(s.manualAvgLatency !== null ? `${s.manualAvgLatency} ms` : null, s.playwrightAvgLatency !== null ? `${s.playwrightAvgLatency} ms` : null)}`,
  ].join("\n");
}
