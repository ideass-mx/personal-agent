/**
 * Mock StructuredResult fixtures for Experience Lab (no LLM / network).
 */
import type { StructuredResult } from "./types.ts";

export const RESEARCH_SOURCES = [
  {
    id: "src_unir",
    title: "Doctorado online — UNIR",
    url: "https://www.unir.net/ejemplo-doctorado",
    domain: "unir.net",
    snippet: "Programas de doctorado en modalidad online.",
    sourceType: "official" as const,
  },
  {
    id: "src_utel",
    title: "Oferta doctoral UTEL",
    url: "https://www.utel.edu.mx/ejemplo",
    domain: "utel.edu.mx",
    snippet: "Estudios de posgrado a distancia.",
    sourceType: "web" as const,
  },
  {
    id: "src_tech",
    title: "Doctorados TECH",
    url: "https://www.techtitute.com/ejemplo",
    domain: "techtitute.com",
    snippet: "Formación online orientada a profesionales.",
    sourceType: "web" as const,
  },
];

export const FIXTURE_RESEARCH_IDLE: StructuredResult = {
  blocks: [
    {
      type: "research",
      title: "Research",
      status: "idle",
      summary: "¿Qué quieres investigar?",
      actions: [
        {
          id: "start",
          label: "Empezar",
          action: "research.start",
          variant: "primary",
        },
      ],
    },
  ],
};

export const FIXTURE_RESEARCH_WORKING: StructuredResult = {
  blocks: [
    {
      type: "progress",
      title: "Investigando",
      status: "working",
      steps: [
        { id: "s1", label: "Definí criterios", status: "completed" },
        { id: "s2", label: "Busqué universidades", status: "completed" },
        { id: "s3", label: "Comparando requisitos", status: "active" },
        { id: "s4", label: "Preparando resultados", status: "pending" },
      ],
    },
    {
      type: "research",
      title: "Investigación en curso",
      status: "working",
      summary: "Estoy buscando las mejores opciones de doctorado en línea.",
    },
  ],
};

export const FIXTURE_RESEARCH_COMPLETED: StructuredResult = {
  blocks: [
    {
      type: "research",
      title: "Investigación completada",
      status: "completed",
      summary: "14 universidades encontradas",
      resultCount: 14,
      items: [
        {
          id: "unir",
          title: "UNIR",
          description: "Online · España",
          metadata: { modalidad: "Online", costo: "$$$", pais: "España" },
        },
        {
          id: "utel",
          title: "UTEL",
          description: "Online · México",
          metadata: { modalidad: "Online", costo: "$$", pais: "México" },
        },
        {
          id: "tech",
          title: "TECH",
          description: "Online · España",
          metadata: { modalidad: "Online", costo: "$$", pais: "España" },
        },
      ],
      sources: RESEARCH_SOURCES,
      actions: [
        {
          id: "compare",
          label: "Comparar",
          action: "research.compare",
          variant: "primary",
        },
        {
          id: "sources",
          label: "Fuentes",
          action: "research.sources",
          variant: "secondary",
        },
        {
          id: "report",
          label: "Crear informe",
          action: "research.report",
          variant: "secondary",
        },
        {
          id: "project",
          label: "Guardar como proyecto",
          action: "research.save_project",
          variant: "secondary",
        },
      ],
    },
  ],
};

export const FIXTURE_RESEARCH_COMPARISON: StructuredResult = {
  blocks: [
    ...FIXTURE_RESEARCH_COMPLETED.blocks,
    {
      type: "comparison",
      title: "Comparación de opciones",
      columns: [
        {
          id: "unir",
          title: "UNIR",
          attributes: {
            Modalidad: "Online",
            Costo: "$$$",
            País: "España",
          },
        },
        {
          id: "utel",
          title: "UTEL",
          attributes: {
            Modalidad: "Online",
            Costo: "$$",
            País: "México",
          },
        },
        {
          id: "tech",
          title: "TECH",
          attributes: {
            Modalidad: "Online",
            Costo: "$$",
            País: "España",
          },
        },
      ],
    },
  ],
};

export const FIXTURE_RESEARCH_SOURCES: StructuredResult = {
  blocks: [
    {
      type: "sources",
      sources: RESEARCH_SOURCES,
    },
  ],
};

export const FIXTURE_RESEARCH_ARTIFACT: StructuredResult = {
  blocks: [
    {
      type: "artifact",
      id: "art_report_demo",
      name: "Informe de investigación",
      kind: "pdf",
      status: "created",
      actions: [
        { id: "open", label: "Open", action: "artifact.open", variant: "primary" },
      ],
    },
  ],
};

export const FIXTURE_RESEARCH_FAILED: StructuredResult = {
  blocks: [
    {
      type: "research",
      title: "Algo salió mal",
      status: "failed",
      summary: "No pude completar la investigación. Puedes intentarlo de nuevo.",
      actions: [
        {
          id: "retry",
          label: "Reintentar",
          action: "research.retry",
          variant: "primary",
        },
      ],
    },
  ],
};

export const FIXTURE_TASK: StructuredResult = {
  blocks: [
    {
      type: "task",
      title: "Revisar propuesta",
      status: "pending",
      dueAt: "Mañana · 9:00 AM",
      actions: [
        {
          id: "create",
          label: "Crear tarea",
          action: "task.create",
          variant: "primary",
        },
      ],
    },
  ],
};

export const FIXTURE_APPROVAL: StructuredResult = {
  blocks: [
    {
      type: "approval",
      title: "Acción pendiente",
      description: "127 archivos duplicados",
      status: "pending",
      actions: [
        { id: "review", label: "Revisar", action: "approval.review", variant: "secondary" },
        { id: "cancel", label: "Cancelar", action: "approval.reject", variant: "secondary" },
        { id: "authorize", label: "Autorizar", action: "approval.approve", variant: "primary" },
      ],
    },
  ],
};

export const FIXTURE_BY_ID: Record<string, StructuredResult> = {
  "research-idle": FIXTURE_RESEARCH_IDLE,
  "research-working": FIXTURE_RESEARCH_WORKING,
  "research-completed": FIXTURE_RESEARCH_COMPLETED,
  "research-failed": FIXTURE_RESEARCH_FAILED,
  "research-comparison": FIXTURE_RESEARCH_COMPARISON,
  "research-artifact": FIXTURE_RESEARCH_ARTIFACT,
  "research-sources": FIXTURE_RESEARCH_SOURCES,
  task: FIXTURE_TASK,
  approval: FIXTURE_APPROVAL,
};
