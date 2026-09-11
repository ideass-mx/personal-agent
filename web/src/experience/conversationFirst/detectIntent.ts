/**
 * Mock intent understanding — determinista, sin LLM.
 * Distingue conversación / investigación / artículo científico.
 */
import type { DetectedIntent, IntentKind } from "./types";

export type ProductIntent =
  | "conversation"
  | "research"
  | "scientific_article";

function normalize(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function includesAny(text: string, needles: string[]): boolean {
  return needles.some((n) => text.includes(normalize(n)));
}

const ARTICLE_PHRASES = [
  "articulo cientifico",
  "artículo científico",
  "hacer un articulo",
  "hacer un artículo",
  "escribir un articulo",
  "escribir un artículo",
  "preparar un articulo",
  "preparar un artículo",
  "publicar un articulo",
  "publicar un artículo",
  "redactar un paper",
  "redactar un articulo",
  "redactar un artículo",
  "revision de literatura",
  "revisión de literatura",
  "articulo de revision",
  "artículo de revisión",
  "manuscrito cientifico",
  "manuscrito científico",
  "preparar un manuscrito",
  "crear un articulo cientifico",
  "crear un artículo científico",
  "quiero crear un articulo",
  "quiero crear un artículo",
];

const RESEARCH_PHRASES = [
  "quiero investigar",
  "investigar cuales",
  "investigar cuáles",
  "investigar los principales",
  "quiero conocer",
  "comparar sus ventajas",
  "comparar enfoques",
  "cuáles se utilizan",
  "cuales se utilizan",
];

export function extractArticleTopic(raw: string): string | undefined {
  const text = raw.trim();
  const m = text.match(
    /(?:sobre|acerca de)\s+(.+?)(?:\.|$)/i,
  );
  if (m?.[1]) return m[1].trim().replace(/\.$/, "");
  const m2 = text.match(
    /artículo científico\s+(.+)/i,
  );
  if (m2?.[1]) return m2[1].trim().replace(/\.$/, "");
  return undefined;
}

export function detectProductIntent(raw: string): ProductIntent {
  const text = normalize(raw);
  if (!text) return "conversation";
  if (includesAny(text, ARTICLE_PHRASES.map(normalize))) {
    return "scientific_article";
  }
  if (includesAny(text, RESEARCH_PHRASES.map(normalize))) {
    return "research";
  }
  return "conversation";
}

/**
 * Respuestas scriptadas del camino trading → artículo (demo).
 * null = usar reply genérico del intent.
 */
export function scriptedConversationReply(
  raw: string,
  priorUserTexts: string[],
): string | null {
  const text = normalize(raw);
  const prior = priorUserTexts.map(normalize).join(" || ");

  if (
    includesAny(text, ["trading cuantitativo"]) &&
    !includesAny(text, ARTICLE_PHRASES.map(normalize)) &&
    !includesAny(text, ["investigar", "algoritmos"])
  ) {
    return "Es un campo interesante.\n¿Qué aspecto te interesa?";
  }

  if (
    includesAny(text, ["algoritmos de optimizacion", "algoritmos de optimización"]) &&
    !includesAny(text, ARTICLE_PHRASES.map(normalize)) &&
    !includesAny(text, ["investigar", "articulo", "artículo"])
  ) {
    return "Hay varios enfoques importantes:\noptimización convexa, algoritmos evolutivos,\nbúsqueda heurística, optimización bayesiana…\n\n¿Quieres profundizar en alguno?";
  }

  if (
    includesAny(text, ["investigar"]) &&
    includesAny(text, ["utilizan", "actualmente", "principales"]) &&
    !includesAny(text, ARTICLE_PHRASES.map(normalize))
  ) {
    return "Puedo ayudarte a mapear qué se usa hoy en la práctica y en la literatura.\nTodavía podemos seguir en conversación; cuando quieras estructurarlo como artículo, dímelo.";
  }

  if (
    includesAny(text, ARTICLE_PHRASES.map(normalize)) &&
    (prior.includes("trading") ||
      prior.includes("optimizacion") ||
      prior.includes("optimización") ||
      includesAny(text, ["esto", "trading", "optimizacion", "optimización"]))
  ) {
    return "Esto ya parece un trabajo que podemos mantener organizado.\n\nPuedo convertir esta conversación en un proyecto de artículo científico para conservar la investigación, las fuentes y el manuscrito en un mismo lugar.";
  }

  return null;
}

export function detectIntent(
  raw: string,
  ctx: { inProject: boolean; priorUserTexts?: string[] },
): DetectedIntent {
  const text = normalize(raw);
  if (!text) return { kind: "generic" };

  if (ctx.inProject) {
    if (
      includesAny(text, [
        "déjame escribir",
        "dejame escribir",
        "yo escribo",
        "yo controlo",
      ])
    ) {
      return {
        kind: "control_manual",
        reply: "De acuerdo. Ahora tú tienes el control de esta sección.",
      };
    }
    if (
      includesAny(text, [
        "haz esta parte",
        "hazlo por mí",
        "hazlo por mi",
        "hazlo tú",
        "hazlo tu",
      ])
    ) {
      return {
        kind: "control_agent",
        reply: "Personal Agent está trabajando en esta sección.",
      };
    }
    if (
      includesAny(text, [
        "evidencia",
        "busca evidencia",
        "más evidencia",
        "mas evidencia",
      ])
    ) {
      return {
        kind: "find_evidence",
        reply: "Buscando evidencia para esta afirmación…",
      };
    }
    if (includesAny(text, ["manuscrito", "escribir", "redact"])) {
      return {
        kind: "write_in_project",
        reply: "Abrimos el manuscrito. La conversación sigue disponible.",
      };
    }
    if (includesAny(text, ["investiga", "investigar", "compara", "fuentes"])) {
      return {
        kind: "research_in_project",
        reply: "Voy a investigar y te muestro el progreso aquí.",
      };
    }
  }

  if (
    includesAny(text, [
      "recuérdame",
      "recuerdame",
      "crear tarea",
      "revisar la propuesta",
    ]) &&
    includesAny(text, ["recuer", "tarea", "mañana", "manana", "propuesta"])
  ) {
    return {
      kind: "task",
      reply:
        "Detecté una tarea que podemos guardar sin convertir esto en proyecto.",
    };
  }

  if (
    includesAny(text, [
      "organiza mis archivos",
      "organizar archivos",
      "downloads",
      "descargas",
    ])
  ) {
    return {
      kind: "computer_task",
      projectTitle: "Archivos",
      reply:
        "Voy a organizar este trabajo como proyecto para mantener juntas las carpetas y decisiones.",
    };
  }

  // Doctorado (legacy demo) — antes que research genérico.
  if (
    includesAny(text, [
      "doctorado",
      "comparar universidades",
      "comparar opciones",
    ])
  ) {
    return {
      kind: "complex_work",
      projectTitle: "Doctorado",
      reply:
        "Esto parece algo que podemos trabajar y mantener organizado. Puedo convertir esta conversación en un proyecto.",
    };
  }

  const product = detectProductIntent(raw);
  const topic =
    extractArticleTopic(raw) ||
    "Algoritmos de optimización en trading cuantitativo";
  const hasPrior = Boolean(ctx.priorUserTexts && ctx.priorUserTexts.length > 0);

  if (product === "scientific_article") {
    // Con historial: propuesta contextual. Sin historial: creación directa.
    if (hasPrior) {
      const scripted = scriptedConversationReply(raw, ctx.priorUserTexts || []);
      return {
        kind: "scientific_article_propose",
        projectTitle: topic,
        reply:
          scripted ||
          "Esto ya parece un trabajo que podemos mantener organizado.\n\nPuedo convertir esta conversación en un proyecto de artículo científico para conservar la investigación, las fuentes y el manuscrito en un mismo lugar.",
      };
    }
    return {
      kind: "scientific_article_direct",
      projectTitle: topic,
      reply: `Vamos a crear tu artículo científico.\n\nTema:\n${topic}`,
    };
  }

  if (product === "research") {
    const scripted = scriptedConversationReply(raw, ctx.priorUserTexts || []);
    return {
      kind: "research_only",
      reply:
        scripted ||
        "Puedo ayudarte a investigar este tema. Seguimos en conversación; si más adelante quieres convertirlo en un artículo científico, lo organizamos juntos.",
    };
  }

  const scripted = scriptedConversationReply(raw, ctx.priorUserTexts || []);
  if (scripted) {
    return { kind: "conversation_continue", reply: scripted };
  }

  if (
    text.startsWith("qué es") ||
    text.startsWith("que es") ||
    includesAny(text, ["aprendizaje automático", "aprendizaje automatico"])
  ) {
    return {
      kind: "simple_ask",
      reply:
        "El aprendizaje automático es un enfoque de la inteligencia artificial en el que los sistemas aprenden patrones a partir de datos, en lugar de seguir solo reglas escritas a mano. ¿Quieres un ejemplo concreto?",
    };
  }

  return {
    kind: "generic",
    reply:
      "Claro. Cuéntame un poco más de lo que necesitas y lo organizamos juntos.",
  };
}

export function intentLabel(kind: IntentKind): string {
  switch (kind) {
    case "simple_ask":
    case "conversation_continue":
      return "Conversación";
    case "research_only":
      return "Investigación (sin proyecto)";
    case "scientific_article_propose":
      return "Artículo · proponer proyecto";
    case "scientific_article_direct":
      return "Artículo · creación directa";
    case "task":
      return "Tarea en conversación";
    case "complex_work":
      return "Trabajo · proponer proyecto";
    case "explicit_work":
      return "Trabajo complejo";
    case "computer_task":
      return "Tarea de computador";
    case "artifact":
      return "Artefacto";
    default:
      return "Continuar";
  }
}
