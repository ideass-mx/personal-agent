/**
 * Playwright runner — 60.9.4 (sin stealth / sin ?q= directo).
 */
import { chromium, type Browser } from "playwright";
import {
  QUERY_60_9_4,
  detectChallenge,
  filterOrganicHits,
  organicResultsDetected,
  sanitizeUrl,
  type RunObservation,
} from "../../node/src/research/experimental/browser-comparison/index.ts";

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    const headless = process.env.DDG_CMP_HEADLESS !== "0";
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

export async function runPlaywrightOnce(run: number): Promise<RunObservation> {
  const started = Date.now();
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: "en-US",
  });
  const page = await context.newPage();
  let resourceCount = 0;
  let navigationCount = 0;
  let httpStatus: number | null = null;
  const redirectChain: string[] = [];

  page.on("request", (req) => {
    resourceCount++;
    if (req.isNavigationRequest()) navigationCount++;
  });
  page.on("response", (res) => {
    if (res.request().resourceType() === "document") {
      httpStatus = res.status();
      if (res.status() >= 300 && res.status() < 400) {
        const loc = res.headers()["location"];
        if (loc) redirectChain.push(sanitizeUrl(loc) ?? loc);
      }
    }
  });

  try {
    await page.goto("https://duckduckgo.com/", {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await page.waitForTimeout(500);

    const input = page
      .locator(
        '#searchbox_input, input[name="q"], textarea[name="q"], input[type="search"]',
      )
      .first();
    await input.waitFor({ state: "visible", timeout: 20_000 });
    await input.click();
    await input.fill(QUERY_60_9_4);
    const after = await input.inputValue();
    const queryEntered = after.includes("PostgreSQL");

    const urlBefore = page.url();
    await Promise.all([
      page.waitForLoadState("domcontentloaded", { timeout: 45_000 }).catch(() => undefined),
      page.keyboard.press("Enter"),
    ]);
    await page.waitForTimeout(2800);

    const finalUrl = page.url();
    const pageTitle = await page.title().catch(() => "");
    const bodyText = await page.locator("body").innerText().catch(() => "");
    const links = await page.evaluate(() =>
      Array.from(document.querySelectorAll("a[href]"))
        .map((a) => ({
          href: (a as HTMLAnchorElement).href,
          text: (a.textContent || "").trim().slice(0, 200),
        }))
        .filter((x) => x.href && x.text)
        .slice(0, 150),
    );

    const challenge = detectChallenge({ url: finalUrl, title: pageTitle, bodyText });
    const organic = challenge ? [] : filterOrganicHits(links, 10);
    const cookies = await context.cookies();
    const cookieNames = [...new Set(cookies.map((c) => c.name))].slice(0, 30);

    await context.close();

    return {
      method: "playwright",
      run,
      query: QUERY_60_9_4,
      queryEntered,
      querySubmitted: queryEntered && (finalUrl !== urlBefore || /[?&]q=/i.test(finalUrl)),
      finalUrl: sanitizeUrl(finalUrl),
      navigationCount,
      redirectChain,
      httpStatus,
      challengeDetected: challenge,
      organicResultsDetected: organicResultsDetected(organic),
      resultCount: organic.length,
      pageTitle: pageTitle.slice(0, 200),
      resourceCount,
      cookieNames,
      elapsedMs: Date.now() - started,
      organicDomains: organic.map((h) => h.domain).slice(0, 10),
      notes: "homepage→fill→Enter; no stealth; no direct ?q=",
    };
  } catch (err) {
    await context.close().catch(() => undefined);
    return {
      method: "playwright",
      run,
      query: QUERY_60_9_4,
      queryEntered: null,
      querySubmitted: null,
      finalUrl: null,
      navigationCount: null,
      redirectChain: [],
      httpStatus: null,
      challengeDetected: null,
      organicResultsDetected: false,
      resultCount: 0,
      pageTitle: null,
      resourceCount: null,
      cookieNames: [],
      elapsedMs: Date.now() - started,
      notes: err instanceof Error ? err.message.slice(0, 200) : "error",
    };
  }
}
