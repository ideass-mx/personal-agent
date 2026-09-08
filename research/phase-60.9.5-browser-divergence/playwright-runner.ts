/**
 * Playwright divergence capture — read-only; no stealth.
 */
import { chromium, type Browser } from "playwright";
import { createRequire } from "node:module";
import {
  ENV_SNAPSHOT_JS,
  QUERY_60_9_5,
  countResourceTypes,
  detectChallengeText,
  normalizeEnvSnapshot,
  sanitizeUrl,
  type DivergenceRun,
  type NetworkEvent,
} from "../../node/src/research/experimental/browser-divergence/index.ts";
import {
  filterOrganicHits,
  organicResultsDetected,
} from "../../node/src/research/experimental/browser-comparison/index.ts";
import os from "node:os";

const require = createRequire(import.meta.url);
const playwrightVersion = String(
  (require("playwright/package.json") as { version: string }).version,
);

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    const headless = process.env.DDG_DIV_HEADLESS !== "0";
    browserPromise = chromium
      .launch({ channel: "chrome", headless })
      .catch(() => chromium.launch({ headless }));
  }
  return browserPromise;
}

export async function closeBrowser(): Promise<void> {
  if (browserPromise) {
    await (await browserPromise).close();
    browserPromise = null;
  }
}

async function enrichAsyncParts(page: import("playwright").Page, snap: ReturnType<typeof normalizeEnvSnapshot>) {
  const permissions: Record<string, string> = { ...snap.permissions };
  for (const name of ["notifications", "geolocation", "camera", "microphone"] as const) {
    try {
      const st = await page.evaluate(async (n) => {
        try {
          const r = await navigator.permissions.query({ name: n as PermissionName });
          return r.state;
        } catch {
          return "unsupported";
        }
      }, name);
      permissions[name] = st;
    } catch {
      permissions[name] = "unsupported";
    }
  }
  let serviceWorkerScopes: string[] = [];
  let cacheStorageKeys: string[] = [];
  try {
    const extra = await page.evaluate(async () => {
      const scopes: string[] = [];
      try {
        if (navigator.serviceWorker) {
          const regs = await navigator.serviceWorker.getRegistrations();
          for (const r of regs) scopes.push(r.scope);
        }
      } catch {}
      const cachesKeys: string[] = [];
      try {
        if (typeof caches !== "undefined") {
          const keys = await caches.keys();
          cachesKeys.push(...keys);
        }
      } catch {}
      return { scopes, cachesKeys };
    });
    serviceWorkerScopes = extra.scopes;
    cacheStorageKeys = extra.cachesKeys;
  } catch {
    /* ignore */
  }
  return normalizeEnvSnapshot({
    ...snap,
    permissions,
    serviceWorkerScopes,
    cacheStorageKeys,
  });
}

async function takeSnapshot(page: import("playwright").Page) {
  const raw = await page.evaluate(ENV_SNAPSHOT_JS);
  return enrichAsyncParts(page, normalizeEnvSnapshot(raw));
}

export async function runPlaywrightDivergence(run: number): Promise<DivergenceRun> {
  const started = Date.now();
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: "en-US",
  });
  const page = await context.newPage();
  const network: NetworkEvent[] = [];
  const t0wall = Date.now();

  page.on("request", (req) => {
    try {
      const u = new URL(req.url());
      network.push({
        kind: "request",
        resourceType: req.resourceType(),
        hostname: u.hostname,
        pathname: u.pathname,
        status: null,
        timingMs: Date.now() - t0wall,
      });
    } catch {
      /* ignore */
    }
  });
  page.on("response", (res) => {
    try {
      const u = new URL(res.url());
      network.push({
        kind: "response",
        resourceType: res.request().resourceType(),
        hostname: u.hostname,
        pathname: u.pathname,
        status: res.status(),
        timingMs: Date.now() - t0wall,
      });
      if (res.status() >= 300 && res.status() < 400) {
        network.push({
          kind: "redirect",
          resourceType: res.request().resourceType(),
          hostname: u.hostname,
          pathname: u.pathname,
          status: res.status(),
          timingMs: Date.now() - t0wall,
        });
      }
    } catch {
      /* ignore */
    }
  });

  await page.goto("https://duckduckgo.com/", {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });
  await page.waitForTimeout(600);
  const t0 = await takeSnapshot(page);

  const input = page
    .locator('#searchbox_input, input[name="q"], textarea[name="q"], input[type="search"]')
    .first();
  await input.waitFor({ state: "visible", timeout: 20_000 });
  await input.click();
  await input.fill(QUERY_60_9_5);
  const after = await input.inputValue();
  const queryEntered = after.includes("PostgreSQL");
  const t1 = await takeSnapshot(page);

  const urlBefore = page.url();
  await Promise.all([
    page.waitForLoadState("domcontentloaded", { timeout: 45_000 }).catch(() => undefined),
    page.keyboard.press("Enter"),
  ]);
  await page.waitForTimeout(3000);
  const t2 = await takeSnapshot(page);

  const body = await page.locator("body").innerText().catch(() => "");
  const title = await page.title().catch(() => "");
  const finalUrl = page.url();
  const challenge = detectChallengeText(body, title, finalUrl);
  const links = await page.evaluate(() =>
    Array.from(document.querySelectorAll("a[href]"))
      .map((a) => ({
        href: (a as HTMLAnchorElement).href,
        text: (a.textContent || "").trim().slice(0, 200),
      }))
      .filter((x) => x.href && x.text)
      .slice(0, 150),
  );
  const organic = challenge ? [] : filterOrganicHits(links, 10);
  const docs = network.filter(
    (e) => e.kind === "response" && e.resourceType === "document",
  );
  const httpStatus = docs.length ? docs[docs.length - 1]!.status : null;
  const redirects = network
    .filter((e) => e.kind === "redirect")
    .map((e) => sanitizeUrl(`https://${e.hostname}${e.pathname}`) ?? `${e.hostname}${e.pathname}`);

  const version = browser.version();
  await context.close();

  return {
    method: "playwright",
    run,
    query: QUERY_60_9_5,
    browserMeta: {
      channel: "playwright-chrome",
      browserVersion: version,
      playwrightVersion,
      os: `${os.platform()} ${os.release()}`,
      arch: os.arch(),
    },
    t0,
    t1,
    t2,
    outcome: {
      queryEntered,
      querySubmitted: queryEntered && (finalUrl !== urlBefore || /[?&]q=/i.test(finalUrl)),
      navigationOccurred: finalUrl !== urlBefore || /[?&]q=/i.test(finalUrl),
      challengeDetected: challenge,
      organicResultsDetected: organicResultsDetected(organic),
      organicDomains: organic.map((h) => h.domain),
      resultCount: organic.length,
      finalUrl: sanitizeUrl(finalUrl),
      pageTitle: title.slice(0, 200),
      httpStatus,
      resourceCount: network.filter((e) => e.kind === "request").length,
      resourceTypeCounts: countResourceTypes(network),
      redirectChain: redirects,
    },
    network: network.slice(0, 400),
    elapsedMs: Date.now() - started,
    notes: "T0/T1/T2 read-only; no stealth; no property redefinition",
  };
}
