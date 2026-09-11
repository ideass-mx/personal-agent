/**
 * Escenarios rápidos de demostración (mock).
 */
import type { DemoScenarioId, LabDimensions } from "./types";

export type DemoScenario = {
  id: DemoScenarioId;
  label: string;
  description: string;
  seedUser?: string;
  seedThread?: { role: "user" | "assistant"; text: string }[];
  dimensions: LabDimensions;
};

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: "simple",
    label: "A · Solo conversación",
    description: "Pregunta factual — no crea proyecto.",
    seedUser: "¿Qué es aprendizaje automático?",
    dimensions: {
      startingPoint: "conversation",
      intent: "ask",
      complexity: "simple",
      delegation: "together",
      channel: "desktop",
    },
  },
  {
    id: "article_via_conversation",
    label: "B · Conversación → Artículo",
    description:
      "Trading → investigación → artículo científico (propuesta).",
    seedThread: [
      {
        role: "user",
        text: "Últimamente me interesa mucho el trading cuantitativo.",
      },
      {
        role: "assistant",
        text: "Es un campo interesante.\n¿Qué aspecto te interesa?",
      },
      {
        role: "user",
        text: "Sobre todo los algoritmos de optimización. Quiero entender cuáles se utilizan más.",
      },
      {
        role: "assistant",
        text: "Hay varios enfoques importantes:\noptimización convexa, algoritmos evolutivos,\nbúsqueda heurística, optimización bayesiana…",
      },
      {
        role: "user",
        text: "Quiero investigar cuáles son los más utilizados actualmente y comparar sus ventajas y desventajas.",
      },
      {
        role: "assistant",
        text: "Puedo ayudarte a mapear qué se usa hoy en la práctica y en la literatura.\nTodavía podemos seguir en conversación; cuando quieras estructurarlo como artículo, dímelo.",
      },
    ],
    seedUser:
      "Sí. De hecho quiero hacer un artículo científico sobre esto. Me gustaría revisar la literatura, comparar los algoritmos, identificar tendencias y proponer una estructura para el artículo.",
    dimensions: {
      startingPoint: "conversation",
      intent: "scientific_article",
      complexity: "long_running",
      delegation: "together",
      channel: "desktop",
    },
  },
  {
    id: "article_direct",
    label: "C · Artículo directo",
    description: "Intención clara desde el primer mensaje.",
    seedUser:
      "Quiero crear un artículo científico sobre algoritmos de optimización utilizados en trading cuantitativo.",
    dimensions: {
      startingPoint: "direct_article",
      intent: "scientific_article",
      complexity: "long_running",
      delegation: "do_it",
      channel: "desktop",
    },
  },
  {
    id: "research_only",
    label: "D · Solo investigación",
    description: "Investigar ≠ artículo científico.",
    seedUser:
      "Quiero investigar los principales algoritmos utilizados en trading cuantitativo.",
    dimensions: {
      startingPoint: "conversation",
      intent: "research",
      complexity: "multi_step",
      delegation: "together",
      channel: "desktop",
    },
  },
  {
    id: "article",
    label: "Artículo (atajo legacy)",
    description: "Misma ruta que C — creación directa.",
    seedUser:
      "Quiero crear un artículo científico sobre algoritmos de optimización utilizados en trading cuantitativo.",
    dimensions: {
      startingPoint: "direct_article",
      intent: "scientific_article",
      complexity: "long_running",
      delegation: "do_it",
      channel: "desktop",
    },
  },
  {
    id: "task",
    label: "Conversación → Tarea",
    description: "Detecta tarea sin convertir en proyecto.",
    seedUser: "Mañana recuérdame revisar la propuesta.",
    dimensions: {
      startingPoint: "conversation",
      intent: "organize",
      complexity: "simple",
      delegation: "together",
      channel: "desktop",
    },
  },
  {
    id: "doctorado",
    label: "Conversación → Proyecto (doctorado)",
    description: "Proyecto genérico de investigación.",
    seedThread: [
      {
        role: "user",
        text: "Estoy pensando en estudiar un doctorado.",
      },
      {
        role: "assistant",
        text: "¿Qué te gustaría saber?",
      },
    ],
    seedUser:
      "Quiero investigar mis opciones de doctorado y comparar universidades.",
    dimensions: {
      startingPoint: "conversation",
      intent: "research",
      complexity: "multi_step",
      delegation: "together",
      channel: "desktop",
    },
  },
  {
    id: "files",
    label: "Conversación → Computer Task",
    description: "Organizar archivos como trabajo estructurado.",
    seedUser: "Organiza mis archivos de Downloads.",
    dimensions: {
      startingPoint: "conversation",
      intent: "organize",
      complexity: "multi_step",
      delegation: "do_it",
      channel: "desktop",
    },
  },
  {
    id: "evidence",
    label: "Manuscript → Research (evidencia)",
    description: "Afirmación → buscar evidencia → volver al manuscrito.",
    dimensions: {
      startingPoint: "existing_project",
      intent: "research",
      complexity: "multi_step",
      delegation: "together",
      channel: "desktop",
    },
  },
];

export const PRINCIPLE_VISIBLE =
  "Simple por defecto. Estructurado cuando hace falta.";

export const PRINCIPLE_INTERNAL =
  "The user expresses intent. The agent organizes the work. The interface adapts to the work.";

export const ARTICLE_UNDERSTANDING =
  "Revisar la literatura sobre algoritmos de optimización utilizados en trading cuantitativo, compararlos e identificar tendencias.";

export const ARTICLE_WORK_PLAN = [
  "Identificar principales familias de algoritmos",
  "Revisar literatura científica",
  "Comparar enfoques",
  "Identificar tendencias",
  "Detectar oportunidades de investigación",
  "Preparar el manuscrito",
];
