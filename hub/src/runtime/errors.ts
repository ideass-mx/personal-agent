/**
 * Códigos de error del lifecycle Hub ↔ Agent.
 * Lista corta; no es una jerarquía de excepciones.
 */
export const AGENT_SPAWN_ERROR = "agent_spawn_error";
export const AGENT_STARTUP_ERROR = "agent_startup_error";
export const MCP_INITIALIZE_ERROR = "mcp_initialize_error";
export const MCP_DISCOVERY_ERROR = "mcp_discovery_error";
export const TOOL_POLICY_ERROR = "tool_policy_error";
export const AGENT_DISCONNECTED = "agent_disconnected";
export const AGENT_TOOL_ERROR = "agent_tool_error";

export class HubAgentError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "HubAgentError";
    this.code = code;
  }
}
