/**
 * Contrato mínimo de Agent Extension (término normativo).
 * "Plugin" es sinónimo informal; no es un proceso ni un Permission System.
 *
 * Una extensión vive en el proceso Agent y solo aporta AgentTool[].
 * No conoce Hub, AgentRuntime, LLM, confirmación ni MCP.
 */
import type { AgentTool } from "../tools/types.ts";

export interface AgentExtension {
  /**
   * Identidad de la extensión (`echo`, `filesystem`, `process`, `math`).
   * Las tools públicas son `<name>.<local>`, salvo `echo` → `agent.echo`.
   */
  name: string;
  /** Metadata informativa; no hay semver enforcement. */
  version?: string;
  tools: AgentTool[];
}
