/**
 * Métricas deterministas del experimento browser-ab.
 */
import type { Observation, ExperimentMethod, SearchProviderId } from "./types.ts";

export function coverage(observations: readonly Observation[]): number {
  if (observations.length === 0) return 0;
  const ok = observations.filter((o) => o.status === "success" && o.resultCount > 0);
  return ok.length / observations.length;
}

export function blockRate(observations: readonly Observation[]): number {
  if (observations.length === 0) return 0;
  return observations.filter((o) => o.blocked).length / observations.length;
}

export function emptyRate(observations: readonly Observation[]): number {
  if (observations.length === 0) return 0;
  return observations.filter((o) => o.status === "empty").length / observations.length;
}

export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)]!;
}

export function latencyStats(observations: readonly Observation[]): {
  avg: number;
  p50: number;
  p95: number;
} {
  const vals = observations.map((o) => o.latencyMs);
  if (vals.length === 0) return { avg: 0, p50: 0, p95: 0 };
  const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  return { avg, p50: percentile(vals, 50), p95: percentile(vals, 95) };
}

export function avgResultCount(observations: readonly Observation[]): number {
  const ok = observations.filter((o) => o.status === "success");
  if (ok.length === 0) return 0;
  return Math.round((ok.reduce((a, o) => a + o.resultCount, 0) / ok.length) * 10) / 10;
}

export function urlJaccard(a: readonly string[], b: readonly string[]): number | null {
  if (a.length === 0 || b.length === 0) return null;
  const norm = (u: string) => u.replace(/\/$/, "").toLowerCase();
  const A = new Set(a.map(norm));
  const B = new Set(b.map(norm));
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? null : Math.round((inter / union) * 1000) / 1000;
}

export function topUrlOverlap(
  a: readonly { url: string }[],
  b: readonly { url: string }[],
  n: number,
): number | null {
  return urlJaccard(
    a.slice(0, n).map((x) => x.url),
    b.slice(0, n).map((x) => x.url),
  );
}

export function summarizeArm(
  observations: readonly Observation[],
  provider: SearchProviderId,
  method: ExperimentMethod,
) {
  const rows = observations.filter((o) => o.provider === provider && o.method === method);
  const lat = latencyStats(rows);
  return {
    provider,
    method,
    total: rows.length,
    coverage: Math.round(coverage(rows) * 1000) / 1000,
    blocked: Math.round(blockRate(rows) * 1000) / 1000,
    empty: Math.round(emptyRate(rows) * 1000) / 1000,
    avgMs: lat.avg,
    p50: lat.p50,
    p95: lat.p95,
    avgResults: avgResultCount(rows),
  };
}

export function classifyBlockReason(input: {
  status?: number;
  bodySnippet?: string;
  captchaVisible?: boolean;
}): import("./types.ts").BlockReason {
  if (input.captchaVisible) return "captcha_or_challenge";
  if (input.status === 403) return "http_403";
  if (input.status === 429) return "http_429";
  if (input.status === 202) return "http_202";
  const s = (input.bodySnippet ?? "").toLowerCase();
  if (s.includes("captcha") || s.includes("anomaly") || s.includes("challenge-form")) {
    return "captcha_or_challenge";
  }
  return "unknown";
}
