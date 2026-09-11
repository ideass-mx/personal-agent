/** Mock content for research / manuscript / evidence demos. */

export const MOCK_UNIVERSITIES = [
  { id: "u1", name: "UNIR", modality: "Online", cost: "Media", fit: "Alta" },
  { id: "u2", name: "UTEL", modality: "Online", cost: "Baja", fit: "Media" },
  { id: "u3", name: "TECH", modality: "Online", cost: "Alta", fit: "Alta" },
  { id: "u4", name: "UAQ", modality: "Presencial", cost: "Media", fit: "Media" },
];

export const MOCK_USER_RESOURCES = [
  { id: "ur1", name: "paper-01.pdf", kind: "pdf" as const },
  { id: "ur2", name: "thesis.pdf", kind: "pdf" as const },
  { id: "ur3", name: "data.xlsx", kind: "sheet" as const },
];

export const MOCK_AGENT_RESOURCES = [
  {
    id: "ar1",
    name: "Journal article — Evolutionary methods",
    kind: "article" as const,
  },
  {
    id: "ar2",
    name: "Systematic review — Quant trading",
    kind: "article" as const,
  },
  {
    id: "ar3",
    name: "Institutional report — Optimization survey",
    kind: "report" as const,
  },
];

export const MOCK_EVIDENCE = [
  {
    id: "e1",
    title: "Holland (1975) — Genetic algorithms",
    snippet:
      "Los algoritmos genéticos exploran espacios de búsqueda complejos mediante selección y variación.",
  },
  {
    id: "e2",
    title: "Survey 2023 — Evolutionary trading",
    snippet:
      "Revisiones recientes documentan utilidad en optimización de portafolios bajo restricciones.",
  },
  {
    id: "e3",
    title: "IEEE — PSO in finance",
    snippet:
      "Particle swarm optimization aparece de forma recurrente en calibración de parámetros.",
  },
];

export const MANUSCRIPT_SECTIONS = [
  "Introducción",
  "Marco teórico",
  "Metodología",
  "Resultados",
  "Discusión",
  "Conclusiones",
] as const;

export const CLAIM_TEXT =
  "Los métodos evolutivos han demostrado utilidad en problemas de optimización complejos.";

export const ARTICLE_PLAN = [
  "Identificar los principales algoritmos",
  "Revisar literatura científica",
  "Comparar enfoques",
  "Identificar tendencias",
  "Construir una síntesis",
  "Preparar el manuscrito",
];

export const ARTICLE_AUTO_STEPS = [
  "Alcance definido",
  "67 fuentes encontradas",
  "24 fuentes seleccionadas",
  "91 piezas de evidencia",
  "Construyendo síntesis",
  "Redactando artículo",
];

export const RESEARCH_STEPS_DOCTORADO = [
  "Definí criterios",
  "Busqué universidades",
  "Comparando opciones",
  "Preparando resultados",
];
