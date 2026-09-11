/**
 * Escenarios rápidos de demostración (mock).
 */
import type { DemoScenarioId, LabDimensions } from "./types";

export type DemoScenario = {
  id: DemoScenarioId;
  label: string;
  description: string;
  /** Seed messages before user acts, or empty for home. */
  seedUser?: string;
  seedThread?: { role: "user" | "assistant"; text: string }[];
  dimensions: LabDimensions;
};

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: "simple",
    label: "Conversación simple",
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
    label: "Conversación → Proyecto → Research",
    description: "Doctorado: propone proyecto y luego investiga.",
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
    seedUser: "Quiero comparar opciones, costos, modalidad y saber cuáles podrían convenirme.",
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
    label: "Proyecto → Research → Manuscript",
    description: "Revisión de literatura con delegación y automatización mock.",
    seedUser:
      "Necesito un artículo de revisión sobre los algoritmos de optimización utilizados en trading cuantitativo. Compara los principales enfoques, encuentra literatura científica e identifica tendencias.",
    dimensions: {
      startingPoint: "conversation",
      intent: "write",
      complexity: "long_running",
      delegation: "do_it",
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
  "Simple por defecto. Estructurado cuando hace falta. Autónomo cuando lo necesitas.";

export const PRINCIPLE_INTERNAL =
  "The user expresses intent. The agent organizes the work. The interface adapts to the work.";
