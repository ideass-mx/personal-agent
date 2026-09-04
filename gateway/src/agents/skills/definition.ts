/**
 * SkillDefinition: conocimiento/instrucciones reutilizables.
 * No es Tool, no ejecuta, no toca MCP/Node, no concede permisos.
 */
export interface SkillDefinition {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  /** Instrucciones inyectadas en el system prompt del Agent. */
  readonly instructions: string;
}

export function createSkillDefinition(
  definition: SkillDefinition,
): SkillDefinition {
  const id = definition.id.trim();
  const name = definition.name.trim();
  const instructions = definition.instructions.trim();
  if (!id) throw new Error("SkillDefinition.id es obligatorio");
  if (!name) throw new Error("SkillDefinition.name es obligatorio");
  if (!instructions) {
    throw new Error(`SkillDefinition.instructions vacío: ${id}`);
  }
  return Object.freeze({
    id,
    name,
    description: definition.description,
    instructions,
  });
}
