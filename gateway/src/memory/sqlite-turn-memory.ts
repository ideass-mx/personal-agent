/**
 * Adapter TurnMemory → funciones SQLite de history.ts.
 * touchDevice permanece en history.ts, fuera de este puerto.
 */
import type { HistoryEntry, Role, TurnMemory } from "./types.ts";
import {
  addMessage,
  ensureConversation,
  getHistory,
} from "./history.ts";

export class SqliteTurnMemory implements TurnMemory {
  ensureConversation(conversationId?: string): string {
    return ensureConversation(conversationId);
  }

  addMessage(
    conversationId: string,
    role: Role,
    content: string,
    deviceId?: string,
  ): string {
    return addMessage(conversationId, role, content, deviceId);
  }

  getHistory(conversationId: string): HistoryEntry[] {
    return getHistory(conversationId);
  }
}

export function createSqliteTurnMemory(): TurnMemory {
  return new SqliteTurnMemory();
}
