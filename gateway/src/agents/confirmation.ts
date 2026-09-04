/**
 * Contrato de confirmación del Agent Runtime.
 * Sin transporte ni infraestructura del Gateway.
 * sessionId en ConfirmationRequest es identidad opaca del turno, no un objeto Session.
 */
import type { ToolResult } from "../tools/types.ts";

export type ConfirmationDecision =
  | "approved"
  | "rejected"
  | "timeout"
  | "cancelled";

/** Operación congelada al registrar la confirmación (servidor = fuente de verdad). */
export interface FrozenConfirmationOperation {
  confirmationId: string;
  toolCallId: string;
  toolName: string;
  input: unknown;
  conversationId: string;
  deviceId?: string;
  sessionId: string;
}

export interface ConfirmationRequest {
  confirmationId: string;
  toolCallId: string;
  toolName: string;
  input: unknown;
  conversationId: string;
  deviceId?: string;
  sessionId: string;
}

export type ConfirmationOutcome =
  | { decision: "approved"; operation: FrozenConfirmationOperation }
  | {
      decision: "rejected" | "timeout" | "cancelled";
      operation: FrozenConfirmationOperation;
    };

/** Puerto que el Runtime usa para suspender un tool_call hasta approve/reject. */
export interface ConfirmationPort {
  wait(request: ConfirmationRequest): Promise<ConfirmationOutcome>;
}

export function confirmationRejectedResult(): ToolResult {
  return {
    ok: false,
    error: {
      code: "confirmation_rejected",
      message: "Tool execution was rejected by the user",
    },
  };
}

export function confirmationTimeoutResult(): ToolResult {
  return {
    ok: false,
    error: {
      code: "confirmation_timeout",
      message: "Tool confirmation timed out",
    },
  };
}

export function confirmationCancelledResult(): ToolResult {
  return {
    ok: false,
    error: {
      code: "confirmation_cancelled",
      message: "Tool confirmation was cancelled",
    },
  };
}

export function confirmationUnavailableResult(): ToolResult {
  return {
    ok: false,
    error: {
      code: "confirmation_unavailable",
      message: "Tool confirmation is unavailable",
    },
  };
}

export function confirmationInconsistentResult(): ToolResult {
  return {
    ok: false,
    error: {
      code: "confirmation_inconsistent",
      message: "Tool confirmation could not be fulfilled safely",
    },
  };
}

export function toolResultForDecision(
  decision: Exclude<ConfirmationDecision, "approved">,
): ToolResult {
  switch (decision) {
    case "rejected":
      return confirmationRejectedResult();
    case "timeout":
      return confirmationTimeoutResult();
    case "cancelled":
      return confirmationCancelledResult();
  }
}
