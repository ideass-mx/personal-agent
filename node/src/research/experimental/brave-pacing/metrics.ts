/**
 * PHASE 60.13.1 — Brave pacing metrics (puros / testables).
 * Observación solamente; sin evasión.
 */

export const BRAVE_PACING_QUERIES = [
  "PostgreSQL 17",
  "React TypeScript",
  "universidades doctorado IA México",
] as const;

export const BRAVE_PACING_INTERVALS_MS = [
  1_000, 5_000, 10_000, 20_000, 30_000, 60_000,
] as const;

export type BravePacingOutcome =
  | "SUCCESS"
  | "CHALLENGE"
  | "BLOCKED"
  | "EMPTY"
  | "UNKNOWN";

export type BravePacingEnvSnapshot = {
  readonly webdriver: boolean | null;
  readonly userAgent: string | null;
  readonly webglVendor: string | null;
  readonly webglRenderer: string | null;
  readonly viewport: { width: number | null; height: number | null };
  readonly devicePixelRatio: number | null;
  readonly languages: readonly string[];
};

export type BravePacingSearchRecord = {
  readonly timestamp: string;
  readonly sessionId: string;
  readonly intervalMs: number;
  readonly searchNumber: number;
  readonly query: string;
  readonly timeSincePreviousSearchMs: number | null;
  readonly totalSessionElapsedMs: number;
  readonly navigation: boolean;
  readonly queryEntered: boolean;
  readonly querySubmitted: boolean;
  readonly challenge: boolean;
  readonly blocked: boolean;
  readonly resultCount: number;
  readonly organicResultCount: number;
  readonly extractionMethod: string;
  readonly latencyMs: number;
  readonly outcome: BravePacingOutcome;
  readonly env?: BravePacingEnvSnapshot;
};

export type BravePacingSessionSummary = {
  readonly sessionId: string;
  readonly intervalMs: number;
  readonly searches: number;
  readonly successCount: number;
  readonly successRate: number;
  readonly sustainedSearchCapacity: number;
  readonly firstChallengeAt: number | null;
  readonly firstBlockAt: number | null;
  readonly timeToFirstChallengeMs: number | null;
  readonly timeToFirstBlockMs: number | null;
  readonly totalTimeMs: number;
  readonly realSearchesPerMinute: number;
  readonly records: readonly BravePacingSearchRecord[];
};

/** Clasifica outcome sin confundir EMPTY con BLOCKED. */
export function classifyPacingOutcome(input: {
  challenge: boolean;
  blocked: boolean;
  organicResultCount: number;
  broken?: boolean;
}): BravePacingOutcome {
  if (input.challenge || input.blocked) {
    return input.blocked && !input.challenge ? "BLOCKED" : "CHALLENGE";
  }
  if (input.broken) return "UNKNOWN";
  if (input.organicResultCount > 0) return "SUCCESS";
  return "EMPTY";
}

/**
 * Sustained Search Capacity = búsquedas SUCCESS consecutivas desde el inicio
 * antes del primer CHALLENGE/BLOCKED.
 */
export function sustainedSearchCapacity(
  records: readonly BravePacingSearchRecord[],
): number {
  // Capacity = SUCCESS consecutivos desde el inicio antes del primer CHALLENGE/BLOCKED.
  let capacity = 0;
  for (const r of records) {
    if (r.outcome === "CHALLENGE" || r.outcome === "BLOCKED") break;
    if (r.outcome === "SUCCESS") capacity += 1;
  }
  return capacity;
}

/** Índice 1-based de la primera búsqueda CHALLENGE, o null. */
export function firstChallengeSearchNumber(
  records: readonly BravePacingSearchRecord[],
): number | null {
  const hit = records.find((r) => r.outcome === "CHALLENGE" || r.challenge);
  return hit ? hit.searchNumber : null;
}

export function firstBlockSearchNumber(
  records: readonly BravePacingSearchRecord[],
): number | null {
  const hit = records.find(
    (r) => r.outcome === "BLOCKED" || (r.blocked && !r.challenge),
  );
  // También si outcome CHALLENGE se trata como block operativo para capacidad
  const challenge = records.find((r) => r.outcome === "CHALLENGE");
  if (hit) return hit.searchNumber;
  return challenge ? challenge.searchNumber : null;
}

export function successRate(
  records: readonly BravePacingSearchRecord[],
): number {
  if (!records.length) return 0;
  return records.filter((r) => r.outcome === "SUCCESS").length / records.length;
}

