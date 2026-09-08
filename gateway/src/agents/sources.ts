/**
 * Agrega fuentes de research.* durante un turno (PHASE 60.15.1).
 * Dedupe por URL; ids estables source-1…N. Sin providers internos.
 */
import type { AgentSource, AgentSourceType } from "../../../packages/protocol/messages.ts";
import type { ToolResult } from "../tools/types.ts";

const SOURCE_TYPES = new Set<AgentSourceType>([
  "web",
  "knowledge",
  "academic",
  "official",
]);

type SourceDraft = Omit<AgentSource, "id">;

function canonicalizeUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function asSourceType(v: unknown): AgentSourceType | undefined {
  return typeof v === "string" && SOURCE_TYPES.has(v as AgentSourceType)
    ? (v as AgentSourceType)
    : undefined;
}

function upsert(
  map: Map<string, SourceDraft>,
  draft: SourceDraft,
): void {
  const key = canonicalizeUrl(draft.url);
  if (!key) return;
  const existing = map.get(key);
  if (!existing) {
    map.set(key, { ...draft, url: key, domain: draft.domain || domainOf(key) });
    return;
  }
  const title =
    draft.title.length > existing.title.length ? draft.title : existing.title;
  const snippet =
    (draft.snippet?.length ?? 0) > (existing.snippet?.length ?? 0)
      ? draft.snippet
      : existing.snippet;
  map.set(key, {
    title,
    url: key,
    domain: existing.domain || draft.domain || domainOf(key),
    ...(snippet ? { snippet } : {}),
    sourceType: existing.sourceType ?? draft.sourceType,
  });
}

export type TurnSourceCollector = {
  ingestTool(toolName: string, result: ToolResult): void;
  finalize(): AgentSource[];
};

export function createTurnSourceCollector(): TurnSourceCollector {
  const byUrl = new Map<string, SourceDraft>();

  function ingestSearch(content: unknown): void {
    if (!content || typeof content !== "object") return;
    const results = (content as { results?: unknown }).results;
    if (!Array.isArray(results)) return;
    for (const row of results) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const url = typeof r.url === "string" ? r.url : "";
      const title =
        typeof r.title === "string" && r.title.trim()
          ? r.title.trim().slice(0, 300)
          : "";
      if (!url || !title) continue;
      const domain =
        typeof r.domain === "string" && r.domain
          ? r.domain
          : typeof r.source === "string"
            ? r.source
            : domainOf(url);
      const snippet =
        typeof r.snippet === "string" && r.snippet.trim()
          ? r.snippet.trim().slice(0, 400)
          : undefined;
      upsert(byUrl, {
        title,
        url,
        domain,
        ...(snippet ? { snippet } : {}),
        sourceType: asSourceType(r.sourceFamily) ?? asSourceType(r.sourceType),
      });
    }
  }

  function ingestFetch(content: unknown): void {
    if (!content || typeof content !== "object") return;
    const r = content as Record<string, unknown>;
    const url =
      (typeof r.finalUrl === "string" && r.finalUrl) ||
      (typeof r.url === "string" && r.url) ||
      "";
    if (!url) return;
    const title =
      typeof r.title === "string" && r.title.trim()
        ? r.title.trim().slice(0, 300)
        : domainOf(url) || url;
    upsert(byUrl, {
      title,
      url,
      domain: domainOf(url),
      sourceType: "web",
    });
  }

  return {
    ingestTool(toolName, result) {
      if (!result.ok) return;
      if (toolName === "research.search") ingestSearch(result.content);
      else if (toolName === "research.fetch") ingestFetch(result.content);
    },
    finalize() {
      return [...byUrl.values()].map((s, i) => ({
        ...s,
        id: `source-${i + 1}`,
      }));
    },
  };
}
