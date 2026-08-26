import { randomUUID } from "node:crypto";
import type { TurnMemory } from "../memory/types.ts";
import type {
  LLMContentBlock,
  LLMMessage,
  LLMProvider,
} from "../providers/types.ts";
import { toLLMToolDescriptor } from "../tools/descriptor.ts";
import type { AgentTool, ToolResult } from "../tools/types.ts";
import {
  createDefaultAgentDefinition,
  type AgentDefinition,
} from "./definition.ts";
import {
  confirmationInconsistentResult,
  confirmationUnavailableResult,
  toolResultForDecision,
  type ConfirmationPort,
  type ConfirmationRequest,
} from "./confirmation.ts";

export type { TurnMemory } from "../memory/types.ts";

/** Eventos internos del runtime (no son el protocolo WS público). */
export type AgentEvent =
  | { type: "text_delta"; text: string }
  | { type: "done"; messageId: string; conversationId: string }
  | { type: "error"; message: string }
  | {
      type: "confirm_request";
      confirmationId: string;
      toolCallId: string;
      toolName: string;
      input: unknown;
      conversationId: string;
    };

export interface AgentTurnInput {
  conversationId?: string;
  deviceId?: string;
  /** Identidad opaca del turno (binding de confirmaciones). No es un objeto Session. */
  sessionId?: string;
  userMessage: string;
  /**
   * Puerto de confirmación para tools con executionMode "confirm".
   * Si falta y una tool pide confirm → fail-closed (no ejecuta).
   */
  confirmation?: ConfirmationPort;
}

/**
 * Puerto de invocación de Tools (Gateway lo implementa hoy con ToolRegistry).
 * El Runtime no nombra la clase ToolRegistry ni el SDK MCP.
 * En producción execute es RemoteAgentTool → MCP Adapter.
 */
export interface AgentRuntimeTools {
  get(name: string): AgentTool | undefined;
  list(): AgentTool[];
}

export interface AgentRuntimeDeps {
  /** Definición del Agent. Si se omite, se usa el Agent implícito del deployment. */
  agent?: AgentDefinition;
  memory: TurnMemory;
  llm: LLMProvider;
  tools: AgentRuntimeTools;
}

export interface AgentRuntime {
  runTurn(input: AgentTurnInput): AsyncGenerator<AgentEvent>;
}

export const MAX_TOOL_ITERATIONS = 10;

const INTERNAL_ERROR_MESSAGE =
  "El agente tuvo un problema generando la respuesta.";

function toolResultForLlm(result: ToolResult): {
  content: string;
  isError: boolean;
} {
  if (result.ok) {
    return { content: JSON.stringify(result.content), isError: false };
  }
  return { content: JSON.stringify(result.error), isError: true };
}

async function executeToolSafe(
  execute: () => Promise<ToolResult>,
): Promise<ToolResult> {
  try {
    return await execute();
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Error ejecutando tool";
    return {
      ok: false,
      error: { code: "tool_exception", message },
    };
  }
}

export function createAgentRuntime(deps: AgentRuntimeDeps): AgentRuntime {
  const agent = deps.agent ?? createDefaultAgentDefinition();
  const { memory, llm, tools } = deps;

  return {
    async *runTurn(input: AgentTurnInput): AsyncGenerator<AgentEvent> {
      try {
        const conversationId = memory.ensureConversation(input.conversationId);
        memory.addMessage(
          conversationId,
          "user",
          input.userMessage,
          input.deviceId,
        );

        const history = memory.getHistory(conversationId);
        const messages: LLMMessage[] = history.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const toolDescriptors = tools.list().map(toLLMToolDescriptor);
        let full = "";

        for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
          const toolCalls: Array<{
            id: string;
            name: string;
            input: unknown;
          }> = [];
          let turnText = "";

          for await (const event of llm.stream({
            messages,
            tools:
              toolDescriptors.length > 0 ? toolDescriptors : undefined,
            system: agent.prompt,
            model: agent.model,
          })) {
            if (event.type === "text_delta") {
              turnText += event.text;
              full += event.text;
              yield { type: "text_delta", text: event.text };
            } else if (event.type === "tool_call") {
              toolCalls.push({
                id: event.id,
                name: event.name,
                input: event.input,
              });
            }
          }

          if (toolCalls.length === 0) {
            const messageId = memory.addMessage(
              conversationId,
              "assistant",
              full,
            );
            yield { type: "done", messageId, conversationId };
            return;
          }

          const assistantBlocks: LLMContentBlock[] = [];
          if (turnText) {
            assistantBlocks.push({ type: "text", text: turnText });
          }
          for (const call of toolCalls) {
            assistantBlocks.push({
              type: "tool_call",
              id: call.id,
              name: call.name,
              input: call.input,
            });
          }
          messages.push({ role: "assistant", content: assistantBlocks });

          const resultBlocks: LLMContentBlock[] = [];
          for (const call of toolCalls) {
            const tool = tools.get(call.name);
            let result: ToolResult;

            if (!tool) {
              result = {
                ok: false,
                error: {
                  code: "tool_not_found",
                  message: `Herramienta no encontrada: ${call.name}`,
                },
              };
            } else if (tool.executionMode === "confirm") {
              if (!input.confirmation || !input.sessionId) {
                result = confirmationUnavailableResult();
              } else {
                const confirmationId = `cf_${randomUUID()}`;
                const request: ConfirmationRequest = {
                  confirmationId,
                  toolCallId: call.id,
                  toolName: tool.name,
                  input: call.input,
                  conversationId,
                  deviceId: input.deviceId,
                  sessionId: input.sessionId,
                };
                // Registrar la espera (input congelado) antes de notificar al cliente.
                const outcomePromise = input.confirmation.wait(request);
                yield {
                  type: "confirm_request",
                  confirmationId: request.confirmationId,
                  toolCallId: request.toolCallId,
                  toolName: request.toolName,
                  input: request.input,
                  conversationId: request.conversationId,
                };
                const outcome = await outcomePromise;

                if (outcome.decision !== "approved") {
                  result = toolResultForDecision(outcome.decision);
                } else {
                  const op = outcome.operation;
                  // Ejecutar SOLO la operación pendiente del servidor.
                  if (
                    op.conversationId !== conversationId ||
                    op.toolCallId !== call.id ||
                    op.toolName !== tool.name
                  ) {
                    result = confirmationInconsistentResult();
                  } else {
                    const toolNow = tools.get(op.toolName);
                    if (
                      !toolNow ||
                      toolNow.executionMode !== "confirm" ||
                      toolNow.name !== op.toolName
                    ) {
                      result = confirmationInconsistentResult();
                    } else {
                      result = await executeToolSafe(() =>
                        toolNow.execute(op.input, {
                          conversationId: op.conversationId,
                          deviceId: op.deviceId,
                        }),
                      );
                    }
                  }
                }
              }
            } else {
              result = await executeToolSafe(() =>
                tool.execute(call.input, {
                  conversationId,
                  deviceId: input.deviceId,
                }),
              );
            }

            const mapped = toolResultForLlm(result);
            resultBlocks.push({
              type: "tool_result",
              toolCallId: call.id,
              content: mapped.content,
              isError: mapped.isError,
            });
          }
          messages.push({ role: "user", content: resultBlocks });
        }

        yield {
          type: "error",
          message:
            "El agente superó el límite de iteraciones de herramientas.",
        };
      } catch (err) {
        console.error("[agent] error generando respuesta:", err);
        yield { type: "error", message: INTERNAL_ERROR_MESSAGE };
      }
    },
  };
}
