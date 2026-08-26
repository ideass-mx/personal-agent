/**
 * ConfirmationWaiter: infraestructura del Gateway.
 * Implementa ConfirmationPort; pending, timeout y binding de sesión.
 * El Agent Runtime no importa este módulo.
 *
 * El cliente solo envía confirmationId + approved; la operación vive en el pending.
 * Estado solo en memoria del proceso — sin SQLite ni Permission System.
 */
import type {
  ConfirmationDecision,
  ConfirmationOutcome,
  ConfirmationPort,
  ConfirmationRequest,
  FrozenConfirmationOperation,
} from "../agent/confirmation.ts";

/** Timeout por defecto para esperar confirm_response del cliente. */
export const CONFIRMATION_TIMEOUT_MS = 60_000;

/**
 * Claimant que intenta resolver una confirmación.
 * En producción lo aporta la sesión WS (no el payload del cliente).
 */
export interface ConfirmationClaimant {
  sessionId: string;
  deviceId?: string;
  /** Si se indica, debe coincidir con el conversationId del pending. */
  conversationId?: string;
}

function freezeInput(input: unknown): unknown {
  try {
    return structuredClone(input);
  } catch {
    throw new Error("confirmation_input_not_clonable");
  }
}

interface PendingConfirmation {
  resolve: (outcome: ConfirmationOutcome) => void;
  timer: ReturnType<typeof setTimeout>;
  operation: FrozenConfirmationOperation;
}

export interface ConfirmationWaiter {
  readonly sessionId: string;
  readonly deviceId?: string;
  port: ConfirmationPort;
  /**
   * Intenta resolver un pending. false si id desconocido, ya resuelto,
   * o el claimant no coincide (en ese caso el pending NO se toca).
   */
  respond(
    confirmationId: string,
    approved: boolean,
    claimant?: ConfirmationClaimant,
  ): boolean;
  /** Fail-closed: cancela todos los pendientes (p. ej. desconexión WS). */
  cancelAll(): void;
  hasPending(confirmationId: string): boolean;
  /** Snapshot del pending si existe (solo tests/diagnóstico). */
  peek(confirmationId: string): FrozenConfirmationOperation | undefined;
}

function claimantMatches(
  operation: FrozenConfirmationOperation,
  claimant: ConfirmationClaimant,
): boolean {
  if (claimant.sessionId !== operation.sessionId) return false;
  if ((claimant.deviceId ?? undefined) !== (operation.deviceId ?? undefined)) {
    return false;
  }
  if (
    claimant.conversationId !== undefined &&
    claimant.conversationId !== operation.conversationId
  ) {
    return false;
  }
  return true;
}

function cancelledOutcome(request: ConfirmationRequest): ConfirmationOutcome {
  return {
    decision: "cancelled",
    operation: {
      confirmationId: request.confirmationId,
      toolCallId: request.toolCallId,
      toolName: request.toolName,
      input: request.input,
      conversationId: request.conversationId,
      deviceId: request.deviceId,
      sessionId: request.sessionId,
    },
  };
}

export function createConfirmationWaiter(options: {
  sessionId: string;
  deviceId?: string;
  timeoutMs?: number;
}): ConfirmationWaiter {
  const timeoutMs = options.timeoutMs ?? CONFIRMATION_TIMEOUT_MS;
  const sessionId = options.sessionId;
  const deviceId = options.deviceId;
  const pending = new Map<string, PendingConfirmation>();

  function settle(
    confirmationId: string,
    decision: ConfirmationDecision,
  ): boolean {
    const entry = pending.get(confirmationId);
    if (!entry) return false;
    pending.delete(confirmationId);
    clearTimeout(entry.timer);
    if (decision === "approved") {
      entry.resolve({ decision: "approved", operation: entry.operation });
    } else {
      entry.resolve({ decision, operation: entry.operation });
    }
    return true;
  }

  const defaultClaimant = (): ConfirmationClaimant => ({
    sessionId,
    deviceId,
  });

  return {
    sessionId,
    deviceId,
    port: {
      wait(request) {
        return new Promise<ConfirmationOutcome>((resolve) => {
          if (request.sessionId !== sessionId) {
            resolve(cancelledOutcome(request));
            return;
          }
          if ((request.deviceId ?? undefined) !== (deviceId ?? undefined)) {
            resolve(cancelledOutcome(request));
            return;
          }

          let frozenInput: unknown;
          try {
            frozenInput = freezeInput(request.input);
          } catch {
            resolve(cancelledOutcome(request));
            return;
          }

          const prev = pending.get(request.confirmationId);
          if (prev) {
            pending.delete(request.confirmationId);
            clearTimeout(prev.timer);
            prev.resolve({
              decision: "cancelled",
              operation: prev.operation,
            });
          }

          const operation: FrozenConfirmationOperation = {
            confirmationId: request.confirmationId,
            toolCallId: request.toolCallId,
            toolName: request.toolName,
            input: frozenInput,
            conversationId: request.conversationId,
            deviceId: request.deviceId,
            sessionId: request.sessionId,
          };

          const timer = setTimeout(() => {
            settle(request.confirmationId, "timeout");
          }, timeoutMs);

          pending.set(request.confirmationId, {
            resolve,
            timer,
            operation,
          });
        });
      },
    },
    respond(confirmationId, approved, claimant) {
      const entry = pending.get(confirmationId);
      if (!entry) return false;

      const who = claimant ?? defaultClaimant();
      if (!claimantMatches(entry.operation, who)) {
        return false;
      }

      return settle(confirmationId, approved ? "approved" : "rejected");
    },
    cancelAll() {
      for (const id of [...pending.keys()]) {
        settle(id, "cancelled");
      }
    },
    hasPending(confirmationId) {
      return pending.has(confirmationId);
    },
    peek(confirmationId) {
      return pending.get(confirmationId)?.operation;
    },
  };
}
