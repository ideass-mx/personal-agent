/**
 * SkillRegistry in-memory. No SQLite, no marketplace, no remote install.
 */
import {
  createSkillDefinition,
  type SkillDefinition,
} from "./definition.ts";

export class SkillRegistry {
  private readonly skills = new Map<string, SkillDefinition>();

  register(definition: SkillDefinition): void {
    const skill = createSkillDefinition(definition);
    if (this.skills.has(skill.id)) {
      throw new Error(`Skill ya registrada: ${skill.id}`);
    }
    this.skills.set(skill.id, skill);
  }

  get(id: string): SkillDefinition | undefined {
    return this.skills.get(id);
  }

  has(id: string): boolean {
    return this.skills.has(id);
  }

  list(): SkillDefinition[] {
    return [...this.skills.values()];
  }

  unregister(id: string): boolean {
    return this.skills.delete(id);
  }
}

export function createEmptySkillRegistry(): SkillRegistry {
  return new SkillRegistry();
}
