import type { AgentTool } from "./types.ts";

/**
 * Registry interno: Tools disponibles para el Runtime (get/list/register).
 * No descubre MCP (eso es discover.ts / Gateway).
 * No autoriza (eso es Tool Policy).
 * No ejecuta (eso es AgentTool / MCP Adapter).
 * No es el catálogo de plataforma.
 */
export class ToolRegistry {
  private readonly tools = new Map<string, AgentTool>();

  register(tool: AgentTool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool ya registrada: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): AgentTool | undefined {
    return this.tools.get(name);
  }

  list(): AgentTool[] {
    return [...this.tools.values()];
  }
}
