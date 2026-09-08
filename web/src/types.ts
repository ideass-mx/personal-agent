/** Navegación: sustantivos que el usuario posee (no capacidades). */
export type NavId =
  | "conversation"
  | "conversations"
  | "projects"
  | "tasks"
  | "automations"
  | "library"
  | "settings"
  | "diagnostics";

export type SettingsSectionId =
  | "profile"
  | "my-agent"
  | "memory"
  | "capabilities"
  | "connections"
  | "privacy"
  | "notifications"
  | "appearance"
  | "system";

/** Capacidades del mismo Personal Agent (no son apps ni navegación). */
export type CapabilityId =
  | "personal"
  | "research"
  | "trading"
  | "office"
  | "computer";

export type AgentStatus =
  | "listening"
  | "understanding"
  | "searching"
  | "analyzing"
  | "needs_approval"
  | "ready"
  | "error"
  | "idle"
  | "paused";

export const CAPABILITY_LABELS: Record<CapabilityId, string> = {
  personal: "Personal",
  research: "Research",
  trading: "Trading",
  office: "Office",
  computer: "Computer",
};

export const AGENT_STATUS_LABELS: Record<AgentStatus, string> = {
  listening: "Escuchando",
  understanding: "Entendiendo",
  searching: "Buscando información",
  analyzing: "Analizando",
  needs_approval: "Necesito tu aprobación",
  ready: "Listo",
  error: "Algo salió mal",
  idle: "Inactivo",
  paused: "Pausado",
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  streaming?: boolean;
  /** Capacidad que respondió (UI); el protocolo aún no la envía. */
  capability?: CapabilityId;
  /** Fuentes Web Intelligence de esta respuesta (PHASE 60.15.1). */
  sources?: import("./sources/types").AgentSource[];
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
  providerErrorType?: string;
  providerRequestId?: string;
  safeMessage?: string;
  model?: string;
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
  summary?: string | null;
  createdAt: string;
  updatedAt?: string;
  workspaceId: string | null;
  /** PHASE 58.5 — fijada en sidebar; default false si el JSON no la trae. */
  pinned?: boolean;
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

export type WorkspaceRow = {
  id: string;
  name: string;
  description: string | null;
};

/* —— Structured UI (contrato de render; el agente no emite HTML) —— */

export type ChartKind = "area" | "bars" | "donut";

export type TextBlock = {
  type: "text";
  id?: string;
  text: string;
  tone?: "default" | "muted" | "agent";
};

export type StateBlock = {
  type: "state";
  id?: string;
  status: AgentStatus;
  label: string;
  detail?: string;
};

export type StatBlock = {
  type: "stat";
  id?: string;
  label: string;
  value: string;
  delta?: string;
  trend?: "up" | "down" | "flat";
};

export type StatGroupBlock = {
  type: "statGroup";
  id?: string;
  stats: StatBlock[];
};

export type ListBlock = {
  type: "list";
  id?: string;
  title?: string;
  ordered?: boolean;
  items: Array<{ id?: string; text: string; meta?: string }>;
};

export type CardItem = {
  id: string;
  title: string;
  subtitle?: string;
  body?: string;
  badge?: string;
  capability?: CapabilityId;
  meta?: string;
};

export type CardsBlock = {
  type: "cards";
  id?: string;
  title?: string;
  cards: CardItem[];
};

export type TableBlock = {
  type: "table";
  id?: string;
  title?: string;
  columns: string[];
  rows: string[][];
};

export type ChartSeries = { name: string; values: number[]; color?: string };

export type ChartBlock = {
  type: "chart";
  id?: string;
  title?: string;
  kind: ChartKind;
  labels?: string[];
  series: ChartSeries[];
  unit?: string;
};

export type ProgressBlock = {
  type: "progress";
  id?: string;
  label: string;
  value: number;
  max?: number;
  detail?: string;
};

export type TimelineItem = {
  id: string;
  title: string;
  detail?: string;
  status: "done" | "active" | "pending";
  at?: string;
};

export type TimelineBlock = {
  type: "timeline";
  id?: string;
  title?: string;
  items: TimelineItem[];
};

export type ComparisonBlock = {
  type: "comparison";
  id?: string;
  title?: string;
  left: { title: string; points: string[] };
  right: { title: string; points: string[] };
};

export type ApprovalBlock = {
  type: "approval";
  id: string;
  title: string;
  summary: string;
  risk?: "low" | "medium" | "high";
  capability?: CapabilityId;
};

export type ConfirmationBlock = {
  type: "confirmation";
  id: string;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

export type FileItem = {
  id: string;
  name: string;
  kind: string;
  size?: string;
  projectId?: string | null;
  origin?: CapabilityId;
  updatedAt?: string;
};

export type FilesBlock = {
  type: "files";
  id?: string;
  title?: string;
  files: FileItem[];
};

export type ArtifactBlock = {
  type: "artifact";
  id: string;
  title: string;
  kind: string;
  preview?: string;
  capability?: CapabilityId;
};

export type SuggestionBlock = {
  type: "suggestion";
  id: string;
  title: string;
  body: string;
  actionLabel: string;
  kind?: "project" | "task" | "generic";
};

export type CardBlock = {
  type: "card";
  id?: string;
  title: string;
  body?: string;
  footer?: string;
  capability?: CapabilityId;
};

export type Block =
  | TextBlock
  | StateBlock
  | StatBlock
  | StatGroupBlock
  | ListBlock
  | CardsBlock
  | TableBlock
  | ChartBlock
  | ProgressBlock
  | TimelineBlock
  | ComparisonBlock
  | ApprovalBlock
  | ConfirmationBlock
  | FilesBlock
  | ArtifactBlock
  | SuggestionBlock
  | CardBlock;
