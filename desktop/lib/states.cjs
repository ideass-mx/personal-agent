"use strict";

/** Estados de producto del Shell (sin falsa precisión de liveness mid-run). */
const AgentUiState = {
  NOT_CONFIGURED: "NOT_CONFIGURED",
  STARTING: "STARTING",
  READY: "READY",
  DEGRADED: "DEGRADED",
  DISCONNECTED: "DISCONNECTED",
  ERROR: "ERROR",
  STOPPED: "STOPPED",
};

function labelForState(state) {
  switch (state) {
    case AgentUiState.NOT_CONFIGURED:
      return "Sin configurar";
    case AgentUiState.STARTING:
      return "Arrancando…";
    case AgentUiState.READY:
      return "AGENT READY";
    case AgentUiState.DEGRADED:
      return "Degradado";
    case AgentUiState.DISCONNECTED:
      return "Android no conectado";
    case AgentUiState.ERROR:
      return "Error";
    case AgentUiState.STOPPED:
      return "Detenido";
    default:
      return "Desconocido";
  }
}

/**
 * Mapea evidencia observable a estado UI.
 * No inventa liveness de Node mid-run.
 */
function mapAgentState({
  workspaceConfigured,
  processRunning,
  bootReady,
  healthOk,
  lastError,
  androidConnected,
}) {
  if (!workspaceConfigured) return AgentUiState.NOT_CONFIGURED;
  if (lastError && !processRunning) return AgentUiState.ERROR;
  if (!processRunning) return AgentUiState.STOPPED;
  if (processRunning && !bootReady) return AgentUiState.STARTING;
  if (bootReady && healthOk) {
    if (androidConnected === false) return AgentUiState.READY;
    return AgentUiState.READY;
  }
  if (processRunning && bootReady && !healthOk) return AgentUiState.DEGRADED;
  if (lastError) return AgentUiState.ERROR;
  return AgentUiState.STARTING;
}

module.exports = {
  AgentUiState,
  labelForState,
  mapAgentState,
};
