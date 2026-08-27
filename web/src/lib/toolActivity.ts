export type ToolActivityPhase =
  | "preparing"
  | "awaiting_auth"
  | "executing"
  | "completed"
  | "failed"
  | "rejected"
  | "timed_out";

export function toolActivityLabel(phase: ToolActivityPhase): string {
  switch (phase) {
    case "preparing":
      return "Preparando acción…";
    case "awaiting_auth":
      return "Esperando autorización…";
    case "executing":
      return "Ejecutando…";
    case "completed":
      return "Acción completada";
    case "failed":
      return "No se pudo completar la acción";
    case "rejected":
      return "Acción rechazada";
    case "timed_out":
      return "Autorización expirada";
  }
}

export const HITL_TIMEOUT_MS = 60_000;
