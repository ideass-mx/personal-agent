/**
 * PHASE 58 / 58.4 — Title/summary for conversations.
 * Prefer LLM semantic titles; deterministic fallback if LLM fails.
 * Does not go through AgentRuntime (no DB imports there); uses existing LLMProvider.
 */
import type { WorkspaceSqlDb } from "../workspace/sqlite-workspace-store.ts";
import { db } from "../db/database.ts";
import {
  getConversation,
  type ConversationRecord,
} from "./conversation-workspace.ts";
import { createLlmProvider } from "../providers/registry.ts";
import { hasProviderApiKeyConfigured } from "../setup/llm-key.ts";
import { DEFAULT_AGENT_MODEL } from "../agents/definition.ts";

const STOP_PREFIX =
  /^(?:hola[,!.]?\s+|buenas?\s+|hey[,!.]?\s+)?(?:quiero|necesito|me gustar[ií]a|podr[ií]as|puedes|ayúdame|ayudame|ayuda(?:me)?(?:\s+(?:a|con))?|deseo|quisiera)\s+/i;

const TITLE_MAX = 60;
const SUMMARY_MAX = 220;

const META_SYSTEM = `Genera metadatos breves para una conversación con un asistente.
Responde ÚNICAMENTE con JSON válido, sin markdown ni explicaciones:
{"title":"...","summary":"..."}

Reglas para title:
- Máximo 60 caracteres.
- Describe la tarea, tema u objetivo principal del usuario.
- No uses saludos, ni prefijos como "Conversación sobre", "Chat sobre", "El usuario quiere".
- No inventes información que no esté en el mensaje.
- Idioma: el mismo que el mensaje del usuario (español si el mensaje es en español).

Reglas para summary:
- Una o dos frases, más descriptivas que el título.
- Sin IDs técnicos ni secretos.`;

const annotating = new Set<string>();
const LLM_META_TIMEOUT_MS = 3500;

/** Diagnostic only — never logs prompts, keys, tokens, or message bodies. */
function logConversationMeta(
  event:
    | "annotation_started"
    | "annotation_completed"
    | "title_generated"
    | "summary_generated"
    | "annotation_failed",
  conversationId: string,
  extra?: Record<string, string | boolean | number | undefined>,
): void {
  const payload: Record<string, string | boolean | number | undefined> = {
    conversation_id: conversationId,
    ...extra,
  };
  console.log(`[gateway] conversation_meta event=${event}`, payload);
}

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
  return clampTitle(t.charAt(0).toUpperCase() + t.slice(1));
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

export function isPlaceholderTitle(title: string | null | undefined): boolean {
  if (!title?.trim()) return true;
  return title.trim().toLowerCase() === "nueva conversación";
}

export function conversationNeedsAnnotation(
  current: Pick<ConversationRecord, "title" | "summary">,
): boolean {
  return isPlaceholderTitle(current.title) || !current.summary?.trim();
}

