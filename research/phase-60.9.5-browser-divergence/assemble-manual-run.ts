/**
 * Ensambla un DivergenceRun manual a partir de capturas T0/T1/T2 (JSON crudo de CDP).
 *
 *   npx tsx assemble-manual-run.ts 1 /tmp/m1-t0.json /tmp/m1-t1.json /tmp/m1-t2.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import {
  QUERY_60_9_5,
  normalizeEnvSnapshot,
  sanitizeUrl,
  type DivergenceRun,
} from "../../node/src/research/experimental/browser-divergence/index.ts";

const here = dirname(fileURLToPath(import.meta.url));
const run = Number(process.argv[2] ?? "1");
const t0p = process.argv[3]!;
const t1p = process.argv[4]!;
const t2p = process.argv[5]!;

function load(p: string) {
  return JSON.parse(readFileSync(p, "utf8"));
}

const raw0 = load(t0p);
const raw1 = load(t1p);
const raw2 = load(t2p);
const t0 = normalizeEnvSnapshot(raw0);
const t1 = normalizeEnvSnapshot(raw1);
const t2 = normalizeEnvSnapshot(raw2);

const challenge = raw2.challenge === true;
const organic = raw2.hasPostgresqlOrg === true || (Array.isArray(raw2.organicDomains) && raw2.organicDomains.includes("postgresql.org"));

const out: DivergenceRun = {
  method: "manual",
  run,
  query: QUERY_60_9_5,
  browserMeta: {
    channel: "cursor-ide-chromium",
    browserVersion: typeof raw0.userAgent === "string" ? raw0.userAgent.slice(0, 120) : null,
    playwrightVersion: null,
    os: `${os.platform()} ${os.release()}`,
    arch: os.arch(),
  },
  t0,
  t1,
  t2,
  outcome: {
    queryEntered: true,
    querySubmitted: true,
    navigationOccurred: true,
    challengeDetected: challenge,
    organicResultsDetected: organic && !challenge,
    organicDomains: Array.isArray(raw2.organicDomains) ? raw2.organicDomains.slice(0, 12) : [],
    resultCount: organic && !challenge ? 10 : 0,
    finalUrl: sanitizeUrl(typeof raw2.url === "string" ? raw2.url : null),
    pageTitle: typeof raw2.title === "string" ? raw2.title : null,
    httpStatus: null,
    resourceCount: null,
    resourceTypeCounts: {},
    redirectChain: [],
  },
  network: [],
  elapsedMs: null,
  notes: "Manual IDE Chromium; network resource counts not instrumented (null); cookie names via document.cookie only",
};

const dest = join(here, `manual-run-${run}.json`);
writeFileSync(dest, JSON.stringify(out, null, 2));
console.log(`wrote ${dest} webdriver=${t0.webdriver} challenge=${challenge} organic=${organic}`);
