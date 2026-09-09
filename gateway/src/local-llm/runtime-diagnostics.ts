/**
 * Observabilidad de arranque llama-server (PHASE 61.2.1).
 * No cambia timeouts ni arquitectura — solo evidencia sanitizada.
 */
import os from "node:os";

const SENSITIVE =
  /token|authorization|cookie|secret|credential|password|api[_-]?key/i;

/** Casos A–H del diagnóstico RUNTIME_HEALTH_TIMEOUT. */
export type RuntimeFailureCase =
  | "A_DID_NOT_START"
  | "B_STARTED_THEN_DIED"
  | "C_ALIVE_NOT_LISTENING"
  | "D_LISTENING_MODEL_LOADING"
  | "E_LOADED_HEALTH_MISMATCH"
  | "F_PROVIDER_COMM_GAP"
  | "G_TIMEOUT_TOO_SHORT"
  | "H_HEALTH_OK_INFERENCE_FAILS"
  | "CAUSE_NOT_IDENTIFIED";

export type RuntimeTraceEventName =
  | "runtime_starting"
  | "spawn_requested"
  | "process_spawned"
  | "stdout_first_line"
  | "stderr_first_line"
  | "health_attempt"
  | "health_success"
  | "runtime_ready"
  | "runtime_failed"
  | "process_exit"
  | "model_check"
  | "port_check"
  | "resource_sample"
  | "inference_started"
  | "inference_first_token"
  | "inference_done";

export type RuntimeTraceEvent = {
  tMs: number;
  at: string;
  event: RuntimeTraceEventName | string;
  detail?: string;
  metadata?: Record<string, unknown>;
};

export type RuntimeStartupTrace = {
  diagnosticId: string | null;
  executionId: string | null;
  startedAt: string;
  endedAt: string | null;
  healthTimeoutMs: number;
  binaryPath: string | null;
  binaryExists: boolean | null;
  modelPath: string | null;
  modelExists: boolean | null;
  modelBytes: number | null;
  args: string[];
  host: string;
  port: number | null;
  childPid: number | null;
  exitCode: number | null;
  exitSignal: string | null;
  processAliveAtTimeout: boolean | null;
  stdoutSummary: string;
  stderrSummary: string;
  healthAttempts: number;
  healthLastStatus: number | null;
  healthLastError: string | null;
  readyAtMs: number | null;
  failedAtMs: number | null;
  errorCode: string | null;
  ramBeforeMb: number | null;
  ramAfterMb: number | null;
  events: RuntimeTraceEvent[];
};

export function sanitizeRuntimeLog(text: string, maxLen = 8_000): string {
  let out = text
    .replace(/Authorization\s*:\s*Bearer\s+\S+/gi, "Authorization: Bearer [redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._+-]+/g, "Bearer [redacted]")
    .replace(/sk-ant-[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/sk-[A-Za-z0-9]{20,}/g, "[redacted]")
    .replace(
      /"?(token|secret|credential|password|cookie|api[_-]?key)"?\s*[:=]\s*"[^"]*"/gi,
      '"$1":"[redacted]"',
    );
  if (out.length > maxLen) {
    out = `${out.slice(0, maxLen)}\n…[truncated ${out.length - maxLen} chars]`;
  }
  return out;
}

export function sanitizeRuntimeMetadata(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!metadata) return null;
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(metadata)) {
    if (SENSITIVE.test(key)) continue;
    if (typeof val === "string") out[key] = sanitizeRuntimeLog(val, 2_000);
    else if (
      typeof val === "number" ||
      typeof val === "boolean" ||
      val === null
    ) {
      out[key] = val;
    } else if (Array.isArray(val)) {
      out[key] = val.slice(0, 40).map((v) =>
        typeof v === "string" ? sanitizeRuntimeLog(v, 400) : v,
      );
    } else if (typeof val === "object") {
      out[key] = sanitizeRuntimeMetadata(val as Record<string, unknown>);
    }
  }
  return out;
}

/** Argumentos de spawn sin filtrar rutas de modelo (necesarias para diagnóstico). */
export function sanitizeSpawnArgs(args: readonly string[]): string[] {
  return args.map((a) => sanitizeRuntimeLog(a, 500));
}

export function createEmptyTrace(input: {
  diagnosticId?: string | null;
  executionId?: string | null;
  healthTimeoutMs: number;
}): RuntimeStartupTrace {
  return {
    diagnosticId: input.diagnosticId ?? null,
    executionId: input.executionId ?? null,
    startedAt: new Date().toISOString(),
    endedAt: null,
    healthTimeoutMs: input.healthTimeoutMs,
    binaryPath: null,
    binaryExists: null,
    modelPath: null,
    modelExists: null,
    modelBytes: null,
    args: [],
    host: "127.0.0.1",
    port: null,
    childPid: null,
    exitCode: null,
    exitSignal: null,
    processAliveAtTimeout: null,
    stdoutSummary: "",
    stderrSummary: "",
    healthAttempts: 0,
    healthLastStatus: null,
    healthLastError: null,
    readyAtMs: null,
    failedAtMs: null,
    errorCode: null,
    ramBeforeMb: null,
    ramAfterMb: null,
    events: [],
  };
}

