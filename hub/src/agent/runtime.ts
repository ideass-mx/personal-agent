import type { HistoryEntry, Role } from "../memory/history.ts";
import type {
  LLMContentBlock,
  LLMMessage,
  LLMProvider,
} from "../providers/types.ts";
import { toLLMToolDescriptor } from "../tools/descriptor.ts";
import type { ToolRegistry } from "../tools/registry.ts";
import type { ToolResult } from "../tools/types.ts";

/** Eventos internos del runtime (no son el protocolo WS público). */
export type AgentEvent =
  | { type: "text_delta"; text: string }
  | { type: "done"; messageId: string; conversationId: string }
  | { type: "error"; message: string };

export interface AgentTurnInput {
  conversationId?: string;
  deviceId?: string;
  userMessage: string;
}

/**
 * Persistencia mínima que el runtime necesita para un turno.
 * En producción apunta a memory/history; en tests se sustituye.
 */
export interface TurnMemory {
  ensureConversation(conversationId?: string): string;
  addMessage(
    conversationId: string,
    role: Role,
    content: string,
    deviceId?: string,
  ): string;
  getHistory(conversationId: string): HistoryEntry[];
}

export interface AgentRuntimeDeps {
  memory: TurnMemory;
  llm: LLMProvider;
  tools: ToolRegistry;
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

export function createAgentRuntime(deps: AgentRuntimeDeps): AgentRuntime {
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
            } else {
              try {
                result = await tool.execute(call.input, {
                  conversationId,
                  deviceId: input.deviceId,
                });
              } catch (err) {
                const message =
                  err instanceof Error ? err.message : "Error ejecutando tool";
                result = {
                  ok: false,
                  error: { code: "tool_exception", message },
                };
              }
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
