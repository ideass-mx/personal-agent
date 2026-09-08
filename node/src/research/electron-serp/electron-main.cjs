/**
 * Electron main bridge — PHASE 60.9.6 (experimental).
 * BrowserWindow oculta; sin stealth / sin modificar fingerprints.
 *
 * Modos:
 *   ELECTRON_SERP_MODE=oneshot  → busca una vez y escribe JSON a stdout (línea RESULT ...)
 *   ELECTRON_SERP_MODE=stdio    → NDJSON request/response por stdin/stdout
 */
"use strict";

const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const readline = require("node:readline");

const MODE = process.env.ELECTRON_SERP_MODE || "oneshot";
const QUERY = process.env.ELECTRON_SERP_QUERY || "PostgreSQL 17";
const WIDTH = Number(process.env.ELECTRON_SERP_WIDTH || "1920");
const HEIGHT = Number(process.env.ELECTRON_SERP_HEIGHT || "1080");
const NAV_TIMEOUT = Number(process.env.ELECTRON_SERP_NAV_TIMEOUT_MS || "45000");
const SEARCH_TIMEOUT = Number(process.env.ELECTRON_SERP_SEARCH_TIMEOUT_MS || "45000");
const USER_DATA =
  process.env.ELECTRON_SERP_USER_DATA ||
  fs.mkdtempSync(path.join(os.tmpdir(), "pa-electron-serp-"));

// Perfil aislado experimental — nunca el del usuario/Cursor.
app.setPath("userData", USER_DATA);
app.setPath("sessionData", path.join(USER_DATA, "session"));

// No headless switch. No disableHardwareAcceleration (queremos GPU nativa si existe).
// --no-sandbox: workaround Linux cuando chrome-sandbox no es setuid root.
// No es stealth ni spoofing de fingerprint; solo permite arrancar Chromium embebido.
if (process.env.ELECTRON_SERP_NO_SANDBOX !== "0") {
  app.commandLine.appendSwitch("no-sandbox");
}
app.commandLine.appendSwitch("no-first-run");
app.commandLine.appendSwitch("disable-default-apps");

let win = null;
let closing = false;

function logLine(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

function fail(err) {
  const message = err && err.message ? err.message : String(err);
  logLine({ type: "error", error: message.slice(0, 500) });
}

async function createWindow() {
  win = new BrowserWindow({
    show: false,
    width: WIDTH,
    height: HEIGHT,
    paintWhenInitiallyHidden: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      // Sin preload de spoofing.
    },
  });
  win.setMenuBarVisibility(false);
  return win;
}

function waitForLoad(timeoutMs) {
  return new Promise((resolve, reject) => {
    const wc = win.webContents;
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      reject(new Error("load timeout"));
    }, timeoutMs);
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve();
    };
    if (!wc.isLoading()) {
      finish();
      return;
    }
    wc.once("did-finish-load", finish);
    wc.once("did-fail-load", (_e, code, desc) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      reject(new Error(`did-fail-load ${code} ${desc}`));
    });
  });
}

async function navigate(url, timeoutMs) {
  const loadPromise = waitForLoad(timeoutMs);
  await win.loadURL(url);
  await loadPromise;
}

async function evaluate(expression) {
  return win.webContents.executeJavaScript(expression, true);
}

async function evaluateFn(fnSource, arg) {
  // fnSource is a string like "(query) => { ... }"
  return win.webContents.executeJavaScript(
    `(${fnSource})(${JSON.stringify(arg)})`,
    true,
  );
}

const ENV_SNAPSHOT = `(() => {
  const nav = navigator;
  let webglVendor = null;
  let webglRenderer = null;
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl");
    if (gl) {
      const dbg = gl.getExtension("WEBGL_debug_renderer_info");
      if (dbg) {
        webglVendor = gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL);
        webglRenderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
      }
    }
  } catch (e) {}
  return {
    webdriver: typeof nav.webdriver === "boolean" ? nav.webdriver : null,
    userAgent: nav.userAgent || null,
    platform: nav.platform || null,
    language: nav.language || null,
    languages: Array.from(nav.languages || []),
    deviceMemory: typeof nav.deviceMemory === "number" ? nav.deviceMemory : null,
    hardwareConcurrency:
      typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : null,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
    screenWidth: screen.width,
    screenHeight: screen.height,
    webglVendor,
    webglRenderer
  };
})()`;

const FILL_SUBMIT = `(query) => {
  const input =
    document.querySelector("#search_form_input_homepage") ||
    document.querySelector("#searchbox_input") ||
    document.querySelector("#searchbox") ||
    document.querySelector("input[name=q]") ||
    document.querySelector("textarea[name=q]") ||
    document.querySelector("input[type=search]") ||
    document.querySelector("form[action*='search'] input[type=text]") ||
    document.querySelector("form[action*='search'] input[type=search]") ||
    document.querySelector("input[type=text]");
  if (!input) return { ok: false, reason: "no-input" };
  input.focus();
  const proto = Object.getPrototypeOf(input);
  const desc = Object.getOwnPropertyDescriptor(proto, "value");
  if (desc && desc.set) desc.set.call(input, query);
  else input.value = query;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  const form = input.closest("form");
  if (form && typeof form.requestSubmit === "function") {
    form.requestSubmit();
    return { ok: true, method: "requestSubmit", value: String(input.value || "") };
  }
  if (form) {
    form.submit();
    return { ok: true, method: "form.submit", value: String(input.value || "") };
  }
  input.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }),
  );
  input.dispatchEvent(
    new KeyboardEvent("keyup", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }),
  );
  return { ok: true, method: "enter-event", value: String(input.value || "") };
}`;

