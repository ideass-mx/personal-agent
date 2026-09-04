/**
 * Puente: AgentTool ToolResult → NormalizedMcpResult (sin Artifact).
 * Preserva el contrato productivo { ok, content|error } como texto JSON MCP.
 */
import type { ToolResult } from "../tools/types.ts";
import type { NormalizedMcpResult } from "./types.ts";

export function agentToolResultToMcp(result: ToolResult): NormalizedMcpResult {
  if (result.ok) {
    return {
      content: [
        {
          type: "text",
          text:
            typeof result.content === "string"
              ? result.content
              : JSON.stringify(result.content),
        },
      ],
      structuredContent:
        typeof result.content === "object" && result.content !== null
          ? result.content
          : undefined,
    };
  }
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result.error),
      },
    ],
    isError: true,
    structuredContent: result.error,
  };
}
