/**
 * process.execute — ejecuta un binario con argv (spawn, shell: false).
 *
 * Hub: executionMode confirm. Esta tool NO confirma.
 * Agent: valida input/cwd y hace spawn. argv no es sandbox: `bash -c` es
 * posible; la barrera actual es la confirmación en el Hub.
 *
 * POSIX (12B): process group propio (detached, sin unref). Timeout/shutdown
 * envían SIGTERM/SIGKILL al grupo (`kill(-pid)`), no al Agent.
 * Windows: se mata el pid raíz; Job Objects no se implementan (sin nativo).
 *
 * Sin env overlay, stdin, PTY, background ni ProcessManager.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { stat } from "node:fs/promises";
import path from "node:path";
import { resolveSafePath } from "./safe-path.ts";
import type { AgentTool, ToolResult } from "./types.ts";

export const PROCESS_EXECUTE_DEFAULT_TIMEOUT_MS = 30_000;
export const PROCESS_EXECUTE_MIN_TIMEOUT_MS = 1_000;
export const PROCESS_EXECUTE_MAX_TIMEOUT_MS = 120_000;
export const PROCESS_EXECUTE_MAX_OUTPUT_BYTES = 64 * 1024;
export const PROCESS_EXECUTE_KILL_GRACE_MS = 500;
/** Holgura para el timeout MCP por llamada (no cambia el default global). */
export const PROCESS_EXECUTE_MCP_SLACK_MS = 5_000;

export const PROCESS_EXECUTE_NAME = "process.execute";

export const PROCESS_EXECUTE_DESCRIPTION =
  "Ejecuta un programa local con argumentos separados (sin shell). Requiere confirmación en el Hub.";

export const PROCESS_EXECUTE_INPUT_SCHEMA = {
  type: "object",
  properties: {
    command: { type: "string" },
    args: { type: "array", items: { type: "string" } },
    cwd: { type: "string" },
    timeoutMs: { type: "number" },
  },
  required: ["command"],
  additionalProperties: false,
} as const;

export type ProcessExecuteOptions = {
  root?: string;
};

export type ProcessExecuteContent = {
  command: string;
  args: string[];
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
};

function fail(code: string, message: string): ToolResult {
  return { ok: false, error: { code, message } };
}

