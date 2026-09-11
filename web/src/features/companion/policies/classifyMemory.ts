/**
 * Clasificación local del prototipo companion (espejo conservador del Gateway).
 * La fuente de verdad de persistencia es gateway/src/user-memory/.
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

export type ClassifyKind =
  | { kind: "memory"; category: MemoryCategory }
  | { kind: "agent_rule" }
  | { kind: "project_knowledge" }
  | { kind: "ephemeral" }
  | { kind: "unknown" };

function norm(text: string): string {
  return text.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

export function looksLikeAgentRule(text: string): boolean {
  const t = norm(text);
  if (
    /\b(siempre|never|nunca|always)\b/.test(t) &&
    /\b(pregunta|ask|confirma|confirm|permiso|permission)\b/.test(t)
  ) {
    return true;
  }
  if (
    /\b(antes de|before)\b/.test(t) &&
    /\b(pagar|payment|payments|enviar|send|borrar|delete|eliminar)\b/.test(t)
  ) {
    return true;
  }
  if (
    /\b(ask me before|pregunta(me)? antes|pide confirmacion|pedir confirmacion)\b/.test(
      t,
    )
  ) {
    return true;
  }
  if (
    /\b(nunca|never)\b/.test(t) &&
    /\b(borr|delet|envi|send|pag)\b/.test(t) &&
    /\b(sin|without|confirm)\b/.test(t)
  ) {
    return true;
  }
  return false;
}

export function classifyMemoryText(text: string): ClassifyKind {
  const raw = text.trim();
  if (!raw) return { kind: "ephemeral" };
  if (looksLikeAgentRule(raw)) return { kind: "agent_rule" };
  const t = norm(raw);

  if (
    /\b(hoy|today)\b/.test(t) &&
    /\b(cansad|tired)\b/.test(t)
  ) {
    return { kind: "ephemeral" };
  }
  if (/^(estoy|i'?m|i am)\s+(cansad|tired)\b/.test(t)) {
    return { kind: "ephemeral" };
  }
  if (
    /\b(difference[- ]in[- ]differences|this paper uses|este paper)\b/.test(t)
  ) {
    return { kind: "project_knowledge" };
  }

  if (
    /\b(prefiero|prefer)\b/.test(t) ||
    (/\b(concis|breve|direct)\b/.test(t) &&
      /\b(respuesta|answer|explanation|explicacion)\b/.test(t))
  ) {
    return { kind: "memory", category: "PREFERENCES" };
  }
  if (
    /\b(me interesa|interesad|i'?m interested|i am interested)\b/.test(t)
  ) {
    return { kind: "memory", category: "INTERESTS" };
  }
  if (
    /\b(quiero|want to|i want)\b/.test(t) &&
    /\b(publicar|publish|libro|book|escribir|write|aprender|learn|become)\b/.test(
      t,
    )
  ) {
    return { kind: "memory", category: "GOALS" };
  }
  if (
    /\b(es mi|is my)\b/.test(t) &&
    /\b(socio|partner|colega|colleague|cliente|client)\b/.test(t)
  ) {
    return { kind: "memory", category: "PEOPLE_AND_RELATIONSHIPS" };
  }
  if (
    /\b(usualmente|usually|suel[eo]|regularmente)\b/.test(t) &&
    /\b(trabajo|work|noche|late)\b/.test(t)
  ) {
    return { kind: "memory", category: "HABITS" };
  }
  if (/\b(trabajo como|i work as)\b/.test(t)) {
    return { kind: "memory", category: "PERSONAL" };
  }
  if (/\b(estoy construyendo|i'?m building|i am building|trabajo en)\b/.test(t)) {
    return { kind: "memory", category: "WORK_AND_PROJECTS" };
  }
  if (
    /\b(se paga|is paid|cada mes|every month|mensual|monthly)\b/.test(t)
  ) {
    return { kind: "memory", category: "IMPORTANT_INFORMATION" };
  }
  return { kind: "unknown" };
}
