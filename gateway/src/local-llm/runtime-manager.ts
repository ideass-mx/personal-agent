/**
 * LocalRuntimeManager — dueño único del proceso llama-server (PHASE 61.1).
 * Observabilidad de arranque: PHASE 61.2.1 (sin cambiar timeouts/arquitectura).
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
import type { DiagnosticEventInput } from "../diagnostics/types.ts";
import {
  freeMemMb,
  memMb,
  RuntimeStartupTracer,
  sanitizeSpawnArgs,
  type RuntimeStartupTrace,
} from "./runtime-diagnostics.ts";

export type RuntimeHealth = {
  ok: boolean;
  detail?: string;
  port?: number;
  pid?: number;
};

export type EnsureReadyOptions = {
  diagnosticId?: string;
  executionId?: string;
  signal?: AbortSignal;
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
  ensureReady(
    modelPath: string,
    opts?: EnsureReadyOptions,
  ): Promise<{ baseUrl: string }>;
  markBusy(): void;
  markIdle(): void;
  stop(): Promise<void>;
  /** Base URL OpenAI-compatible (…/v1) cuando READY/BUSY/IDLE. */
  baseUrl(): string | null;
  getManifest(): RuntimeManifest | null;
  /** Último trace de arranque (PHASE 61.2.1). */
  getLastStartupTrace(): RuntimeStartupTrace | null;
};

type LockPayload = {
  pid: number;
  port: number;
  modelPath: string;
  startedAt: string;
};

export function getLocalLlmHealthTimeoutMs(): number {
  const raw = process.env.LOCAL_LLM_HEALTH_TIMEOUT_MS?.trim();
  if (raw && Number.isFinite(Number(raw))) return Math.max(5_000, Number(raw));
  return 120_000;
}

function idleTimeoutMs(): number {
  const raw = process.env.LOCAL_LLM_IDLE_TIMEOUT_MS?.trim();
  if (raw && Number.isFinite(Number(raw))) return Math.max(10_000, Number(raw));
  return 5 * 60_000;
}

