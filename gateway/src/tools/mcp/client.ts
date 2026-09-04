/**
 * MCP Client surface del Tool System (reexport del transporte stdio).
 * Ubicación canónica: gateway/src/tools/mcp/ — no gateway/src/mcp/.
 */
export {
  connectAgentStdioClient,
  defaultAgentStdioCommand,
  childEnvForLocalNode,
  type ConnectAgentStdioOptions,
  type AgentStdioSession,
} from "./stdio.ts";
