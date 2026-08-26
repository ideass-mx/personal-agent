/**
 * Definición mínima de Agent: identidad/configuración lógica, no ejecución.
 * Agent identity is currently configuration-scoped and not yet persistent.
 * Sin persistencia ni registry de Agents.
 */
import { SYSTEM_PROMPT } from "./prompts.ts";
import {
  DEFAULT_TOOL_POLICY,
  type ToolPolicy,
} from "../tools/tool-policy.ts";

export type { ToolPolicy };

/** Modelo por defecto del Agent implícito (no es config de Gateway/HTTP). */
export const DEFAULT_AGENT_MODEL = "claude-sonnet-4-6";

/**
 * Configuración que el Agent Runtime ejecuta.
 * No contiene root de archivos, puertos, procesos ni el arranque del Node.
 */
export interface AgentDefinition {
  readonly prompt: string;
  readonly model: string;
  readonly toolPolicy: ToolPolicy;
}

export function createAgentDefinition(
  definition: AgentDefinition,
): AgentDefinition {
  return Object.freeze({
    prompt: definition.prompt,
    model: definition.model,
    toolPolicy: definition.toolPolicy,
  });
}

/** Un Agent implícito de este deployment. No es un registry. */
export function createDefaultAgentDefinition(): AgentDefinition {
  return createAgentDefinition({
    prompt: SYSTEM_PROMPT,
    model: DEFAULT_AGENT_MODEL,
    toolPolicy: DEFAULT_TOOL_POLICY,
  });
}
