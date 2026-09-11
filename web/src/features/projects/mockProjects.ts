/**
 * Mock de proyectos de producto (prototipo UX, sin API).
 */
export type MockProjectType =
  | "scientific_article"
  | "research"
  | "document"
  | "generic";

export type PendingProjectCreate = MockProjectType | null;

export type MockProject = {
  id: string;
  title: string;
  type: MockProjectType;
  createdAt: string;
  /** Descripción / tema. */
  summary?: string;
};

export function projectTypeLabel(type: MockProjectType): string {
  switch (type) {
    case "scientific_article":
      return "Artículo científico";
    case "research":
      return "Investigación";
    case "document":
      return "Documento";
    case "generic":
      return "Proyecto";
  }
}

export const NEW_PROJECT_OPTIONS: Array<{
  type: MockProjectType;
  title: string;
  description: string;
}> = [
  {
    type: "scientific_article",
    title: "Artículo científico",
    description: "Investigar y escribir un manuscrito científico",
  },
  {
    type: "research",
    title: "Investigación",
    description: "Investigar un tema y organizar los resultados",
  },
  {
    type: "document",
    title: "Documento",
    description: "Crear un documento",
  },
  {
    type: "generic",
    title: "Otro proyecto",
    description: "Empezar un proyecto desde cero",
  },
];
