import type {
  ActivityEvent,
  CompanionFile,
  CompanionMessage,
  CompanionTask,
  CompanionWorkspace,
  MemoryEntry,
  PromoteState,
} from "./types";
import { MAIN_THREAD_ID, sectionsForKind } from "./types";

function id(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

const now = Date.now();

export function seedMainMessages(): CompanionMessage[] {
  return [
    {
      id: id("m"),
      threadId: MAIN_THREAD_ID,
      role: "agent",
      text: "Buenos días. Estoy en línea — trabajando en 2 cosas y hay una decisión pendiente para ti.",
      createdAt: now - 60_000 * 12,
    },
    {
      id: id("m"),
      threadId: MAIN_THREAD_ID,
      role: "agent",
      text: "Mientras no hablábamos: avancé el borrador del correo a Ana y vigilé el precio del vuelo CDMX–NRT.",
      createdAt: now - 60_000 * 10,
    },
    {
      id: id("m"),
      threadId: MAIN_THREAD_ID,
      role: "agent",
      text: "Necesito tu decisión sobre este correo.",
      card: {
        kind: "attention",
        title: "Necesita tu decisión",
        body: "Borrador listo: respuesta a Ana confirmando la reunión del martes a las 11:00. ¿Lo envío?",
        primaryLabel: "Aprobar y enviar",
        secondaryLabel: "Editar después",
        primaryAction: "approve-email",
        secondaryAction: "dismiss-email",
      },
      createdAt: now - 60_000 * 8,
    },
    {
      id: id("m"),
      threadId: MAIN_THREAD_ID,
      role: "agent",
      text: "Observación: el vuelo que mirábamos bajó $180. Te aviso si quieres que lo reserve con confirmación.",
      createdAt: now - 60_000 * 5,
    },
  ];
}

export function seedTasks(): CompanionTask[] {
  return [
    {
      id: id("t"),
      title: "Redactar respuesta a Ana",
      owner: "agent",
      state: "doing",
      pct: 70,
      note: "Borrador casi listo",
    },
    {
      id: id("t"),
      title: "Vigilar precio CDMX–NRT",
      owner: "agent",
      state: "watching",
      note: "Alerta si baja de $890",
    },
    {
      id: id("t"),
      title: "Aprobar correo a Ana",
      owner: "you",
      state: "needs-you",
      due: true,
    },
    {
      id: id("t"),
      title: "Revisar resumen semanal",
      owner: "agent",
      state: "queued",
    },
    {
      id: id("t"),
      title: "Pagar la luz",
      owner: "you",
      state: "todo",
      when: "Viernes",
    },
    {
      id: id("t"),
      title: "Organizar capturas del escritorio",
      owner: "agent",
      state: "done",
      note: "Hecho esta mañana",
    },
  ];
}

export function seedWorkspaces(): CompanionWorkspace[] {
  const threadId = id("th");
  return [
    {
      id: "ws_paper_seed",
      kind: "Paper",
      name: "Algoritmos en trading cuantitativo",
      objective:
        "Investigar y redactar un manuscrito sobre algoritmos de optimización en trading cuantitativo.",
      sections: sectionsForKind("Paper"),
      status: "live",
      progress: 34,
      threadId,
      liveSections: {
        Investigación: "live",
        Fuentes: "wait",
        Manuscrito: "wait",
      },
      whileAway: [
        "Añadí 3 fuentes nuevas a la cola.",
        "Borrador de estructura del manuscrito listo para revisar.",
      ],
      nextSteps: ["Confirmar el enfoque metodológico", "Priorizar fuentes"],
      needsDecision: "¿Enfoque empírico o revisión de literatura?",
    },
  ];
}

export function seedPromote(): PromoteState {
  return {
    topicId: "trip",
    label: "el viaje a Japón",
    mentions: 0,
    rejected: false,
    reoffered: false,
    workspaceId: null,
    notes: [],
  };
}

export function seedMemory(): MemoryEntry[] {
  return [
    {
      id: id("mem"),
      category: "PREFERENCES",
      type: "EXPLICIT",
      scope: "GLOBAL",
      content: "Prefiere explicaciones concisas.",
      importance: 0.85,
      confidence: 0.95,
      sourceType: "conversation",
      sourceReason: "Lo dijiste explícitamente en una conversación.",
      status: "ACTIVE",
      pin: true,
      createdAt: now - 2 * 3600000,
      updatedAt: now - 2 * 3600000,
    },
    {
      id: id("mem"),
      category: "PREFERENCES",
      type: "INFERRED",
      scope: "GLOBAL",
      content: "Prefiere nombres en inglés para proyectos de software.",
      importance: 0.6,
      confidence: 0.55,
      sourceType: "project",
      sourceReason: "Observado en cómo nombra espacios de software.",
      status: "ACTIVE",
      createdAt: now - 3 * 86400000,
      updatedAt: now - 3 * 86400000,
    },
    {
      id: id("mem"),
      category: "INTERESTS",
      type: "EXPLICIT",
      scope: "GLOBAL",
      content: "Le interesa la inteligencia artificial aplicada.",
      importance: 0.75,
      confidence: 0.88,
      sourceType: "conversation",
      status: "ACTIVE",
      createdAt: now - 5 * 3600000,
      updatedAt: now - 5 * 3600000,
    },
    {
      id: id("mem"),
      category: "INTERESTS",
      type: "OBSERVED",
      scope: "GLOBAL",
      content: "Sigue de cerca finanzas cuantitativas.",
      importance: 0.55,
      confidence: 0.5,
      sourceType: "activity",
      status: "ACTIVE",
      createdAt: now - 12 * 86400000,
      updatedAt: now - 12 * 86400000,
    },
    {
      id: id("mem"),
      category: "GOALS",
      type: "EXPLICIT",
      scope: "GLOBAL",
      content: "Quiere publicar un artículo científico.",
      importance: 0.8,
      confidence: 0.9,
      sourceType: "user_manual",
      sourceReason: "Lo añadiste tú manualmente.",
      status: "ACTIVE",
      createdAt: now - 10 * 86400000,
      updatedAt: now - 10 * 86400000,
    },
    {
      id: id("mem"),
      category: "PERSONAL",
      type: "EXPLICIT",
      scope: "GLOBAL",
      content: "Trabaja desde la Ciudad de México; horario típico 9–18.",
      importance: 0.6,
      confidence: 0.75,
      sourceType: "conversation",
      sourceReason: "Contexto personal estable que compartiste.",
      status: "ACTIVE",
      createdAt: now - 2 * 86400000,
      updatedAt: now - 2 * 86400000,
    },
    {
      id: id("mem"),
      category: "WORK_AND_PROJECTS",
      type: "PROJECT_DERIVED",
      scope: "GLOBAL",
      content: "Está construyendo un agente de IA personal.",
      importance: 0.8,
      confidence: 0.85,
      sourceType: "project",
      sourceReason: "Hecho durable derivado de su trabajo.",
      status: "ACTIVE",
      createdAt: now - 1 * 86400000,
      updatedAt: now - 1 * 86400000,
    },
    {
      id: id("mem"),
      category: "WORK_AND_PROJECTS",
      type: "PROJECT_DERIVED",
      scope: "PROJECT",
      projectId: "ws_paper_seed",
      content:
        "Está escribiendo un artículo científico sobre trading cuantitativo.",
      importance: 0.7,
      confidence: 0.8,
      sourceType: "project",
      sourceReason: "Derivado del espacio del paper.",
      status: "ACTIVE",
      createdAt: now - 86400000,
      updatedAt: now - 86400000,
    },
    {
      id: id("mem"),
      category: "PEOPLE_AND_RELATIONSHIPS",
      type: "EXPLICIT",
      scope: "GLOBAL",
      content: "Pedro es socio de negocio.",
      importance: 0.7,
      confidence: 0.9,
      sourceType: "conversation",
      status: "ACTIVE",
      createdAt: now - 20 * 86400000,
      updatedAt: now - 20 * 86400000,
    },
    {
      id: id("mem"),
      category: "HABITS",
      type: "OBSERVED",
      scope: "GLOBAL",
      content: "Suele trabajar hasta tarde.",
      importance: 0.5,
      confidence: 0.55,
      sourceType: "activity",
      status: "ACTIVE",
      createdAt: now - 8 * 86400000,
      updatedAt: now - 8 * 86400000,
    },
    {
      id: id("mem"),
      category: "IMPORTANT_INFORMATION",
      type: "EXPLICIT",
      scope: "GLOBAL",
      content: "La CFE se paga cada mes.",
      importance: 0.65,
      confidence: 0.85,
      sourceType: "conversation",
      status: "ACTIVE",
      createdAt: now - 40 * 86400000,
      updatedAt: now - 40 * 86400000,
    },
  ];
}

export function seedFiles(): CompanionFile[] {
  return [
    {
      id: id("f"),
      name: "borrador-correo-ana.md",
      kind: "markdown",
      byAgent: true,
      updatedAt: now - 3600000,
    },
    {
      id: id("f"),
      name: "fuentes-trading.csv",
      kind: "csv",
      projectId: "ws_paper_seed",
      byAgent: true,
      updatedAt: now - 7200000,
    },
    {
      id: id("f"),
      name: "notas-viaje.txt",
      kind: "text",
      byAgent: false,
      updatedAt: now - 86400000,
    },
  ];
}

export function seedActivity(): ActivityEvent[] {
  return [
    {
      id: id("a"),
      title: "Vigilancia de precio",
      detail: "Detecté baja de $180 en CDMX–NRT",
      at: now - 300000,
    },
    {
      id: id("a"),
      title: "Borrador de correo",
      detail: "Preparé respuesta a Ana (pendiente de aprobación)",
      at: now - 600000,
    },
    {
      id: id("a"),
      title: "Investigación",
      detail: "3 fuentes nuevas en el paper de trading",
      at: now - 3600000,
      projectId: "ws_paper_seed",
    },
  ];
}

export { id as companionId };
