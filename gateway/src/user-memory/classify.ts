/**
 * Clasificación conservadora de candidatos a memoria.
 * El LLM puede proponer; este módulo decide la categoría o si no es memoria.
 */
import type { MemoryCandidate, MemoryCategory } from "./types.ts";

export type ClassifyKind =
  | { readonly kind: "memory"; readonly category: MemoryCategory }
  | { readonly kind: "agent_rule" }
  | { readonly kind: "project_knowledge" }
  | { readonly kind: "ephemeral" }
  | { readonly kind: "unknown" };

function norm(text: string): string {
  return text.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

/** Reglas / permisos de comportamiento del agente → Settings, no Memory. */
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

/** Estado momentáneo / no durable. */
export function looksEphemeral(text: string): boolean {
  const t = norm(text);
  if (
    /\b(hoy|today|ahora|right now|esta manana|esta tarde|esta noche)\b/.test(
      t,
    ) &&
    /\b(cansad|tired|agotad|hambrient|hungry|enferm|sick|ocupad|busy)\b/.test(
      t,
    )
  ) {
    return true;
  }
  if (/^(estoy|i'?m|i am)\s+(cansad|tired|bien|mal|ok|okay)\b/.test(t)) {
    return true;
  }
  if (t.length < 12 && /\b(ok|vale|gracias|thanks|hola|hi)\b/.test(t)) {
    return true;
  }
  return false;
}

/**
 * Hechos de proyecto / paper / método — pertenecen a Project Knowledge.
 * Solo cuando el contexto indica proyecto o el texto es claramente técnico de un artefacto.
 */
export function looksLikeProjectKnowledge(
  text: string,
  opts?: { fromProjectKnowledge?: boolean; projectId?: string | null },
): boolean {
  if (opts?.fromProjectKnowledge) return true;
  const t = norm(text);
  // Metodología / paper facts
  if (
    /\b(difference[- ]in[- ]differences|diff-in-diff|did estimator|peer-reviewed|manuscrito debe|citar fuentes)\b/.test(
      t,
    )
  ) {
    return true;
  }
  if (
    opts?.projectId &&
    /\b(este paper|this paper|el manuscrito|the manuscript|en este proyecto|in this project)\b/.test(
      t,
    )
  ) {
    return true;
  }
  return false;
}

function matchPreferences(t: string): boolean {
  return (
    /\b(prefiero|prefer|me gusta que|i like (my|the)?\s*(answers?|replies?|explanations?))\b/.test(
      t,
    ) ||
    /\b(concis|detailed|detallad|breve|verbose|direct)\b/.test(t) &&
      /\b(respuesta|answer|explanation|explicacion|estilo|style|tono|tone)\b/.test(
        t,
      )
  );
}

function matchInterests(t: string): boolean {
  return (
    /\b(me interesa|interesad[oa]|i'?m interested|i am interested|me apasiona)\b/.test(
      t,
    ) || /\b(interesad[oa] en)\b/.test(t)
  );
}

function matchGoals(t: string): boolean {
  return (
    /\b(quiero|want to|i want|aspire|aspir[oa]|objetivo|goal|meta)\b/.test(t) &&
    /\b(publicar|publish|escribir|write|libro|book|aprender|learn|convertirme|become|lanzar|build a company|empresa|trader)\b/.test(
      t,
    )
  );
}

function matchWork(t: string): boolean {
  return (
    /\b(estoy construyendo|i'?m building|i am building|trabajo en|i work on|desarrollo|developing)\b/.test(
      t,
    ) && !/\b(trabajo como|i work as)\b/.test(t)
  );
}

function matchPeople(t: string): boolean {
  return (
    /\b(es mi|is my|son mis)\b/.test(t) &&
    /\b(socio|partner|colega|colleague|cliente|client|hermano|hermana|advisor|asesor|contacto)\b/.test(
      t,
    )
  );
}

function matchHabits(t: string): boolean {
  return (
    /\b(usualmente|usually|suel[eo]|regularmente|regularly|siempre que|tends? to|tiende a)\b/.test(
      t,
    ) &&
    /\b(trabajo|work|reviso|review|organizo|organize|noche|late|fin de semana|weekend)\b/.test(
      t,
    )
  );
}

function matchPersonal(t: string): boolean {
  return (
    /\b(idiomas?|languages?|vivo en|i live|ciudad de)\b/.test(t) ||
    /\b(trabajo como|i work as|soy\s+\w*(architect|arquitecto|engineer|ingeniero|developer|desarrollador))\b/.test(
      t,
    )
  );
}

function matchImportant(t: string): boolean {
  return (
    /\b(se paga|is paid|pagad[oa]|cada mes|every month|mensual|monthly|recuerda que|remember that)\b/.test(
      t,
    ) || /\b(importante|important):\b/.test(t)
  );
}

/**
 * Clasifica un texto o candidato. No escribe en el store.
 */
export function classifyMemoryText(
  text: string,
  opts?: {
    fromProjectKnowledge?: boolean;
    projectId?: string | null;
    suggestedCategory?: MemoryCategory;
  },
): ClassifyKind {
  const raw = text.trim();
  if (!raw) return { kind: "ephemeral" };

  if (looksLikeAgentRule(raw)) return { kind: "agent_rule" };
  if (looksEphemeral(raw)) return { kind: "ephemeral" };
  if (
    looksLikeProjectKnowledge(raw, {
      fromProjectKnowledge: opts?.fromProjectKnowledge,
      projectId: opts?.projectId,
    })
  ) {
    return { kind: "project_knowledge" };
  }

  if (opts?.suggestedCategory) {
    return { kind: "memory", category: opts.suggestedCategory };
  }

  const t = norm(raw);

  if (matchPreferences(t)) return { kind: "memory", category: "PREFERENCES" };
  if (matchInterests(t)) return { kind: "memory", category: "INTERESTS" };
  if (matchGoals(t)) return { kind: "memory", category: "GOALS" };
  if (matchPeople(t)) {
    return { kind: "memory", category: "PEOPLE_AND_RELATIONSHIPS" };
  }
  if (matchHabits(t)) return { kind: "memory", category: "HABITS" };
  if (matchPersonal(t)) return { kind: "memory", category: "PERSONAL" };
  if (matchWork(t)) return { kind: "memory", category: "WORK_AND_PROJECTS" };
  if (matchImportant(t)) {
    return { kind: "memory", category: "IMPORTANT_INFORMATION" };
  }

  // Intereses / goals más cortos en inglés de los tests
  if (/\binterested in\b/.test(t) || /\bi'?m interested\b/.test(t)) {
    return { kind: "memory", category: "INTERESTS" };
  }
  if (/\bi want to (publish|write|become|learn)\b/.test(t)) {
    return { kind: "memory", category: "GOALS" };
  }
  if (/\bi'?m building\b/.test(t)) {
    return { kind: "memory", category: "WORK_AND_PROJECTS" };
  }

  return { kind: "unknown" };
}

export function classifyCandidate(candidate: MemoryCandidate): ClassifyKind {
  return classifyMemoryText(candidate.content, {
    fromProjectKnowledge: candidate.fromProjectKnowledge,
    projectId: candidate.projectId,
    suggestedCategory: candidate.category,
  });
}
