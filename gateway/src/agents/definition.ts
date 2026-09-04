/**
 * AgentDefinition: identidad/configuración lógica de un Agent.
 * No es un proceso, Node, MCP server, Gateway ni cliente.
 *
 * Distinción de identidades (PHASE 55):
 * - `GatewayConfig.agentId` = identidad de **instalación** del Personal Agent (pairing/producto).
 * - `AgentDefinition.id` = identidad **lógica** del Agent (p. ej. "personal-assistant").
 *
 * Persistencia: hoy in-memory vía AgentRegistry. No hay tabla SQLite de Agents.
 */
import { SYSTEM_PROMPT } from "./prompts.ts";
import {
  DEFAULT_TOOL_POLICY,
  type ToolPolicy,
} from "../tools/policy.ts";

export type { ToolPolicy };

/** Modelo por defecto del Agent implícito (no es config de Gateway/HTTP). */
export const DEFAULT_AGENT_MODEL = "claude-sonnet-4-6";

/** ID lógico del Agent por defecto. No es `agentId` de instalación. */
export const DEFAULT_AGENT_DEFINITION_ID = "personal-assistant";

/** Nombre UI del Agent por defecto. */
export const DEFAULT_AGENT_NAME = "Asistente personal";

/**
 * Política de memoria a nivel Agent (preparación).
 * Hoy el historial es por `conversationId` (TurnMemory), no por AgentDefinition.id.
 */
export type MemoryPolicy = {
  readonly scope: "conversation";
};

export const DEFAULT_MEMORY_POLICY: MemoryPolicy = Object.freeze({
  scope: "conversation",
});

/**
 * Configuración que el Agent Runtime ejecuta.
 * No contiene root de archivos, puertos, procesos ni el arranque del Node.
 *
 * `prompt` = system prompt del Agent (nombre histórico; conceptualmente systemPrompt).
 */
export interface AgentDefinition {
  /** Identidad lógica del Agent. ≠ installation `agentId`. */
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  /** System prompt. */
  readonly prompt: string;
  readonly model: string;
  readonly toolPolicy: ToolPolicy;
  /**
   * Allowed capability identities (PHASE 63). Nombre histórico: enabledTools.
   * El Runtime solo anuncia/ejecuta estas capabilities (subset del ToolRegistry).
   * Entradas exactas (`filesystem.read`) o prefijo de familia (`filesystem` → filesystem.*).
   * No son identidades de Node ni de transporte MCP.
   * Si se omite, usa todas las tools registradas (filtradas por policy en discovery).
   * Las Skills NO agregan tools.
   */
  readonly enabledTools?: readonly string[];
  /**
   * IDs de Skills a componer en el system prompt (orden = orden de resolución).
   * Skills no conceden permisos ni modifican ToolPolicy.
   */
  readonly skills?: readonly string[];
  readonly memoryPolicy?: MemoryPolicy;
}

export function createAgentDefinition(
  definition: AgentDefinition,
): AgentDefinition {
  const id = definition.id.trim();
  const name = definition.name.trim();
  if (!id) throw new Error("AgentDefinition.id es obligatorio");
  if (!name) throw new Error("AgentDefinition.name es obligatorio");
  return Object.freeze({
    id,
    name,
    description: definition.description,
    prompt: definition.prompt,
    model: definition.model,
    toolPolicy: definition.toolPolicy,
    enabledTools: definition.enabledTools
      ? Object.freeze([...definition.enabledTools])
      : undefined,
    skills: definition.skills
      ? Object.freeze([...definition.skills])
      : undefined,
    memoryPolicy: definition.memoryPolicy ?? DEFAULT_MEMORY_POLICY,
  });
}

/** Un Agent lógico por defecto de este deployment. No es un proceso. */
export function createDefaultAgentDefinition(): AgentDefinition {
  return createAgentDefinition({
    id: DEFAULT_AGENT_DEFINITION_ID,
    name: DEFAULT_AGENT_NAME,
    description:
      "Agent por defecto del Personal Agent. Conversación general asistida por tools locales.",
    prompt: SYSTEM_PROMPT,
    model: DEFAULT_AGENT_MODEL,
    toolPolicy: DEFAULT_TOOL_POLICY,
    memoryPolicy: DEFAULT_MEMORY_POLICY,
  });
}