const EXTRACT = `(() => {
  const links = [];
  for (const a of document.querySelectorAll("a[href]")) {
    const href = a.href;
    const text = (a.textContent || "").trim();
    if (!href || text.length < 3) continue;
    links.push({ href, text: text.slice(0, 200) });
  }
  return {
    title: document.title || "",
    url: location.href,
    bodyText: (document.body && document.body.innerText || "").slice(0, 4000),
    links
  };
})()`;

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

/** Espera condición observable: challenge o SERP con enlaces suficientes. */
async function waitForSerpReady(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await evaluate(`(() => {
      const body = ((document.body && document.body.innerText) || "").slice(0, 2500).toLowerCase();
      const challenge = /bots use duckduckgo|please complete the following challenge|select all squares|\\/assets\\/anomaly\\//.test(body);
      const hasQ = /[?&]q=/.test(location.search || location.href);
      const links = document.querySelectorAll("a[href]").length;
      const title = document.title || "";
      const loading = document.readyState !== "complete";
      return {
        challenge,
        hasQ,
        links,
        title,
        loading,
        ready: challenge || (hasQ && !loading && links >= 6)
      };
    })()`);
    if (last && last.ready) return last;
    await sleep(100);
  }
  return last;
}

async function runOneshotSearch(query) {
  const started = Date.now();
  let queryEntered = false;
  let querySubmitted = false;
  let navigation = false;
  let env = null;
  let extract = null;
  let error = null;
  const timings = {
    navigateMs: 0,
    submitWaitMs: 0,
    stabilizeMs: 0,
    extractMs: 0,
  };

  try {
    const tNav = Date.now();
    await navigate("https://duckduckgo.com/", NAV_TIMEOUT);
    timings.navigateMs = Date.now() - tNav;

    env = await evaluate(ENV_SNAPSHOT);
    const fill = await evaluateFn(FILL_SUBMIT, query);
    const qLower = String(query || "").toLowerCase();
    const filled = String((fill && fill.value) || "").toLowerCase();
    queryEntered = !!(fill && fill.ok && (filled.includes(qLower.slice(0, 12)) || filled.length >= 3));
    querySubmitted = !!(fill && fill.ok);

    const before = win.webContents.getURL();
    const tWait = Date.now();
    const deadline = Date.now() + SEARCH_TIMEOUT;
    while (Date.now() < deadline) {
      await sleep(100);
      if (win.webContents.isLoading()) continue;
      const now = win.webContents.getURL();
      if (now !== before && /[?&]q=/.test(now)) {
        navigation = true;
        break;
      }
      if (/[?&]q=/.test(now) && now !== "https://duckduckgo.com/") {
        navigation = true;
        break;
      }
    }
    timings.submitWaitMs = Date.now() - tWait;

    const tStab = Date.now();
    await waitForSerpReady(Math.min(12_000, SEARCH_TIMEOUT));
    timings.stabilizeMs = Date.now() - tStab;

    if (!navigation) {
      const u = win.webContents.getURL();
      navigation = u !== before;
    }

    const tExt = Date.now();
    extract = await evaluate(EXTRACT);
    env = await evaluate(ENV_SNAPSHOT);
    timings.extractMs = Date.now() - tExt;
  } catch (e) {
    error = e && e.message ? e.message : String(e);
  }

  return {
    type: "oneshot-result",
    query,
    queryEntered,
    querySubmitted,
    navigation,
    env,
    extract,
    error,
    elapsedMs: Date.now() - started,
    timings,
    browserMeta: {
      channel: "electron-background",
      electronVersion: process.versions.electron || null,
      chromeVersion: process.versions.chrome || null,
      userDataDir: USER_DATA,
      showWindow: false,
      os: `${process.platform} ${os.release()}`,
      arch: process.arch,
      windowSize: { width: WIDTH, height: HEIGHT },
    },
  };
}

async function waitForBraveSerpReady(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await evaluate(`(() => {
      const body = ((document.body && document.body.innerText) || "").slice(0, 2500).toLowerCase();
      const challenge = /unusual traffic|verify you are human|are you a robot|access denied|cf-challenge|just a moment|attention required|captcha|please complete the security check/.test(body);
      const href = location.href || "";
      const hasSearch =
        /search\\.brave\\.com\\/search/i.test(href) ||
        /[?&]q=/.test(location.search || href);
      const links = document.querySelectorAll("a[href]").length;
      const title = document.title || "";
      const loading = document.readyState !== "complete";
      return {
        challenge,
        hasSearch,
        links,
        title,
        loading,
        ready: challenge || (hasSearch && !loading && links >= 6)
      };
    })()`);
    if (last && last.ready) return last;
    await sleep(100);
  }
  return last;
}

