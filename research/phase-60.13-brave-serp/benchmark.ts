/**
 * PHASE 60.13 — Brave Web SERP vs DuckDuckGo (Electron runtime compartido).
 *
 *   npm run research:benchmark:60.13
 *
 * Flujo: smoke 3×3 → si pasa, benchmark completo + comparación DDG.
 * Sin Brave API. Sin fallback automático. Production UNCHANGED.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createElectronBraveSerpAdapter,
  createElectronDuckDuckGoSerpAdapter,
  createSerpDiscoveryProvider,
  ELECTRON_BRAVE_PROVIDER_ID,
  ELECTRON_DDG_PROVIDER_ID,
  scrapeHitToDiscoveryResult,
  type SerpDiscoveryResult,
} from "../../node/src/research/electron-serp/index.ts";

const here = dirname(fileURLToPath(import.meta.url));
const researchRoot = join(here, "..");

const SMOKE_QUERIES = [
  "PostgreSQL 17",
  "React TypeScript",
  "universidades doctorado IA México",
];

const FULL_QUERIES: Array<{ q: string; bucket: string }> = [
  { q: "PostgreSQL 17", bucket: "technology" },
  { q: "React TypeScript", bucket: "technology" },
  { q: "Python pandas", bucket: "technology" },
  { q: "laptops RTX 4060", bucket: "general" },
  { q: "SAT México", bucket: "mexico" },
  { q: "inflación México 2026", bucket: "mexico" },
  { q: "Tlaxcala", bucket: "mexico" },
  { q: "universidades México", bucket: "mexico" },
  { q: "doctorado inteligencia artificial México", bucket: "spanish" },
  { q: "universidades doctorado IA México", bucket: "university" },
  { q: "SAT", bucket: "government" },
  { q: "Banxico", bucket: "government" },
  { q: "machine learning transformers", bucket: "academic" },
  { q: "quantum computing", bucket: "academic" },
  { q: "Spring Boot", bucket: "technology" },
  { q: "Docker", bucket: "technology" },
  { q: "What is quantum computing", bucket: "general" },
  { q: "cómo funciona DNS", bucket: "spanish" },
  { q: "best laptop for programming", bucket: "general" },
  { q: "large language models research", bucket: "academic" },
  { q: "UAQ", bucket: "university" },
  { q: "UNAM", bucket: "university" },
  { q: "Java", bucket: "ambiguous" },
  { q: "Python", bucket: "ambiguous" },
  { q: "climate change overview", bucket: "news" },
];

const OFFICIAL =
  /\.(gob\.mx|gov|edu|ac\.)|sat\.gob|banxico|dof\.gob|unam\.mx|uaq\.mx|postgresql\.org|arxiv\.org|ieee\.org|acm\.org/i;
const ACADEMIC = /arxiv\.org|ieee\.org|acm\.org|springer|nature\.com|sciencedirect/i;
const MX = /\.mx\b|méxico|mexico|sat\.gob|banxico|conahcyt|uaq|unam/i;

function avg(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
function pct(xs: number[], p: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))]!;
}

function scoreTop3(results: readonly SerpDiscoveryResult[], query: string): number {
  const top = results.slice(0, 3);
  if (!top.length) return 0;
  let sum = 0;
  const q = query.toLowerCase();
  for (const r of top) {
    let s = 1;
    if (OFFICIAL.test(r.url) || OFFICIAL.test(r.domain)) s = 3;
    else if (ACADEMIC.test(r.url)) s = 3;
    else if (q.split(/\s+/).some((t) => t.length > 3 && r.title.toLowerCase().includes(t)))
      s = 2;
    sum += s;
  }
  return sum / top.length;
}

function toResults(
  hits: readonly { title: string; url: string; snippet?: string; domain?: string; position?: number }[],
  providerId: string,
): SerpDiscoveryResult[] {
  const out: SerpDiscoveryResult[] = [];
  for (const h of hits) {
    const d = scrapeHitToDiscoveryResult(
      {
        title: h.title,
        url: h.url,
        snippet: h.snippet,
        domain: h.domain ?? "",
        position: h.position ?? out.length + 1,
        provider: providerId,
        source: "serp",
        confidence: { score: 0.8, signals: [] },
      } as never,
      providerId,
    );
    if (d) out.push(d);
  }
  return out;
}

type Row = {
  engine: "brave" | "ddg";
  query: string;
  bucket?: string;
  run: number;
  ok: boolean;
  blocked: boolean;
  challenge: boolean;
  empty: boolean;
  resultCount: number;
  latencyMs: number;
  top3: number;
  official: number;
  mexico: number;
  academic: number;
  domains: string[];
  finalUrl?: string | null;
  outcome: string;
};

async function countElectronMain(): Promise<number> {
  try {
    const { execSync } = await import("node:child_process");
    const out = execSync(
      "ps -eo args= 2>/dev/null | grep -c '[e]lectron-main.cjs' || true",
      { encoding: "utf8" },
    ).trim();
    return Number(out) || 0;
  } catch {
    return -1;
  }
}

async function runAdapterBatch(
  engine: "brave" | "ddg",
  queries: Array<{ q: string; bucket?: string }>,
  runs: number,
  mode: "reusable",
): Promise<Row[]> {
  const adapter =
    engine === "brave"
      ? createElectronBraveSerpAdapter({ mode })
      : createElectronDuckDuckGoSerpAdapter({ mode });
  const providerId =
    engine === "brave" ? ELECTRON_BRAVE_PROVIDER_ID : ELECTRON_DDG_PROVIDER_ID;
  const rows: Row[] = [];
  try {
    await adapter.warmUp();
    for (let run = 1; run <= runs; run++) {
      for (const { q, bucket } of queries) {
        const t0 = Date.now();
        try {
          const out = await adapter.search({ query: q, limit: 10 });
          const results = toResults(out.hits, providerId);
          const blocked = out.blocked || out.health === "BLOCKED";
          const empty = !blocked && results.length === 0;
          const ok = !blocked && results.length > 0;
          let outcome = "SUCCESS";
          if (blocked) outcome = "BLOCKED";
          else if (empty) outcome = "EMPTY";
          else if (out.health === "BROKEN") outcome = "EXTRACTION_FAILURE";
          rows.push({
            engine,
            query: q,
            bucket,
            run,
            ok,
            blocked,
            challenge: blocked,
            empty,
            resultCount: results.length,
            latencyMs: Date.now() - t0,
            top3: scoreTop3(results, q),
            official: results.filter((r) => OFFICIAL.test(r.url)).length,
            mexico: results.filter((r) => MX.test(r.url) || MX.test(r.title)).length,
            academic: results.filter((r) => ACADEMIC.test(r.url)).length,
            domains: [...new Set(results.map((r) => r.domain))],
            finalUrl: out.finalUrl ?? null,
            outcome,
          });
        } catch {
          rows.push({
            engine,
            query: q,
            bucket,
            run,
            ok: false,
            blocked: false,
            challenge: false,
            empty: true,
            resultCount: 0,
            latencyMs: Date.now() - t0,
            top3: 0,
            official: 0,
            mexico: 0,
            academic: 0,
            domains: [],
            outcome: "UNKNOWN",
          });
        }
      }
    }
  } finally {
    await adapter.close();
  }
  return rows;
}

function summarize(rows: Row[]) {
  const n = rows.length || 1;
  const lat = rows.filter((r) => r.ok).map((r) => r.latencyMs);
  const domains = new Set(rows.flatMap((r) => r.domains));
  return {
    n: rows.length,
    successRate: rows.filter((r) => r.ok).length / n,
    blockedRate: rows.filter((r) => r.blocked).length / n,
    challengeRate: rows.filter((r) => r.challenge).length / n,
    emptyRate: rows.filter((r) => r.empty).length / n,
    avgLatencyMs: Math.round(avg(lat)),
    p50Ms: Math.round(pct(lat, 50)),
    p95Ms: Math.round(pct(lat, 95)),
    avgResults: avg(rows.filter((r) => r.ok).map((r) => r.resultCount)),
    avgTop3: avg(rows.filter((r) => r.ok).map((r) => r.top3)),
    avgOfficial: avg(rows.map((r) => r.official)),
    avgMexico: avg(rows.map((r) => r.mexico)),
    avgAcademic: avg(rows.map((r) => r.academic)),
    domainDiversity: domains.size,
  };
}

function decide(smoke: ReturnType<typeof summarize>, full?: ReturnType<typeof summarize>) {
  // Smoke OK luego full colapsa → rate-limit / soft-block (parcial, no viable estable).
  if (
    full &&
    smoke.successRate >= 0.55 &&
    full.blockedRate >= 0.8 &&
    smoke.successRate - full.successRate >= 0.4
  ) {
    return "CASE_B" as const;
  }
  if (smoke.blockedRate >= 0.7 && smoke.successRate < 0.3) return "CASE_C" as const;
  if (smoke.successRate < 0.4) return "CASE_D" as const;
  if (!full) {
    if (smoke.successRate >= 0.66 && smoke.blockedRate < 0.34) return "CASE_A_SMOKE" as const;
    return "CASE_B" as const;
  }
  if (full.successRate >= 0.8 && full.blockedRate < 0.15 && full.avgTop3 >= 1.5)
    return "CASE_A" as const;
  if (full.successRate >= 0.4) return "CASE_B" as const;
  if (full.blockedRate >= 0.5) return "CASE_C" as const;
  return "CASE_D" as const;
}

async function main() {
  const started = Date.now();
  const procsBefore = await countElectronMain();

  console.error("60.13 smoke: Brave 3 queries × 3 runs (warm)...");
  const smokeRows = await runAdapterBatch(
    "brave",
    SMOKE_QUERIES.map((q) => ({ q })),
    3,
    "reusable",
  );
  const smoke = summarize(smokeRows);
  const smokePass =
    smoke.successRate >= 0.55 &&
    smoke.blockedRate < 0.45 &&
    smokeRows.some((r) => r.resultCount > 0);

  let fullBrave: Row[] = [];
  let fullDdg: Row[] = [];
  let braveSum = smoke;
  let ddgSum: ReturnType<typeof summarize> | null = null;
  let caseId = decide(smoke);

  if (smokePass) {
    console.error("Smoke PASS — running full Brave + DDG comparison...");
    fullBrave = await runAdapterBatch(
      "brave",
      FULL_QUERIES,
      1,
      "reusable",
    );
    // Warm cold: first query of full is after new launch — OK
    fullDdg = await runAdapterBatch("ddg", FULL_QUERIES, 1, "reusable");
    braveSum = summarize(fullBrave);
    ddgSum = summarize(fullDdg);
    caseId = decide(smoke, braveSum);
  } else {
    console.error("Smoke FAIL/PARTIAL — skipping full benchmark.");
    caseId = decide(smoke);
    if (caseId === "CASE_A_SMOKE") caseId = "CASE_B";
  }

  const procsAfter = await countElectronMain();

  const label =
    caseId === "CASE_A"
      ? "VIABLE"
      : caseId === "CASE_B"
        ? "PARCIAL"
        : caseId === "CASE_C"
          ? "BLOCKED"
          : "NO VIABLE";

  const report = {
    phase: "60.13",
    generatedAt: new Date().toISOString(),
    totalElapsedMs: Date.now() - started,
    decision: caseId,
    braveWeb: label,
    production: "UNCHANGED",
    defaultProvider: "electron-duckduckgo",
    noApiKey: true,
    noFallback: true,
    smoke: {
      pass: smokePass,
      summary: smoke,
      rows: smokeRows,
    },
    full: smokePass
      ? {
          brave: braveSum,
          ddg: ddgSum,
          braveRows: fullBrave,
          ddgRows: fullDdg,
        }
      : null,
    processes: { before: procsBefore, after: procsAfter },
  };

  mkdirSync(researchRoot, { recursive: true });
  const rawPath = join(researchRoot, "phase-60.13-brave-serp-benchmark-raw.json");
  writeFileSync(rawPath, JSON.stringify(report, null, 2));

  const fmt = (s: ReturnType<typeof summarize> | null) =>
    s
      ? `| ${(s.successRate * 100).toFixed(0)}% | ${(s.blockedRate * 100).toFixed(0)}% | ${(s.challengeRate * 100).toFixed(0)}% | ${(s.emptyRate * 100).toFixed(0)}% | ${s.avgLatencyMs} | ${s.p50Ms} | ${s.p95Ms} | ${s.avgResults.toFixed(1)} | ${s.avgTop3.toFixed(2)} | ${s.avgOfficial.toFixed(2)} | ${s.avgMexico.toFixed(2)} | ${s.avgAcademic.toFixed(2)} | ${s.domainDiversity} |`
      : "| — | — | — | — | — | — | — | — | — | — | — | — | — |";

  const md = `# PHASE 60.13 — Brave Web SERP benchmark summary

**Fecha:** ${report.generatedAt}
**Decisión:** **${caseId}** — Brave Web: **${label}**
**Producción:** UNCHANGED (\`electron-duckduckgo\` default)

## Condiciones

- Runtime: Electron SERP compartido (\`BrowserWindow show:false\`)
- Sin Brave API / sin API key / sin stealth / sin proxies
- Smoke: 3 queries × 3 runs (warm)
- Full: ${smokePass ? `${FULL_QUERIES.length} queries × 1 run Brave + DDG` : "omitido"}

## Smoke

- Pass: **${smokePass}**
- Success: **${(smoke.successRate * 100).toFixed(0)}%** (${smokeRows.filter((r) => r.ok).length}/${smokeRows.length})
- Blocked: **${(smoke.blockedRate * 100).toFixed(0)}%**
- Avg latency: **${smoke.avgLatencyMs} ms**
- Avg results: **${smoke.avgResults.toFixed(1)}**

## Comparación (full)

| Metric | DDG | Brave |
| --- | --- | --- |
| Success | ${ddgSum ? (ddgSum.successRate * 100).toFixed(0) + "%" : "—"} | ${smokePass ? (braveSum.successRate * 100).toFixed(0) + "%" : "—"} |
| Blocked | ${ddgSum ? (ddgSum.blockedRate * 100).toFixed(0) + "%" : "—"} | ${smokePass ? (braveSum.blockedRate * 100).toFixed(0) + "%" : "—"} |
| Challenge | ${ddgSum ? (ddgSum.challengeRate * 100).toFixed(0) + "%" : "—"} | ${smokePass ? (braveSum.challengeRate * 100).toFixed(0) + "%" : "—"} |
| Empty | ${ddgSum ? (ddgSum.emptyRate * 100).toFixed(0) + "%" : "—"} | ${smokePass ? (braveSum.emptyRate * 100).toFixed(0) + "%" : "—"} |
| Avg latency | ${ddgSum?.avgLatencyMs ?? "—"} | ${smokePass ? braveSum.avgLatencyMs : "—"} |
| P50 | ${ddgSum?.p50Ms ?? "—"} | ${smokePass ? braveSum.p50Ms : "—"} |
| P95 | ${ddgSum?.p95Ms ?? "—"} | ${smokePass ? braveSum.p95Ms : "—"} |
| Avg results | ${ddgSum ? ddgSum.avgResults.toFixed(1) : "—"} | ${smokePass ? braveSum.avgResults.toFixed(1) : "—"} |
| Top-3 relevance | ${ddgSum ? ddgSum.avgTop3.toFixed(2) : "—"} | ${smokePass ? braveSum.avgTop3.toFixed(2) : "—"} |
| Official/Gov/Edu | ${ddgSum ? ddgSum.avgOfficial.toFixed(2) : "—"} | ${smokePass ? braveSum.avgOfficial.toFixed(2) : "—"} |
| Mexico | ${ddgSum ? ddgSum.avgMexico.toFixed(2) : "—"} | ${smokePass ? braveSum.avgMexico.toFixed(2) : "—"} |
| Academic | ${ddgSum ? ddgSum.avgAcademic.toFixed(2) : "—"} | ${smokePass ? braveSum.avgAcademic.toFixed(2) : "—"} |
| Domain diversity | ${ddgSum?.domainDiversity ?? "—"} | ${smokePass ? braveSum.domainDiversity : "—"} |

Detalle tabular: Success/Blocked/… → DDG ${fmt(ddgSum)} / Brave ${fmt(smokePass ? braveSum : null)}

## Procesos

- before: ${procsBefore}
- after: ${procsAfter}

## Conclusión

Brave Search Web vía Electron (sin API): **${label}**.

No se activa fallback automático ni se cambia el default productivo.

## Artefactos

- \`${rawPath}\`
- \`docs/architecture/phase-60.13-brave-serp.md\`
`;

  const mdPath = join(researchRoot, "phase-60.13-brave-serp-benchmark-summary.md");
  writeFileSync(mdPath, md);
  console.log(md);
  console.log(`\nWrote ${rawPath}\nWrote ${mdPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
