/**
 * Pipeline: Conversation → Extraction (candidates) → Evaluation → Store.
 * El LLM no escribe directo; propone candidatos.
 */
import { applyEvaluateResult, type ApplyResult } from "./apply.ts";
import { evaluateMemoryCandidate } from "./evaluate.ts";
import { listUserMemories } from "./store.ts";
import type { MemoryCandidate, UserMemory } from "./types.ts";

export function processMemoryCandidates(
  userId: string,
  candidates: readonly MemoryCandidate[],
): ApplyResult[] {
  const active = listUserMemories({ userId, status: "ACTIVE" });
  const results: ApplyResult[] = [];
  // Copia mutable para que SUPERSEDE/CREATE afecten evaluaciones siguientes
  const working: UserMemory[] = [...active];

  for (const candidate of candidates) {
    const evaluated = evaluateMemoryCandidate(candidate, working);
    const applied = applyEvaluateResult(userId, evaluated);
    results.push(applied);
    if (applied.applied && applied.memory) {
      if (
        evaluated.outcome === "SUPERSEDE" &&
        "targetId" in evaluated
      ) {
        const idx = working.findIndex((m) => m.id === evaluated.targetId);
        if (idx >= 0) working.splice(idx, 1);
      }
      if (
        evaluated.outcome === "UPDATE" ||
        evaluated.outcome === "MERGE"
      ) {
        const idx = working.findIndex((m) => m.id === applied.memory!.id);
        if (idx >= 0) working[idx] = applied.memory;
        else working.push(applied.memory);
      } else if (
        evaluated.outcome === "CREATE" ||
        evaluated.outcome === "PROMOTE_TO_GLOBAL" ||
        evaluated.outcome === "SUPERSEDE"
      ) {
        working.push(applied.memory);
      }
    }
  }
  return results;
}

/**
 * Evaluación de promoción Project Knowledge → Global Memory.
 * No automática: solo si el candidato parece hecho durable del usuario.
 */
export function evaluateProjectPromotion(
  userId: string,
  content: string,
  projectId: string,
): ApplyResult {
  return processMemoryCandidates(userId, [
    {
      content,
      type: "PROJECT_DERIVED",
      scope: "GLOBAL",
      projectId,
      fromProjectKnowledge: false,
      sourceType: "project",
      sourceId: projectId,
      sourceReason: "Promovido desde un proyecto por ser un hecho durable del usuario.",
      confidence: 0.7,
    },
  ])[0]!;
}
