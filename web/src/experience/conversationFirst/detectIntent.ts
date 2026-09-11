/**
 * Mock intent understanding — heuristics only (demo, no LLM).
 */
import type { DetectedIntent, IntentKind } from "./types";

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

export function detectIntent(
  raw: string,
  ctx: { inProject: boolean },
): DetectedIntent {
  const text = normalize(raw);
  if (!text) return { kind: "generic" };

  if (ctx.inProject) {
    if (
      includesAny(text, [
        "déjame escribir",
        "dejame escribir",
        "yo escribo",
        "controlo",
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
        "buscar evidencia",
        "fuentes para",
        "más evidencia",
        "mas evidencia",
      ])
    ) {
      return {
        kind: "find_evidence",
        reply: "Buscando evidencia para esta afirmación…",
      };
    }
    if (
      includesAny(text, [
        "artículo",
        "articulo",
        "manuscrito",
        "escribir",
        "redact",
        "convierte esto",
      ])
    ) {
      return {
        kind: "write_in_project",
        reply:
          "Puedo ayudarte a convertirlo en un artículo. El documento queda aquí, con la conversación al lado.",
      };
    }
    if (
      includesAny(text, [
        "investiga",
        "investigar",
        "compara",
        "universidades",
        "opciones",
        "busca",
      ])
    ) {
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
      "recuerda",
      "mañana",
      "manana",
      "crear tarea",
      "revisar la propuesta",
    ]) &&
    includesAny(text, ["recuer", "tarea", "mañana", "manana", "propuesta"])
  ) {
    return {
      kind: "task",
      reply: "Detecté una tarea que podemos guardar sin convertir esto en proyecto.",
    };
  }

  if (
    includesAny(text, [
      "organiza mis archivos",
      "organizar archivos",
      "downloads",
      "descargas",
      "duplicados",
    ])
  ) {
    return {
      kind: "computer_task",
      projectTitle: "Archivos",
      reply:
        "Voy a organizar este trabajo como proyecto para mantener juntas las carpetas, duplicados y decisiones.",
    };
  }

  if (
    includesAny(text, [
      "revisión de literatura",
      "revision de literatura",
      "artículo de revisión",
      "articulo de revision",
      "trading cuantitativo",
      "algoritmos de optimización",
      "algoritmos de optimizacion",
      "redacta un artículo",
      "redacta un articulo",
    ])
  ) {
    return {
      kind: "explicit_work",
      projectTitle: "Optimización en trading",
      reply:
        "Entendí que quieres preparar una revisión de literatura. Voy a organizar este trabajo como proyecto para mantener juntas la investigación, las fuentes y el manuscrito.",
    };
  }

  if (
    includesAny(text, [
      "doctorado",
      "universidades",
      "comparar opciones",
      "comparar universidades",
      "quiero investigar",
      "investiga las mejores",
    ])
  ) {
    return {
      kind: "complex_work",
      projectTitle: "Doctorado",
      reply:
        "Esto parece algo que podemos trabajar y mantener organizado. Puedo convertir esta conversación en un proyecto para conservar investigaciones, fuentes, documentos y decisiones en un mismo lugar.",
    };
  }

  if (
    includesAny(text, [
      "hazme un reporte",
      "crear reporte",
      "genera un informe",
      "haz un informe",
      "reporte de esto",
    ])
  ) {
    return {
      kind: "artifact",
      reply: "Listo. Dejé el reporte como un artefacto persistente, no solo como un mensaje.",
    };
  }

  if (
    text.startsWith("qué es") ||
    text.startsWith("que es") ||
    text.startsWith("¿qué es") ||
    text.startsWith("¿que es") ||
    includesAny(text, ["aprendizaje automático", "aprendizaje automatico"])
  ) {
    return {
      kind: "simple_ask",
      reply:
        "El aprendizaje automático es un enfoque de la inteligencia artificial en el que los sistemas aprenden patrones a partir de datos, en lugar de seguir solo reglas escritas a mano. ¿Quieres un ejemplo concreto o cómo se usa en la práctica?",
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
      return "Conversación simple";
    case "task":
      return "Tarea en conversación";
    case "complex_work":
      return "Trabajo · proponer proyecto";
    case "explicit_work":
      return "Trabajo complejo · organizar";
    case "computer_task":
      return "Tarea de computador";
    case "artifact":
      return "Artefacto";
    default:
      return "Continuar";
  }
}
