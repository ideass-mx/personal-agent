/**
 * Host Node → Electron child (BrowserWindow oculta).
 * Sin stealth; sin modificar fingerprints.
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import os from "node:os";
import {
  assertNoSecretsInPayload,
  normalizeEnvSnapshot,
  sanitizeDiagnosticUrl,
} from "./diagnostics.ts";
import { analyzeSerpPage, type PageExtract } from "./duckduckgo/page.ts";
import { analyzeBraveSerpPage } from "./brave/page.ts";
import {
  QUERY_60_9_6,
  type ElectronSerpRunResult,
  type ElectronSerpRuntimeOptions,
} from "./types.ts";

const here = dirname(fileURLToPath(import.meta.url));
const MAIN = join(here, "electron-main.cjs");
const require = createRequire(import.meta.url);

export function resolveElectronBinary(): string {
  try {
    // electron package exports path string when required from Node
    const p = require("electron") as unknown;
    if (typeof p === "string" && existsSync(p)) return p;
  } catch {
    /* fallthrough */
  }
  const local = join(here, "../../../../node_modules/electron/cli.js");
  if (existsSync(local)) return process.execPath; // use electron via npx path below
  throw new Error("electron binary not found — install electron as a node devDependency");
}

function electronCli(): { cmd: string; argsPrefix: string[] } {
  try {
    const bin = require("electron") as unknown;
    if (typeof bin === "string") return { cmd: bin, argsPrefix: [] };
  } catch {
    /* ignore */
  }
  // Fallback: electron npm bin
  const electronPkg = join(here, "../../../../node_modules/.bin/electron");
  if (existsSync(electronPkg)) return { cmd: electronPkg, argsPrefix: [] };
  throw new Error("electron not installed");
}

type Pending = {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
};

export class ElectronSerpRuntime {
  private child: ChildProcessWithoutNullStreams | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private userDataDir: string;
  private ownsUserData: boolean;
  private width: number;
  private height: number;
  private navigateTimeoutMs: number;
  private searchTimeoutMs: number;
  private ready = false;
  private closed = false;

  constructor(opts: ElectronSerpRuntimeOptions = {}) {
    this.ownsUserData = !opts.userDataDir;
    this.userDataDir =
      opts.userDataDir ?? mkdtempSync(join(tmpdir(), "pa-electron-serp-"));
    this.width = opts.width ?? 1920;
    this.height = opts.height ?? 1080;
    this.navigateTimeoutMs = opts.navigateTimeoutMs ?? 45_000;
    this.searchTimeoutMs = opts.searchTimeoutMs ?? 45_000;
  }

  getUserDataDir(): string {
    return this.userDataDir;
  }

  async launch(): Promise<void> {
    if (this.child) return;
    this.closed = false;
    if (this.ownsUserData && !existsSync(this.userDataDir)) {
      this.userDataDir = mkdtempSync(join(tmpdir(), "pa-electron-serp-"));
    }
    const { cmd, argsPrefix } = electronCli();
    const env = {
      ...process.env,
      ELECTRON_SERP_MODE: "stdio",
      ELECTRON_SERP_USER_DATA: this.userDataDir,
      ELECTRON_SERP_WIDTH: String(this.width),
      ELECTRON_SERP_HEIGHT: String(this.height),
      ELECTRON_SERP_NAV_TIMEOUT_MS: String(this.navigateTimeoutMs),
      ELECTRON_SERP_SEARCH_TIMEOUT_MS: String(this.searchTimeoutMs),
      // Evitar que Electron trate el host como app GUI ruidosa en algunos entornos
      ELECTRON_NO_ATTACH_CONSOLE: "1",
    };
    // --no-sandbox: requerido en Linux si chrome-sandbox no es setuid (no es stealth).
    const sandboxArgs =
      process.env.ELECTRON_SERP_NO_SANDBOX === "0" ? [] : ["--no-sandbox"];
    this.child = spawn(cmd, [...argsPrefix, ...sandboxArgs, MAIN], {
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.closed = false;

    const rl = createInterface({ input: this.child.stdout });
    rl.on("line", (line) => this.onLine(line));
    this.child.stderr.on("data", () => {
      /* no loguear cuerpos; stderr de chromium puede ser ruidoso */
    });
    this.child.on("exit", () => {
      this.child = null;
      this.ready = false;
      for (const [, p] of this.pending) p.reject(new Error("electron exited"));
      this.pending.clear();
    });

    await this.waitReady(30_000);
  }

  private waitReady(timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const tick = () => {
        if (this.ready) {
          resolve();
          return;
        }
        if (Date.now() - started > timeoutMs) {
          reject(new Error("electron ready timeout"));
          return;
        }
        setTimeout(tick, 50);
      };
      tick();
    });
  }

