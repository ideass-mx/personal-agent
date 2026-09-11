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
      scope: "personal",
      text: "Prefiere respuestas directas, sin relleno.",
      createdAt: now - 86400000 * 3,
    },
    {
      id: id("mem"),
      scope: "personal",
      text: "Trabaja desde la Ciudad de México; horario típico 9–18.",
      createdAt: now - 86400000 * 2,
    },
    {
      id: id("mem"),
      scope: "project",
      projectId: "ws_paper_seed",
      text: "El manuscrito debe citar fuentes peer-reviewed.",
      createdAt: now - 86400000,
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
