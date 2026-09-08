/**
 * PHASE 60.9.6 — benchmark Electron background SERP (3 runs).
 *
 *   npm run research:benchmark:60.9.6 -w @mxideass/node
 *
 * No modifica research.search / producción.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  QUERY_60_9_6,
  runElectronSerpOnce,
  type ElectronSerpRunResult,
} from "../../node/src/research/experimental/electron-serp/index.ts";

const here = dirname(fileURLToPath(import.meta.url));
const rootResearch = join(here, "..");

type CaseId = "A" | "B" | "C";

function classify(electron: ElectronSerpRunResult[]): {
  caseId: CaseId;
  label: string;
  answer: string;
} {
  const n = electron.length;
  const serp = electron.filter((r) => !r.challenge && r.containsPostgresqlOrg).length;
  const challenge = electron.filter((r) => r.challenge).length;
  // Referencia fija 60.9.4/60.9.5
  const cursorOk = true;
  const playwrightOk = false;

  if (cursorOk && serp === n && !playwrightOk) {
    return {
      caseId: "A",
      label: "Cursor ✓ / Electron BG ✓ / Playwright ✗",
      answer:
        "Evidencia: el runtime Electron programático en background obtuvo SERP orgánico como Cursor; Playwright headless no. Candidato a explorar como base experimental de SERP — aún sin integración a producción.",
    };
  }
  if (cursorOk && serp === 0 && challenge === n && !playwrightOk) {
    return {
      caseId: "B",
      label: "Cursor ✓ / Electron BG ✗ / Playwright ✗",
      answer:
        "Evidencia: Electron programático en background NO reproduce el SERP de Cursor; igual que Playwright recibe challenge (o falla). No usar como base de General SERP Discovery sin más diagnóstico.",
    };
  }
  return {
    caseId: "C",
    label: "Resultado mixto o distinto al patrón A/B",
    answer:
      "Evidencia mixta o inesperada — ver rates y env; no afirmar causalidad ni adoptar el runtime como solución SERP sin más datos.",
  };
}

async function main() {
  mkdirSync(rootResearch, { recursive: true });
  const runs: ElectronSerpRunResult[] = [];
  const n = Number(process.env.ELECTRON_SERP_RUNS || "3");

  for (let i = 1; i <= n; i++) {
    console.error(`[60.9.6] electron-background run ${i}/${n}`);
    const r = await runElectronSerpOnce(i, QUERY_60_9_6);
    runs.push(r);
    console.error(
      `  webdriver=${r.env.webdriver} challenge=${r.challenge} organic=${r.organicResults} pg.org=${r.containsPostgresqlOrg} err=${r.error}`,
    );
  }

  const classification = classify(runs);
  const rates = {
    queryEntered: runs.filter((r) => r.queryEntered).length,
    querySubmitted: runs.filter((r) => r.querySubmitted).length,
    navigation: runs.filter((r) => r.navigation).length,
    challenge: runs.filter((r) => r.challenge).length,
    organic: runs.filter((r) => !r.challenge && r.organicResults > 0).length,
    postgresqlOrg: runs.filter((r) => r.containsPostgresqlOrg).length,
    n: runs.length,
  };

  const envSample = runs[0]?.env ?? null;

  const raw = {
    phase: "60.9.6-electron-serp-background",
    generatedAt: new Date().toISOString(),
    query: QUERY_60_9_6,
    productionUntouched: true,
    stealthUsed: false,
    webdriverModified: false,
    classification,
    reference: {
      cursorManual: {
        queryEntered: "3/3",
        querySubmitted: "3/3",
        navigation: "3/3",
        challenge: "0/3",
        organic: "3/3",
        postgresqlOrg: "3/3",
        source: "phase-60.9.4 / 60.9.5",
      },
      playwrightHeadless: {
        queryEntered: "3/3",
        querySubmitted: "3/3",
        navigation: "3/3",
        challenge: "3/3",
        organic: "0/3",
        postgresqlOrg: "0/3",
        source: "phase-60.9.4 / 60.9.5",
      },
    },
    rates,
    envSample,
    runs,
  };

  const rawPath = join(rootResearch, "phase-60.9.6-electron-serp-benchmark-raw.json");
  writeFileSync(rawPath, JSON.stringify(raw, null, 2));

  const summary = `# PHASE 60.9.6 — Electron SERP background

**Generated:** ${raw.generatedAt}  
**Case:** **${classification.caseId}** — ${classification.label}  
**Query:** \`${QUERY_60_9_6}\`

## Comparison

\`\`\`text
                         Cursor      Playwright       Electron BG
------------------------------------------------------------------
Query entered              3/3           3/3              ${rates.queryEntered}/${rates.n}
Query submitted            3/3           3/3              ${rates.querySubmitted}/${rates.n}
Navigation                 3/3           3/3              ${rates.navigation}/${rates.n}
Challenge                  0/3           3/3              ${rates.challenge}/${rates.n}
Organic results            3/3           0/3              ${rates.organic}/${rates.n}
postgresql.org             3/3           0/3              ${rates.postgresqlOrg}/${rates.n}
\`\`\`

## Electron BG environment (run 1)

| Field | Value |
| --- | --- |
| webdriver | ${JSON.stringify(envSample?.webdriver ?? null)} |
| userAgent | ${JSON.stringify(envSample?.userAgent ?? null)} |
| WebGL vendor | ${JSON.stringify(envSample?.webglVendor ?? null)} |
| WebGL renderer | ${JSON.stringify(envSample?.webglRenderer ?? null)} |
| viewport | ${envSample?.innerWidth}×${envSample?.innerHeight} |
| DPR | ${envSample?.devicePixelRatio} |
| languages | ${JSON.stringify(envSample?.languages ?? [])} |
| deviceMemory | ${JSON.stringify(envSample?.deviceMemory ?? null)} |

## Answer

${classification.answer}

## Constraints honored

- No stealth / no webdriver mutation / no UA spoofing / no CAPTCHA solve / no proxies
- Isolated userDataDir (temp); no Cursor/Chrome personal profile
- production \`research.search\` untouched

See \`docs/architecture/phase-60.9.6-electron-serp-background.md\`.
`;

  writeFileSync(join(rootResearch, "phase-60.9.6-electron-serp-benchmark-summary.md"), summary);
  console.log(JSON.stringify({ caseId: classification.caseId, rates, rawPath }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
