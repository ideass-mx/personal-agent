/**
 * Convierte AgentTool → herramientas MCP.
 * El descriptor MCP toma name/description de la tool.
 * El input de negocio viaja en `input` (JSON-safe) junto a requestId/context.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createDefaultToolRegistry } from "../tools/defaults.ts";
import type { ToolRegistry } from "../tools/registry.ts";
import { toolExceptionResult } from "../tools/types.ts";

const remoteEnvelope = z.object({
  requestId: z.string(),
  context: z.object({
    conversationId: z.string(),
    deviceId: z.string().optional(),
  }),
  input: z.unknown(),
});

export function createAgentMcpServer(
  registry: ToolRegistry = createDefaultToolRegistry(),
): McpServer {
  const server = new McpServer({
    name: "mxideass-agent",
    version: "0.0.0",
  });

  for (const tool of registry.list()) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: remoteEnvelope,
      },
      async ({ requestId, context, input }) => {
        let result;
        try {
          result = await tool.execute(input, {
            conversationId: context.conversationId,
            ...(context.deviceId !== undefined
              ? { deviceId: context.deviceId }
              : {}),
          });
        } catch (err) {
          result = toolExceptionResult(err);
        }
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ requestId, result }),
            },
          ],
        };
      },
    );
  }

  return server;
}

