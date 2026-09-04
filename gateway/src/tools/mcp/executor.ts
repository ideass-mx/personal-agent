/**
 * MCP Adapter (invocación): RemoteToolExecutor sobre un cliente MCP.
 * Único módulo de producción del Hub, junto a mcp-stdio, que importa el SDK MCP.
 * Un intento, sin retry ni fallback in-process.
 */
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import type {
  RemoteToolExecutor,
  RemoteToolRequest,
  RemoteToolResponse,
} from "../remote.ts";
import { REMOTE_TOOL_ERROR_CODE, isToolResult } from "../remote.ts";
import type { ToolResult } from "../types.ts";
import { AGENT_DISCONNECTED, AGENT_TOOL_ERROR } from "../../runtime/errors.ts";

export const MCP_TOOL_TIMEOUT_MS = 15_000;

export const REMOTE_TOOL_TIMEOUT_CODE = "remote_tool_timeout";

export type McpCallToolClient = {
  callTool: (
    params: { name: string; arguments?: Record<string, unknown> },
    resultSchema?: any,
    options?: any,
  ) => unknown;
};

export type McpRemoteExecutorOptions = {
  timeoutMs?: number;
  isDisconnected?: () => boolean;
};

function failResult(code: string, message: string): ToolResult {
  return { ok: false, error: { code, message } };
}

function mcpText(mcp: unknown): { text?: string; isError: boolean } {
  if (typeof mcp !== "object" || mcp === null) {
    return { isError: false };
  }
  const rec = mcp as { content?: unknown; isError?: unknown };
  const isError = rec.isError === true;
  const content = rec.content;
  if (!Array.isArray(content) || content.length === 0) {
    return { isError };
  }
  const first = content[0] as { type?: unknown; text?: unknown };
  if (first.type !== "text" || typeof first.text !== "string") {
    return { isError };
  }
  return { text: first.text, isError };
}

function parseEnvelope(
  text: string,
  expectedId: string,
): RemoteToolResponse | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null) return undefined;
  const rec = parsed as { requestId?: unknown; result?: unknown };
  if (rec.requestId !== expectedId) return undefined;
  if (!isToolResult(rec.result)) return undefined;
  return { requestId: expectedId, result: rec.result };
}

function isTimeoutError(err: unknown): boolean {
  if (err instanceof McpError && err.code === ErrorCode.RequestTimeout) {
    return true;
  }
  const message = err instanceof Error ? err.message : String(err);
  return /timeout/i.test(message);
}

function isDisconnectError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /connection closed|not connected|disconnected|EPIPE|ECONNRESET/i.test(
    message,
  );
}

async function withTimeout<T>(
  work: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new McpError(ErrorCode.RequestTimeout, "timeout"));
    }, timeoutMs);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export function createMcpRemoteExecutor(
  client: McpCallToolClient,
  options: McpRemoteExecutorOptions = {},
): RemoteToolExecutor {
  const defaultTimeoutMs = options.timeoutMs ?? MCP_TOOL_TIMEOUT_MS;

  return {
    async execute(request: RemoteToolRequest): Promise<RemoteToolResponse> {
      if (options.isDisconnected?.()) {
        return {
          requestId: request.requestId,
          result: failResult(
            AGENT_DISCONNECTED,
            "El Agent no está conectado.",
          ),
        };
      }
      const timeoutMs = request.timeoutMs ?? defaultTimeoutMs;
      try {
        const mcp = await withTimeout(
          Promise.resolve(
            client.callTool(
              {
                name: request.toolName,
                arguments: {
                  requestId: request.requestId,
                  context: {
                    conversationId: request.context.conversationId,
                    ...(request.context.deviceId !== undefined
                      ? { deviceId: request.context.deviceId }
                      : {}),
                  },
                  input: request.input,
                },
              },
              undefined,
              { timeout: timeoutMs },
            ),
          ) as Promise<unknown>,
          timeoutMs,
        );
        const { text, isError } = mcpText(mcp);
        if (isError || text === undefined) {
          return {
            requestId: request.requestId,
            result: failResult(
              isError ? AGENT_TOOL_ERROR : REMOTE_TOOL_ERROR_CODE,
              "Respuesta MCP de error o sin texto JSON.",
            ),
          };
        }
        const parsed = parseEnvelope(text, request.requestId);
        if (!parsed) {
          return {
            requestId: request.requestId,
            result: failResult(
              REMOTE_TOOL_ERROR_CODE,
              "JSON MCP inválido o requestId distinto.",
            ),
          };
        }
        return parsed;
      } catch (err) {
        if (isTimeoutError(err)) {
          return {
            requestId: request.requestId,
            result: failResult(
              REMOTE_TOOL_TIMEOUT_CODE,
              "Remote tool execution timed out",
            ),
          };
        }
        if (isDisconnectError(err) || options.isDisconnected?.()) {
          return {
            requestId: request.requestId,
            result: failResult(
              AGENT_DISCONNECTED,
              err instanceof Error ? err.message : "Agent desconectado",
            ),
          };
        }
        const message =
          err instanceof Error ? err.message : "Fallo MCP hacia el Agent";
        return {
          requestId: request.requestId,
          result: failResult(REMOTE_TOOL_ERROR_CODE, message),
        };
      }
    },
  };
}
