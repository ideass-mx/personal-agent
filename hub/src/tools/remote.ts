/**
 * Frontera Hub → Agent: contrato JSON-safe y adapter RemoteAgentTool.
 * El transporte (MCP) vive en mcp-executor; AgentRuntime solo ve AgentTool.
 */
import { randomUUID } from "node:crypto";
import type {
  AgentTool,
  JsonSchema,
  ToolContext,
  ToolExecutionMode,
  ToolResult,
} from "./types.ts";

export interface RemoteToolRequest {
  requestId: string;
  toolName: string;
  input: unknown;
  context: ToolContext;
  timeoutMs?: number;
}

export interface RemoteToolResponse {
  requestId: string;
  result: ToolResult;
}

export interface RemoteToolExecutor {
  execute(request: RemoteToolRequest): Promise<RemoteToolResponse>;
}

export const REMOTE_TOOL_ERROR_CODE = "remote_tool_error";

export type RemoteAgentToolMeta = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  executionMode: ToolExecutionMode;
  timeoutMsFor?: (input: unknown) => number | undefined;
};

export type RemoteAgentToolSpec = RemoteAgentToolMeta & {
  executor?: RemoteToolExecutor;
};

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function remoteFail(message: string): ToolResult {
  return {
    ok: false,
    error: { code: REMOTE_TOOL_ERROR_CODE, message },
  };
}

export function isToolResult(value: unknown): value is ToolResult {
  if (typeof value !== "object" || value === null) return false;
  const rec = value as { ok?: unknown; content?: unknown; error?: unknown };
  if (rec.ok === true) return "content" in rec;
  if (rec.ok !== false) return false;
  if (typeof rec.error !== "object" || rec.error === null) return false;
  const err = rec.error as { code?: unknown; message?: unknown };
  return typeof err.code === "string" && typeof err.message === "string";
}

export function createRemoteAgentTool(
  spec: RemoteAgentToolSpec,
  executorArg?: RemoteToolExecutor,
): AgentTool {
  const executor = spec.executor ?? executorArg;
  if (!executor) {
    throw new Error("createRemoteAgentTool requiere executor");
  }
  const { name, description, inputSchema, executionMode, timeoutMsFor } = spec;
  return {
    name,
    description,
    inputSchema,
    executionMode,
    async execute(input, context): Promise<ToolResult> {
      const requestId = `rt_${randomUUID()}`;
      let request: RemoteToolRequest;
      try {
        request = jsonClone({
          requestId,
          toolName: name,
          input,
          context,
          ...(timeoutMsFor !== undefined
            ? { timeoutMs: timeoutMsFor(input) }
            : {}),
        });
      } catch {
        return remoteFail("El input de la tool remota no es JSON-safe.");
      }

      let response: RemoteToolResponse;
      try {
        response = await executor.execute(request);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Fallo en la tool remota";
        return remoteFail(message);
      }

      if (
        typeof response !== "object" ||
        response === null ||
        response.requestId !== requestId ||
        !isToolResult(response.result)
      ) {
        return remoteFail("Respuesta remota inválida o requestId no coincide.");
      }

      try {
        return jsonClone(response.result);
      } catch {
        return remoteFail("El ToolResult remoto no es JSON-safe.");
      }
    },
  };
}
