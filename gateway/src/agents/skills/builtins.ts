/**
 * Catálogo estático de Skills de ejemplo (fixtures / resolución).
 * No son Agents. No habilitan Tools. No tocan seguridad.
 */
import { createSkillDefinition, type SkillDefinition } from "./definition.ts";
import { SkillRegistry } from "./registry.ts";

export const BUILTIN_SKILLS: readonly SkillDefinition[] = Object.freeze([
  createSkillDefinition({
    id: "book-writing",
    name: "Book writing",
    description: "Cómo plantear y escribir un libro.",
    instructions: `Orienta la escritura de libros de no ficción y ficción.
- Propón estructura por capítulos antes de redactar en masa.
- Mantén voz coherente y evita relleno.
- Cuando el usuario pida exportar, sugiere tools de documento/PDF si están disponibles; no inventes archivos.`,
  }),
  createSkillDefinition({
    id: "narrative-structure",
    name: "Narrative structure",
    description: "Arco narrativo y ritmo.",
    instructions: `Aplica estructura narrativa (planteamiento, desarrollo, clímax, cierre).
- Señala huecos de motivación y ritmo.
- No ejecutes tools salvo que el usuario lo pida y estén disponibles.`,
  }),
  createSkillDefinition({
    id: "scientific-writing",
    name: "Scientific writing",
    description: "Estilo académico y claridad.",
    instructions: `Escribe con rigor científico: hipótesis, método, resultados, limitaciones.
- Distingue evidencia de opinión.
- No inventes citas; usa tools de citation/web solo si existen.`,
  }),
  createSkillDefinition({
    id: "literature-review",
    name: "Literature review",
    description: "Revisión de literatura.",
    instructions: `Organiza revisión de literatura por temas y lagunas.
- Prioriza fuentes primarias cuando haya tools de búsqueda.
- No fabriques bibliografía.`,
  }),
  createSkillDefinition({
    id: "academic-citations",
    name: "Academic citations",
    description: "Citas estructuradas vs búsqueda web cruda.",
    instructions: `Separa búsqueda web de citación bibliográfica.
- Una URL no es automáticamente una cita APA/BibTeX.
- Usa citation.* solo si está disponible; si no, dilo.`,
  }),
  createSkillDefinition({
    id: "software-engineering",
    name: "Software engineering",
    description: "Prácticas de ingeniería de software.",
    instructions: `Aplica buenas prácticas: cambios pequeños, tests, claridad.
- No ejecutes process.execute ni writes sin necesidad.
- Skills no conceden permisos: respeta ToolPolicy y confirmaciones.`,
  }),
  createSkillDefinition({
    id: "debugging",
    name: "Debugging",
    description: "Diagnóstico sistemático.",
    instructions: `Depura con hipótesis → evidencia → fix mínimo.
- Lee logs/archivos con tools disponibles antes de conjeturar.`,
  }),
  createSkillDefinition({
    id: "code-review",
    name: "Code review",
    description: "Revisión de código.",
    instructions: `Revisa claridad, correción y riesgos.
- Señala problemas concretos con ubicación.
- No reescribas todo el módulo sin pedirlo.`,
  }),
]);

/** Registry con Skills builtin (in-memory). */
export function createBuiltinSkillRegistry(): SkillRegistry {
  const registry = new SkillRegistry();
  for (const skill of BUILTIN_SKILLS) {
    registry.register(skill);
  }
  return registry;
}
