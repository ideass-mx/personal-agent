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

/** Copy a partir de `tool_progress` real (no heurística). */
export function toolProgressBanner(input: {
  phase: "executing" | "completed" | "failed";
  toolLabel: string;
  detail?: string;
}): string {
  const detail =
    input.detail && input.detail.trim()
      ? ` «${input.detail.trim()}»`
      : "";
  switch (input.phase) {
    case "executing":
      return `${input.toolLabel}…${detail}`;
    case "completed":
      return `${input.toolLabel}: listo.${detail}`;
    case "failed":
      return `No se pudo completar: ${input.toolLabel}${detail}`;
  }
}

/**
 * Copy de paciencia genérico solo mientras el LLM piensa sin tool_progress.
 */
export function workingPatienceLabel(input: {
  busyMs: number;
  hasAssistantTokens: boolean;
}): string {
  if (input.hasAssistantTokens) {
    return "Procesando la respuesta…";
  }
  if (input.busyMs >= 8_000) {
    return "El agente sigue pensando; esto puede tardar un poco…";
  }
  return "El agente está trabajando…";
}

export const HITL_TIMEOUT_MS = 60_000;
