/**
 * PHASE 60.9.3 — DDG search-space diagnostic (3 queries × 5 methods).
 *
 *   MANUAL_JSON='[...]' npm run research:benchmark:60.9.3 -w @mxideass/node
 *
 * Manual observations can be supplied via MANUAL_JSON or manual-observations.json.
 * Playwright never uses direct ?q= URLs.
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { QUERY_MATRIX_60_9_3, type Observation, type ExperimentMethod } from "./types.ts";
import { runHttpObservation } from "./http-runner.ts";
import { closeBrowser, getBrowserLabel, runPlaywrightObservation } from "./browser-runner.ts";

const here = dirname(fileURLToPath(import.meta.url));
const rawPath = join(here, "benchmark-raw.json");
const summaryPath = join(here, "benchmark-summary.md");
const manualPath = join(here, "manual-observations.json");

function loadManual(): Observation[] {
  if (process.env.MANUAL_JSON) {
    return JSON.parse(process.env.MANUAL_JSON) as Observation[];
  }
  if (existsSync(manualPath)) {
    return JSON.parse(readFileSync(manualPath, "utf8")) as Observation[];
  }
  return [];
}

function cell(obs: Observation | undefined): string {
  if (!obs) return "MISSING";
  return obs.status;
}

function yn(v: boolean | undefined): string {
  if (v === undefined) return "?";
  return v ? "✓" : "✗";
}

async function main() {
  const observations: Observation[] = [];
  const manual = loadManual();
  for (const m of manual) observations.push(m);

  console.error(`[60.9.3] queries=${QUERY_MATRIX_60_9_3.length} manual=${manual.length}`);

  for (const q of QUERY_MATRIX_60_9_3) {
    for (const mode of ["fill", "insertText", "type"] as const) {
      console.error(`[60.9.3] ${q.id} playwright_${mode}`);
      const obs = await runPlaywrightObservation({
        run: 1,
        queryId: q.id,
        query: q.query,
        mode,
      });
      observations.push(obs);
      console.error(
        `  → ${obs.status} entered=${obs.interaction?.queryEntered} submitted=${obs.interaction?.querySubmitted} nav=${obs.interaction?.navigationOccurred} challenge=${obs.interaction?.challengeDetected} results=${obs.resultCount}`,
      );
      // Parar temprano si challenge en todos los modos de la misma query (proteger IP)
      if (obs.status === "CHALLENGE" || obs.status === "CAPTCHA") {
        console.error(`[60.9.3] challenge detected — continuing remaining modes carefully`);
      }
    }

    console.error(`[60.9.3] ${q.id} http`);
    observations.push(
      await runHttpObservation({ run: 1, queryId: q.id, query: q.query }),
    );
  }

  await closeBrowser();

  const methods: ExperimentMethod[] = [
    "manual",
    "playwright_fill",
    "playwright_insertText",
    "playwright_type",
    "http",
  ];

  const find = (queryId: string, method: ExperimentMethod) =>
    observations.find((o) => o.queryId === queryId && o.method === method);

  const tableRows = QUERY_MATRIX_60_9_3.map((q) => {
    const cells = methods.map((m) => cell(find(q.id, m))).join(" | ");
    return `| ${q.id} | ${cells} |`;
  });

  // Segunda tabla: diagnóstico de interacción (agregar modos PW)
  const diagRows: string[] = [];
  for (const q of QUERY_MATRIX_60_9_3) {
    for (const mode of ["playwright_fill", "playwright_insertText", "playwright_type"] as const) {
      const o = find(q.id, mode);
      const i = o?.interaction;
      diagRows.push(
        `| ${q.id} / ${mode.replace("playwright_", "")} | ${yn(i?.queryEntered)} | ${yn(i?.querySubmitted)} | ${yn(i?.navigationOccurred)} | ${yn(i?.challengeDetected)} | ${o?.resultCount ?? 0} |`,
      );
    }
  }

  const pw = observations.filter((o) => o.method.startsWith("playwright_"));
  const pwSuccess = pw.filter((o) => o.status === "SUCCESS").length;
  const pwChallenge = pw.filter((o) => o.status === "CHALLENGE" || o.status === "CAPTCHA").length;
  const pwRunner = pw.filter((o) => o.status === "RUNNER_ERROR").length;
  const manualOk = manual.some((o) => o.status === "SUCCESS");
  const manualFail = manual.length > 0 && manual.every((o) => o.status !== "SUCCESS");
  const httpOk = observations.some((o) => o.method === "http" && o.status === "SUCCESS");
  const httpFail = observations
    .filter((o) => o.method === "http")
    .every((o) => o.status !== "SUCCESS");
  const pwOk = pwSuccess > 0;

  let decision: "A" | "B" | "C" | "D" | "E" | "UNKNOWN" = "UNKNOWN";
  if (manual.length === 0) {
    decision = "UNKNOWN";
  } else if (manualFail && !pwOk && httpFail) {
    decision = "E";
  } else if (manualOk && pwChallenge > 0 && !pwOk && httpFail) {
    decision = "D";
  } else if (manualOk && pwRunner > 0 && !pwOk) {
    decision = "C";
  } else if (manualOk && pwOk && httpFail) {
    decision = "B";
  } else if (manualOk && pwOk && httpOk) {
    decision = "A";
  } else if (manualOk && pwChallenge > 0 && !pwOk) {
    decision = "D";
  } else if (manualOk && !pwOk) {
    decision = pwChallenge > pwRunner ? "D" : "C";
  }

  const answerRunner =
    pwRunner > 0 && pwSuccess === 0 && pwChallenge === 0
      ? "NO — runner failure (query not entered/submitted)"
      : pw.some((o) => o.interaction?.queryEntered && o.interaction.querySubmitted)
        ? "YES — query entered and submitted; outcome after submit"
        : "PARTIAL / UNKNOWN";

  const report = {
    phase: "60.9.3-ddg-search-space",
    generatedAt: new Date().toISOString(),
    productionUntouched: true,
    browser: getBrowserLabel(),
    decision,
    answers: {
      runnerPerformsUserLikeSearch: answerRunner,
      queryEntersInput: pw.some((o) => o.interaction?.queryEntered === true),
      querySubmitted: pw.some((o) => o.interaction?.querySubmitted === true),
      reachesSerpOrChallenge: pw.some(
        (o) =>
          o.interaction?.resultsPageDetected ||
          o.interaction?.challengeDetected ||
          o.resultCount > 0,
      ),
    },
    observationCount: observations.length,
    observations,
  };

  mkdirSync(here, { recursive: true });
  writeFileSync(rawPath, JSON.stringify(report, null, 2));

  const summary = `# PHASE 60.9.3 — DuckDuckGo Search-Space & Manual Browser

**Generated:** ${report.generatedAt}  
**Browser (Playwright):** ${report.browser}  
**Production:** unchanged  
**Decision:** **${decision}**

## Tabla principal

| Query | Manual | Playwright fill | Playwright insertText | Playwright type | HTTP |
| ----- | ------ | --------------- | --------------------- | --------------- | ---- |
${tableRows.join("\n")}

## Tabla diagnóstico (Playwright)

| Query | Input entered | Submitted | Navigation | Challenge | Results |
| ----- | ------------: | --------: | ---------: | --------: | ------: |
${diagRows.join("\n")}

## ¿El runner hace la misma operación que un usuario?

**${answerRunner}**

- queryEntered observado: ${report.answers.queryEntersInput}
- querySubmitted observado: ${report.answers.querySubmitted}
- llega a SERP o challenge: ${report.answers.reachesSerpOrChallenge}

## Manual

${
  manual.length === 0
    ? "_Sin observaciones manuales en \`manual-observations.json\`. Completar antes de cerrar la fase._"
    : manual
        .map(
          (m) =>
            `- ${m.queryId}: ${m.status} results≈${m.resultCount} challenge=${m.blocked} (${m.notes ?? ""})`,
        )
        .join("\n")
}

## Search space (borrador)

Solo mecanismo básico en esta fase (3 queries). Categorías pendientes:

\`\`\`text
SEARCH SPACE
├── General      ← q1 React TypeScript
├── Technical    ← q2 PostgreSQL 17
├── Mexico       ← q3 universidades doctorado IA
├── Academic     (pendiente)
├── Financial    (pendiente)
├── Local        (pendiente)
├── Long/Short   (pendiente)
└── Special chars (pendiente)
\`\`\`

## Artefactos

- \`research/phase-60.9.3-ddg-search-space/benchmark-raw.json\`
- \`docs/architecture/phase-60.9.3-ddg-search-space.md\`
`;

  writeFileSync(summaryPath, summary);
  console.log(JSON.stringify({ decision, answers: report.answers, tableRows }, null, 2));
  console.log(`wrote ${rawPath}`);
  console.log(`wrote ${summaryPath}`);
}

main().catch(async (err) => {
  console.error(err);
  await closeBrowser().catch(() => undefined);
  process.exitCode = 1;
});