export function clampTitle(raw: string): string {
  let t = raw.replace(/\s+/g, " ").trim();
  t = t.replace(/^["'«»]+|["'«»]+$/g, "").trim();
  if (t.length > TITLE_MAX) {
    t = t.slice(0, TITLE_MAX).replace(/\s+\S*$/, "").trim() || t.slice(0, TITLE_MAX);
  }
  return t;
}

export function looksLikeTechnicalTitle(title: string): boolean {
  const t = title.trim();
  return (
    /^c_[0-9a-f-]{8}/i.test(t) ||
    /^conv_[0-9a-f]/i.test(t) ||
    /^ws_[0-9a-f]/i.test(t) ||
    /^session_/i.test(t) ||
    t === "local-user" ||
    t === "personal-agent"
  );
}

export function sanitizeGeneratedTitle(raw: string): string | null {
  let t = clampTitle(raw);
  t = t
    .replace(/^(?:conversaci[oó]n|chat|hilo)\s+(?:sobre|de|acerca de)\s+/i, "")
    .replace(/^(?:el usuario (?:quiere|necesita|pide)\s+)/i, "")
    .trim();
  t = clampTitle(t);
  if (!t || isPlaceholderTitle(t) || looksLikeTechnicalTitle(t)) return null;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function sanitizeGeneratedSummary(raw: string): string | null {
  let s = raw.replace(/\s+/g, " ").trim();
  s = s.replace(/^["'«»]+|["'«»]+$/g, "").trim();
  if (!s || looksLikeTechnicalTitle(s)) return null;
  if (s.length > SUMMARY_MAX) {
    s = s.slice(0, SUMMARY_MAX).replace(/\s+\S*$/, "").trim() + "…";
  }
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Parse LLM JSON (or plain title line) into title/summary. */
export function parseMetaLlmResponse(
  raw: string,
): { title: string | null; summary: string | null } {
  const text = raw.trim();
  if (!text) return { title: null, summary: null };
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const obj = JSON.parse(jsonMatch[0]) as {
        title?: unknown;
        summary?: unknown;
      };
      return {
        title:
          typeof obj.title === "string"
            ? sanitizeGeneratedTitle(obj.title)
            : null,
        summary:
          typeof obj.summary === "string"
            ? sanitizeGeneratedSummary(obj.summary)
            : null,
      };
    } catch {
      /* fall through */
    }
  }
  const firstLine = text.split(/\n/)[0] ?? text;
  return {
    title: sanitizeGeneratedTitle(firstLine),
    summary: null,
  };
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
 * Deterministic annotate (no LLM). Used as fallback and in unit tests.
 * Safe to call after each turn; only fills placeholder/missing fields.
 */
export function maybeAnnotateConversation(
  conversationId: string,
  userMessage: string,
  sql: WorkspaceSqlDb = db as unknown as WorkspaceSqlDb,
): ConversationRecord | null {
  const current = getConversation(conversationId, sql);
  if (!current) return null;
  if (!conversationNeedsAnnotation(current)) return current;
  const title = isPlaceholderTitle(current.title)
    ? deriveConversationTitle(userMessage)
    : current.title;
  const summary = current.summary?.trim()
    ? current.summary
    : deriveConversationSummary(userMessage);
  return updateConversationMeta(
    conversationId,
    { title, summary },
    sql,
  );
}

async function generateMetaViaLlm(
  userMessage: string,
): Promise<{ title: string | null; summary: string | null } | null> {
  const trimmed = userMessage.replace(/\s+/g, " ").trim();
  if (trimmed.length < 3) return null;
  if (!hasProviderApiKeyConfigured("anthropic")) return null;
  try {
    const provider = createLlmProvider("anthropic");
    let text = "";
    for await (const event of provider.stream({
      system: META_SYSTEM,
      model: DEFAULT_AGENT_MODEL,
      messages: [
        {
          role: "user",
          content: `Mensaje del usuario:\n${trimmed.slice(0, 2000)}`,
        },
      ],
    })) {
      if (event.type === "text_delta") text += event.text;
    }
    if (!text.trim()) return null;
    return parseMetaLlmResponse(text);
  } catch {
    return null;
  }
}

async function generateMetaViaLlmBounded(
  userMessage: string,
  timeoutMs: number,
): Promise<{ title: string | null; summary: string | null } | null> {
  return await Promise.race([
    generateMetaViaLlm(userMessage),
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), timeoutMs);
    }),
  ]);
}

/**
 * Prefer LLM title/summary once; fall back to deterministic heuristics.
 * Writes deterministic metadata BEFORE awaiting the LLM so GET/sidebar
 * never wait on a slow or hung provider. Never throws to the caller.
 */
export async function maybeAnnotateConversationAsync(
  conversationId: string,
  userMessage: string,
  sql: WorkspaceSqlDb = db as unknown as WorkspaceSqlDb,
): Promise<ConversationRecord | null> {
  const current = getConversation(conversationId, sql);
  if (!current) {
    logConversationMeta("annotation_failed", conversationId, {
      reason: "not_found",
    });
    return null;
  }
  if (!conversationNeedsAnnotation(current)) return current;
  if (annotating.has(conversationId)) return current;
  annotating.add(conversationId);
  try {
    logConversationMeta("annotation_started", conversationId);

    // Re-read after lock to avoid double-write races.
    const latest = getConversation(conversationId, sql);
    if (!latest || !conversationNeedsAnnotation(latest)) {
      return latest ?? null;
    }

    // 1) Persist deterministic title/summary immediately (sync until first await).
    let record = maybeAnnotateConversation(conversationId, userMessage, sql);
    if (!record) {
      logConversationMeta("annotation_failed", conversationId, {
        reason: "seed_failed",
      });
      return null;
    }
    if (record.title) {
      logConversationMeta("title_generated", conversationId, {
        source: "fallback",
      });
    }
    if (record.summary) {
      logConversationMeta("summary_generated", conversationId, {
        source: "fallback",
      });
    }

    // 2) Optional LLM upgrade (bounded). Failure keeps the fallback.
    const llm = await generateMetaViaLlmBounded(
      userMessage,
      LLM_META_TIMEOUT_MS,
    );
    if (llm && (llm.title || llm.summary)) {
      const upgraded = updateConversationMeta(
        conversationId,
        {
          title: llm.title ?? record.title,
          summary: llm.summary ?? record.summary,
        },
        sql,
      );
      if (upgraded) {
        record = upgraded;
        if (llm.title) {
          logConversationMeta("title_generated", conversationId, {
            source: "llm",
          });
        }
        if (llm.summary) {
          logConversationMeta("summary_generated", conversationId, {
            source: "llm",
          });
        }
      }
    }

    logConversationMeta("annotation_completed", conversationId, {
      has_title: Boolean(record.title),
      has_summary: Boolean(record.summary),
    });
    return record;
  } catch {
    try {
      const fallback = maybeAnnotateConversation(
        conversationId,
        userMessage,
        sql,
      );
      logConversationMeta("annotation_failed", conversationId, {
        reason: "exception_fallback",
      });
      return fallback;
    } catch {
      logConversationMeta("annotation_failed", conversationId, {
        reason: "exception",
      });
      return getConversation(conversationId, sql) ?? null;
    }
  } finally {
    annotating.delete(conversationId);
  }
}
