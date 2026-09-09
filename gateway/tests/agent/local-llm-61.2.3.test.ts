/**
 * PHASE 61.2.3 — Windows runtime packaging + preflight.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  beginModelInstall,
  clearModelInstallProgress,
  completeModelInstall,
  failModelInstall,
  getModelInstallSnapshot,
  setModelInstallPhase,
} from "../../src/local-llm/install-progress.ts";
import {
  isDllNotFoundExit,
  runRuntimePreflight,
  WIN_STATUS_DLL_NOT_FOUND,
} from "../../src/local-llm/runtime-preflight.ts";
import {
  ensureWindowsVc140Sidecars,
  listMissingWindowsVc140Sidecars,
  resolveWinVc140AssetDir,
  WIN_VC140_SIDE_BY_SIDE_DLLS,
} from "../../src/local-llm/runtime-sidecars.ts";
import { userMessageForCode } from "../../src/local-llm/errors.ts";
import type { RuntimeStoragePaths } from "../../src/local-llm/runtime-storage.ts";

function fakePaths(root: string): RuntimeStoragePaths {
  const binary =
    process.platform === "win32"
      ? path.join(root, "llama-server.exe")
      : path.join(root, "llama-server");
  return {
    root,
    runtimesDir: root,
    installRoot: root,
    binaryPath: binary,
    downloadsDir: path.join(root, "downloads"),
    lockFile: path.join(root, "runtime.lock"),
  };
}

describe("PHASE 61.2.3 runtime packaging & preflight", () => {
  it("A — asset dir de sidecars VC140 existe", () => {
    const dir = resolveWinVc140AssetDir();
    assert.ok(fs.existsSync(dir), `missing asset dir: ${dir}`);
  });

  it("B — DLLs empaquetadas existen", () => {
    const dir = resolveWinVc140AssetDir();
    for (const name of WIN_VC140_SIDE_BY_SIDE_DLLS) {
      assert.ok(
        fs.existsSync(path.join(dir, name)),
        `missing packaged dependency: ${name}`,
      );
    }
  });

  it("C — ensureWindowsVc140Sidecars copia al install root", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pa-6123-side-"));
    try {
      const r = ensureWindowsVc140Sidecars(tmp);
      assert.equal(r.missingAssets.length, 0);
      assert.ok(r.copied.length + r.alreadyPresent.length >= 3);
      assert.equal(listMissingWindowsVc140Sidecars(tmp).length, 0);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("D — preflight ok cuando spawn --version sale 0", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pa-6123-pf-ok-"));
    try {
      const paths = fakePaths(tmp);
      fs.writeFileSync(paths.binaryPath, "x");
      const result = runRuntimePreflight(paths, {
        spawnSyncFn: (() => ({
          status: 0,
          stdout: "version 1",
          stderr: "",
          error: undefined,
          signal: null,
        })) as unknown as typeof import("node:child_process").spawnSync,
      });
      assert.equal(result.ok, true);
      assert.equal(result.exitCode, 0);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("E — preflight detecta 0xC0000135 / STATUS_DLL_NOT_FOUND", () => {
    assert.equal(isDllNotFoundExit(WIN_STATUS_DLL_NOT_FOUND), true);
    assert.equal(isDllNotFoundExit(-1073741515), true);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pa-6123-pf-dll-"));
    try {
      const paths = fakePaths(tmp);
      fs.writeFileSync(paths.binaryPath, "x");
      // Evitar que la copia de sidecars “cure” el caso: forzamos exit DLL.
      const result = runRuntimePreflight(paths, {
        spawnSyncFn: (() => ({
          status: -1073741515,
          stdout: "",
          stderr: "",
          error: undefined,
          signal: null,
        })) as unknown as typeof import("node:child_process").spawnSync,
      });
      assert.equal(result.ok, false);
      assert.equal(result.errorCode, "RUNTIME_DEPENDENCY_MISSING");
      assert.match(String(result.diagnostics), /C0000135/i);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("F — ejecutable ausente → no ok / RUNTIME_NOT_INSTALLED", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pa-6123-miss-"));
    try {
      const paths = fakePaths(tmp);
      const result = runRuntimePreflight(paths);
      assert.equal(result.ok, false);
      assert.equal(result.errorCode, "RUNTIME_NOT_INSTALLED");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("G — mensaje usuario no es el NTSTATUS crudo", () => {
    const msg = userMessageForCode("RUNTIME_DEPENDENCY_MISSING");
    assert.doesNotMatch(msg, /0xC0000135/i);
    assert.match(msg, /motor local/i);
  });

  it("H — fases reales de onboarding (modelo → runtime → validate → start)", () => {
    clearModelInstallProgress();
    beginModelInstall({ modelId: "qwen3-4b", displayName: "Qwen3 4B" });
    setModelInstallPhase("downloading");
    setModelInstallPhase("verifying");
    setModelInstallPhase("installing_runtime");
    setModelInstallPhase("validating_runtime");
    setModelInstallPhase("starting_model");
    completeModelInstall();
    const snap = getModelInstallSnapshot();
    assert.equal(snap?.phase, "complete");
    assert.ok(snap?.stageDurationsMs.downloading != null);
    assert.ok(snap?.stageDurationsMs.validating_runtime != null);
    assert.ok(snap?.stageDurationsMs.starting_model != null);
    clearModelInstallProgress();
  });

  it("I — fallo de runtime no marca complete", () => {
    clearModelInstallProgress();
    beginModelInstall({ modelId: "qwen3-4b", displayName: "Qwen3 4B" });
    setModelInstallPhase("downloading");
    setModelInstallPhase("verifying");
    setModelInstallPhase("installing_runtime");
    failModelInstall(
      "RUNTIME_DEPENDENCY_MISSING",
      "El modelo se descargó correctamente, pero el motor local no pudo iniciarse.",
    );
    const snap = getModelInstallSnapshot();
    assert.equal(snap?.phase, "failed");
    assert.equal(snap?.errorCode, "RUNTIME_DEPENDENCY_MISSING");
    assert.notEqual(snap?.phase, "complete");
    clearModelInstallProgress();
  });

  it("L — preflight sanitiza secretos en stdout/stderr", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pa-6123-sec-"));
    try {
      const paths = fakePaths(tmp);
      fs.writeFileSync(paths.binaryPath, "x");
      const result = runRuntimePreflight(paths, {
        spawnSyncFn: (() => ({
          status: 1,
          stdout: "Authorization: Bearer sk-ant-secretTOKEN",
          stderr: "Bearer abc.def.ghi",
          error: undefined,
          signal: null,
        })) as unknown as typeof import("node:child_process").spawnSync,
      });
      assert.equal(result.ok, false);
      assert.doesNotMatch(String(result.stdout), /sk-ant-secretTOKEN/);
      assert.doesNotMatch(String(result.stderr), /abc\.def\.ghi/);
      assert.match(String(result.stdout), /\[redacted\]/);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
