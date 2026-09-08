/**
 * LocalRuntimeManager — dueño único del proceso llama-server (PHASE 61.1).
 * AgentRuntime / Web no conocen procesos ni puertos.
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { LocalModelError, userMessageForCode } from "./errors.ts";
import {
  installLlamaServerRuntime,
  validateInstalledRuntime,
} from "./runtime-installer.ts";
import {
  resolveRuntimeManifest,
  type RuntimeManifest,
} from "./runtime-manifest.ts";
import {
  isRuntimeBinaryPresent,
  resolveRuntimeStorage,
  type RuntimeStoragePaths,
} from "./runtime-storage.ts";
import type { LocalRuntimeState } from "./types.ts";

export type RuntimeHealth = {
  ok: boolean;
  detail?: string;
  port?: number;
  pid?: number;
};

export type LocalRuntimeManager = {
  state(): LocalRuntimeState;
  health(): Promise<RuntimeHealth>;
  isInstalled(): boolean;
  install(opts?: {
    signal?: AbortSignal;
    fetchImpl?: typeof fetch;
    sourceArchive?: string;
    skipHash?: boolean;
  }): Promise<void>;
  /** Lazy start: arranca proceso + carga modelo + espera health. */
  ensureReady(modelPath: string): Promise<{ baseUrl: string }>;
  markBusy(): void;
  markIdle(): void;
  stop(): Promise<void>;
  /** Base URL OpenAI-compatible (…/v1) cuando READY/BUSY/IDLE. */
  baseUrl(): string | null;
  getManifest(): RuntimeManifest | null;
};

type LockPayload = {
  pid: number;
  port: number;
  modelPath: string;
  startedAt: string;
};

function idleTimeoutMs(): number {
  const raw = process.env.LOCAL_LLM_IDLE_TIMEOUT_MS?.trim();
  if (raw && Number.isFinite(Number(raw))) return Math.max(10_000, Number(raw));
  return 5 * 60_000;
}

function healthTimeoutMs(): number {
  const raw = process.env.LOCAL_LLM_HEALTH_TIMEOUT_MS?.trim();
  if (raw && Number.isFinite(Number(raw))) return Math.max(5_000, Number(raw));
  return 120_000;
}

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (!addr || typeof addr === "string") {
        srv.close();
        reject(new Error("no_port"));
        return;
      }
      const { port } = addr;
      srv.close((err) => (err ? reject(err) : resolve(port)));
    });
    srv.on("error", reject);
  });
}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return;
  await new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true },
    );
  });
}

function writeLock(lockFile: string, payload: LockPayload): void {
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  fs.writeFileSync(lockFile, JSON.stringify(payload), "utf8");
}

function readLock(lockFile: string): LockPayload | null {
  if (!fs.existsSync(lockFile)) return null;
  try {
    return JSON.parse(fs.readFileSync(lockFile, "utf8")) as LockPayload;
  } catch {
    return null;
  }
}

