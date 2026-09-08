/** Fuentes estructuradas de una respuesta (PHASE 60.15.1). */

export type AgentSourceType = "web" | "knowledge" | "academic" | "official";

export type AgentSource = {
  id: string;
  title: string;
  url: string;
  domain: string;
  snippet?: string;
  sourceType?: AgentSourceType;
};

export const SOURCE_TYPE_LABELS: Record<AgentSourceType, string> = {
  web: "Web",
  knowledge: "Knowledge",
  academic: "Academic",
  official: "Official",
};

/** Etiqueta del chip: "1 fuente" / "N fuentes". Vacío si count ≤ 0. */
export function sourcesChipLabel(count: number): string {
  if (count <= 0) return "";
  return count === 1 ? "1 fuente" : `${count} fuentes`;
}

export function sourcesPanelTitle(count: number): string {
  if (count <= 0) return "Fuentes";
  return count === 1 ? "1 fuente" : `${count} fuentes`;
}

export function isSafeHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function normalizeAgentSources(raw: unknown): AgentSource[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: AgentSource[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id : "";
    const title = typeof r.title === "string" ? r.title : "";
    const url = typeof r.url === "string" ? r.url : "";
    const domain = typeof r.domain === "string" ? r.domain : "";
    if (!id || !title || !url || !isSafeHttpUrl(url)) continue;
    const snippet =
      typeof r.snippet === "string" && r.snippet.trim()
        ? r.snippet.trim()
        : undefined;
    const st = r.sourceType;
    const sourceType =
      st === "web" ||
      st === "knowledge" ||
      st === "academic" ||
      st === "official"
        ? st
        : undefined;
    out.push({
      id,
      title,
      url,
      domain: domain || "",
      ...(snippet ? { snippet } : {}),
      ...(sourceType ? { sourceType } : {}),
    });
  }
  return out.length > 0 ? out : undefined;
}
