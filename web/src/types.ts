export type NavId =
  | "overview"
  | "chat"
  | "conversations"
  | "capabilities"
  | "workspace"
  | "connections"
  | "settings"
  | "diagnostics";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  streaming?: boolean;
};

export type ConfirmPending = {
  confirmationId: string;
  toolCallId: string;
  toolName: string;
  input: unknown;
  conversationId: string;
  receivedAtMs: number;
};

export type HealthSnapshot = {
  ok: boolean;
  name?: string;
  devices: string[];
  agentReady: boolean;
  agentTools: string[];
  nodeStatus?: string;
  version?: string;
  build?: string;
  commit?: string;
  platform?: string;
  architecture?: string;
  builtAt?: string;
};

export type DiagnosticInfo = {
  diagnosticId: string;
  component: string;
  stage: string;
  errorCode: string;
  timestamp: string;
  provider?: string;
  httpStatus?: number;
};

export type DiagnosticEventRow = {
  timestamp: string;
  diagnosticId: string;
  requestId: string;
  component: string;
  stage: string;
  level: string;
  event: string;
  errorCode: string | null;
  message: string | null;
  durationMs: number | null;
  metadata: Record<string, unknown> | null;
};

export type ConversationMeta = {
  id: string;
  title: string | null;
  createdAt: string;
  workspaceId: string | null;
};

export type ConnectionConfig = {
  /** HTTP origin, e.g. http://192.168.1.10:8787 — empty = same origin */
  httpBase: string;
  token: string;
  deviceId: string;
  deviceName: string;
};

/** Product setup status from Gateway GET /v1/setup/status */
export type SetupStatusDto = {
  ok: true;
  state: string;
  installationReady: boolean;
  llmConfigured: boolean;
  verified: boolean;
  onboardingCompleted: boolean;
  llmProvider: string | null;
  lastError: { code: string; message: string } | null;
  updatedAt: string;
};