export class RuntimeStartupTracer {
  readonly t0: number;
  readonly trace: RuntimeStartupTrace;
  private stdoutBuf = "";
  private stderrBuf = "";
  private stdoutFirst = false;
  private stderrFirst = false;
  private readonly maxBuf = 16_000;

  constructor(input: {
    diagnosticId?: string | null;
    executionId?: string | null;
    healthTimeoutMs: number;
  }) {
    this.t0 = Date.now();
    this.trace = createEmptyTrace(input);
  }

  push(
    event: RuntimeTraceEventName | string,
    detail?: string,
    metadata?: Record<string, unknown>,
  ): void {
    this.trace.events.push({
      tMs: Date.now() - this.t0,
      at: new Date().toISOString(),
      event,
      detail: detail ? sanitizeRuntimeLog(detail, 1_000) : undefined,
      metadata: sanitizeRuntimeMetadata(metadata) ?? undefined,
    });
  }

  appendStdout(chunk: string | Buffer): void {
    const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
    this.stdoutBuf = trimRing(this.stdoutBuf + text, this.maxBuf);
    this.trace.stdoutSummary = sanitizeRuntimeLog(this.stdoutBuf);
    if (!this.stdoutFirst) {
      const line = firstLine(text);
      if (line) {
        this.stdoutFirst = true;
        this.push("stdout_first_line", line);
      }
    }
  }

  appendStderr(chunk: string | Buffer): void {
    const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
    this.stderrBuf = trimRing(this.stderrBuf + text, this.maxBuf);
    this.trace.stderrSummary = sanitizeRuntimeLog(this.stderrBuf);
    if (!this.stderrFirst) {
      const line = firstLine(text);
      if (line) {
        this.stderrFirst = true;
        this.push("stderr_first_line", line);
      }
    }
  }

  finish(errorCode?: string | null): RuntimeStartupTrace {
    this.trace.endedAt = new Date().toISOString();
    if (errorCode) this.trace.errorCode = errorCode;
    this.trace.stdoutSummary = sanitizeRuntimeLog(this.stdoutBuf);
    this.trace.stderrSummary = sanitizeRuntimeLog(this.stderrBuf);
    return snapshotTrace(this.trace);
  }

  snapshot(): RuntimeStartupTrace {
    return snapshotTrace(this.trace);
  }
}

function firstLine(text: string): string | null {
  const line = text.split(/\r?\n/).find((l) => l.trim().length > 0);
  return line ? sanitizeRuntimeLog(line.trim(), 400) : null;
}

function trimRing(buf: string, max: number): string {
  if (buf.length <= max) return buf;
  return buf.slice(buf.length - max);
}

function snapshotTrace(t: RuntimeStartupTrace): RuntimeStartupTrace {
  return {
    ...t,
    args: [...t.args],
    events: t.events.map((e) => ({
      ...e,
      metadata: e.metadata ? { ...e.metadata } : undefined,
    })),
  };
}

export function memMb(): number {
  return Math.round(process.memoryUsage().rss / (1024 * 1024));
}

export function freeMemMb(): number {
  return Math.round(os.freemem() / (1024 * 1024));
}

/**
 * Clasificación heurística A–H a partir del trace (sin inventar hechos).
 */