function nodeErrorCode(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null || !("code" in err)) {
    return undefined;
  }
  const code = (err as { code: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function isFiniteInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

export function mcpTimeoutMsForProcessExecute(input: unknown): number {
  const slack = PROCESS_EXECUTE_MCP_SLACK_MS;
  if (typeof input === "object" && input !== null) {
    const raw = (input as { timeoutMs?: unknown }).timeoutMs;
    if (
      isFiniteInteger(raw) &&
      raw >= PROCESS_EXECUTE_MIN_TIMEOUT_MS &&
      raw <= PROCESS_EXECUTE_MAX_TIMEOUT_MS
    ) {
      return raw + slack;
    }
  }
  return PROCESS_EXECUTE_DEFAULT_TIMEOUT_MS + slack;
}

type StreamBuf = { bytes: number; chunks: Buffer[]; truncated: boolean };

function appendChunk(buf: StreamBuf, chunk: Buffer, max: number): void {
  if (buf.truncated) return;
  const room = max - buf.bytes;
  if (room <= 0) {
    buf.truncated = true;
    return;
  }
  if (chunk.length <= room) {
    buf.chunks.push(chunk);
    buf.bytes += chunk.length;
    return;
  }
  buf.chunks.push(chunk.subarray(0, room));
  buf.bytes += room;
  buf.truncated = true;
}

function decode(buf: StreamBuf): string {
  return Buffer.concat(buf.chunks, buf.bytes).toString("utf8");
}

async function resolveCwd(
  cwd: string | undefined,
  root: string | undefined,
): Promise<{ ok: true; cwd: string } | { ok: false; result: ToolResult }> {
  if (cwd === undefined) {
    if (root === undefined) {
      return { ok: true, cwd: process.cwd() };
    }
    const resolved = await resolveSafePath(".", root, "directory");
    if (!resolved.ok) return resolved;
    return assertExistingDirectory(resolved.resolved);
  }
  if (cwd.length === 0 || cwd.trim().length === 0) {
    return {
      ok: false,
      result: fail("invalid_input", "cwd no puede estar vacío."),
    };
  }
  const resolved = await resolveSafePath(cwd, root, "directory");
  if (!resolved.ok) return resolved;
  return assertExistingDirectory(resolved.resolved);
}

async function assertExistingDirectory(
  dir: string,
): Promise<{ ok: true; cwd: string } | { ok: false; result: ToolResult }> {
  try {
    const info = await stat(dir);
    if (!info.isDirectory()) {
      return {
        ok: false,
        result: fail("not_a_directory", "cwd no apunta a un directorio."),
      };
    }
    return { ok: true, cwd: path.resolve(dir) };
  } catch (err) {
    const code = nodeErrorCode(err);
    if (code === "ENOENT") {
      return {
        ok: false,
        result: fail("cwd_not_found", "cwd no existe."),
      };
    }
    const message =
      err instanceof Error ? err.message : "No se pudo inspeccionar cwd";
    return { ok: false, result: fail("invalid_input", message) };
  }
}

/** POSIX: un grupo por spawn. Windows: sin Job Object nativo. */
export function processExecuteUsesProcessGroup(
  platform: NodeJS.Platform = process.platform,
): boolean {
  return platform !== "win32";
}

/** Hijos de process.execute aún vivos en este proceso Agent. */
const activeProcessExecutes = new Set<ChildProcess>();

function isAlive(child: ChildProcess): boolean {
  return child.exitCode === null && child.signalCode == null;
}

/**
 * Mata el árbol de *esta* ejecución.
 * POSIX: `kill(-pid)` = process group del hijo (líder = pid del spawn).
 * Nunca se señala el pid del Agent ni su process group.
 */
function killProcessTree(
  child: ChildProcess,
  signal: NodeJS.Signals,
): void {
  if (!isAlive(child)) return;
  const pid = child.pid;
  if (typeof pid !== "number" || pid <= 0 || pid === process.pid) return;

  if (processExecuteUsesProcessGroup()) {
    try {
      process.kill(-pid, signal);
      return;
    } catch {
      /* ESRCH / EPERM: caer al pid raíz */
    }
  }
  try {
    child.kill(signal);
  } catch {
    /* ignore */
  }
}

function requestKill(child: ChildProcess): void {
  killProcessTree(child, "SIGTERM");
}

function forceKill(child: ChildProcess): void {
  killProcessTree(child, "SIGKILL");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Timeout/shutdown/disconnect MCP: SIGTERM al grupo, gracia, SIGKILL.
 * Encapsulado aquí; no es un ProcessManager.
 */
export async function abortActiveProcessExecutes(): Promise<void> {
  const children = [...activeProcessExecutes];
  if (children.length === 0) return;
  for (const child of children) requestKill(child);
  await delay(PROCESS_EXECUTE_KILL_GRACE_MS);
  for (const child of children) forceKill(child);
}

export function createProcessExecuteTool(
  options: ProcessExecuteOptions = {},
): AgentTool {
  const root = options.root;

  return {
    name: PROCESS_EXECUTE_NAME,
    description: PROCESS_EXECUTE_DESCRIPTION,
    inputSchema: PROCESS_EXECUTE_INPUT_SCHEMA,
    executionMode: "confirm",
    async execute(input): Promise<ToolResult> {
      if (typeof input !== "object" || input === null) {
        return fail(
          "invalid_input",
          "Se espera { command: string, args?: string[] }.",
        );
      }
      const rec = input as {
        command?: unknown;
        args?: unknown;
        cwd?: unknown;
        timeoutMs?: unknown;
      };
      if (typeof rec.command !== "string") {
        return fail("invalid_input", "command debe ser string.");
      }
      const command = rec.command;
      if (command.length === 0 || command.trim().length === 0) {
        return fail("invalid_input", "command no puede estar vacío.");
      }
      let args: string[] = [];
      if (rec.args !== undefined) {
        if (!Array.isArray(rec.args) || rec.args.some((a) => typeof a !== "string")) {
          return fail("invalid_input", "args debe ser un array de strings.");
        }
        args = rec.args;
      }
      if (rec.cwd !== undefined && typeof rec.cwd !== "string") {
        return fail("invalid_input", "cwd debe ser string.");
      }
      let timeoutMs = PROCESS_EXECUTE_DEFAULT_TIMEOUT_MS;
      if (rec.timeoutMs !== undefined) {
        if (!isFiniteInteger(rec.timeoutMs)) {
          return fail("invalid_input", "timeoutMs debe ser un entero.");
        }
        if (
          rec.timeoutMs < PROCESS_EXECUTE_MIN_TIMEOUT_MS ||
          rec.timeoutMs > PROCESS_EXECUTE_MAX_TIMEOUT_MS
        ) {
          return fail(
            "invalid_input",
            `timeoutMs debe estar entre ${PROCESS_EXECUTE_MIN_TIMEOUT_MS} y ${PROCESS_EXECUTE_MAX_TIMEOUT_MS}.`,
          );
        }
        timeoutMs = rec.timeoutMs;
      }

      const cwdResult = await resolveCwd(rec.cwd, root);
      if (!cwdResult.ok) return cwdResult.result;

      const stdoutBuf: StreamBuf = { bytes: 0, chunks: [], truncated: false };
      const stderrBuf: StreamBuf = { bytes: 0, chunks: [], truncated: false };
      const max = PROCESS_EXECUTE_MAX_OUTPUT_BYTES;

      let child: ChildProcess;
      try {
        child = spawn(command, args, {
          cwd: cwdResult.cwd,
          shell: false,
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"],
          // POSIX: líder de un process group nuevo. Sin unref: el Agent espera.
          // Windows: detached no da Job Object; no se usa.
          detached: processExecuteUsesProcessGroup(),
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "No se pudo iniciar el proceso";
        return fail("process_spawn_error", message);
      }

      activeProcessExecutes.add(child);

      return new Promise<ToolResult>((resolve) => {
        let settled = false;
        let timedOut = false;
        let killTimer: ReturnType<typeof setTimeout> | undefined;
        const timeoutTimer = setTimeout(() => {
          timedOut = true;
          requestKill(child);
          killTimer = setTimeout(() => forceKill(child), PROCESS_EXECUTE_KILL_GRACE_MS);
        }, timeoutMs);

        const finish = (result: ToolResult) => {
          if (settled) return;
          settled = true;
          activeProcessExecutes.delete(child);
          clearTimeout(timeoutTimer);
          if (killTimer !== undefined) clearTimeout(killTimer);
          resolve(result);
        };

        child.stdout?.on("data", (chunk: Buffer | string) => {
          appendChunk(
            stdoutBuf,
            typeof chunk === "string" ? Buffer.from(chunk) : chunk,
            max,
          );
        });
        child.stderr?.on("data", (chunk: Buffer | string) => {
          appendChunk(
            stderrBuf,
            typeof chunk === "string" ? Buffer.from(chunk) : chunk,
            max,
          );
        });

        child.on("error", (err) => {
          const code = nodeErrorCode(err);
          const message = err instanceof Error ? err.message : "spawn error";
          if (code === "ENOENT") {
            finish(
              fail(
                "process_spawn_error",
                `Comando no encontrado: ${command}`,
              ),
            );
            return;
          }
          finish(fail("process_spawn_error", message));
        });

        child.on("close", (exitCode, signal) => {
          const content: ProcessExecuteContent = {
            command,
            args,
            exitCode,
            signal,
            timedOut,
            stdout: decode(stdoutBuf),
            stderr: decode(stderrBuf),
            stdoutTruncated: stdoutBuf.truncated,
            stderrTruncated: stderrBuf.truncated,
          };
          finish({ ok: true, content });
        });
      });
    },
  };
}

export const processExecuteTool = createProcessExecuteTool();

export const PROCESS_EXECUTE = {
  name: processExecuteTool.name,
  description: processExecuteTool.description,
  inputSchema: processExecuteTool.inputSchema,
  executionMode: processExecuteTool.executionMode,
} as const;
