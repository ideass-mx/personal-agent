/**
 * Preferencia de inteligencia por conversación (no es la predeterminada global).
 */
import fs from "node:fs";
import path from "node:path";
import { resolveProductDataRoot } from "../local-llm/storage.ts";

type Store = Record<string, string>;

function storePath(): string {
  return path.join(
    resolveProductDataRoot(),
    "config",
    "conversation-intelligence.json",
  );
}

function readStore(): Store {
  try {
    const raw = fs.readFileSync(storePath(), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const out: Store = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim()) out[k] = v.trim();
    }
    return out;
  } catch {
    return {};
  }
}

function writeStore(store: Store): void {
  const file = storePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(store, null, 2), "utf8");
}

export function getConversationIntelligenceConnectionId(
  conversationId: string,
): string | null {
  const id = readStore()[conversationId];
  return id || null;
}

export function setConversationIntelligenceConnectionId(
  conversationId: string,
  connectionId: string | null,
): void {
  const store = readStore();
  if (!connectionId) {
    delete store[conversationId];
  } else {
    store[conversationId] = connectionId;
  }
  writeStore(store);
}
