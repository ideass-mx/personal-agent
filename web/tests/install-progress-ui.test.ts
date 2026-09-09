/**
 * PHASE 61.2.2 — copy/formato de progreso de instalación (UI).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatBytesShort,
  installPhaseTitle,
  installProgressDetail,
  mapInstallApiPhase,
  shouldShowDeterminateBar,
  type InstallUiState,
} from "../src/lib/installProgressUi.ts";

describe("PHASE 61.2.2 installProgressUi", () => {
  it("A — preparing no dice solo «Preparando instalación» genérico", () => {
    assert.equal(installPhaseTitle("preparing"), "Preparando tu agente");
    assert.notEqual(installPhaseTitle("preparing"), "Preparando instalación…");
  });

  it("B — progreso 0–100 con total", () => {
    const state: InstallUiState = {
      phase: "downloading",
      displayName: "Qwen3 4B",
      progress: 51,
      bytesReceived: 1.2e9,
      bytesTotal: 2.4e9,
    };
    assert.equal(shouldShowDeterminateBar(state), true);
    assert.match(installProgressDetail(state), /51%/);
  });

  it("C — sin total no inventa %", () => {
    const state: InstallUiState = {
      phase: "downloading",
      displayName: "Qwen3 4B",
      bytesReceived: 1.1e9,
    };
    assert.equal(shouldShowDeterminateBar(state), false);
    assert.match(installProgressDetail(state), /descargados/);
    assert.doesNotMatch(installProgressDetail(state), /%/);
  });

  it("D — verifying mapea desde validating", () => {
    assert.equal(mapInstallApiPhase("validating"), "verifying");
    assert.equal(installPhaseTitle("verifying"), "Verificando el modelo");
  });

  it("H — fases específicas vs preparing genérico", () => {
    assert.equal(installPhaseTitle("downloading"), "Descargando tu modelo");
    assert.equal(
      installPhaseTitle("installing_runtime"),
      "Preparando el motor local",
    );
    assert.equal(
      installPhaseTitle("validating_runtime"),
      "Validando el motor local",
    );
    assert.equal(installPhaseTitle("starting_model"), "Iniciando el modelo");
    assert.match(formatBytesShort(2_497_280_736), /GB/);
  });

  it("N — sin Content-Length no muestra % falso", () => {
    const state: InstallUiState = {
      phase: "validating_runtime",
      displayName: "Qwen3 4B",
      progress: 42,
    };
    assert.equal(shouldShowDeterminateBar(state), false);
    assert.equal(installProgressDetail(state), "");
  });
});
