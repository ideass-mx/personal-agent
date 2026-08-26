import type { AgentTool } from "./types.ts";
import type { AgentExtension } from "../extensions/types.ts";
import { assertValidExtension } from "../extensions/validate.ts";

export class ToolRegistry {
  private readonly tools = new Map<string, AgentTool>();
  private readonly extensionNames = new Set<string>();

  register(tool: AgentTool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool ya registrada: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * Valida la extensión y registra sus tools.
   * tools vacío: no-op. Duplicados (nombre de extensión o tool): fail-closed.
   */
  registerExtension(extension: AgentExtension): void {
    const valid = assertValidExtension(extension);
    if (this.extensionNames.has(valid.name)) {
      throw new Error(`Extensión duplicada: ${valid.name}`);
    }
    this.extensionNames.add(valid.name);
    for (const tool of valid.tools) {
      if (this.tools.has(tool.name)) {
        throw new Error(
          `Extensión "${valid.name}": tool duplicada ${tool.name}`,
        );
      }
      this.register(tool);
    }
  }

  get(name: string): AgentTool | undefined {
    return this.tools.get(name);
  }

  list(): AgentTool[] {
    return [...this.tools.values()];
  }
}
