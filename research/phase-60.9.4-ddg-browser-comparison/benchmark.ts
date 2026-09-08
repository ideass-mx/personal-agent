/**
 * PHASE 60.9.4 — agrega observaciones manuales + Playwright y escribe summary.
 *
 * Manual: colocar manual-run-{1,2,3}.json (o generar vía script de captura).
 * Playwright: DDG_CMP_RUNS=3 npm run research:benchmark:60.9.4 -w @mxideass/node
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  computeSummary,
  formatSummaryTable,
  normalizeObservation,
  type RunObservation,
} from "../../node/src/research/experimental/browser-comparison/index.ts";
import { closeBrowser, runPlaywrightOnce } from "./playwright-runner.ts";

const here = dirname(fileURLToPath(import.meta.url));
const PW_RUNS = Number(process.env.DDG_CMP_RUNS ?? "3");

function loadManual(): RunObservation[] {
  const out: RunObservation[] = [];
  for (let i = 1; i <= 3; i++) {
    const p = join(here, `manual-run-${i}.json`);
    if (!existsSync(p)) continue;
    out.push(normalizeObservation(JSON.parse(readFileSync(p, "utf8"))));
  }
  return out;
}

async function main() {
  mkdirSync(here, { recursive: true });
  const observations: RunObservation[] = [...loadManual()];

  if (process.env.DDG_CMP_SKIP_PLAYWRIGHT !== "1") {
    for (let run = 1; run <= PW_RUNS; run++) {
      console.error(`[60.9.4] playwright run ${run}`);
      const obs = await runPlaywrightOnce(run);
      observations.push(obs);
      writeFileSync(join(here, `playwright-run-${run}.json`), JSON.stringify(obs, null, 2));
      console.error(
        `  → entered=${obs.queryEntered} submitted=${obs.querySubmitted} challenge=${obs.challengeDetected} organic=${obs.organicResultsDetected} results=${obs.resultCount}`,
      );
    }
    await closeBrowser();
  } else {
    for (let i = 1; i <= 3; i++) {
      const p = join(here, `playwright-run-${i}.json`);
      if (existsSync(p)) {
        observations.push(normalizeObservation(JSON.parse(readFileSync(p, "utf8"))));
      }
    }
  }

  // Re-load all files on disk for authoritative set
  const all: RunObservation[] = [];
  for (const name of readdirSync(here).sort()) {
    if (!/^(manual|playwright)-run-\d+\.json$/.test(name)) continue;
    all.push(normalizeObservation(JSON.parse(readFileSync(join(here, name), "utf8"))));
  }

  const summary = computeSummary(all);
  const table = formatSummaryTable(summary);
  const report = {
    phase: "60.9.4-ddg-browser-comparison",
    generatedAt: new Date().toISOString(),
    productionUntouched: true,
    query: "PostgreSQL 17",
    observationCount: all.length,
    summary,
    table,
    observations: all,
  };

  writeFileSync(join(here, "summary.json"), JSON.stringify(report, null, 2));
  writeFileSync(
    join(here, "summary.md"),
    `# PHASE 60.9.4 — Manual Chromium vs Playwright

**Generated:** ${report.generatedAt}  
**Query:** PostgreSQL 17  
**Case:** **${summary.caseId}** — ${summary.caseLabel}

\`\`\`text
${table}
\`\`\`

## Rates

| Metric | Manual | Playwright | Delta |
| --- | ---: | ---: | ---: |
| Success | ${(summary.manualSuccessRate * 100).toFixed(0)}% | ${(summary.playwrightSuccessRate * 100).toFixed(0)}% | |
| Challenge | ${(summary.manualChallengeRate * 100).toFixed(0)}% | ${(summary.playwrightChallengeRate * 100).toFixed(0)}% | Δch=${summary.deltaChallengeRate} |
| Organic | ${(summary.manualOrganicResultRate * 100).toFixed(0)}% | ${(summary.playwrightOrganicResultRate * 100).toFixed(0)}% | Δorg=${summary.deltaOrganicResultRate} |

## Conclusión (solo evidencia)

${
  summary.caseId === "B"
    ? "Entrada/submit/navegación correctos en ambos; el entorno Playwright recibió challenge tras submit; Manual obtuvo orgánicos. No se afirma el algoritmo interno de DDG."
    : summary.caseId === "A"
      ? "Ambos caminos obtuvieron orgánicos de forma consistente en esta muestra."
      : summary.caseId === "D"
        ? "Ambos fallaron; el problema no parece específico de Playwright en esta muestra."
        : "Comportamiento variable; se necesita más evidencia (sin aumentar agresivamente las pruebas)."
}

## Decision

${
  summary.caseId === "B"
    ? "Playwright **no** se considera vía viable para SERP discovery. Mantener Browser = interacción web; Search Engine = discovery legítimo."
    : summary.caseId === "A"
      ? "Playwright podría investigarse como capability experimental (aún no producción)."
      : "No integrar Playwright como SERP solution todavía."
}

Artefacto: \`docs/architecture/phase-60.9.4-browser-comparison.md\`
`,
  );

  console.log(table);
  console.log(JSON.stringify({ caseId: summary.caseId, rates: {
    manualSuccessRate: summary.manualSuccessRate,
    playwrightSuccessRate: summary.playwrightSuccessRate,
    manualChallengeRate: summary.manualChallengeRate,
    playwrightChallengeRate: summary.playwrightChallengeRate,
  } }, null, 2));
}

main().catch(async (e) => {
  console.error(e);
  await closeBrowser().catch(() => undefined);
  process.exitCode = 1;
});
