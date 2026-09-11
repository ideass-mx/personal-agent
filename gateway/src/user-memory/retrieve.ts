/**
 * Recuperación jerárquica de memorias relevantes (filtros antes de semántica).
 * No carga toda la memoria en cada turno.
 */
import { listUserMemories } from "./store.ts";
import { contentSimilarity } from "./evaluate.ts";
import type { MemoryCategory, MemoryScope, UserMemory } from "./types.ts";
import { updateUserMemory } from "./store.ts";

export type RetrieveOpts = {
  userId: string;
  query: string;
  projectId?: string | null;
  categories?: readonly MemoryCategory[];
  scopes?: readonly MemoryScope[];
  minImportance?: number;
  minConfidence?: number;
  limit?: number;
  /** Prioridad fuerte al proyecto actual. */
  preferProject?: boolean;
};

/**
 * 1) Filtra por scope/categoría/proyecto/umbral
 * 2) Ordena por solapamiento léxico + importancia + confianza + recencia
 */
export function retrieveRelevantMemories(opts: RetrieveOpts): UserMemory[] {
  const limit = opts.limit ?? 8;
  const scopes = opts.scopes ?? (["GLOBAL", "PROJECT"] as MemoryScope[]);
  const all: UserMemory[] = [];

  for (const scope of scopes) {
    const chunk = listUserMemories({
      userId: opts.userId,
      status: "ACTIVE",
      scope,
      projectId:
        scope === "PROJECT"
          ? opts.projectId ?? undefined
          : scope === "GLOBAL"
            ? null
            : undefined,
    });
    all.push(...chunk);
  }

  // GLOBAL siempre; PROJECT solo del proyecto activo si se pidió
  let pool = all.filter((m) => {
    if (opts.categories && !opts.categories.includes(m.category)) return false;
    if (opts.minImportance !== undefined && m.importance < opts.minImportance) {
      return false;
    }
    if (opts.minConfidence !== undefined && m.confidence < opts.minConfidence) {
      return false;
    }
    if (m.scope === "PROJECT") {
      if (!opts.projectId || m.projectId !== opts.projectId) return false;
    }
    return true;
  });

  const q = opts.query.trim();
  const scored = pool.map((m) => {
    const sim = q ? contentSimilarity(q, m.content) : 0.3;
    const recency =
      Date.parse(m.updatedAt || m.createdAt) / 1_000_000_000_000 || 0;
    const projectBoost =
      opts.preferProject &&
      opts.projectId &&
      m.scope === "PROJECT" &&
      m.projectId === opts.projectId
        ? 0.35
        : m.scope === "GLOBAL"
          ? 0.1
          : 0;
    const score =
      sim * 0.45 +
      m.importance * 0.2 +
      m.confidence * 0.15 +
      projectBoost +
      Math.min(0.1, recency);
    return { m, score, sim };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored.filter((s) => s.sim > 0.05 || !q).slice(0, limit);

  for (const { m } of top) {
    try {
      updateUserMemory(m.id, { touchAccessed: true });
    } catch {
      /* ignore */
    }
  }

  return top.map((s) => s.m);
}

/** Bloque breve para inyectar en el system prompt. */
export function formatMemoriesForContext(memories: readonly UserMemory[]): string {
  if (memories.length === 0) return "";
  const lines = memories.map((m) => `- [${m.category}] ${m.content}`);
  return [
    "Lo que recuerdas del usuario (úsalo con naturalidad; no lo lists como base de datos):",
    ...lines,
  ].join("\n");
}

/**
 * Orden conceptual del Context Builder (documentado / usable por el runtime).
 */
export function buildMemoryContextBlock(opts: RetrieveOpts): string {
  const memories = retrieveRelevantMemories({
    ...opts,
    preferProject: opts.preferProject ?? Boolean(opts.projectId),
    limit: opts.limit ?? 6,
  });
  return formatMemoriesForContext(memories);
}
