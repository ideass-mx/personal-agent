/** Tipos de historial y puerto de memoria del Agent Runtime. Sin SQLite ni I/O. */

import type { AgentSource } from "../../../packages/protocol/messages.ts";

export type Role = "user" | "assistant";

export interface HistoryEntry {
  role: Role;
  content: string;
}

/**
 * Persistencia mínima de un turno.
 * El Runtime depende de este contrato, no de SQLite ni de history.ts.
 */
export interface TurnMemory {
  ensureConversation(conversationId?: string): string;
  addMessage(
    conversationId: string,
    role: Role,
    content: string,
    deviceId?: string,
    sources?: readonly AgentSource[],
  ): string;
  getHistory(conversationId: string): HistoryEntry[];
}
