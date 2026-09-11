/**
 * Helpers de UI para Memory (lentes categoría / recientes).
 */
import type { MemoryCategory, MemoryEntry, MemoryType } from "../types";
import { classifyMemoryText } from "./classifyMemory";

export const MEMORY_UI_CATEGORIES: MemoryCategory[] = [
  "PERSONAL",
  "PREFERENCES",
  "INTERESTS",
  "GOALS",
  "WORK_AND_PROJECTS",
  "PEOPLE_AND_RELATIONSHIPS",
  "HABITS",
  "IMPORTANT_INFORMATION",
];

/** Etiquetas cortas para pills / encabezados (español de producto). */
export const MEMORY_UI_LABELS: Record<MemoryCategory, string> = {
  PERSONAL: "Personal",
  PREFERENCES: "Preferencias",
  INTERESTS: "Intereses",
  GOALS: "Objetivos",
  WORK_AND_PROJECTS: "Trabajo y proyectos",
  PEOPLE_AND_RELATIONSHIPS: "Personas",
  HABITS: "Hábitos",
  IMPORTANT_INFORMATION: "Información importante",
};

export type MemorySrc = "told" | "chat" | "project" | "activity";

export type MemoryConfUi = "high" | "medium" | "inferred";

export type TimeBucket = "Today" | "This week" | "This month" | "Earlier";

export const TIME_BUCKET_LABELS: Record<TimeBucket, string> = {
  Today: "Hoy",
  "This week": "Esta semana",
  "This month": "Este mes",
  Earlier: "Antes",
};

export const TIME_BUCKET_ORDER: TimeBucket[] = [
  "Today",
  "This week",
  "This month",
  "Earlier",
];

export const NEW_MS = 4 * 24 * 3600 * 1000;

export function isNewMemory(at: number, now = Date.now()): boolean {
  return now - at < NEW_MS;
}

export function memorySrc(m: MemoryEntry): MemorySrc {
  const t = (m.sourceType || "").toLowerCase();
  if (t === "user_manual" || t === "explicit_remember" || t === "told") {
    return "told";
  }
  if (t === "project" || t === "project_derived" || m.type === "PROJECT_DERIVED") {
    return "project";
  }
  if (t === "activity" || t === "observed") return "activity";
  if (t === "conversation" || t === "chat" || t === "inferred") return "chat";
  if (m.scope === "PROJECT" || m.projectId) return "project";
  return "chat";
}

export function memoryConfUi(m: MemoryEntry): MemoryConfUi {
  if (m.type === "EXPLICIT" || m.sourceType === "user_manual") return "high";
  if (m.type === "INFERRED" || m.type === "OBSERVED") return "inferred";
  if (m.confidence < 0.65) return "medium";
  if (m.confidence < 0.85) return "medium";
  return "high";
}

export function relTime(t: number, now = Date.now()): string {
  const sec = Math.max(0, Math.floor((now - t) / 1000));
  if (sec < 45) return "ahora mismo";
  const min = Math.floor(sec / 60);
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "ayer";
  if (d < 7) return `hace ${d} días`;
  const w = Math.floor(d / 7);
  if (w < 5) return `hace ${w} sem.`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `hace ${mo} mes${mo === 1 ? "" : "es"}`;
  const y = Math.floor(d / 365);
  return `hace ${y} año${y === 1 ? "" : "s"}`;
}

export function timeBucket(t: number, now = Date.now()): TimeBucket {
  const d = (now - t) / 86400000;
  if (d < 1) return "Today";
  if (d < 7) return "This week";
  if (d < 31) return "This month";
  return "Earlier";
}

export function inferMemoryCategory(text: string): MemoryCategory {
  const c = classifyMemoryText(text);
  if (c.kind === "memory") return c.category;
  return "IMPORTANT_INFORMATION";
}

export function sortMemoryRows(rows: MemoryEntry[]): MemoryEntry[] {
  return [...rows].sort(
    (a, b) =>
      (b.pin ? 1 : 0) - (a.pin ? 1 : 0) ||
      b.createdAt - a.createdAt,
  );
}

export function srcLabel(src: MemorySrc): string {
  switch (src) {
    case "told":
      return "Tú me lo dijiste";
    case "chat":
      return "De un chat";
    case "project":
      return "De tus proyectos";
    case "activity":
      return "De tu actividad";
  }
}

export function typeForManualAdd(): MemoryType {
  return "EXPLICIT";
}
