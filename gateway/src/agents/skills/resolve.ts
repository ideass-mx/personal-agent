/**
 * Resolución determinista de Skills → instrucciones de system prompt.
 * Independiente del LLM Provider. No concede tools ni permisos.
 */
import type { AgentDefinition } from "../definition.ts";
import type { SkillDefinition } from "./definition.ts";
import type { SkillRegistry } from "./registry.ts";

export class SkillResolutionError extends Error {
  readonly code = "skill_resolution_error";
  constructor(message: string) {
    super(message);
    this.name = "SkillResolutionError";
  }
}

/**
 * Resuelve SkillDefinition[] en el orden declarado por AgentDefinition.skills.
 * Falla si falta alguna Skill requerida (no se ignora en silencio).
 */
export function resolveSkills(
  agent: AgentDefinition,
  registry: SkillRegistry,
): SkillDefinition[] {
  const ids = agent.skills;
  if (!ids || ids.length === 0) return [];
  const out: SkillDefinition[] = [];
  for (const id of ids) {
    const skill = registry.get(id);
    if (!skill) {
      throw new SkillResolutionError(
        `Skill no encontrada: "${id}" (Agent "${agent.id}")`,
      );
    }
    out.push(skill);
  }
  return out;
}

/**
 * Compone system prompt:
 * 1) AgentDefinition.prompt
 * 2) Skills en orden de agent.skills (cada una bajo heading fijo)
 *
 * Determinista: mismos inputs → misma cadena.
 */
export function resolveAgentInstructions(
  agent: AgentDefinition,
  registry: SkillRegistry,
): string {
  const skills = resolveSkills(agent, registry);
  if (skills.length === 0) {
    return agent.prompt;
  }
  const parts: string[] = [agent.prompt.trimEnd(), "", "# Skills", ""];
  for (const skill of skills) {
    parts.push(`## ${skill.name} (${skill.id})`);
    parts.push("");
    parts.push(skill.instructions.trim());
    parts.push("");
  }
  return parts.join("\n").trimEnd() + "\n";
}