export function classifyRuntimeFailure(
  trace: RuntimeStartupTrace,
): {
  case: RuntimeFailureCase;
  rootCause: string | null;
  confidence: "high" | "medium" | "low";
  notes: string[];
} {
  const notes: string[] = [];
  const spawned = trace.events.some((e) => e.event === "process_spawned");
  const exited = trace.events.some((e) => e.event === "process_exit");
  const healthOk = trace.events.some((e) => e.event === "health_success");
  const ready = trace.events.some((e) => e.event === "runtime_ready");
  const httpNonOk = trace.events.some(
    (e) =>
      e.event === "health_attempt" &&
      typeof e.metadata?.httpStatus === "number" &&
      (e.metadata.httpStatus as number) >= 100 &&
      (e.metadata.httpStatus as number) < 200 === false &&
      (e.metadata.httpStatus as number) !== 200,
  );
  const http503 = trace.events.some(
    (e) =>
      e.event === "health_attempt" && e.metadata?.httpStatus === 503,
  );
  const connRefused = trace.events.some(
    (e) =>
      e.event === "health_attempt" &&
      String(e.metadata?.error || e.detail || "").includes("ECONNREFUSED"),
  );
  const loadHints = /load(ing)?\s+(model|tensor|context)|server\s+listen|model\s+loaded/i.test(
    `${trace.stdoutSummary}\n${trace.stderrSummary}`,
  );

  if (!spawned && trace.errorCode === "RUNTIME_START_FAILED") {
    return {
      case: "A_DID_NOT_START",
      rootCause: "llama-server no pudo iniciar (spawn falló).",
      confidence: "high",
      notes: ["Sin evento process_spawned."],
    };
  }

  if (spawned && (exited || trace.exitCode !== null) && !healthOk) {
    notes.push(`exitCode=${trace.exitCode}`);
    if (trace.stderrSummary.trim()) notes.push("Hay stderr capturado.");
    return {
      case: "B_STARTED_THEN_DIED",
      rootCause:
        "llama-server arrancó y terminó antes de health OK (posible fallo de carga/modelo/DLL).",
      confidence: "high",
      notes,
    };
  }

  if (
    spawned &&
    trace.processAliveAtTimeout === true &&
    !healthOk &&
    connRefused &&
    !httpNonOk
  ) {
    return {
      case: "C_ALIVE_NOT_LISTENING",
      rootCause:
        "Proceso vivo pero el puerto no aceptó conexiones (no listening).",
      confidence: "medium",
      notes: ["Solo ECONNREFUSED en health; sin HTTP status."],
    };
  }

  if (
    spawned &&
    (http503 || (loadHints && !healthOk)) &&
    trace.processAliveAtTimeout !== false
  ) {
    return {
      case: "D_LISTENING_MODEL_LOADING",
      rootCause:
        "Servidor respondió o emitió señales de carga, pero no alcanzó health OK a tiempo.",
      confidence: http503 ? "high" : "medium",
      notes: [
        http503 ? "Se observó HTTP 503 durante health." : "Hints de carga en logs.",
        `healthTimeoutMs=${trace.healthTimeoutMs}`,
        `durationMs=${trace.failedAtMs ?? "n/a"}`,
      ],
    };
  }

  if (
    spawned &&
    loadHints &&
    !healthOk &&
    httpNonOk &&
    !http503
  ) {
    return {
      case: "E_LOADED_HEALTH_MISMATCH",
      rootCause:
        "Hay indicios de carga, pero el health check no reconoce READY (criterio/URL).",
      confidence: "low",
      notes,
    };
  }

  if (
    ready &&
    healthOk &&
    trace.events.some((e) => e.event === "inference_started") &&
    !trace.events.some((e) => e.event === "inference_done")
  ) {
    return {
      case: "H_HEALTH_OK_INFERENCE_FAILS",
      rootCause: "Health OK pero la inferencia mínima falló o no completó.",
      confidence: "medium",
      notes,
    };
  }

  if (
    spawned &&
    !exited &&
    !healthOk &&
    trace.errorCode === "RUNTIME_HEALTH_TIMEOUT" &&
    (trace.failedAtMs ?? 0) >= trace.healthTimeoutMs * 0.9
  ) {
    notes.push(
      `Startup alcanzó ~timeout (${trace.failedAtMs}ms / ${trace.healthTimeoutMs}ms).`,
    );
    if (loadHints || http503) {
      return {
        case: "G_TIMEOUT_TOO_SHORT",
        rootCause:
          "Evidencia de progreso de carga sin READY antes del deadline — timeout posiblemente corto (no concluido como única causa).",
        confidence: "medium",
        notes,
      };
    }
    return {
      case: "CAUSE_NOT_IDENTIFIED",
      rootCause: null,
      confidence: "low",
      notes: [
        ...notes,
        "Timeout sin señales claras de carga ni crash; hace falta más evidencia.",
      ],
    };
  }

  return {
    case: "CAUSE_NOT_IDENTIFIED",
    rootCause: null,
    confidence: "low",
    notes: [
      `spawned=${spawned}`,
      `healthOk=${healthOk}`,
      `exitCode=${trace.exitCode}`,
      `errorCode=${trace.errorCode}`,
    ],
  };
}

export function formatTraceConsole(trace: RuntimeStartupTrace): string {
  const lines: string[] = [
    "PHASE 61.2.1",
    `Runtime: llama-server`,
    `Model path: ${trace.modelPath ?? "n/a"}`,
    `Process:`,
    `  spawned: ${trace.events.some((e) => e.event === "process_spawned") ? "yes" : "no"}`,
    `  pid: ${trace.childPid ?? "n/a"}`,
    `  exitCode: ${trace.exitCode ?? "n/a"}`,
    `  aliveAtTimeout: ${trace.processAliveAtTimeout ?? "n/a"}`,
    `Health:`,
    `  attempts: ${trace.healthAttempts}`,
    `  lastStatus: ${trace.healthLastStatus ?? "n/a"}`,
    `  lastError: ${trace.healthLastError ?? "n/a"}`,
    `  readyAtMs: ${trace.readyAtMs ?? "n/a"}`,
    `  timeoutMs: ${trace.healthTimeoutMs}`,
    `errorCode: ${trace.errorCode ?? "none"}`,
  ];
  const cls = classifyRuntimeFailure(trace);
  lines.push(`Case: ${cls.case}`);
  lines.push(
    cls.rootCause
      ? `ROOT_CAUSE: ${cls.rootCause}`
      : "CAUSE_NOT_IDENTIFIED",
  );
  return lines.join("\n");
}
