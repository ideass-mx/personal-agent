/**
 * Modelo companion (prototipo UX) — un chat, muchos espacios.
 * Español en copy; inglés en identificadores.
 */

export type CompanionRole = "user" | "agent";

export type IntentRoute = "action" | "task" | "project" | "chat";

export type WorkspaceKind =
  | "Book"
  | "Paper"
  | "Finance"
  | "Software"
  | "Legal"
  | "Travel"
  | "Generic";

export type WorkspaceStatus = "live" | "wait" | "idle";

export type TaskOwner = "agent" | "you";

export type TaskState =
  | "doing"
  | "queued"
  | "needs-you"
  | "todo"
  | "watching"
  | "done";

export type PromoteCard = {
  kind: "promote";
  topicId: string;
  label: string;
  reason?: string;
  reoffer?: boolean;
};

export type AttentionCard = {
  kind: "attention";
  title: string;
  body: string;
  primaryLabel: string;
  secondaryLabel?: string;
  primaryAction: string;
  secondaryAction?: string;
};

export type CompanionAction = {
  label: string;
  kind:
    | "open"
    | "project"
    | "tasks"
    | "reply"
    | "toast"
    | "create-trip"
    | "reject-trip"
    | "approve"
    | "dismiss";
  target?: string;
};

export type CompanionMessage = {
  id: string;
  threadId: string;
  role: CompanionRole;
  text?: string;
  card?: AttentionCard | PromoteCard;
  action?: CompanionAction;
  createdAt: number;
};

export type CompanionThread = {
  id: string;
  type: "main" | "workspace";
  workspaceId?: string;
};

export type CompanionWorkspace = {
  id: string;
  kind: WorkspaceKind;
  name: string;
  objective: string;
  sections: string[];
  status: WorkspaceStatus;
  progress: number;
  threadId: string;
  liveSections?: Record<string, "live" | "wait" | "done">;
  whileAway?: string[];
  nextSteps?: string[];
  needsDecision?: string;
};

export type CompanionTask = {
  id: string;
  title: string;
  owner: TaskOwner;
  state: TaskState;
  projectId?: string;
  note?: string;
  when?: string;
  pct?: number;
  due?: boolean;
};

/** Señal — apunta; no almacena el mensaje. */
export type CompanionSignal = {
  id: string;
  text: string;
  where: string;
  target: string;
  createdAt: number;
  seen: boolean;
};

export type MemoryCategory =
  | "PERSONAL"
  | "PREFERENCES"
  | "INTERESTS"
  | "GOALS"
  | "WORK_AND_PROJECTS"
  | "PEOPLE_AND_RELATIONSHIPS"
  | "HABITS"
  | "IMPORTANT_INFORMATION";

export type MemoryType =
  | "EXPLICIT"
  | "INFERRED"
  | "OBSERVED"
  | "IMPORTED"
  | "PROJECT_DERIVED";

export type MemoryScope =
  | "GLOBAL"
  | "PROJECT"
  | "TASK"
  | "CONVERSATION"
  | "TEMPORARY";

export type MemoryStatus = "ACTIVE" | "SUPERSEDED" | "ARCHIVED" | "DELETED";

/** Lo que el agente recuerda del usuario (no historial ni reglas). */
export type MemoryEntry = {
  id: string;
  category: MemoryCategory;
  type: MemoryType;
  scope: MemoryScope;
  content: string;
  importance: number;
  confidence: number;
  sourceType?: string;
  sourceId?: string;
  sourceReason?: string;
  status: MemoryStatus;
  projectId?: string;
  createdAt: number;
  updatedAt: number;
  /** Importante: flota al inicio del grupo. */
  pin?: boolean;
  /** @deprecated usar scope GLOBAL/PROJECT — compat lectura */
  legacyScope?: "personal" | "project";
};

export type PromoteState = {
  topicId: string;
  label: string;
  mentions: number;
  rejected: boolean;
  reoffered: boolean;
  workspaceId: string | null;
  /** Notas reunidas en la línea principal (memoria transversal). */
  notes: string[];
};

export type ToastItem = {
  id: string;
  text: string;
  target?: string;
  createdAt: number;
};

export type CompanionFile = {
  id: string;
  name: string;
  kind: string;
  projectId?: string | null;
  byAgent: boolean;
  updatedAt: number;
};

export type ActivityEvent = {
  id: string;
  title: string;
  detail?: string;
  at: number;
  projectId?: string;
};

export const MAIN_THREAD_ID = "main";

export function sectionsForKind(kind: WorkspaceKind): string[] {
  switch (kind) {
    case "Book":
      return [
        "Concepto",
        "Investigación",
        "Esquema",
        "Capítulos",
        "Manuscrito",
        "Revisión",
      ];
    case "Paper":
      return [
        "Investigación",
        "Fuentes",
        "Metodología",
        "Dataset",
        "Análisis",
        "Manuscrito",
      ];
    case "Finance":
      return [
        "Tesis",
        "Datos de mercado",
        "Investigación",
        "Modelos",
        "Riesgo",
        "Reportes",
      ];
    case "Software":
      return ["Requisitos", "Arquitectura", "Código", "Tests", "Deploy"];
    case "Legal":
      return ["Casos", "Leyes", "Regulaciones", "Análisis", "Reporte"];
    case "Travel":
      return [
        "Fechas",
        "Vuelos",
        "Alojamiento",
        "Itinerario",
        "Presupuesto",
        "Reservas",
      ];
    default:
      return ["Investigación", "Notas", "Trabajo", "Revisión"];
  }
}

export function kindLabel(kind: WorkspaceKind): string {
  switch (kind) {
    case "Book":
      return "Libro";
    case "Paper":
      return "Artículo científico";
    case "Finance":
      return "Finanzas";
    case "Software":
      return "Software";
    case "Legal":
      return "Investigación legal";
    case "Travel":
      return "Viaje";
    default:
      return "Proyecto";
  }
}
