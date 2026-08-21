import type { HistoryEntry, Role } from "../memory/history.ts";
import {
  addMessage as persistMessage,
  ensureConversation as persistEnsureConversation,
  getHistory as persistGetHistory,
} from "../memory/history.ts";
import { streamReply as anthropicStreamReply } from "../providers/anthropic.ts";

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

/**
 * Contrato local del streamer Anthropic actual (no es LLMProvider genérico).
 */
export type ReplyStreamer = (
  history: HistoryEntry[],
) => AsyncIterable<string>;

export interface AgentRuntimeDeps {
  memory: TurnMemory;
  streamReply: ReplyStreamer;
}

export interface AgentRuntime {
  runTurn(input: AgentTurnInput): AsyncGenerator<AgentEvent>;
}

const INTERNAL_ERROR_MESSAGE =
  "El agente tuvo un problema generando la respuesta.";

export function createAgentRuntime(deps: AgentRuntimeDeps): AgentRuntime {
  const { memory, streamReply } = deps;

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

        let full = "";
        for await (const chunk of streamReply(history)) {
          full += chunk;
          yield { type: "text_delta", text: chunk };
        }

        const messageId = memory.addMessage(conversationId, "assistant", full);
        yield { type: "done", messageId, conversationId };
      } catch (err) {
        console.error("[agent] error generando respuesta:", err);
        yield { type: "error", message: INTERNAL_ERROR_MESSAGE };
      }
    },
  };
}

/** Runtime de producción: memoria SQLite + streamer Anthropic. */
export const agentRuntime: AgentRuntime = createAgentRuntime({
  memory: {
    ensureConversation: persistEnsureConversation,
    addMessage: persistMessage,
    getHistory: persistGetHistory,
  },
  streamReply: anthropicStreamReply,
});