/** Búsquedas/minuto reales: successes+all / (elapsed minutes). */
export function realSearchDensityPerMinute(
  records: readonly BravePacingSearchRecord[],
): number {
  if (!records.length) return 0;
  const last = records[records.length - 1]!;
  const elapsedMin = Math.max(last.totalSessionElapsedMs, 1) / 60_000;
  return records.length / elapsedMin;
}

export function summarizeSession(
  sessionId: string,
  intervalMs: number,
  records: readonly BravePacingSearchRecord[],
): BravePacingSessionSummary {
  const firstCh = firstChallengeSearchNumber(records);
  const firstBl = firstBlockSearchNumber(records);
  const chRec = firstCh
    ? records.find((r) => r.searchNumber === firstCh)
    : undefined;
  const blRec = firstBl
    ? records.find((r) => r.searchNumber === firstBl)
    : undefined;
  const last = records[records.length - 1];
  return {
    sessionId,
    intervalMs,
    searches: records.length,
    successCount: records.filter((r) => r.outcome === "SUCCESS").length,
    successRate: successRate(records),
    sustainedSearchCapacity: sustainedSearchCapacity(records),
    firstChallengeAt: firstCh,
    firstBlockAt: firstBl,
    timeToFirstChallengeMs: chRec?.totalSessionElapsedMs ?? null,
    timeToFirstBlockMs: blRec?.totalSessionElapsedMs ?? null,
    totalTimeMs: last?.totalSessionElapsedMs ?? 0,
    realSearchesPerMinute: realSearchDensityPerMinute(records),
    records,
  };
}

export type IntervalAggregate = {
  readonly intervalMs: number;
  readonly sessions: number;
  readonly meanSuccessRate: number;
  readonly meanSustainedCapacity: number;
  readonly meanTimeToFirstChallengeMs: number | null;
  readonly meanRealSearchesPerMinute: number;
  readonly capacities: readonly number[];
  readonly successRates: readonly number[];
};

export function aggregateByInterval(
  sessions: readonly BravePacingSessionSummary[],
): IntervalAggregate[] {
  const by = new Map<number, BravePacingSessionSummary[]>();
  for (const s of sessions) {
    const list = by.get(s.intervalMs) ?? [];
    list.push(s);
    by.set(s.intervalMs, list);
  }
  const out: IntervalAggregate[] = [];
  for (const [intervalMs, list] of [...by.entries()].sort((a, b) => a[0] - b[0])) {
    const rates = list.map((s) => s.successRate);
    const caps = list.map((s) => s.sustainedSearchCapacity);
    const times = list
      .map((s) => s.timeToFirstChallengeMs)
      .filter((t): t is number => t != null);
    const dens = list.map((s) => s.realSearchesPerMinute);
    out.push({
      intervalMs,
      sessions: list.length,
      meanSuccessRate: avg(rates),
      meanSustainedCapacity: avg(caps),
      meanTimeToFirstChallengeMs: times.length ? avg(times) : null,
      meanRealSearchesPerMinute: avg(dens),
      capacities: caps,
      successRates: rates,
    });
  }
  return out;
}

