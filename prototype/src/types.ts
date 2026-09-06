/** Contrato Structured UI — el agente emite bloques semánticos, no HTML. */

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

export type ChartSeries = {
  name: string;
  values: number[];
  color?: string;
};

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

/** Navegación: sustantivos que el usuario posee. */
export type ScreenId =
  | "agent"
  | "conversations"
  | "conversation"
  | "projects"
  | "project"
  | "tasks"
  | "automations"
  | "library"
  | "settings";

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

export type Project = {
  id: string;
  name: string;
  description: string;
  instructions?: string;
  progress: number;
  capabilities: CapabilityId[];
  updatedAt: string;
};

export type Conversation = {
  id: string;
  title: string;
  projectId: string | null;
  preview: string;
  updatedAt: string;
};

export type ChatRole = "user" | "agent";

export type ChatMessage = {
  id: string;
  conversationId: string;
  role: ChatRole;
  text?: string;
  blocks?: Block[];
  capability?: CapabilityId;
  createdAt: string;
};

export type TaskItem = {
  id: string;
  title: string;
  detail?: string;
  projectId: string | null;
  capability: CapabilityId;
  needsApproval: boolean;
  bucket: "today" | "week" | "none";
  done?: boolean;
};

export type AutomationRun = {
  id: string;
  at: string;
  status: "ok" | "error" | "skipped";
  summary: string;
};

export type Automation = {
  id: string;
  name: string;
  trigger: string;
  kind: string;
  capability: CapabilityId;
  projectId: string | null;
  enabled: boolean;
  runs: AutomationRun[];
};

export type MemoryItem = {
  id: string;
  text: string;
  scope: "personal" | "project";
  projectId?: string | null;
  createdAt: string;
};

export type Account = {
  name: string;
  email: string;
  plan: string;
  initials: string;
};

export type ThemeMode = "system" | "light" | "dark";

export type SettingsState = {
  profile: {
    name: string;
    about: string;
    preferences: string;
  };
  agent: {
    name: string;
    personality: string;
    style: "concise" | "balanced" | "detailed";
    detailLevel: "low" | "medium" | "high";
    initiative: "reactive" | "balanced" | "proactive";
    decisions: "ask" | "suggest" | "act";
    confirmations: boolean;
  };
  memory: {
    personal: boolean;
    projects: boolean;
  };
  capabilities: Record<
    Exclude<CapabilityId, "personal">,
    { enabled: boolean }
  >;
  notifications: {
    pendingTasks: boolean;
    approvals: boolean;
    automations: boolean;
    agentActivity: boolean;
    desktop: boolean;
    mobile: boolean;
  };
  appearance: {
    theme: ThemeMode;
    density: "comfortable" | "compact";
    animations: boolean;
    agentLook: "minimal" | "warm" | "sharp";
  };
  system: {
    startWithOs: boolean;
    runInBackground: boolean;
  };
};

export type AgentSpaceMode = "idle" | "working" | "results";

export type NavState =
  | { screen: "agent"; capability: CapabilityId; mode: AgentSpaceMode }
  | { screen: "conversations" }
  | { screen: "conversation"; conversationId: string }
  | { screen: "projects" }
  | { screen: "project"; projectId: string; tab: ProjectTab }
  | { screen: "tasks" }
  | { screen: "automations" }
  | { screen: "library" }
  | { screen: "settings"; section: SettingsSectionId };

export type ProjectTab =
  | "summary"
  | "conversations"
  | "research"
  | "files"
  | "tasks"
  | "artifacts";

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
