import type {
  DiagnosticClientPayload,
  DiagnosticComponent,
  DiagnosticStage,
} from "./types.ts";

export class AgentDiagnosticError extends Error {
  readonly component: DiagnosticComponent;
  readonly stage: DiagnosticStage;
  readonly errorCode: string;
  readonly diagnosticId?: string;
  readonly httpStatus?: number;
  readonly metadata?: Record<string, unknown>;

  constructor(input: {
    message: string;
    component: DiagnosticComponent;
    stage: DiagnosticStage;
    errorCode: string;
    diagnosticId?: string;
    httpStatus?: number;
    metadata?: Record<string, unknown>;
  }) {
    super(input.message);
    this.name = "AgentDiagnosticError";
    this.component = input.component;
    this.stage = input.stage;
    this.errorCode = input.errorCode;
    this.diagnosticId = input.diagnosticId;
    this.httpStatus = input.httpStatus;
    this.metadata = input.metadata;
  }
}

export function toDiagnosticClientPayload(
  err: AgentDiagnosticError,
  timestamp: string,
): DiagnosticClientPayload {
  return {
    diagnosticId: err.diagnosticId || "PA-UNKNOWN",
    component: err.component,
    stage: err.stage,
    errorCode: err.errorCode,
    timestamp,
    provider:
      typeof err.metadata?.provider === "string"
        ? err.metadata.provider
        : undefined,
    httpStatus:
      typeof err.httpStatus === "number" ? err.httpStatus : undefined,
    providerErrorType:
      typeof err.metadata?.providerErrorType === "string"
        ? err.metadata.providerErrorType
        : undefined,
    providerRequestId:
      typeof err.metadata?.providerRequestId === "string"
        ? err.metadata.providerRequestId
        : undefined,
    safeMessage:
      typeof err.metadata?.safeProviderMessage === "string"
        ? err.metadata.safeProviderMessage
        : undefined,
    model:
      typeof err.metadata?.model === "string"
        ? err.metadata.model
        : undefined,
  };
}

