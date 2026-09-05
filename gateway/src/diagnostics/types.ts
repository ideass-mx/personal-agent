export type DiagnosticComponent =
  | "WEB"
  | "GATEWAY"
  | "AGENT_RUNTIME"
  | "LLM_PROVIDER"
  | "NODE"
  | "MCP"
  | "ELECTRON";

export type DiagnosticStage =
  | "REQUEST_RECEIVED"
  | "SESSION_RESOLUTION"
  | "AGENT_RUNTIME"
  | "MEMORY"
  | "PROMPT_BUILD"
  | "LLM_REQUEST"
  | "LLM_STREAM"
  | "LLM_RESPONSE"
  | "TOOL_SELECTION"
  | "TOOL_EXECUTION"
  | "MCP"
  | "RESPONSE_ASSEMBLY"
  | "WEBSOCKET";

export type DiagnosticLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

export type DiagnosticEventInput = {
  diagnosticId: string;
  requestId?: string;
  component: DiagnosticComponent;
  stage: DiagnosticStage;
  level: DiagnosticLevel;
  event: string;
  errorCode?: string | null;
  message?: string | null;
  durationMs?: number | null;
  metadata?: Record<string, unknown> | null;
};

export type DiagnosticEventRecord = {
  timestamp: string;
  diagnosticId: string;
  requestId: string;
  component: DiagnosticComponent;
  stage: DiagnosticStage;
  level: DiagnosticLevel;
  event: string;
  errorCode: string | null;
  message: string | null;
  durationMs: number | null;
  metadata: Record<string, unknown> | null;
};

export type DiagnosticClientPayload = {
  diagnosticId: string;
  component: DiagnosticComponent;
  stage: DiagnosticStage;
  errorCode: string;
  timestamp: string;
  provider?: string;
  httpStatus?: number;
  providerErrorType?: string;
  providerRequestId?: string;
  safeMessage?: string;
  model?: string;
};

