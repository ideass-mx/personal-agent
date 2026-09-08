/**
 * PHASE 60.12 — Electron SERP runtime optimization benchmark.
 *
 *   npm run research:benchmark:60.12 -w @mxideass/node
 *
 * Mide cold vs warm, research-session, idle (timeouts cortos como proxy),
 * stress serial, memoria y calidad vs 60.11.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createElectronDuckDuckGoSearchProvider,
  researchFetch,
  type SearchResponse,
} from "../../node/src/research/index.ts";

const here = dirname(fileURLToPath(import.meta.url));
const researchRoot = join(here, "..");

const QUERIES = [
  "PostgreSQL 17",
  "What is quantum computing",
  "cómo funciona DNS",
  "SAT México",
  "React TypeScript",
  "Banxico",
  "machine learning research",
  "Kubernetes networking",
  "UAQ",
  "open source licenses explained",
  "Spring Boot",
  "climate change overview",
  "UNAM",
  "how does a REST API work",
  "Python programming",
  "inflación México",
  "large language models",
  "containerization vs virtualization",
  "DOF",
  "best laptop for programming",
];

const OFFICIAL =
  /\.(gob\.mx|gov|edu|ac\.)|sat\.gob|banxico|dof\.gob|unam\.mx|uaq\.mx|postgresql\.org|arxiv\.org/i;

function pct(xs: number[], p: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
  return s[i]!;
}

function avg(xs: number[]): number {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function scoreTop3(res: SearchResponse): number {
  const top = res.results.slice(0, 3);
  if (!top.length) return 0;
  let sum = 0;
  for (const r of top) {
    if (OFFICIAL.test(r.url) || OFFICIAL.test(r.domain ?? "")) sum += 1;
    else if (r.title.length > 5) sum += 0.5;
  }
  return sum;
}

function rssMb(): number {
  return Math.round((process.memoryUsage().rss / (1024 * 1024)) * 10) / 10;
}

async function countElectronish(): Promise<number> {
  try {
    const { execSync } = await import("node:child_process");
    const out = execSync("ps -eo args= 2>/dev/null | grep -c '[e]lectron-main.cjs' || true", {
      encoding: "utf8",
    }).trim();
    return Number(out) || 0;
  } catch {
    return -1;
  }
}

type LatencyRow = {
  label: string;
  ok: boolean;
  latencyMs: number;
  resultCount: number;
  top3: number;
  official: number;
  rssMb: number;
};

async function main() {
  const started = Date.now();
  const rssInitial = rssMb();
  const procsBefore = await countElectronish();

  // --- Strategy A: cold oneshot (close after each) ---
  const cold: LatencyRow[] = [];
  for (let i = 0; i < 5; i++) {
    const provider = createElectronDuckDuckGoSearchProvider({ idleTimeoutMs: 0 });
    const q = QUERIES[i]!;
    const t0 = Date.now();
    try {
      const res = await provider.search({ query: q, limit: 10 });
      cold.push({
        label: `cold-${i + 1}`,
        ok: true,
        latencyMs: Date.now() - t0,
        resultCount: res.results.length,
        top3: scoreTop3(res),
        official: res.results.filter((r) => OFFICIAL.test(r.url)).length,
        rssMb: rssMb(),
      });
    } catch {
      cold.push({
        label: `cold-${i + 1}`,
        ok: false,
        latencyMs: Date.now() - t0,
        resultCount: 0,
        top3: 0,
        official: 0,
        rssMb: rssMb(),
      });
    }
    await provider.close();
  }

  // --- Strategy B: warm research-session ---
  const warmProvider = createElectronDuckDuckGoSearchProvider({
    idleTimeoutMs: 0,
  });
  const warm: LatencyRow[] = [];
  const memoryTrail: Array<{ at: string; rssMb: number }> = [
    { at: "initial", rssMb: rssInitial },
  ];
  for (let i = 0; i < 10; i++) {
    const q = QUERIES[i]!;
    const t0 = Date.now();
    try {
      const res = await warmProvider.search({ query: q, limit: 10 });
      warm.push({
        label: `warm-${i + 1}`,
        ok: true,
        latencyMs: Date.now() - t0,
        resultCount: res.results.length,
        top3: scoreTop3(res),
        official: res.results.filter((r) => OFFICIAL.test(r.url)).length,
        rssMb: rssMb(),
      });
    } catch {
      warm.push({
        label: `warm-${i + 1}`,
        ok: false,
        latencyMs: Date.now() - t0,
        resultCount: 0,
        top3: 0,
        official: 0,
        rssMb: rssMb(),
      });
    }
    if (i === 0 || i === 4 || i === 9) {
      memoryTrail.push({ at: `after_warm_${i + 1}`, rssMb: rssMb() });
    }
  }

  // --- Research session: search + fetch interleaved ---
  const sessionStarted = Date.now();
  const sessionRows: Array<Record<string, unknown>> = [];
  for (let i = 0; i < 5; i++) {
    const q = QUERIES[i + 5]!;
    const t0 = Date.now();
    let searchOk = false;
    let fetchOk = false;
    let url = "";
    let searchMs = 0;
    let fetchMs = 0;
    try {
      const res = await warmProvider.search({ query: q, limit: 5 });
      searchMs = Date.now() - t0;
      searchOk = res.results.length > 0;
      url = res.results[0]?.url ?? "";
      if (url) {
        const tf = Date.now();
        try {
          await researchFetch({ url });
          fetchOk = true;
        } catch {
          fetchOk = false;
        }
        fetchMs = Date.now() - tf;
      }
    } catch {
      searchMs = Date.now() - t0;
    }
    sessionRows.push({
      query: q,
      searchOk,
      fetchOk,
      searchMs,
      fetchMs,
      urlHost: url ? new URL(url).hostname : "",
    });
  }
  const sessionTotalMs = Date.now() - sessionStarted;

  // --- Stress: 20 serial on warm ---
  const stress: number[] = [];
  let stressOk = 0;
  for (let i = 0; i < 20; i++) {
    const q = QUERIES[i % QUERIES.length]!;
    const t0 = Date.now();
    try {
      const res = await warmProvider.search({ query: q, limit: 8 });
      stress.push(Date.now() - t0);
      if (res.results.length > 0) stressOk += 1;
    } catch {
      stress.push(Date.now() - t0);
    }
    if (i === 19) memoryTrail.push({ at: "after_stress_20", rssMb: rssMb() });
  }

  const procsDuring = await countElectronish();
  const cleanupT0 = Date.now();
  await warmProvider.close();
  const cleanupMs = Date.now() - cleanupT0;
  await new Promise((r) => setTimeout(r, 500));
  const procsAfter = await countElectronish();
  memoryTrail.push({ at: "after_close", rssMb: rssMb() });

  // --- Idle proxy (short timeouts stand in for 1/5/15 min strategies) ---
  const idleExperiments: Array<Record<string, unknown>> = [];
  for (const [label, ms] of [
    ["proxy_1min", 80],
    ["proxy_5min", 120],
    ["proxy_15min", 180],
  ] as const) {
    const p = createElectronDuckDuckGoSearchProvider({ idleTimeoutMs: ms });
    const t0 = Date.now();
    try {
      await p.search({ query: "PostgreSQL 17", limit: 5 });
    } catch {
      /* ignore */
    }
    const warmAt = p.isWarm();
    await new Promise((r) => setTimeout(r, ms + 80));
    idleExperiments.push({
      label,
      configuredIdleMs: ms,
      productionEquivalent:
        label === "proxy_1min"
          ? 60_000
          : label === "proxy_5min"
            ? 300_000
            : 900_000,
      wasWarmAfterSearch: warmAt,
      warmAfterIdle: p.isWarm(),
      elapsedMs: Date.now() - t0,
    });
    await p.close();
  }

  const coldLat = cold.filter((r) => r.ok).map((r) => r.latencyMs);
  const warmLat = warm.filter((r) => r.ok).map((r) => r.latencyMs);
  const warmFirst = warm[0]?.latencyMs ?? 0;
  const warmRest = warm.slice(1).filter((r) => r.ok).map((r) => r.latencyMs);

  const quality = {
    coldSuccessRate: cold.filter((r) => r.ok).length / Math.max(1, cold.length),
    warmSuccessRate: warm.filter((r) => r.ok).length / Math.max(1, warm.length),
    warmAvgTop3: avg(warm.filter((r) => r.ok).map((r) => r.top3)),
    warmAvgResults: avg(warm.filter((r) => r.ok).map((r) => r.resultCount)),
    stressSuccessRate: stressOk / 20,
    targetTop3: 2.3,
  };

  const warmGain =
    coldLat.length && warmRest.length
      ? avg(coldLat) - avg(warmRest)
      : 0;

  let decision: "CASE_A" | "CASE_B" | "CASE_C" = "CASE_A";
  let strategy = "B_research_session_warm_idle";
  if (warmGain < 400) {
    decision = "CASE_C";
    strategy = "C_lazy_ondemand";
  } else if (warmGain > 2500 && avg(warmRest) < 1500) {
    decision = "CASE_B";
    strategy = "B_or_longer_idle_agent_session";
  }

  const report = {
    phase: "60.12",
    generatedAt: new Date().toISOString(),
    totalElapsedMs: Date.now() - started,
    decision,
    strategyRecommended: strategy,
    hypothesis: "Strategy B — research-triggered warm + idle timeout (default 5 min)",
    metrics: {
      cold: {
        n: cold.length,
        avgMs: Math.round(avg(coldLat)),
        p50Ms: Math.round(pct(coldLat, 50)),
        p95Ms: Math.round(pct(coldLat, 95)),
        rows: cold,
      },
      warm: {
        n: warm.length,
        firstMs: warmFirst,
        avgRestMs: Math.round(avg(warmRest)),
        avgAllMs: Math.round(avg(warmLat)),
        p50Ms: Math.round(pct(warmLat, 50)),
        p95Ms: Math.round(pct(warmLat, 95)),
        warmGainVsColdAvgMs: Math.round(warmGain),
        rows: warm,
      },
      researchSession: {
        searches: sessionRows.length,
        totalMs: sessionTotalMs,
        avgSearchMs: Math.round(
          avg(sessionRows.map((r) => Number(r.searchMs) || 0)),
        ),
        avgFetchMs: Math.round(
          avg(sessionRows.map((r) => Number(r.fetchMs) || 0)),
        ),
        rows: sessionRows,
      },
      stress: {
        n: 20,
        ok: stressOk,
        avgMs: Math.round(avg(stress)),
        p50Ms: Math.round(pct(stress, 50)),
        p95Ms: Math.round(pct(stress, 95)),
      },
      idle: idleExperiments,
      memory: memoryTrail,
      processes: {
        before: procsBefore,
        during: procsDuring,
        after: procsAfter,
        cleanupMs,
      },
      quality,
    },
  };

  mkdirSync(researchRoot, { recursive: true });
  const rawPath = join(researchRoot, "phase-60.12-runtime-optimization-raw.json");
  writeFileSync(rawPath, JSON.stringify(report, null, 2));

  const md = `# PHASE 60.12 — Runtime optimization summary

**Fecha:** ${report.generatedAt}
**Decisión:** **${decision}** — estrategia \`${strategy}\`

## Hipótesis

Research-triggered warm runtime + idle timeout (default **5 min** via \`ELECTRON_SERP_IDLE_TIMEOUT_MS\`).

## Cold (5× oneshot launch/search/close)

| avg | p50 | p95 |
| --- | --- | --- |
| ${report.metrics.cold.avgMs} ms | ${report.metrics.cold.p50Ms} ms | ${report.metrics.cold.p95Ms} ms |

## Warm (10× same session)

| first | avg rest | avg all | gain vs cold avg |
| --- | --- | --- | --- |
| ${warmFirst} ms | ${report.metrics.warm.avgRestMs} ms | ${report.metrics.warm.avgAllMs} ms | ${report.metrics.warm.warmGainVsColdAvgMs} ms |

## Research session (5× search+fetch)

- total: **${sessionTotalMs} ms**
- avg search: **${report.metrics.researchSession.avgSearchMs} ms**
- avg fetch: **${report.metrics.researchSession.avgFetchMs} ms**

## Stress (20 serial)

- success: **${stressOk}/20**
- avg: **${report.metrics.stress.avgMs} ms** (p50 ${report.metrics.stress.p50Ms}, p95 ${report.metrics.stress.p95Ms})

## Memory (parent RSS MB)

${memoryTrail.map((m) => `- ${m.at}: **${m.rssMb} MB**`).join("\n")}

## Processes (electron-main.cjs)

- before: ${procsBefore}
- during: ${procsDuring}
- after close: ${procsAfter}
- cleanup: ${cleanupMs} ms

## Idle (proxies cortos → equivalentes 1 / 5 / 15 min)

${idleExperiments
  .map(
    (e) =>
      `- ${e.label}: configured ${e.configuredIdleMs}ms (prod ~${e.productionEquivalent}ms) → warmAfterIdle=${e.warmAfterIdle}`,
  )
  .join("\n")}

## Quality

- warm success: **${(quality.warmSuccessRate * 100).toFixed(0)}%**
- warm avg top-3 score: **${quality.warmAvgTop3.toFixed(2)}** (target ≈ 2.3)
- warm avg results: **${quality.warmAvgResults.toFixed(1)}**

## Producción

- Provider default: \`electron-duckduckgo\`
- Electron SERP es el camino productivo de \`research.search\`
- \`ELECTRON_SERP_ENABLED\` **deprecated** (ignorado por ResearchEngine)
- Config útil: \`ELECTRON_SERP_IDLE_TIMEOUT_MS\` (default 300000)

## Artefactos

- \`${rawPath}\`
- \`docs/architecture/phase-60.12-electron-serp-primary.md\`
`;

  const mdPath = join(researchRoot, "phase-60.12-runtime-optimization-summary.md");
  writeFileSync(mdPath, md);
  console.log(md);
  console.log(`\nWrote ${rawPath}\nWrote ${mdPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
