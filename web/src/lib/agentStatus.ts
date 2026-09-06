import type { AgentStatus } from "../types";
import { AGENT_STATUS_LABELS } from "../types";

/** Deriva estado humano del agente a partir del runtime real (WS / HITL / health). */
export function deriveAgentStatus(input: {
  wsStatus: string;
  agentReady: boolean;
  busy: boolean;
  pendingConfirm: boolean;
  hasError: boolean;
  streaming: boolean;
}): { status: AgentStatus; label: string; detail?: string } {
  if (input.hasError) {
    return { status: "error", label: AGENT_STATUS_LABELS.error };
  }
  if (input.wsStatus === "disconnected" || input.wsStatus === "error") {
    return { status: "idle", label: AGENT_STATUS_LABELS.idle, detail: "Sin conexión" };
  }
  if (input.wsStatus === "connecting") {
    return { status: "listening", label: AGENT_STATUS_LABELS.listening, detail: "Conectando…" };
  }
  if (input.pendingConfirm) {
    return {
      status: "needs_approval",
      label: AGENT_STATUS_LABELS.needs_approval,
      detail: "Acción pendiente de autorización",
    };
  }
  if (input.busy && input.streaming) {
    return { status: "analyzing", label: AGENT_STATUS_LABELS.analyzing };
  }
  if (input.busy) {
    return { status: "understanding", label: AGENT_STATUS_LABELS.understanding };
  }
  if (input.agentReady && input.wsStatus === "authenticated") {
    return { status: "ready", label: AGENT_STATUS_LABELS.ready };
  }
  if (input.wsStatus === "authenticated") {
    return { status: "paused", label: AGENT_STATUS_LABELS.paused, detail: "Node no listo" };
  }
  return { status: "idle", label: AGENT_STATUS_LABELS.idle };
}
