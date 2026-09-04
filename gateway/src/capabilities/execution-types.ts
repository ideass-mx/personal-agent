/**
 * PHASE 64 — contratos de ejecución de Capability (sin routing inteligente).
 */
import { randomUUID } from "node:crypto";
import type { ArtifactReference } from "../artifacts/types.ts";
import type { ToolContext } from "../tools/types.ts";
import type { ImplementationKind } from "./types.ts";

export type CapabilityRequest = {
  readonly capabilityId: string;
  readonly input: unknown;
  readonly context: ToolContext;
  readonly requestId?: string;
  readonly timeoutMs?: number;
};

/** Resolución elegida — sin secretos ni paths. */
export type CapabilityResolution = {
  readonly requestId: string;
  readonly capabilityId: string;
  readonly implementationId: string;
  readonly executionTargetId: string;
  readonly toolName: string;
  readonly implementationKind: ImplementationKind;
  readonly transport?: string;
};

export type CapabilityExecutionStatus =
  | "success"
  | "failed"
  | "timeout"
  | "cancelled"
  | "unavailable"
  | "denied";

export type CapabilityExecutionErrorCode =
  | "capability_not_found"
  | "implementation_unavailable"
  | "target_unavailable"
  | "policy_denied"
  | "execution_timeout"
  | "execution_failed"
  | "transport_error"
  | "cancelled";

export type CapabilityExecutionResult = {
  readonly requestId: string;
  readonly status: CapabilityExecutionStatus;
  readonly content?: unknown;
  readonly artifacts?: readonly ArtifactReference[];
  readonly error?: {
    readonly code: CapabilityExecutionErrorCode | string;
    readonly message: string;
  };
  readonly resolution?: CapabilityResolution;
};

export function newCapabilityRequestId(): string {
  return `cap_${randomUUID()}`;
}

export function implementationIdFor(input: {
  executionTargetId: string;
  toolName: string;
}): string {
  return `${input.executionTargetId}::${input.toolName}`;
}

/** Mensajes client-safe (sin paths, secrets ni stack). */
export const EXECUTION_SAFE_MESSAGES: Readonly<
  Record<CapabilityExecutionErrorCode, string>
> = Object.freeze({
  capability_not_found: "Capability no disponible.",
  implementation_unavailable: "No hay implementación disponible.",
  target_unavailable: "El destino de ejecución no está disponible.",
  policy_denied: "Capability no autorizada.",
  execution_timeout: "La ejecución superó el tiempo límite.",
  execution_failed: "La ejecución falló.",
  transport_error: "Error de transporte hacia el destino.",
  cancelled: "Ejecución cancelada.",
});