  private onLine(line: string): void {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(line) as Record<string, unknown>;
    } catch {
      return;
    }
    if (msg.type === "ready") {
      this.ready = true;
      return;
    }
    if (typeof msg.id === "number") {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.ok === false) p.reject(new Error(String(msg.error || "cmd-failed")));
      else p.resolve(msg);
    }
  }

  private request(payload: Record<string, unknown>, timeoutMs: number): Promise<Record<string, unknown>> {
    if (!this.child || !this.child.stdin.writable) {
      return Promise.reject(new Error("runtime not launched"));
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`cmd timeout: ${payload.cmd}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v as Record<string, unknown>);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      this.child!.stdin.write(JSON.stringify({ ...payload, id }) + "\n");
    });
  }

  async navigate(url: string): Promise<string> {
    const res = await this.request(
      { cmd: "navigate", url, timeoutMs: this.navigateTimeoutMs },
      this.navigateTimeoutMs + 5_000,
    );
    return String(res.url || "");
  }

  async waitForLoad(): Promise<void> {
    await this.request({ cmd: "waitForLoad", timeoutMs: this.navigateTimeoutMs }, this.navigateTimeoutMs + 5_000);
  }

  async evaluate<T = unknown>(expression: string): Promise<T> {
    const res = await this.request(
      { cmd: "evaluate", expression },
      this.searchTimeoutMs + 5_000,
    );
    return res.result as T;
  }

  async getContent(): Promise<{ htmlLength: number }> {
    const res = await this.request({ cmd: "getContent" }, 15_000);
    return res.result as { htmlLength: number };
  }

  /**
   * Búsqueda DDG completa dentro del proceso Electron.
   */
  async searchDuckDuckGo(query: string, run = 1): Promise<ElectronSerpRunResult> {
    const res = await this.request(
      { cmd: "searchDdg", query },
      this.searchTimeoutMs + this.navigateTimeoutMs + 15_000,
    );
    const raw = res.result as Record<string, unknown>;
    return finalizeRunResult(raw, run, this.userDataDir, "ddg");
  }

  /**
   * Búsqueda Brave Search Web (PHASE 60.13) — mismo runtime Electron.
   */
  async searchBrave(query: string, run = 1): Promise<ElectronSerpRunResult> {
    const res = await this.request(
      { cmd: "searchBrave", query },
      this.searchTimeoutMs + this.navigateTimeoutMs + 15_000,
    );
    const raw = res.result as Record<string, unknown>;
    return finalizeRunResult(raw, run, this.userDataDir, "brave");
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    try {
      if (this.child) {
        await this.request({ cmd: "close" }, 5_000).catch(() => undefined);
        const child = this.child;
        await new Promise<void>((resolve) => {
          if (!child) {
            resolve();
            return;
          }
          const t = setTimeout(() => {
            try {
              child.kill("SIGKILL");
            } catch {
              /* ignore */
            }
            resolve();
          }, 3_000);
          child.once("exit", () => {
            clearTimeout(t);
            resolve();
          });
        });
      }
    } finally {
      this.child = null;
      this.ready = false;
      if (this.ownsUserData) {
        try {
          rmSync(this.userDataDir, { recursive: true, force: true });
        } catch {
          /* ignore */
        }
      }
    }
  }
}

export function finalizeRunResult(
  raw: Record<string, unknown>,
  run: number,
  userDataDir: string,
  engine: "ddg" | "brave" = "ddg",
): ElectronSerpRunResult {
  const extract = (raw.extract || {}) as PageExtract;
  const page = {
    title: typeof extract.title === "string" ? extract.title : "",
    url: typeof extract.url === "string" ? extract.url : "",
    bodyText: typeof extract.bodyText === "string" ? extract.bodyText : "",
    links: Array.isArray(extract.links) ? extract.links : [],
  };
  const analysis =
    engine === "brave" ? analyzeBraveSerpPage(page) : analyzeSerpPage(page);
  const env = normalizeEnvSnapshot(raw.env);
  const meta = (raw.browserMeta || {}) as Record<string, unknown>;
  const organicCount = analysis.challenge ? 0 : analysis.hits.length;
  const result: ElectronSerpRunResult = {
    method: "electron-background",
    run,
    query: typeof raw.query === "string" ? raw.query : QUERY_60_9_6,
    queryEntered: raw.queryEntered === true,
    querySubmitted: raw.querySubmitted === true,
    navigation: raw.navigation === true,
    challenge: analysis.challenge,
    organicResults: organicCount,
    containsPostgresqlOrg: analysis.challenge ? false : analysis.containsPostgresqlOrg,
    organicDomains: analysis.challenge ? [] : analysis.hits.map((h) => h.domain),
    finalUrl: analysis.finalUrl ?? sanitizeDiagnosticUrl(typeof extract.url === "string" ? extract.url : null),
    pageTitle: analysis.pageTitle,
    env,
    browserMeta: {
      channel: "electron-background",
      electronVersion: typeof meta.electronVersion === "string" ? meta.electronVersion : null,
      chromeVersion: typeof meta.chromeVersion === "string" ? meta.chromeVersion : null,
      userDataDir,
      showWindow: false,
      os: typeof meta.os === "string" ? meta.os : `${os.platform()} ${os.release()}`,
      arch: typeof meta.arch === "string" ? meta.arch : os.arch(),
    },
    elapsedMs: typeof raw.elapsedMs === "number" ? raw.elapsedMs : 0,
    error: typeof raw.error === "string" ? raw.error : null,
  };
  assertNoSecretsInPayload(result);
  return result;
}

/** oneshot: launch → search → close (proceso Electron dedicado). */
export async function runElectronSerpOnce(
  run: number,
  query = QUERY_60_9_6,
  opts: ElectronSerpRuntimeOptions = {},
): Promise<ElectronSerpRunResult> {
  const runtime = new ElectronSerpRuntime(opts);
  try {
    await runtime.launch();
    return await runtime.searchDuckDuckGo(query, run);
  } finally {
    await runtime.close();
  }
}

/**
 * Alternativa oneshot vía env ELECTRON_SERP_MODE=oneshot (sin stdio protocol).
 * Útil para depuración / smoke.
 */
export async function runElectronSerpOneshotProcess(
  run: number,
  query = QUERY_60_9_6,
  opts: ElectronSerpRuntimeOptions = {},
): Promise<ElectronSerpRunResult> {
  const userDataDir = opts.userDataDir ?? mkdtempSync(join(tmpdir(), "pa-electron-serp-"));
  const owns = !opts.userDataDir;
  const { cmd, argsPrefix } = electronCli();
  const sandboxArgs =
    process.env.ELECTRON_SERP_NO_SANDBOX === "0" ? [] : ["--no-sandbox"];
  const child = spawn(cmd, [...argsPrefix, ...sandboxArgs, MAIN], {
    env: {
      ...process.env,
      ELECTRON_SERP_MODE: "oneshot",
      ELECTRON_SERP_QUERY: query,
      ELECTRON_SERP_USER_DATA: userDataDir,
      ELECTRON_SERP_WIDTH: String(opts.width ?? 1920),
      ELECTRON_SERP_HEIGHT: String(opts.height ?? 1080),
      ELECTRON_NO_ATTACH_CONSOLE: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let resultLine: Record<string, unknown> | null = null;
  const rl = createInterface({ input: child.stdout });
  rl.on("line", (line) => {
    try {
      const msg = JSON.parse(line) as Record<string, unknown>;
      if (msg.type === "oneshot-result") resultLine = msg;
    } catch {
      /* ignore */
    }
  });
  const code = await new Promise<number>((resolve) => {
    child.on("exit", (c) => resolve(c ?? 1));
  });
  if (owns) {
    try {
      rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
  if (!resultLine) {
    return {
      method: "electron-background",
      run,
      query,
      queryEntered: false,
      querySubmitted: false,
      navigation: false,
      challenge: false,
      organicResults: 0,
      containsPostgresqlOrg: false,
      organicDomains: [],
      finalUrl: null,
      pageTitle: null,
      env: normalizeEnvSnapshot({}),
      browserMeta: {
        channel: "electron-background",
        electronVersion: null,
        chromeVersion: null,
        userDataDir,
        showWindow: false,
        os: `${os.platform()} ${os.release()}`,
        arch: os.arch(),
      },
      elapsedMs: 0,
      error: `oneshot failed exit=${code}`,
    };
  }
  return finalizeRunResult(resultLine, run, userDataDir);
}
