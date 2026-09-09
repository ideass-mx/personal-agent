/**
 * PHASE 61.2.2 — progreso de instalación de modelo.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  beginModelInstall,
  clearModelInstallProgress,
  completeModelInstall,
  failModelInstall,
  getModelInstallSnapshot,
  setModelInstallPhase,
  updateModelDownloadProgress,
} from "../../src/local-llm/install-progress.ts";

describe("PHASE 61.2.2 install progress", () => {
  it("A — preparing → downloading con progreso real", () => {
    clearModelInstallProgress();
    beginModelInstall({ modelId: "qwen3-4b", displayName: "Qwen3 4B" });
    let snap = getModelInstallSnapshot();
    assert.equal(snap?.phase, "preparing");
    setModelInstallPhase("downloading");
    updateModelDownloadProgress({
      bytesReceived: 25,
      bytesTotal: 100,
      ratio: 0.25,
    });
    snap = getModelInstallSnapshot();
    assert.equal(snap?.phase, "downloading");
    assert.equal(snap?.progress, 25);
    assert.equal(snap?.bytesReceived, 25);
    assert.equal(snap?.bytesTotal, 100);
    updateModelDownloadProgress({
      bytesReceived: 50,
      bytesTotal: 100,
      ratio: 0.5,
    });
    updateModelDownloadProgress({
      bytesReceived: 75,
      bytesTotal: 100,
      ratio: 0.75,
    });
    updateModelDownloadProgress({
      bytesReceived: 100,
      bytesTotal: 100,
      ratio: 1,
    });
    snap = getModelInstallSnapshot();
    assert.equal(snap?.progress, 100);
    clearModelInstallProgress();
  });

  it("C — sin totalBytes no inventa porcentaje", () => {
    clearModelInstallProgress();
    beginModelInstall({ modelId: "qwen3-4b", displayName: "Qwen3 4B" });
    setModelInstallPhase("downloading");
    updateModelDownloadProgress({ bytesReceived: 1_000_000 });
    const snap = getModelInstallSnapshot();
    assert.equal(snap?.bytesReceived, 1_000_000);
    assert.equal(snap?.progress, undefined);
    clearModelInstallProgress();
  });

  it("D — downloading → verifying", () => {
    clearModelInstallProgress();
    beginModelInstall({ modelId: "qwen3-4b", displayName: "Qwen3 4B" });
    setModelInstallPhase("downloading");
    setModelInstallPhase("verifying");
    const snap = getModelInstallSnapshot();
    assert.equal(snap?.phase, "verifying");
    assert.ok(
      snap?.events.some((e) => e.event === "model_verification_started"),
    );
    clearModelInstallProgress();
  });

  it("E — runtime → download → verify → complete", () => {
    clearModelInstallProgress();
    beginModelInstall({ modelId: "qwen3-4b", displayName: "Qwen3 4B" });
    setModelInstallPhase("installing_runtime");
    setModelInstallPhase("downloading");
    setModelInstallPhase("verifying");
    completeModelInstall();
    const snap = getModelInstallSnapshot();
    assert.equal(snap?.phase, "complete");
    assert.ok(snap?.stageDurationsMs.installing_runtime != null);
    clearModelInstallProgress();
  });

  it("F — failure por etapa", () => {
    clearModelInstallProgress();
    beginModelInstall({ modelId: "qwen3-4b", displayName: "Qwen3 4B" });
    setModelInstallPhase("downloading");
    failModelInstall("MODEL_DOWNLOAD_FAILED", "No pudimos descargar el modelo.");
    const snap = getModelInstallSnapshot();
    assert.equal(snap?.phase, "failed");
    assert.equal(snap?.errorCode, "MODEL_DOWNLOAD_FAILED");
    clearModelInstallProgress();
  });

  it("I — no secretos en snapshot", () => {
    clearModelInstallProgress();
    beginModelInstall({ modelId: "qwen3-4b", displayName: "Qwen3 4B" });
    const snap = getModelInstallSnapshot();
    const raw = JSON.stringify(snap);
    assert.doesNotMatch(raw, /sk-ant-|Authorization|Bearer /i);
    clearModelInstallProgress();
  });
});
