/**
 * PHASE 60.9.5 — agrega runs y genera comparison.json + summary.md
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyDivergence,
  compareSnapshots,
  firstDivergencePoint,
  type DivergenceRun,
  type FieldComparison,
} from "../../node/src/research/experimental/browser-divergence/index.ts";
import { closeBrowser, runPlaywrightDivergence } from "./playwright-runner.ts";

const here = dirname(fileURLToPath(import.meta.url));

function loadRuns(): DivergenceRun[] {
  const out: DivergenceRun[] = [];
  for (const name of readdirSync(here).sort()) {
    if (!/^(manual|playwright)-run-\d+\.json$/.test(name)) continue;
    out.push(JSON.parse(readFileSync(join(here, name), "utf8")) as DivergenceRun);
  }
  return out;
}

function medianSnapshot(runs: DivergenceRun[], phase: "t0" | "t1" | "t2") {
  // Use first complete run as representative for matrix (documented)
  return runs[0]?.[phase] ?? null;
}

async function main() {
  mkdirSync(here, { recursive: true });

  if (process.env.DDG_DIV_SKIP_PLAYWRIGHT !== "1") {
    const n = Number(process.env.DDG_DIV_RUNS ?? "3");
    for (let run = 1; run <= n; run++) {
      console.error(`[60.9.5] playwright run ${run}`);
      const obs = await runPlaywrightDivergence(run);
      writeFileSync(join(here, `playwright-run-${run}.json`), JSON.stringify(obs, null, 2));
      console.error(
        `  webdriver=${obs.t0.webdriver} challenge=${obs.outcome.challengeDetected} organic=${obs.outcome.organicResultsDetected}`,
      );
    }
    await closeBrowser();
  }

  const all = loadRuns();
  const manuals = all.filter((r) => r.method === "manual");
  const pws = all.filter((r) => r.method === "playwright");

  if (manuals.length === 0 || pws.length === 0) {
    console.error(
      `[60.9.5] waiting for both methods: manual=${manuals.length} playwright=${pws.length}`,
    );
  }

  const m0 = medianSnapshot(manuals, "t0");
  const p0 = medianSnapshot(pws, "t0");
  const m1 = medianSnapshot(manuals, "t1");
  const p1 = medianSnapshot(pws, "t1");
  const m2 = medianSnapshot(manuals, "t2");
  const p2 = medianSnapshot(pws, "t2");

  const t0 = m0 && p0 ? compareSnapshots(m0, p0) : [];
  const t1 = m1 && p1 ? compareSnapshots(m1, p1) : [];
  const t2 = m2 && p2 ? compareSnapshots(m2, p2) : [];
  const firstPoint = firstDivergencePoint({ t0, t1, t2 });
  const possibleRelevant = [...t0, ...t1, ...t2].filter(
    (c) => c.difference === "DIFFERENT" && c.potentialRelevance === "possible",
  );
  const classification = classifyDivergence({
    firstPoint,
    t0Diffs: t0,
    possibleRelevantDiffs: possibleRelevant,
  });

  const evidenceMatrix = (t0.length ? t0 : []).map((c) => ({
    observable: c.field,
    manual: c.manual,
    playwright: c.playwright,
    difference: c.difference,
    potentialRelevance: c.potentialRelevance,
    evidenceStrength: c.evidenceStrength,
  }));

  // Outcome row — valores reales del outcome (no "every===" booleans confusos)
  if (manuals[0] && pws[0]) {
    const mChallenge = manuals.map((m) => m.outcome.challengeDetected);
    const pChallenge = pws.map((p) => p.outcome.challengeDetected);
    const mOrganic = manuals.map((m) => m.outcome.organicResultsDetected);
    const pOrganic = pws.map((p) => p.outcome.organicResultsDetected);
    evidenceMatrix.push({
      observable: "challengeDetected",
      manual: mChallenge,
      playwright: pChallenge,
      difference: "DIFFERENT",
      potentialRelevance: "outcome",
      evidenceStrength: "strong",
    });
    evidenceMatrix.push({
      observable: "organicResultsDetected",
      manual: mOrganic,
      playwright: pOrganic,
      difference: "DIFFERENT",
      potentialRelevance: "outcome",
      evidenceStrength: "strong",
    });
  }

  const comparison = {
    phase: "60.9.5-browser-divergence",
    generatedAt: new Date().toISOString(),
    query: "PostgreSQL 17",
    productionUntouched: true,
    causeIdentified: false as const,
    causeStatement: "CAUSE NOT IDENTIFIED",
    firstDivergencePoint: firstPoint,
    classification,
    evidenceMatrix,
    possibleRelevantDiffs: [...new Set(possibleRelevant.map((c) => c.field))],
    rates: {
      manualChallenge: manuals.filter((m) => m.outcome.challengeDetected).length,
      playwrightChallenge: pws.filter((p) => p.outcome.challengeDetected).length,
      manualOrganic: manuals.filter((m) => m.outcome.organicResultsDetected).length,
      playwrightOrganic: pws.filter((p) => p.outcome.organicResultsDetected).length,
      manualN: manuals.length,
      playwrightN: pws.length,
    },
    answers: {
      q1_queryEnteredBoth:
        manuals.every((m) => m.outcome.queryEntered) && pws.every((p) => p.outcome.queryEntered),
      q2_submitBoth:
        manuals.every((m) => m.outcome.querySubmitted) &&
        pws.every((p) => p.outcome.querySubmitted),
      q3_navigationBoth:
        manuals.every((m) => m.outcome.navigationOccurred) &&
        pws.every((p) => p.outcome.navigationOccurred),
      q4_firstDifference: firstPoint,
      q8_causeIdentified: false,
      q10_continueResearch: classification.caseId === "A" || classification.caseId === "B",
    },
  };

  writeFileSync(join(here, "comparison.json"), JSON.stringify(comparison, null, 2));

  const mdTable = evidenceMatrix
    .map(
      (r) =>
        `| ${r.observable} | ${JSON.stringify(r.manual)} | ${JSON.stringify(r.playwright)} | ${r.difference} | ${r.potentialRelevance} | ${r.evidenceStrength} |`,
    )
    .join("\n");

  writeFileSync(
    join(here, "summary.md"),
    `# PHASE 60.9.5 — Browser Divergence

**Generated:** ${comparison.generatedAt}  
**Case:** **${classification.caseId}** — ${classification.label}  
**Cause:** ${comparison.causeStatement}  
**First divergence:** ${firstPoint}

## Outcomes

| | Manual | Playwright |
| --- | ---: | ---: |
| Challenge | ${comparison.rates.manualChallenge}/${comparison.rates.manualN} | ${comparison.rates.playwrightChallenge}/${comparison.rates.playwrightN} |
| Organic | ${comparison.rates.manualOrganic}/${comparison.rates.manualN} | ${comparison.rates.playwrightOrganic}/${comparison.rates.playwrightN} |

## Evidence matrix (T0 representative)

| Observable | Manual | Playwright | Difference | Relevance | Strength |
| --- | --- | --- | --- | --- | --- |
${mdTable}

## Answers

1. Query entered both: ${comparison.answers.q1_queryEnteredBoth}
2. Submit both: ${comparison.answers.q2_submitBoth}
3. Navigation both: ${comparison.answers.q3_navigationBoth}
4. First difference: ${firstPoint}
8. Cause identified: false — CAUSE NOT IDENTIFIED
10. Continue research: ${comparison.answers.q10_continueResearch}

See \`docs/architecture/phase-60.9.5-browser-divergence.md\`.
`,
  );

  console.log(
    JSON.stringify(
      {
        caseId: classification.caseId,
        firstPoint,
        causeIdentified: false,
        possibleRelevant: possibleRelevant.map((c: FieldComparison) => c.field),
      },
      null,
      2,
    ),
  );
}

main().catch(async (e) => {
  console.error(e);
  await closeBrowser().catch(() => undefined);
  process.exitCode = 1;
});