function clearLock(lockFile: string): void {
  try {
    fs.unlinkSync(lockFile);
  } catch {
    /* ignore */
  }
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export type CreateLocalRuntimeManagerOptions = {
  manifest?: RuntimeManifest | null;
  /** Inyectable en tests. */
  spawnFn?: typeof spawn;
  fetchImpl?: typeof fetch;
  /** Puerto fijo (tests). */
  port?: number;
};

export function createLocalRuntimeManager(
  options: CreateLocalRuntimeManagerOptions = {},
): LocalRuntimeManager {
  const manifest =
    options.manifest === undefined
      ? resolveRuntimeManifest()
      : options.manifest;
  const spawnFn = options.spawnFn ?? spawn;
  const fetchImpl = options.fetchImpl ?? fetch;

  let state: LocalRuntimeState = "COLD";
  let child: ChildProcessWithoutNullStreams | null = null;
  let port: number | null = options.port ?? null;
  let modelPathLoaded: string | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let startChain: Promise<{ baseUrl: string }> | null = null;
  let crashRestarts = 0;

  function paths(): RuntimeStoragePaths | null {
    if (!manifest) return null;
    return resolveRuntimeStorage(manifest);
  }

  function clearIdle(): void {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  }

  function scheduleIdleStop(): void {
    clearIdle();
    idleTimer = setTimeout(() => {
      if (state === "IDLE" || state === "READY") {
        void stopInternal("idle");
      }
    }, idleTimeoutMs());
  }

  async function pollHealth(
    p: number,
    signal?: AbortSignal,
  ): Promise<RuntimeHealth> {
    const started = Date.now();
    const deadline = started + healthTimeoutMs();
    while (Date.now() < deadline) {
      if (signal?.aborted) {
        return { ok: false, detail: "aborted" };
      }
      if (child && child.exitCode !== null) {
        return { ok: false, detail: "process_exited" };
      }
      try {
        const res = await fetchImpl(`http://127.0.0.1:${p}/health`, {
          signal: AbortSignal.timeout(2000),
        });
        if (res.ok) {
          return { ok: true, detail: "ok", port: p, pid: child?.pid };
        }
      } catch {
        /* retry */
      }
      await sleep(400, signal);
    }
    return { ok: false, detail: "timeout", port: p };
  }

  async function stopInternal(_reason: string): Promise<void> {
    clearIdle();
    state = "STOPPING";
    const c = child;
    child = null;
    const p = paths();
    if (p) clearLock(p.lockFile);
    if (c && c.exitCode === null) {
      try {
        c.kill("SIGTERM");
      } catch {
        /* ignore */
      }
      await sleep(800);
      if (c.exitCode === null) {
        try {
          c.kill("SIGKILL");
        } catch {
          /* ignore */
        }
      }
    }
    port = options.port ?? null;
    modelPathLoaded = null;
    state = "STOPPED";
    startChain = null;
  }

  async function startProcess(modelPath: string): Promise<{ baseUrl: string }> {
    if (!manifest) {
      throw new LocalModelError(
        "RUNTIME_NOT_INSTALLED",
        userMessageForCode("RUNTIME_NOT_INSTALLED"),
      );
    }
    const storage = validateInstalledRuntime(manifest);
    if (!fs.existsSync(modelPath)) {
      throw new LocalModelError(
        "MODEL_NOT_INSTALLED",
        userMessageForCode("MODEL_NOT_INSTALLED"),
      );
    }

    // Ownership: si hay lock de otro proceso vivo, fallar (no matar ajenos).
    const existing = readLock(storage.lockFile);
    if (existing && existing.pid !== process.pid && isPidAlive(existing.pid)) {
      throw new LocalModelError(
        "RUNTIME_START_FAILED",
        userMessageForCode("RUNTIME_START_FAILED"),
      );
    }

    state = "STARTING";
    const listenPort = options.port ?? (await findFreePort());
    port = listenPort;

    const args = [
      "-m",
      modelPath,
      "--host",
      "127.0.0.1",
      "--port",
      String(listenPort),
      "--ctx-size",
      "4096",
      "-np",
      "1",
    ];

    try {
      child = spawnFn(storage.binaryPath, args, {
        cwd: path.dirname(storage.binaryPath),
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env },
      }) as unknown as ChildProcessWithoutNullStreams;
    } catch (err) {
      state = "FAILED";
      throw new LocalModelError(
        "RUNTIME_START_FAILED",
        userMessageForCode("RUNTIME_START_FAILED"),
        err,
      );
    }

    child.on("exit", (code, signal) => {
      if (state === "STOPPING" || state === "STOPPED") return;
      state = "CRASHED";
      child = null;
      const st = paths();
      if (st) clearLock(st.lockFile);
      process.stderr.write(
        `[gateway] local-llm runtime crashed code=${code} signal=${signal}\n`,
      );
    });

    // No loguear stdout/stderr del modelo (puede contener prompts).
    child.stdout?.on("data", () => {});
    child.stderr?.on("data", () => {});

    writeLock(storage.lockFile, {
      pid: process.pid,
      port: listenPort,
      modelPath,
      startedAt: new Date().toISOString(),
    });

    const health = await pollHealth(listenPort);
    if (!health.ok) {
      await stopInternal("health_timeout");
      state = "FAILED";
      throw new LocalModelError(
        "RUNTIME_HEALTH_TIMEOUT",
        userMessageForCode("RUNTIME_HEALTH_TIMEOUT"),
      );
    }

    modelPathLoaded = modelPath;
    state = "READY";
    crashRestarts = 0;
    scheduleIdleStop();
    return { baseUrl: `http://127.0.0.1:${listenPort}/v1` };
  }

  return {
    state: () => state,
    async health() {
      if (!port || (state !== "READY" && state !== "BUSY" && state !== "IDLE")) {
        return { ok: false, detail: state };
      }
      return pollHealth(port);
    },
    isInstalled() {
      if (!manifest) return false;
      return isRuntimeBinaryPresent(resolveRuntimeStorage(manifest));
    },
    async install(opts) {
      if (!manifest) {
        throw new LocalModelError(
          "RUNTIME_NOT_INSTALLED",
          userMessageForCode("RUNTIME_NOT_INSTALLED"),
        );
      }
      await installLlamaServerRuntime({
        manifest,
        signal: opts?.signal,
        fetchImpl: opts?.fetchImpl ?? fetchImpl,
        sourceArchive: opts?.sourceArchive,
        skipHash: opts?.skipHash,
      });
    },
    async ensureReady(modelPath) {
      if (
        (state === "READY" || state === "IDLE" || state === "BUSY") &&
        modelPathLoaded === modelPath &&
        child &&
        child.exitCode === null
      ) {
        const h = await this.health();
        if (h.ok) {
          if (state === "IDLE") state = "READY";
          scheduleIdleStop();
          return { baseUrl: `http://127.0.0.1:${port}/v1` };
        }
        // health falló → reinicio
        await stopInternal("unhealthy");
      }

      if (state === "CRASHED" || state === "FAILED") {
        if (crashRestarts >= 2) {
          throw new LocalModelError(
            "RUNTIME_CRASHED",
            userMessageForCode("RUNTIME_CRASHED"),
          );
        }
        crashRestarts += 1;
        await stopInternal("recover");
      }

      if (!startChain) {
        startChain = startProcess(modelPath).finally(() => {
          startChain = null;
        });
      }
      return startChain;
    },
    markBusy() {
      clearIdle();
      if (state === "READY" || state === "IDLE") state = "BUSY";
    },
    markIdle() {
      if (state === "BUSY" || state === "READY") state = "IDLE";
      scheduleIdleStop();
    },
    async stop() {
      await stopInternal("explicit");
    },
    baseUrl() {
      if (!port) return null;
      if (state === "READY" || state === "BUSY" || state === "IDLE") {
        return `http://127.0.0.1:${port}/v1`;
      }
      return null;
    },
    getManifest() {
      return manifest ? { ...manifest } : null;
    },
  };
}