async function runBraveSearch(query) {
  const started = Date.now();
  let queryEntered = false;
  let querySubmitted = false;
  let navigation = false;
  let env = null;
  let extract = null;
  let error = null;
  const timings = {
    navigateMs: 0,
    submitWaitMs: 0,
    stabilizeMs: 0,
    extractMs: 0,
  };

  try {
    const searchUrl =
      "https://search.brave.com/search?q=" +
      encodeURIComponent(String(query || "")) +
      "&source=web";
    const tNav = Date.now();
    await navigate(searchUrl, NAV_TIMEOUT);
    timings.navigateMs = Date.now() - tNav;

    const nowUrl = win.webContents.getURL();
    navigation = /search\.brave\.com\/search/i.test(nowUrl);
    queryEntered = /[?&]q=/.test(nowUrl);
    querySubmitted = queryEntered;

    env = await evaluate(ENV_SNAPSHOT);

    const tStab = Date.now();
    await waitForBraveSerpReady(Math.min(12_000, SEARCH_TIMEOUT));
    timings.stabilizeMs = Date.now() - tStab;
    timings.submitWaitMs = 0;

    const tExt = Date.now();
    extract = await evaluate(EXTRACT);
    env = await evaluate(ENV_SNAPSHOT);
    timings.extractMs = Date.now() - tExt;

    if (!navigation) {
      navigation = /search\.brave\.com\/search/i.test(win.webContents.getURL());
    }
  } catch (e) {
    error = e && e.message ? e.message : String(e);
  }

  return {
    type: "oneshot-result",
    engine: "brave",
    query,
    queryEntered,
    querySubmitted,
    navigation,
    env,
    extract,
    error,
    elapsedMs: Date.now() - started,
    timings,
    browserMeta: {
      channel: "electron-background",
      electronVersion: process.versions.electron || null,
      chromeVersion: process.versions.chrome || null,
      userDataDir: USER_DATA,
      showWindow: false,
      os: `${process.platform} ${os.release()}`,
      arch: process.arch,
      windowSize: { width: WIDTH, height: HEIGHT },
    },
  };
}

async function shutdown(code) {
  if (closing) return;
  closing = true;
  try {
    if (win && !win.isDestroyed()) win.destroy();
  } catch (_) {}
  try {
    app.exit(code);
  } catch (_) {
    process.exit(code);
  }
}

async function handleStdioCommand(msg) {
  const id = msg.id;
  try {
    switch (msg.cmd) {
      case "ping":
        logLine({ id, ok: true, pong: true });
        break;
      case "navigate":
        await navigate(String(msg.url || ""), Number(msg.timeoutMs || NAV_TIMEOUT));
        logLine({ id, ok: true, url: win.webContents.getURL() });
        break;
      case "waitForLoad":
        await waitForLoad(Number(msg.timeoutMs || NAV_TIMEOUT));
        logLine({ id, ok: true });
        break;
      case "evaluate":
        logLine({ id, ok: true, result: await evaluate(String(msg.expression || "")) });
        break;
      case "getContent": {
        const html = await evaluate("document.documentElement.outerHTML.slice(0, 50000)");
        logLine({ id, ok: true, result: { htmlLength: typeof html === "string" ? html.length : 0 } });
        break;
      }
      case "searchDdg": {
        const result = await runOneshotSearch(String(msg.query || QUERY));
        logLine({ id, ok: true, result });
        break;
      }
      case "searchBrave": {
        const result = await runBraveSearch(String(msg.query || QUERY));
        logLine({ id, ok: true, result });
        break;
      }
      case "close":
        logLine({ id, ok: true });
        await shutdown(0);
        break;
      default:
        logLine({ id, ok: false, error: "unknown-cmd" });
    }
  } catch (e) {
    logLine({ id, ok: false, error: (e && e.message) || String(e) });
  }
}

app.whenReady().then(async () => {
  try {
    await createWindow();
    if (MODE === "stdio") {
      logLine({ type: "ready", userDataDir: USER_DATA });
      const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
      rl.on("line", (line) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        let msg;
        try {
          msg = JSON.parse(trimmed);
        } catch {
          fail(new Error("invalid-json"));
          return;
        }
        void handleStdioCommand(msg);
      });
      rl.on("close", () => {
        void shutdown(0);
      });
      return;
    }

    // oneshot
    const result = await runOneshotSearch(QUERY);
    logLine(result);
    await shutdown(result.error ? 1 : 0);
  } catch (e) {
    fail(e);
    await shutdown(1);
  }
});

app.on("window-all-closed", (e) => {
  // Evitar quit implícito mientras stdio sigue vivo
  if (MODE === "stdio") e.preventDefault();
});

process.on("SIGINT", () => {
  void shutdown(0);
});
process.on("SIGTERM", () => {
  void shutdown(0);
});
