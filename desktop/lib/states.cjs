"use strict";

/** Estados de producto del Shell (sin falsa precisión de liveness mid-run). */
const AgentUiState = {
  NOT_CONFIGURED: "NOT_CONFIGURED",
  WAITING_NETWORK: "WAITING_NETWORK",
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
    case AgentUiState.WAITING_NETWORK:
      return "Red segura pendiente";
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
 * networkReady=false ⇒ no READY (Tailscale es prerrequisito del Runtime operable).
 *
 * nodeStatus del Gateway (/health):
 *   READY → UI READY (si healthOk)
 *   DISCONNECTED | DEGRADED → UI DEGRADED (Gateway vivo, Node caído)
 *   STOPPING → STOPPED
 */
function mapAgentState({
  workspaceConfigured,
  processRunning,
  bootReady,
  healthOk,
  lastError,
  androidConnected,
  networkReady,
  nodeStatus,
  agentReady,
}) {
  if (networkReady === false) return AgentUiState.WAITING_NETWORK;
  if (!workspaceConfigured) return AgentUiState.NOT_CONFIGURED;
  if (lastError && !processRunning) return AgentUiState.ERROR;
  if (!processRunning) return AgentUiState.STOPPED;
  if (processRunning && !bootReady) return AgentUiState.STARTING;

  if (nodeStatus === "STOPPING") return AgentUiState.STOPPED;
  if (
    processRunning &&
    bootReady &&
    (nodeStatus === "DISCONNECTED" || nodeStatus === "DEGRADED")
  ) {
    return AgentUiState.DEGRADED;
  }

  // agentReady false with explicit READY expectation after health probe
  if (
    processRunning &&
    bootReady &&
    agentReady === false &&
    (nodeStatus === "READY" || nodeStatus === "UNKNOWN")
  ) {
    // Transient UNKNOWN before first probe: stay STARTING; false+READY is inconsistent → DEGRADED
    if (nodeStatus === "READY") return AgentUiState.DEGRADED;
  }

  if (bootReady && healthOk && agentReady !== false) {
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