function healthTimeoutMs(): number {
  return getLocalLlmHealthTimeoutMs();
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
  /** Bitácora opcional (PHASE 61.2.1). */
  diagnostics?: { record: (input: DiagnosticEventInput) => unknown };
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
  let lastTrace: RuntimeStartupTrace | null = null;
  let activeTracer: RuntimeStartupTracer | null = null;

  function paths(): RuntimeStoragePaths | null {
    if (!manifest) return null;
    return resolveRuntimeStorage(manifest);
  }

  function recordDiag(
    tracer: RuntimeStartupTracer | null,
    input: {
      diagnosticId?: string;
      level: DiagnosticEventInput["level"];
      event: string;
      errorCode?: string | null;
      message?: string | null;
      durationMs?: number | null;
      metadata?: Record<string, unknown> | null;
      component?: DiagnosticEventInput["component"];
      stage?: DiagnosticEventInput["stage"];
    },
  ): void {
    const diagnosticId =
      input.diagnosticId ||
      tracer?.trace.diagnosticId ||
      "PA-UNKNOWN";
    options.diagnostics?.record({
      diagnosticId,
      requestId: tracer?.trace.executionId || diagnosticId,
      component: input.component ?? "LLM_PROVIDER",
      stage: input.stage ?? "LLM_REQUEST",
      level: input.level,
      event: input.event,
      errorCode: input.errorCode,
      message: input.message,
      durationMs: input.durationMs,
      metadata: input.metadata,
    });
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
    tracer?: RuntimeStartupTracer | null,
  ): Promise<RuntimeHealth> {
    const started = Date.now();
    const deadline = started + healthTimeoutMs();
    let attempt = 0;
    while (Date.now() < deadline) {
      if (signal?.aborted) {
        return { ok: false, detail: "aborted" };
      }
      if (child && child.exitCode !== null) {
        tracer?.push("health_attempt", "process_exited", {
          attempt: attempt + 1,
          exitCode: child.exitCode,
        });
        if (tracer) tracer.trace.healthAttempts = attempt + 1;
        return { ok: false, detail: "process_exited" };
      }
      attempt += 1;
      if (tracer) tracer.trace.healthAttempts = attempt;
      try {
        const res = await fetchImpl(`http://127.0.0.1:${p}/health`, {
          signal: AbortSignal.timeout(2000),
        });
        if (tracer) {
          tracer.trace.healthLastStatus = res.status;
          tracer.trace.healthLastError = null;
          tracer.push("health_attempt", `http_${res.status}`, {
            attempt,
            httpStatus: res.status,
            ok: res.ok,
          });
        }
        if (res.ok) {
          tracer?.push("health_success", "ok", {
            attempt,
            httpStatus: res.status,
            tMs: Date.now() - (tracer?.t0 ?? Date.now()),
          });
          return { ok: true, detail: "ok", port: p, pid: child?.pid };
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const code =
          err && typeof err === "object" && "code" in err
            ? String((err as { code?: unknown }).code ?? "")
            : "";
        const detail = code || msg.slice(0, 120);
        if (tracer) {
          tracer.trace.healthLastError = detail;
          tracer.push("health_attempt", detail, {
            attempt,
            error: detail,
            code: code || undefined,
          });
        }
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
    activeTracer = null;
  }

  async function startProcess(
    modelPath: string,
    ensureOpts?: EnsureReadyOptions,
  ): Promise<{ baseUrl: string }> {
    const tracer = new RuntimeStartupTracer({
      diagnosticId: ensureOpts?.diagnosticId ?? null,
      executionId: ensureOpts?.executionId ?? null,
      healthTimeoutMs: healthTimeoutMs(),
    });
    activeTracer = tracer;
    tracer.trace.ramBeforeMb = freeMemMb();
    tracer.push("runtime_starting", undefined, {
      modelPath,
      healthTimeoutMs: healthTimeoutMs(),
    });
    recordDiag(tracer, {
      level: "INFO",
      event: "runtime_starting",
      metadata: { healthTimeoutMs: healthTimeoutMs() },
    });

    if (!manifest) {
      tracer.push("runtime_failed", "RUNTIME_NOT_INSTALLED");
      lastTrace = tracer.finish("RUNTIME_NOT_INSTALLED");
      throw new LocalModelError(
        "RUNTIME_NOT_INSTALLED",
        userMessageForCode("RUNTIME_NOT_INSTALLED"),
      );
    }
    const storage = validateInstalledRuntime(manifest);
    tracer.trace.binaryPath = storage.binaryPath;
    tracer.trace.binaryExists = fs.existsSync(storage.binaryPath);
    tracer.trace.modelPath = modelPath;
    tracer.trace.modelExists = fs.existsSync(modelPath);
    if (tracer.trace.modelExists) {
      try {
        tracer.trace.modelBytes = fs.statSync(modelPath).size;
      } catch {
        tracer.trace.modelBytes = null;
      }
    }
    tracer.push("model_check", undefined, {
      exists: tracer.trace.modelExists,
      bytes: tracer.trace.modelBytes,
    });

    if (!fs.existsSync(modelPath)) {
      tracer.push("runtime_failed", "MODEL_NOT_INSTALLED");
      lastTrace = tracer.finish("MODEL_NOT_INSTALLED");
      throw new LocalModelError(
        "MODEL_NOT_INSTALLED",
        userMessageForCode("MODEL_NOT_INSTALLED"),
      );
    }

    // Ownership: si hay lock de otro proceso vivo, fallar (no matar ajenos).
    const existing = readLock(storage.lockFile);
    if (existing && existing.pid !== process.pid && isPidAlive(existing.pid)) {
      tracer.push("runtime_failed", "RUNTIME_START_FAILED", {
        reason: "lock_held",
      });
      lastTrace = tracer.finish("RUNTIME_START_FAILED");
      throw new LocalModelError(
        "RUNTIME_START_FAILED",
        userMessageForCode("RUNTIME_START_FAILED"),
      );
    }

    state = "STARTING";
    const listenPort = options.port ?? (await findFreePort());
    port = listenPort;
    tracer.trace.port = listenPort;
    tracer.push("port_check", "allocated", { port: listenPort });

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
    tracer.trace.args = sanitizeSpawnArgs(args);
    tracer.trace.host = "127.0.0.1";

    tracer.push("spawn_requested", storage.binaryPath, {
      args: tracer.trace.args,
      cwd: path.dirname(storage.binaryPath),
    });
    recordDiag(tracer, {
      level: "INFO",
      event: "spawn_requested",
      metadata: {
        binaryExists: tracer.trace.binaryExists,
        port: listenPort,
        argCount: args.length,
      },
    });

    try {
      child = spawnFn(storage.binaryPath, args, {
        cwd: path.dirname(storage.binaryPath),
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env },
      }) as unknown as ChildProcessWithoutNullStreams;
    } catch (err) {
      state = "FAILED";
      tracer.push("runtime_failed", "RUNTIME_START_FAILED");
      lastTrace = tracer.finish("RUNTIME_START_FAILED");
      recordDiag(tracer, {
        level: "ERROR",
        event: "runtime_failed",
        errorCode: "RUNTIME_START_FAILED",
      });
      throw new LocalModelError(
        "RUNTIME_START_FAILED",
        userMessageForCode("RUNTIME_START_FAILED"),
        err,
      );
    }

    tracer.trace.childPid = child.pid ?? null;
    tracer.push("process_spawned", undefined, {
      pid: child.pid ?? null,
      port: listenPort,
    });
    recordDiag(tracer, {
      level: "INFO",
      event: "process_spawned",
      metadata: { pid: child.pid ?? null, port: listenPort },
    });

    child.on("exit", (code, signal) => {
      const exitCode = code;
      const exitSignal = signal;
      if (activeTracer) {
        activeTracer.trace.exitCode = exitCode;
        activeTracer.trace.exitSignal = exitSignal;
        activeTracer.push("process_exit", undefined, {
          exitCode,
          exitSignal,
        });
      }
      if (state === "STOPPING" || state === "STOPPED") return;
      state = "CRASHED";
      child = null;
      const st = paths();
      if (st) clearLock(st.lockFile);
      process.stderr.write(
        `[gateway] local-llm runtime crashed code=${code} signal=${signal}\n`,
      );
      recordDiag(activeTracer, {
        level: "ERROR",
        event: "runtime_failed",
        errorCode: "RUNTIME_CRASHED",
        metadata: { exitCode: code, exitSignal: signal },
      });
    });

    // Captura sanitizada para diagnóstico (no prompts de inferencia en startup).
    child.stdout?.on("data", (chunk: Buffer | string) => {
      activeTracer?.appendStdout(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      activeTracer?.appendStderr(chunk);
    });

    writeLock(storage.lockFile, {
      pid: process.pid,
      port: listenPort,
      modelPath,
      startedAt: new Date().toISOString(),
    });

    const health = await pollHealth(
      listenPort,
      ensureOpts?.signal,
      tracer,
    );
    if (!health.ok) {
      const alive =
        child !== null &&
        child.exitCode === null &&
        typeof child.pid === "number"
          ? isPidAlive(child.pid)
          : false;
      tracer.trace.processAliveAtTimeout = alive;
      tracer.trace.failedAtMs = Date.now() - tracer.t0;
      tracer.trace.ramAfterMb = freeMemMb();
      tracer.push("runtime_failed", "RUNTIME_HEALTH_TIMEOUT", {
        detail: health.detail,
        alive,
        healthAttempts: tracer.trace.healthAttempts,
        rssMb: memMb(),
        freeMemMb: tracer.trace.ramAfterMb,
      });
      recordDiag(tracer, {
        level: "ERROR",
        event: "RUNTIME_HEALTH_TIMEOUT",
        errorCode: "RUNTIME_HEALTH_TIMEOUT",
        durationMs: tracer.trace.failedAtMs,
        metadata: {
          detail: health.detail,
          alive,
          pid: tracer.trace.childPid,
          port: listenPort,
          healthAttempts: tracer.trace.healthAttempts,
          healthLastStatus: tracer.trace.healthLastStatus,
          healthLastError: tracer.trace.healthLastError,
          exitCode: tracer.trace.exitCode,
          stdoutChars: tracer.trace.stdoutSummary.length,
          stderrChars: tracer.trace.stderrSummary.length,
        },
      });
      lastTrace = tracer.finish("RUNTIME_HEALTH_TIMEOUT");
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
    tracer.trace.readyAtMs = Date.now() - tracer.t0;
    tracer.trace.ramAfterMb = freeMemMb();
    tracer.push("runtime_ready", undefined, {
      readyAtMs: tracer.trace.readyAtMs,
      pid: child?.pid ?? null,
      port: listenPort,
    });
    recordDiag(tracer, {
      level: "INFO",
      event: "runtime_ready",
      durationMs: tracer.trace.readyAtMs,
      metadata: { pid: child?.pid ?? null, port: listenPort },
    });
    lastTrace = tracer.finish(null);
    activeTracer = null;
    scheduleIdleStop();
    return { baseUrl: `http://127.0.0.1:${listenPort}/v1` };
  }

  return {
    state: () => state,
    async health() {
      if (!port || (state !== "READY" && state !== "BUSY" && state !== "IDLE")) {
        return { ok: false, detail: state };
      }
      // Poll corto de verificación (mismo endpoint; no es el wait de arranque).
      try {
        const res = await fetchImpl(`http://127.0.0.1:${port}/health`, {
          signal: AbortSignal.timeout(2000),
        });
        return {
          ok: res.ok,
          detail: res.ok ? "ok" : `http_${res.status}`,
          port,
          pid: child?.pid,
        };
      } catch (err) {
        return {
          ok: false,
          detail: err instanceof Error ? err.message : "unreachable",
          port,
          pid: child?.pid,
        };
      }
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
    async ensureReady(modelPath, ensureOpts) {
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
        startChain = startProcess(modelPath, ensureOpts).finally(() => {
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
    getLastStartupTrace() {
      return lastTrace ? { ...lastTrace, events: [...lastTrace.events] } : null;
    },
  };
}
