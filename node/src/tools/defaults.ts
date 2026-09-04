import { ToolRegistry } from "./registry.ts";
import type { AgentConfig } from "../config.ts";
import type { AgentExtension } from "../extensions/types.ts";
import { createDefaultExtensions } from "../extensions/defaults.ts";

/**
 * Registry de arranque: solo Agent Extensions.
 * El core no registra tools por nombre.
 */
export function createDefaultToolRegistry(
  config: AgentConfig = {},
  extensions: AgentExtension[] = createDefaultExtensions(config),
): ToolRegistry {
  const registry = new ToolRegistry();
  for (const extension of extensions) {
    registry.registerExtension(extension);
  }
  return registry;
}
