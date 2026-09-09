/**
 * Preflight del ejecutable llama-server (PHASE 61.2.3).
 * Usa `--version` — NO carga el GGUF / NO usa /health.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { LocalModelError, userMessageForCode } from "./errors.ts";
import {
  ensureWindowsVc140Sidecars,
  listMissingWindowsVc140Sidecars,
} from "./runtime-sidecars.ts";
import type { RuntimeStoragePaths } from "./runtime-storage.ts";

/** Windows NTSTATUS STATUS_DLL_NOT_FOUND (unsigned 3221225781 / signed -1073741515). */
export const WIN_STATUS_DLL_NOT_FOUND = 0xc000_0135;

export type RuntimePreflightResult = {
  ok: boolean;
  executablePath: string;
  cwd: string;
  exitCode?: number;
  signal?: string | null;
  stdout?: string;
  stderr?: string;
  errorCode?: string;
  /** Dependencia sospechosa cuando aplica (p.ej. VCRUNTIME140.dll). */
  missingDependency?: string;
  diagnostics?: string;
  durationMs: number;
};

function sanitizeOut(text: string, max = 2_000): string {
  return text
    .replace(/Authorization\s*:\s*Bearer\s+\S+/gi, "[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._+-]+/g, "Bearer [redacted]")
    .replace(/sk-ant-[A-Za-z0-9_-]+/g, "[redacted]")
    .slice(0, max);
}

function normalizeExitCode(code: number | null): number | undefined {
  if (code === null || code === undefined) return undefined;
  // Node on Windows may surface NTSTATUS as signed 32-bit.
  return code < 0 ? code >>> 0 : code;
}

export function isDllNotFoundExit(code: number | undefined): boolean {
  if (code === undefined) return false;
  return code === WIN_STATUS_DLL_NOT_FOUND || code === -1073741515;
}

/**
 * Ejecuta `llama-server --version` (o el binario de paths) con cwd = install dir.
 */
export function runRuntimePreflight(
  paths: RuntimeStoragePaths,
  opts?: {
    spawnSyncFn?: typeof spawnSync;
    /** Timeout ms (default 15s). */
    timeoutMs?: number;
  },
): RuntimePreflightResult {
  const t0 = Date.now();
  const executablePath = paths.binaryPath;
  const cwd = path.dirname(executablePath);
  if (!fs.existsSync(executablePath)) {
    return {
      ok: false,
      executablePath,
      cwd,
      errorCode: "RUNTIME_NOT_INSTALLED",
      diagnostics: "executable_missing",
      durationMs: Date.now() - t0,
    };
  }

  if (process.platform === "win32") {
    ensureWindowsVc140Sidecars(paths.installRoot);
    const missing = listMissingWindowsVc140Sidecars(paths.installRoot);
    if (missing.length > 0) {
      return {
        ok: false,
        executablePath,
        cwd,
        errorCode: "RUNTIME_DEPENDENCY_MISSING",
        missingDependency: missing[0],
        diagnostics: `sidecars_missing:${missing.join(",")}`,
        durationMs: Date.now() - t0,
      };
    }
  }

  const spawnSyncFn = opts?.spawnSyncFn ?? spawnSync;
  const env = {
    ...process.env,
    PATH: `${cwd}${path.delimiter}${process.env.PATH || ""}`,
  };
  const result = spawnSyncFn(executablePath, ["--version"], {
    cwd,
    env,
    encoding: "utf8",
    windowsHide: true,
    timeout: opts?.timeoutMs ?? 15_000,
  });

  const exitCode = normalizeExitCode(
    result.status === null ? null : result.status,
  );
  const stdout = sanitizeOut(String(result.stdout || ""));
  const stderr = sanitizeOut(String(result.stderr || ""));
  const durationMs = Date.now() - t0;

  if (result.error) {
    return {
      ok: false,
      executablePath,
      cwd,
      exitCode,
      stdout,
      stderr,
      errorCode: "RUNTIME_START_FAILED",
      diagnostics: sanitizeOut(result.error.message),
      durationMs,
    };
  }

  if (isDllNotFoundExit(exitCode)) {
    return {
      ok: false,
      executablePath,
      cwd,
      exitCode,
      stdout,
      stderr,
      errorCode: "RUNTIME_DEPENDENCY_MISSING",
      missingDependency:
        process.platform === "win32"
          ? listMissingWindowsVc140Sidecars(paths.installRoot)[0] ||
            "VCRUNTIME140.dll"
          : undefined,
      diagnostics: `win_ntstatus=0x${(exitCode ?? 0).toString(16).toUpperCase()}`,
      durationMs,
    };
  }

  if (exitCode !== 0) {
    return {
      ok: false,
      executablePath,
      cwd,
      exitCode,
      signal: result.signal,
      stdout,
      stderr,
      errorCode: "RUNTIME_VALIDATION_FAILED",
      diagnostics: `exit=${exitCode}`,
      durationMs,
    };
  }

  return {
    ok: true,
    executablePath,
    cwd,
    exitCode: 0,
    stdout,
    stderr,
    durationMs,
  };
}

export function assertRuntimePreflight(
  paths: RuntimeStoragePaths,
  opts?: Parameters<typeof runRuntimePreflight>[1],
): RuntimePreflightResult {
  const result = runRuntimePreflight(paths, opts);
  if (result.ok) return result;
  const code =
    (result.errorCode as import("./errors.ts").LocalModelErrorCode) ||
    "RUNTIME_VALIDATION_FAILED";
  throw new LocalModelError(
    code === "RUNTIME_DEPENDENCY_MISSING" ||
      code === "RUNTIME_NOT_INSTALLED" ||
      code === "RUNTIME_START_FAILED" ||
      code === "RUNTIME_VALIDATION_FAILED"
      ? code
      : "RUNTIME_VALIDATION_FAILED",
    userMessageForCode(
      code === "RUNTIME_DEPENDENCY_MISSING"
        ? "RUNTIME_DEPENDENCY_MISSING"
        : code === "RUNTIME_NOT_INSTALLED"
          ? "RUNTIME_NOT_INSTALLED"
          : code === "RUNTIME_START_FAILED"
            ? "RUNTIME_START_FAILED"
            : "RUNTIME_VALIDATION_FAILED",
    ),
    result,
  );
}
