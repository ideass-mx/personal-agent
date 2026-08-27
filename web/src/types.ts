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
