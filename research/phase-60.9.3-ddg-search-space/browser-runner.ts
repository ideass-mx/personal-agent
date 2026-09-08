/**
 * Playwright — interacción humana en DuckDuckGo homepage.
 * NO usa page.goto("https://duckduckgo.com/?q=...").
 * Sin stealth / CAPTCHA solving / fingerprint spoofing.
 */
import { chromium, firefox, type Browser, type Page } from "playwright";
import {
  parseDuckDuckGoHtmlResults,
  parseGenericSerpLinks,
} from "../../node/src/research/experimental/browser-ab/parsers.ts";
import type {
  ExperimentMethod,
  InputMode,
  InteractionTrace,
  NetworkMeta,
  Observation,
  ObservationStatus,
  SerpHit,
} from "./types.ts";

let browserPromise: Promise<Browser> | null = null;
let browserLabel = "unknown";

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    const headless = process.env.DDG_SS_HEADLESS !== "0";
    const prefer = (process.env.DDG_SS_CHANNEL ?? "chrome").toLowerCase();
    browserPromise = (async () => {
      if (prefer === "firefox") {
        browserLabel = "firefox";
        return firefox.launch({ headless });
      }
      try {
        browserLabel = prefer === "chromium" ? "chromium" : "chrome";
        return await chromium.launch({
          channel: prefer === "chromium" ? undefined : "chrome",
          headless,
        });
      } catch {
        browserLabel = "chromium";
        return chromium.launch({ headless });
      }
    })();
  }
  return browserPromise;
}

export async function closeBrowser(): Promise<void> {
  if (browserPromise) {
    const b = await browserPromise;
    await b.close();
    browserPromise = null;
  }
}

export function getBrowserLabel(): string {
  return browserLabel;
}

function methodFor(mode: InputMode): ExperimentMethod {
  if (mode === "fill") return "playwright_fill";
  if (mode === "insertText") return "playwright_insertText";
  return "playwright_type";
}

function detectChallenge(url: string, title: string, body: string): boolean {
  const t = `${title}\n${body}\n${url}`.toLowerCase();
  if (/bots use duckduckgo|please complete the following challenge|select all squares containing/i.test(t)) {
    return true;
  }
  if (/are you a robot|verify you are human|anomaly-modal|\/assets\/anomaly\//i.test(t)) {
    return true;
  }
  if (/captcha/i.test(t) && !/result__a|web-result/i.test(body)) return true;
  return false;
}

function detectResultsPage(url: string, title: string, resultCount: number): boolean {
  if (resultCount > 0) return true;
  try {
    const u = new URL(url);
    if (u.hostname.includes("duckduckgo.com") && u.searchParams.has("q")) return true;
  } catch {
    /* ignore */
  }
  if (/ at duckduckgo$/i.test(title.trim())) return true;
  return false;
}

function extractHits(html: string, links: Array<{ href: string; text: string }>): SerpHit[] {
  const fromHtml = parseDuckDuckGoHtmlResults(html, 10);
  if (fromHtml.length > 0) return fromHtml;
  return parseGenericSerpLinks(links, ["duckduckgo.com", "duck.com"], 10);
}

async function readInputValue(page: Page): Promise<string | null> {
  const loc = page
    .locator('#searchbox_input, input[name="q"], textarea[name="q"], input[type="search"]')
    .first();
  if (!(await loc.count().catch(() => 0))) return null;
  return (await loc.inputValue().catch(() => null)) ?? null;
}

