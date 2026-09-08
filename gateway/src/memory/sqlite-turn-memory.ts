/**
 * Adapter TurnMemory → funciones SQLite de history.ts.
 */
import type { AgentSource } from "../../../packages/protocol/messages.ts";
import {
  addMessage,
  ensureConversation,
  getHistory,
} from "./history.ts";
import type { HistoryEntry, Role, TurnMemory } from "./types.ts";

export class SqliteTurnMemory implements TurnMemory {
  ensureConversation(conversationId?: string): string {
    return ensureConversation(conversationId);
  }

  addMessage(
    conversationId: string,
    role: Role,
    content: string,
    deviceId?: string,
    sources?: readonly AgentSource[],
  ): string {
    return addMessage(conversationId, role, content, deviceId, sources);
  }

  getHistory(conversationId: string): HistoryEntry[] {
    return getHistory(conversationId);
  }
}

export function createSqliteTurnMemory(): TurnMemory {
  return new SqliteTurnMemory();
}
