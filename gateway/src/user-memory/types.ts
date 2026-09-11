/**
 * Memoria personal de largo plazo — lo que el agente recuerda del usuario.
 * No es TurnMemory (historial), Project Knowledge, Tasks ni Agent Rules.
 */

export const MEMORY_CATEGORIES = [
  "PERSONAL",
  "PREFERENCES",
  "INTERESTS",
  "GOALS",
  "WORK_AND_PROJECTS",
  "PEOPLE_AND_RELATIONSHIPS",
  "HABITS",
  "IMPORTANT_INFORMATION",
] as const;

export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

export const MEMORY_TYPES = [
  "EXPLICIT",
  "INFERRED",
  "OBSERVED",
  "IMPORTED",
  "PROJECT_DERIVED",
] as const;

export type MemoryType = (typeof MEMORY_TYPES)[number];

export const MEMORY_SCOPES = [
  "GLOBAL",
  "PROJECT",
  "TASK",
  "CONVERSATION",
  "TEMPORARY",
] as const;

export type MemoryScope = (typeof MEMORY_SCOPES)[number];

export const MEMORY_STATUSES = [
  "ACTIVE",
  "SUPERSEDED",
  "ARCHIVED",
  "DELETED",
] as const;

export type MemoryStatus = (typeof MEMORY_STATUSES)[number];

export type UserMemory = {
  readonly id: string;
  readonly userId: string;
  readonly category: MemoryCategory;
  readonly type: MemoryType;
  readonly scope: MemoryScope;
  readonly content: string;
  readonly importance: number;
  readonly confidence: number;
  readonly sourceType: string | null;
  readonly sourceId: string | null;
  /** Explicación humana del origen (no detalles de implementación). */
  readonly sourceReason: string | null;
  readonly status: MemoryStatus;
  readonly projectId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastAccessedAt: string | null;
  readonly expiresAt: string | null;
  readonly supersededBy: string | null;
};

export type MemoryCandidate = {
  readonly content: string;
  readonly category?: MemoryCategory;
  readonly type?: MemoryType;
  readonly scope?: MemoryScope;
  readonly importance?: number;
  readonly confidence?: number;
  readonly sourceType?: string;
  readonly sourceId?: string;
  readonly sourceReason?: string;
  readonly projectId?: string | null;
  /** Si el texto proviene de Project Knowledge (no promover automáticamente). */
  readonly fromProjectKnowledge?: boolean;
};

export type EvaluateOutcome =
  | "IGNORE"
  | "CREATE"
  | "UPDATE"
  | "MERGE"
  | "SUPERSEDE"
  | "PROMOTE_TO_GLOBAL"
  | "ROUTE_TO_AGENT_RULE";

export type EvaluateResult =
  | { readonly outcome: "IGNORE"; readonly reason: string }
  | {
      readonly outcome: "CREATE";
      readonly candidate: Required<
        Pick<MemoryCandidate, "content" | "category" | "type" | "scope">
      > &
        MemoryCandidate;
      readonly reason: string;
    }
  | {
      readonly outcome: "UPDATE" | "MERGE" | "SUPERSEDE";
      readonly targetId: string;
      readonly candidate: Required<
        Pick<MemoryCandidate, "content" | "category" | "type" | "scope">
      > &
        MemoryCandidate;
      readonly reason: string;
    }
  | {
      readonly outcome: "PROMOTE_TO_GLOBAL";
      readonly candidate: Required<
        Pick<MemoryCandidate, "content" | "category" | "type" | "scope">
      > &
        MemoryCandidate;
      readonly reason: string;
    }
  | {
      readonly outcome: "ROUTE_TO_AGENT_RULE";
      readonly content: string;
      readonly reason: string;
    };

/** Etiquetas UI (español). */
export const MEMORY_CATEGORY_LABELS: Record<MemoryCategory, string> = {
  PERSONAL: "Personal",
  PREFERENCES: "Preferencias",
  INTERESTS: "Intereses",
  GOALS: "Objetivos",
  WORK_AND_PROJECTS: "Trabajo y proyectos",
  PEOPLE_AND_RELATIONSHIPS: "Personas y relaciones",
  HABITS: "Hábitos",
  IMPORTANT_INFORMATION: "Información importante",
};

/** Mapeo de scopes legacy del prototipo companion. */
export function mapLegacyScope(
  scope: "personal" | "project",
): MemoryScope {
  return scope === "project" ? "PROJECT" : "GLOBAL";
}
