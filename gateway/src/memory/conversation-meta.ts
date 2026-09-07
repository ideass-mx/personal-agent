/**
 * PHASE 58 — Semantic title/summary for conversations (deterministic, no LLM).
 */
import type { WorkspaceSqlDb } from "../workspace/sqlite-workspace-store.ts";
import { db } from "../db/database.ts";
import {
  getConversation,
  type ConversationRecord,
} from "./conversation-workspace.ts";

const STOP_PREFIX =
  /^(?:hola[,!.]?\s+|buenas?\s+|hey[,!.]?\s+)?(?:quiero|necesito|me gustar[ií]a|podr[ií]as|puedes|ayúdame|ayudame|ayuda(?:me)?(?:\s+(?:a|con))?|deseo|quisiera)\s+/i;

/** Short human title from the first user message. Never returns an id/hash. */
export function deriveConversationTitle(userText: string): string {
  const cleaned = userText.replace(/\s+/g, " ").trim();
  if (!cleaned) return "Nueva conversación";
  let t = cleaned.replace(STOP_PREFIX, "").trim() || cleaned;
  t = (t.split(/[.!?\n]/)[0] ?? t).trim() || cleaned;
  if (t.length > 52) {
    t = t.slice(0, 52).replace(/\s+\S*$/, "").trim() || t.slice(0, 52);
  }
  t = t.replace(/[,:;]+$/, "").trim();
  if (!t) return "Nueva conversación";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** One-line summary for list/search. Never an id/hash. */
export function deriveConversationSummary(userText: string): string {
  const cleaned = userText.replace(/\s+/g, " ").trim();
  if (!cleaned) return "Conversación sin detalle aún.";
  let s = cleaned;
  if (s.length > 140) {
    s = s.slice(0, 140).replace(/\s+\S*$/, "").trim() + "…";
  }
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function updateConversationMeta(
  conversationId: string,
  input: { title?: string | null; summary?: string | null },
  sql: WorkspaceSqlDb = db as unknown as WorkspaceSqlDb,
): ConversationRecord | null {
  const current = getConversation(conversationId, sql);
  if (!current) return null;
  const title =
    input.title === undefined
      ? current.title
      : input.title === null
        ? null
        : input.title.trim() || null;
  const summary =
    input.summary === undefined
      ? current.summary
      : input.summary === null
        ? null
        : input.summary.trim() || null;
  const cols = (
    sql.prepare(`PRAGMA table_info(conversations)`).all() as Array<{
      name: string;
    }>
  ).map((c) => c.name);
  if (cols.includes("summary") && cols.includes("updated_at")) {
    sql
      .prepare(
        `UPDATE conversations
         SET title = ?, summary = ?, updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(title, summary, conversationId);
  } else {
    sql
      .prepare(`UPDATE conversations SET title = ? WHERE id = ?`)
      .run(title, conversationId);
  }
  return getConversation(conversationId, sql) ?? null;
}

/**
 * Persist title/summary once when still empty. Safe to call after each turn.
 * Does not call an LLM.
 */
export function maybeAnnotateConversation(
  conversationId: string,
  userMessage: string,
  sql: WorkspaceSqlDb = db as unknown as WorkspaceSqlDb,
): ConversationRecord | null {
  const current = getConversation(conversationId, sql);
  if (!current) return null;
  if (current.title && current.summary) return current;
  const title = current.title ?? deriveConversationTitle(userMessage);
  const summary = current.summary ?? deriveConversationSummary(userMessage);
  return updateConversationMeta(
    conversationId,
    { title, summary },
    sql,
  );
}
