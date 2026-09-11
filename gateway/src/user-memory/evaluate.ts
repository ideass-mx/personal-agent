/**
 * Evaluación de candidatos: el LLM propone; el subsystem decide.
 */
import { classifyCandidate, classifyMemoryText } from "./classify.ts";
import type {
  EvaluateResult,
  MemoryCandidate,
  MemoryCategory,
  MemoryType,
  UserMemory,
} from "./types.ts";

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .split(/[^a-z0-9áéíóúñü]+/i)
      .filter((w) => w.length > 2),
  );
}

/** Similitud Jaccard simple para deduplicación. */
export function contentSimilarity(a: string, b: string): number {
  const A = tokenize(a);
  const B = tokenize(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

function sameTopicConflict(
  a: string,
  b: string,
  category: MemoryCategory,
): boolean {
  if (category !== "PREFERENCES" && category !== "GOALS") {
    return contentSimilarity(a, b) >= 0.45;
  }
  // Preferencias contradictorias sobre el mismo eje (conciso vs largo)
  const na = a.toLowerCase();
  const nb = b.toLowerCase();
  const concise =
    /\b(concis\w*|breves?|direct\w*|short|minimal)\b/.test(na) ||
    /\b(concis\w*|breves?|direct\w*|short|minimal)\b/.test(nb);
  const long =
    /\b(larg\w*|detailed|detallad\w*|verbose|extens\w*)\b/.test(na) ||
    /\b(larg\w*|detailed|detallad\w*|verbose|extens\w*)\b/.test(nb);
  if (concise && long && category === "PREFERENCES") return true;
  return contentSimilarity(a, b) >= 0.4;
}

const TYPE_AUTHORITY: Record<MemoryType, number> = {
  EXPLICIT: 5,
  IMPORTED: 4,
  PROJECT_DERIVED: 3,
  OBSERVED: 2,
  INFERRED: 1,
};

function enrichCandidate(
  candidate: MemoryCandidate,
  category: MemoryCategory,
): Required<Pick<MemoryCandidate, "content" | "category" | "type" | "scope">> &
  MemoryCandidate {
  const type = candidate.type ?? "EXPLICIT";
  const scope =
    candidate.scope ??
    (candidate.projectId && !candidate.fromProjectKnowledge
      ? "PROJECT"
      : "GLOBAL");
  return {
    ...candidate,
    content: candidate.content.trim(),
    category,
    type,
    scope,
    importance: clamp01(candidate.importance ?? 0.6),
    confidence: clamp01(
      candidate.confidence ?? (type === "EXPLICIT" ? 0.85 : 0.55),
    ),
  };
}

/**
 * Evalúa un candidato contra memorias activas existentes.
 * No persiste; el caller aplica el outcome.
 */
export function evaluateMemoryCandidate(
  candidate: MemoryCandidate,
  active: readonly UserMemory[],
): EvaluateResult {
  const classified = classifyCandidate(candidate);

  if (classified.kind === "agent_rule") {
    return {
      outcome: "ROUTE_TO_AGENT_RULE",
      content: candidate.content.trim(),
      reason: "Es una regla de comportamiento del agente, no una memoria.",
    };
  }
  if (classified.kind === "ephemeral") {
    return {
      outcome: "IGNORE",
      reason: "Información momentánea; no merece memoria permanente.",
    };
  }
  if (classified.kind === "project_knowledge") {
    return {
      outcome: "IGNORE",
      reason:
        "Pertenece a Project Knowledge; no se promueve automáticamente a Memory global.",
    };
  }
  if (classified.kind === "unknown") {
    // Solo CREATE si el usuario lo pidió explícitamente (source manual) o confidence alta
    if (
      candidate.sourceType === "user_manual" ||
      candidate.sourceType === "explicit_remember"
    ) {
      return {
        outcome: "CREATE",
        candidate: enrichCandidate(candidate, "IMPORTANT_INFORMATION"),
        reason: "El usuario pidió recordar esto explícitamente.",
      };
    }
    return {
      outcome: "IGNORE",
      reason: "Evidencia insuficiente para una memoria permanente.",
    };
  }

  const enriched = enrichCandidate(candidate, classified.category);

  // Intereses/hábitos observados: exigir confianza o repetición
  if (
    (enriched.category === "INTERESTS" || enriched.category === "HABITS") &&
    (enriched.type === "INFERRED" || enriched.type === "OBSERVED") &&
    (enriched.confidence ?? 0) < 0.65
  ) {
    return {
      outcome: "IGNORE",
      reason:
        "Interés/hábito débil: se necesita más evidencia antes de persistir.",
    };
  }

  const sameCategory = active.filter(
    (m) =>
      m.status === "ACTIVE" &&
      m.category === enriched.category &&
      m.scope === enriched.scope &&
      (m.projectId ?? null) === (enriched.projectId ?? null),
  );

  let best: UserMemory | null = null;
  let bestSim = 0;
  for (const m of sameCategory) {
    const sim = contentSimilarity(m.content, enriched.content);
    if (sim > bestSim) {
      bestSim = sim;
      best = m;
    }
  }

  if (best && bestSim >= 0.85) {
    // Duplicado casi exacto → MERGE (subir confidence)
    return {
      outcome: "MERGE",
      targetId: best.id,
      candidate: enriched,
      reason: "Memoria duplicada; se refuerza la confianza.",
    };
  }

  if (best && sameTopicConflict(best.content, enriched.content, enriched.category)) {
    const newAuth = TYPE_AUTHORITY[enriched.type ?? "INFERRED"];
    const oldAuth = TYPE_AUTHORITY[best.type];
    if (newAuth >= oldAuth) {
      return {
        outcome: "SUPERSEDE",
        targetId: best.id,
        candidate: enriched,
        reason: "Nueva evidencia contradice o reemplaza la memoria anterior.",
      };
    }
    return {
      outcome: "IGNORE",
      reason: "La memoria existente tiene más autoridad que la nueva evidencia.",
    };
  }

  if (best && bestSim >= 0.55) {
    return {
      outcome: "UPDATE",
      targetId: best.id,
      candidate: enriched,
      reason: "Actualiza una memoria relacionada existente.",
    };
  }

  if (
    enriched.type === "PROJECT_DERIVED" &&
    enriched.scope === "GLOBAL"
  ) {
    return {
      outcome: "PROMOTE_TO_GLOBAL",
      candidate: enriched,
      reason: "Hecho durable del usuario promovido desde un proyecto.",
    };
  }

  return {
    outcome: "CREATE",
    candidate: enriched,
    reason: "Nuevo hecho durable sobre el usuario.",
  };
}

/** Atajo: clasifica + evalúa un enunciado suelto. */
export function evaluateUtterance(
  text: string,
  active: readonly UserMemory[],
  opts?: Partial<MemoryCandidate>,
): EvaluateResult {
  const classified = classifyMemoryText(text, {
    fromProjectKnowledge: opts?.fromProjectKnowledge,
    projectId: opts?.projectId,
  });
  if (classified.kind === "memory") {
    return evaluateMemoryCandidate(
      { content: text, category: classified.category, ...opts },
      active,
    );
  }
  return evaluateMemoryCandidate({ content: text, ...opts }, active);
}