async function enterQuery(page: Page, query: string, mode: InputMode): Promise<{
  entered: boolean;
  before: string | null;
  after: string | null;
  error?: string;
}> {
  const input = page
    .locator(
      '#searchbox_input, input[name="q"], textarea[name="q"], input[type="search"], [data-testid="searchbox"] input',
    )
    .first();

  try {
    await input.waitFor({ state: "visible", timeout: 20_000 });
  } catch {
    return { entered: false, before: null, after: null, error: "search_input_not_visible" };
  }

  await input.click({ timeout: 5000 });
  const before = await input.inputValue().catch(() => "");

  if (mode === "fill") {
    await input.fill(query);
  } else if (mode === "insertText") {
    await input.fill("");
    await page.keyboard.insertText(query);
  } else {
    await input.fill("");
    // Velocidad normal de teclado — no “humanize” anti-detección.
    await page.keyboard.type(query, { delay: 30 });
  }

  const after = await input.inputValue().catch(() => null);
  const entered = typeof after === "string" && after.includes(query.slice(0, Math.min(8, query.length)));
  return { entered, before: before || null, after };
}

export async function runPlaywrightObservation(input: {
  run: number;
  queryId: string;
  query: string;
  mode: InputMode;
}): Promise<Observation> {
  const started = Date.now();
  const method = methodFor(input.mode);
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: "en-US",
  });
  const page = await context.newPage();

  let documentRequests = 0;
  let navigationRequests = 0;
  let redirectCount = 0;
  let resourceCount = 0;
  let lastDocumentStatus: number | null = null;
  let contentType: string | null = null;
  const startUrl = "https://duckduckgo.com/";

  page.on("request", (req) => {
    resourceCount++;
    if (req.isNavigationRequest()) navigationRequests++;
    if (req.resourceType() === "document") documentRequests++;
  });
  page.on("response", (res) => {
    if (res.status() >= 300 && res.status() < 400) redirectCount++;
    if (res.request().resourceType() === "document") {
      lastDocumentStatus = res.status();
      contentType = res.headers()["content-type"] ?? null;
    }
  });

  const emptyTrace = (partial: Partial<InteractionTrace>): InteractionTrace => ({
    queryEntered: false,
    querySubmitted: false,
    navigationOccurred: false,
    resultsPageDetected: false,
    challengeDetected: false,
    inputValueBeforeSubmit: null,
    inputValueAfterSubmit: null,
    submitTriggered: false,
    runnerFailure: false,
    ...partial,
  });

  try {
    await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForTimeout(600);

    // Consent genérico (no evasion)
    for (const sel of [
      'button:has-text("Accept")',
      'button:has-text("Aceptar")',
      'button:has-text("Got it")',
    ]) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.click({ timeout: 1500 }).catch(() => undefined);
        break;
      }
    }

    const urlBeforeSubmit = page.url();
    const entry = await enterQuery(page, input.query, input.mode);
    if (!entry.entered) {
      const cookies = await context.cookies();
      const failUrl = page.url();
      const failTitle = await page.title().catch(() => "");
      await context.close();
      return {
        run: input.run,
        queryId: input.queryId,
        query: input.query,
        method,
        status: "RUNNER_ERROR",
        latencyMs: Date.now() - started,
        resultCount: 0,
        blocked: false,
        blockReason: "BROWSER_RUNNER_FAILURE",
        error: entry.error ?? "query_not_entered",
        currentUrl: failUrl,
        pageTitle: failTitle,
        results: [],
        interaction: emptyTrace({
          queryEntered: false,
          inputValueBeforeSubmit: entry.before,
          inputValueAfterSubmit: entry.after,
          runnerFailure: true,
        }),
        network: {
          documentRequests,
          navigationRequests,
          redirectCount,
          resourceCount,
          lastDocumentStatus,
          contentType,
          cookiesSet: cookies.length > 0,
          cookieCount: cookies.length,
        },
        notes: `browser=${browserLabel}; query never entered input`,
      };
    }

    // Submit: Enter (flujo normal de usuario)
    const submitTriggered = true;
    await Promise.all([
      page.waitForLoadState("domcontentloaded", { timeout: 45_000 }).catch(() => undefined),
      page.keyboard.press("Enter"),
    ]);
    await page.waitForTimeout(2800);

    const urlAfter = page.url();
    const navigationOccurred =
      urlAfter !== urlBeforeSubmit || /[?&]q=/i.test(urlAfter);
    const title = await page.title().catch(() => "");
    const body = await page.locator("body").innerText().catch(() => "");
    const html = await page.content();
    const links = await page.evaluate(() =>
      Array.from(document.querySelectorAll("a[href]"))
        .map((a) => ({
          href: (a as HTMLAnchorElement).href,
          text: (a.textContent || "").trim().slice(0, 200),
        }))
        .filter((x) => x.href && x.text)
        .slice(0, 120),
    );
    const hitsRaw = extractHits(html, links);
    const challengeDetected = detectChallenge(urlAfter, title, body);
    // En challenge, los "hits" genéricos suelen ser enlaces del chrome (apps/store), no SERP.
    const hits = challengeDetected ? [] : hitsRaw;
    const resultsPageDetected = detectResultsPage(urlAfter, title, hits.length);
    const inputAfterSubmit = await readInputValue(page);
    const cookies = await context.cookies();

    const interaction: InteractionTrace = {
      queryEntered: true,
      querySubmitted: submitTriggered && (navigationOccurred || challengeDetected || hits.length > 0),
      navigationOccurred,
      resultsPageDetected,
      challengeDetected,
      inputValueBeforeSubmit: entry.before,
      inputValueAfterSubmit: entry.after,
      submitTriggered,
      runnerFailure: false,
    };

    // Clasificación: runner failure vs anti-bot
    let status: ObservationStatus;
    let blocked = false;
    let blockReason: string | null = null;
    let runnerFailure = false;

    if (!interaction.queryEntered || !interaction.submitTriggered) {
      status = "RUNNER_ERROR";
      blockReason = "BROWSER_RUNNER_FAILURE";
      runnerFailure = true;
    } else if (challengeDetected) {
      status = /captcha/i.test(body) ? "CAPTCHA" : "CHALLENGE";
      blocked = true;
      blockReason = status.toLowerCase();
    } else if (hits.length > 0) {
      status = "SUCCESS";
    } else if (resultsPageDetected && hits.length === 0) {
      if (/bots use|challenge|anomaly/i.test(body)) {
        status = "CHALLENGE";
        blocked = true;
        blockReason = "challenge";
      } else {
        status = "EMPTY";
      }
    } else if (!navigationOccurred) {
      status = "RUNNER_ERROR";
      blockReason = "BROWSER_RUNNER_FAILURE";
      runnerFailure = true;
    } else {
      status = "UNKNOWN";
    }

    const interactionFinal: InteractionTrace = {
      ...interaction,
      runnerFailure,
      querySubmitted:
        interaction.querySubmitted ||
        (submitTriggered && (navigationOccurred || challengeDetected || hits.length > 0)),
    };

    const network: NetworkMeta = {
      documentRequests,
      navigationRequests,
      redirectCount,
      resourceCount,
      lastDocumentStatus,
      contentType,
      cookiesSet: cookies.length > 0,
      cookieCount: cookies.length,
    };

    await context.close();

    return {
      run: input.run,
      queryId: input.queryId,
      query: input.query,
      method,
      status,
      latencyMs: Date.now() - started,
      resultCount: hits.length,
      blocked,
      blockReason,
      currentUrl: urlAfter,
      pageTitle: title,
      results: hits,
      interaction: interactionFinal,
      network,
      notes: `browser=${browserLabel}; mode=${input.mode}; no direct ?q= navigation`,
    };
  } catch (err) {
    await context.close().catch(() => undefined);
    const msg = err instanceof Error ? err.message : "error";
    return {
      run: input.run,
      queryId: input.queryId,
      query: input.query,
      method,
      status: /timeout/i.test(msg) ? "NAVIGATION_ERROR" : "RUNNER_ERROR",
      latencyMs: Date.now() - started,
      resultCount: 0,
      blocked: false,
      blockReason: "BROWSER_RUNNER_FAILURE",
      error: msg.slice(0, 200),
      results: [],
      interaction: emptyTrace({ runnerFailure: true }),
      notes: `browser=${browserLabel}`,
    };
  }
}
