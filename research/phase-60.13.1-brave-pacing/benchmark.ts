/**
 * PHASE 60.13.1 — Brave Search pacing & blocking correlation experiment.
 *
 *   npm run research:benchmark:60.13.1
 *
 * Env opcionales:
 *   BRAVE_PACING_MAX_SEARCHES=15
 *   BRAVE_PACING_SESSIONS=3
 *   BRAVE_PACING_SEED=60131
 *   BRAVE_PACING_SKIP_RECOVERY=1
 *   BRAVE_PACING_QUICK=1  → intervalos reducidos (solo smoke local; no DoD)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElectronBraveSerpAdapter } from "../../node/src/research/experimental/electron-serp/brave-provider.ts";
import {
  BRAVE_PACING_INTERVALS_MS,
  BRAVE_PACING_QUERIES,
  aggregateByInterval,
  assertNoSecretsInPacingPayload,
  buildSessionPlan,
  classifyBraveCandidate,
  classifyPacingOutcome,
  describeCorrelation,
  pearsonCorrelation,
  renderScatterSvg,
  summarizeSession,
  type BravePacingEnvSnapshot,
  type BravePacingSearchRecord,
  type BravePacingSessionSummary,
} from "../../node/src/research/experimental/brave-pacing/index.ts";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = here;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

async function captureEnv(
  adapter: ReturnType<typeof createElectronBraveSerpAdapter>,
): Promise<BravePacingEnvSnapshot | undefined> {
  try {
    return await adapter.snapshotDiagnostics();
  } catch {
    return undefined;
  }
}

async function runPacingSession(input: {
  sessionId: string;
  intervalMs: number;
  maxSearches: number;
  queries: readonly string[];
}): Promise<BravePacingSessionSummary> {
  const adapter = createElectronBraveSerpAdapter({ mode: "reusable" });
  const records: BravePacingSearchRecord[] = [];
  const sessionStarted = Date.now();
  let prevEnd: number | null = null;
  let envSnap: BravePacingEnvSnapshot | undefined;

  try {
    await adapter.warmUp();
    envSnap = await captureEnv(adapter);

    for (let i = 1; i <= input.maxSearches; i++) {
      if (i > 1) {
        await sleep(input.intervalMs);
      }
      const query = input.queries[(i - 1) % input.queries.length]!;
      const t0 = Date.now();
      let navigation = true;
      let queryEntered = true;
      let querySubmitted = true;
      let challenge = false;
      let blocked = false;
      let organic = 0;
      let extractionMethod = "selector";
      let outcome = classifyPacingOutcome({
        challenge: false,
        blocked: false,
        organicResultCount: 0,
      });

      try {
        const out = await adapter.search({ query, limit: 10 });
        challenge = out.blocked || out.health === "BLOCKED";
        blocked = challenge;
        organic = out.hits.length;
        extractionMethod = out.strategy ?? "selector";
        navigation = !!out.finalUrl;
        queryEntered = true;
        querySubmitted = true;
        outcome = classifyPacingOutcome({
          challenge,
          blocked,
          organicResultCount: organic,
        });
      } catch {
        outcome = "UNKNOWN";
        blocked = true;
      }

      const now = Date.now();
      const record: BravePacingSearchRecord = {
        timestamp: new Date(now).toISOString(),
        sessionId: input.sessionId,
        intervalMs: input.intervalMs,
        searchNumber: i,
        query,
        timeSincePreviousSearchMs:
          prevEnd == null ? null : Math.max(0, t0 - prevEnd),
        totalSessionElapsedMs: now - sessionStarted,
        navigation,
        queryEntered,
        querySubmitted,
        challenge,
        blocked,
        resultCount: organic,
        organicResultCount: organic,
        extractionMethod,
        latencyMs: now - t0,
        outcome,
        env: envSnap,
      };
      records.push(record);
      prevEnd = now;

      // Detener sesión ante challenge/block persistente (sin resolver).
      if (outcome === "CHALLENGE" || outcome === "BLOCKED") {
        break;
      }
    }
  } finally {
    await adapter.close();
  }

  return summarizeSession(input.sessionId, input.intervalMs, records);
}

async function runRecoveryExperiment(): Promise<Record<string, unknown>> {
  const waits = [60_000, 5 * 60_000];
  const results: Array<Record<string, unknown>> = [];

  for (const waitMs of waits) {
    const adapter = createElectronBraveSerpAdapter({ mode: "reusable" });
    try {
      await adapter.warmUp();
      // Provocar challenge con ráfaga corta (intervalo 1s, hasta 12).
      let challenged = false;
      let searchesBefore = 0;
      for (let i = 1; i <= 12; i++) {
        if (i > 1) await sleep(1000);
        const out = await adapter.search({
          query: BRAVE_PACING_QUERIES[(i - 1) % 3]!,
          limit: 8,
        });
        searchesBefore = i;
        if (out.blocked || out.health === "BLOCKED") {
          challenged = true;
          break;
        }
      }
      if (!challenged) {
        results.push({
          waitMs,
          challenged: false,
          note: "no challenge after burst — cannot test persistence",
          searchesBefore,
        });
        continue;
      }
      await sleep(waitMs);
      const after = await adapter.search({
        query: "PostgreSQL 17",
        limit: 8,
      });
      const stillBlocked = after.blocked || after.health === "BLOCKED";
      results.push({
        waitMs,
        challenged: true,
        searchesBefore,
        afterWaitBlocked: stillBlocked,
        afterWaitHits: after.hits.length,
        persistent: stillBlocked,
        temporary: !stillBlocked,
      });
    } finally {
      await adapter.close();
    }
  }

  return { experiments: results };
}

async function main() {
  const quick = process.env.BRAVE_PACING_QUICK === "1";
  const maxSearches = envInt("BRAVE_PACING_MAX_SEARCHES", quick ? 5 : 15);
  const sessionsPer = envInt("BRAVE_PACING_SESSIONS", quick ? 1 : 3);
  const seed = envInt("BRAVE_PACING_SEED", 60_131);
  const intervals = quick
    ? ([1_000, 5_000, 10_000] as const)
    : BRAVE_PACING_INTERVALS_MS;
  const skipRecovery =
    process.env.BRAVE_PACING_SKIP_RECOVERY === "1" || quick;

  const plan = buildSessionPlan([...intervals], sessionsPer, seed);
  console.error(
    `60.13.1 plan: ${plan.length} sessions, maxSearches=${maxSearches}, order=${plan.map((p) => `${p.intervalMs}:${p.replicate}`).join(",")}`,
  );

  const sessions: BravePacingSessionSummary[] = [];
  for (const step of plan) {
    console.error(
      `→ session ${step.sessionId} interval=${step.intervalMs}ms`,
    );
    const summary = await runPacingSession({
      sessionId: step.sessionId,
      intervalMs: step.intervalMs,
      maxSearches,
      queries: BRAVE_PACING_QUERIES,
    });
    sessions.push(summary);
    console.error(
      `  capacity=${summary.sustainedSearchCapacity} success=${summary.successCount}/${summary.searches} firstChallenge=${summary.firstChallengeAt ?? "—"}`,
    );
  }

  const aggregates = aggregateByInterval(sessions);
  const xs = aggregates.map((a) => a.intervalMs);
  const corrSuccess = pearsonCorrelation(
    xs,
    aggregates.map((a) => a.meanSuccessRate),
  );
  const corrCapacity = pearsonCorrelation(
    xs,
    aggregates.map((a) => a.meanSustainedCapacity),
  );
  const corrTime = pearsonCorrelation(
    xs,
    aggregates.map((a) => a.meanTimeToFirstChallengeMs ?? 0),
  );

  let recovery: Record<string, unknown> | null = null;
  if (!skipRecovery) {
    console.error("→ recovery experiment (60s, 5min waits)...");
    recovery = await runRecoveryExperiment();
  }

  const candidate = classifyBraveCandidate(aggregates);

  // Caso A/B/C/D de correlación (escenarios del brief)
  let pacingCase = "D_INCONCLUSIVE";
  const shortCap = avg(
    aggregates.filter((a) => a.intervalMs <= 5_000).map((a) => a.meanSustainedCapacity),
  );
  const longCap = avg(
    aggregates.filter((a) => a.intervalMs >= 20_000).map((a) => a.meanSustainedCapacity),
  );
  if (corrCapacity != null && corrCapacity >= 0.5 && longCap > shortCap + 2) {
    pacingCase = "A_PACING_CORRELATION";
  } else if (
    aggregates.every((a) => a.meanSustainedCapacity <= 4) &&
    aggregates.every((a) => a.meanSuccessRate < 0.5)
  ) {
    pacingCase = "B_INTERVAL_ALONE_INSUFFICIENT";
  } else if (
    Math.abs((corrCapacity ?? 0)) < 0.3 &&
    aggregates.every((a) => a.meanSustainedCapacity >= 3)
  ) {
    pacingCase = "C_CUMULATIVE_SESSION_EFFECT";
  } else if (
    aggregates.some((a) => Math.max(...a.capacities) - Math.min(...a.capacities) >= 8)
  ) {
    pacingCase = "D_HIGH_VARIANCE";
  }

  const report = {
    phase: "60.13.1",
    generatedAt: new Date().toISOString(),
    constraints: {
      electron: true,
      showFalse: true,
      noStealth: true,
      noProxy: true,
      noCaptchaSolve: true,
      productionUnchanged: true,
    },
    config: {
      intervalsMs: [...intervals],
      sessionsPerInterval: sessionsPer,
      maxSearches,
      seed,
      queryCycle: [...BRAVE_PACING_QUERIES],
      sessionOrder: plan.map((p) => p.sessionId),
      quick,
    },
    sessions,
    aggregates,
    correlations: {
      intervalVsSuccessRate: corrSuccess,
      intervalVsSuccessRateNote: describeCorrelation(corrSuccess),
      intervalVsSustainedCapacity: corrCapacity,
      intervalVsSustainedCapacityNote: describeCorrelation(corrCapacity),
      intervalVsTimeToChallenge: corrTime,
      intervalVsTimeToChallengeNote: describeCorrelation(corrTime),
    },
    pacingCase,
    candidate,
    recovery,
  };

  assertNoSecretsInPacingPayload(report);

  mkdirSync(outDir, { recursive: true });
  const rawPath = join(outDir, "raw.json");
  writeFileSync(rawPath, JSON.stringify(report, null, 2));

  // Charts
  writeFileSync(
    join(outDir, "chart-interval-vs-success.svg"),
    renderScatterSvg(
      "Search Interval vs Success Rate",
      aggregates.map((a) => ({
        x: a.intervalMs / 1000,
        y: a.meanSuccessRate * 100,
      })),
      "Interval (s)",
      "Success rate (%)",
    ),
  );
  writeFileSync(
    join(outDir, "chart-interval-vs-capacity.svg"),
    renderScatterSvg(
      "Search Interval vs Sustained Search Capacity",
      aggregates.map((a) => ({
        x: a.intervalMs / 1000,
        y: a.meanSustainedCapacity,
      })),
      "Interval (s)",
      "Sustained capacity",
    ),
  );
  writeFileSync(
    join(outDir, "chart-interval-vs-time-to-challenge.svg"),
    renderScatterSvg(
      "Search Interval vs Time To First Challenge",
      aggregates
        .filter((a) => a.meanTimeToFirstChallengeMs != null)
        .map((a) => ({
          x: a.intervalMs / 1000,
          y: (a.meanTimeToFirstChallengeMs ?? 0) / 1000,
        })),
      "Interval (s)",
      "Time to challenge (s)",
    ),
  );

  const tableRows = sessions
    .map(
      (s) =>
        `| ${s.intervalMs}ms | ${s.sessionId} | ${s.searches} | ${s.successCount} | ${s.firstChallengeAt ?? "—"} | ${s.firstBlockAt ?? "—"} | ${Math.round(s.totalTimeMs / 1000)}s | ${s.sustainedSearchCapacity} | ${(s.successRate * 100).toFixed(0)}% | ${s.realSearchesPerMinute.toFixed(2)}/min |`,
    )
    .join("\n");

  const aggRows = aggregates
    .map(
      (a) =>
        `| ${a.intervalMs}ms | ${(a.meanSuccessRate * 100).toFixed(0)}% | ${a.meanSustainedCapacity.toFixed(1)} | ${a.meanTimeToFirstChallengeMs != null ? Math.round(a.meanTimeToFirstChallengeMs / 1000) + "s" : "—"} | ${a.meanRealSearchesPerMinute.toFixed(2)}/min | caps=[${a.capacities.join(",")}] |`,
    )
    .join("\n");

  const md = `# PHASE 60.13.1 — Brave pacing summary

**Fecha:** ${report.generatedAt}
**Pacing case:** \`${pacingCase}\`
**Personal Agent decision:** **${candidate.decision} — ${candidate.label}**
**Producción:** UNCHANGED

## Hipótesis

> A mayor intervalo entre búsquedas, menor probabilidad de challenge/block.

## Observación (no causalidad)

- Interval vs success rate: ${describeCorrelation(corrSuccess)}
- Interval vs sustained capacity: ${describeCorrelation(corrCapacity)}
- Interval vs time-to-challenge: ${describeCorrelation(corrTime)}

## Agregados por intervalo

| Interval | Success rate | Sustained capacity | Time to challenge | Real density | Capacities |
| --- | --- | --- | --- | --- | --- |
${aggRows}

## Sesiones

| Interval | Session | Searches | Success | First Challenge | First Block | Total Time | Capacity | Success% | Density |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
${tableRows}

## Recovery (experimento separado)

${recovery ? "```json\n" + JSON.stringify(recovery, null, 2) + "\n```" : "_omitido (SKIP_RECOVERY o QUICK)_"}

## Gráficas

- \`chart-interval-vs-success.svg\`
- \`chart-interval-vs-capacity.svg\`
- \`chart-interval-vs-time-to-challenge.svg\`

## Respuestas explícitas

1. ¿Correlación intervalo↔bloqueo? ${describeCorrelation(corrCapacity)}
2. Success rate por intervalo: ver tabla agregados.
3. Sustained Search Capacity por intervalo: ver tabla.
4. Tiempo hasta primer challenge: ver \`Time to challenge\`.
5. ¿Intervalo vs acumulación? Caso pacing=\`${pacingCase}\` (hipótesis; causalidad no demostrada).
6. ¿10/20/30/60s cambian el comportamiento? Comparar filas ≥10s vs ≤5s en agregados.
7. ¿Challenge desaparece tras esperar? Ver recovery.
8. ¿Temporal o persistente? Ver recovery \`persistent\`/\`temporary\`.
9. ¿Suficiente para investigación real? Decisión **${candidate.label}**.
10. ¿Candidato? **${candidate.decision}** — ${candidate.rationale}
11. ¿Pasar a Mojeek? ${candidate.decision === "D" || candidate.decision === "C" ? "Sí, priorizar Mojeek bajo las mismas condiciones." : "Sí como siguiente comparación; Brave no reemplaza DDG."}
12. Experimento adicional si inconclusivo: pacing + fetch interleaved (patrón research real) y cooldown entre sesiones.

## Artefactos

- \`${rawPath}\`
- \`docs/architecture/phase-60.13.1-brave-pacing.md\`
`;

  writeFileSync(join(outDir, "summary.md"), md);
  console.log(md);
  console.error(`Wrote ${rawPath}`);
}

function avg(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