function avg(xs: number[]): number {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/**
 * Correlación de Pearson simple (intervalMs vs metric).
 * |r| >= 0.5 → "observamos correlación"; else "no evidencia suficiente".
 */
export function pearsonCorrelation(
  xs: readonly number[],
  ys: readonly number[],
): number | null {
  if (xs.length !== ys.length || xs.length < 3) return null;
  const mx = avg([...xs]);
  const my = avg([...ys]);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < xs.length; i++) {
    const a = xs[i]! - mx;
    const b = ys[i]! - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (dx === 0 || dy === 0) return null;
  return num / Math.sqrt(dx * dy);
}

export function describeCorrelation(r: number | null): string {
  if (r == null || !Number.isFinite(r)) {
    return "no encontramos evidencia suficiente de correlación";
  }
  const abs = Math.abs(r);
  if (abs >= 0.7) return `observamos una correlación fuerte (r=${r.toFixed(2)})`;
  if (abs >= 0.4) return `observamos una correlación moderada (r=${r.toFixed(2)})`;
  return `no encontramos evidencia suficiente de correlación (r=${r.toFixed(2)})`;
}

/** Fisher-Yates shuffle (mutates copy). */
export function shuffledOrder<T>(items: readonly T[], seed: number): T[] {
  const arr = [...items];
  let s = seed >>> 0;
  const rand = () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

/** Plan de sesiones: 3 por intervalo, orden mezclado. */
export function buildSessionPlan(
  intervalsMs: readonly number[] = BRAVE_PACING_INTERVALS_MS,
  sessionsPerInterval = 3,
  seed = 60_131,
): Array<{ sessionId: string; intervalMs: number; replicate: number }> {
  const plan: Array<{ sessionId: string; intervalMs: number; replicate: number }> =
    [];
  for (const intervalMs of intervalsMs) {
    for (let r = 1; r <= sessionsPerInterval; r++) {
      plan.push({
        sessionId: `i${intervalMs}-r${r}`,
        intervalMs,
        replicate: r,
      });
    }
  }
  return shuffledOrder(plan, seed);
}

export type CandidateDecision = "A" | "B" | "C" | "D";

/**
 * Clasificación práctica (heurística documentada; no causalidad).
 * A — CANDIDATO: mean capacity ≥ 10 y success ≥ 0.8 en intervalos ≥ 20s
 * B — CON LIMITACIONES: capacity ≥ 5 en algún intervalo ≥ 10s
 * C — EXPERIMENTAL: alta varianza
 * D — DESCARTAR: ningún intervalo mejora de forma útil
 */
export function classifyBraveCandidate(
  aggregates: readonly IntervalAggregate[],
): { decision: CandidateDecision; label: string; rationale: string } {
  if (!aggregates.length) {
    return {
      decision: "D",
      label: "DESCARTAR",
      rationale: "Sin agregados",
    };
  }
  const caps = aggregates.flatMap((a) => [...a.capacities]);
  const varianceHigh =
    caps.length >= 6 &&
    Math.max(...caps) - Math.min(...caps) >= 10 &&
    stddev(caps) >= 3.5;

  const slow = aggregates.filter((a) => a.intervalMs >= 20_000);
  const mid = aggregates.filter((a) => a.intervalMs >= 10_000);
  if (
    slow.some((a) => a.meanSustainedCapacity >= 10 && a.meanSuccessRate >= 0.8)
  ) {
    return {
      decision: "A",
      label: "CANDIDATO",
      rationale:
        "Intervalos ≥20s muestran capacidad sostenida alta y success rate alto (observación).",
    };
  }
  if (
    mid.some((a) => a.meanSustainedCapacity >= 5 && a.meanSuccessRate >= 0.5)
  ) {
    return {
      decision: "B",
      label: "CANDIDATO CON LIMITACIONES",
      rationale:
        "Pacing más lento mejora la capacidad relativa a intervalos cortos, con límites (observación).",
    };
  }
  if (varianceHigh) {
    return {
      decision: "C",
      label: "EXPERIMENTAL",
      rationale: "Alta varianza entre sesiones; conclusión débil.",
    };
  }
  return {
    decision: "D",
    label: "DESCARTAR",
    rationale:
      "El intervalo no mejora suficientemente la estabilidad observada.",
  };
}

function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = avg(xs);
  return Math.sqrt(avg(xs.map((x) => (x - m) ** 2)));
}

/** Asserts payload has no secrets (cookies/tokens/credentials). */
export function assertNoSecretsInPacingPayload(payload: unknown): void {
  const s = JSON.stringify(payload);
  if (/Set-Cookie|api[_-]?key|subscription.?token|password|authorization:/i.test(s)) {
    throw new Error("pacing payload contains forbidden secret-like fields");
  }
}

/** Genera SVG simple interval vs metric. */
export function renderScatterSvg(
  title: string,
  points: readonly { x: number; y: number; label?: string }[],
  xLabel: string,
  yLabel: string,
  width = 640,
  height = 360,
): string {
  const pad = 48;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs, 0);
  const maxX = Math.max(...xs, 1);
  const minY = Math.min(...ys, 0);
  const maxY = Math.max(...ys, 1);
  const sx = (x: number) =>
    pad + ((x - minX) / (maxX - minX || 1)) * (width - 2 * pad);
  const sy = (y: number) =>
    height - pad - ((y - minY) / (maxY - minY || 1)) * (height - 2 * pad);
  const dots = points
    .map(
      (p) =>
        `<circle cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="5" fill="#2563eb"/>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#fff"/>
  <text x="${width / 2}" y="24" text-anchor="middle" font-family="sans-serif" font-size="14">${escapeXml(title)}</text>
  <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="#333"/>
  <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" stroke="#333"/>
  <text x="${width / 2}" y="${height - 12}" text-anchor="middle" font-family="sans-serif" font-size="11">${escapeXml(xLabel)}</text>
  <text x="14" y="${height / 2}" text-anchor="middle" font-family="sans-serif" font-size="11" transform="rotate(-90 14 ${height / 2})">${escapeXml(yLabel)}</text>
  ${dots}
</svg>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
