/**
 * Quita o parsea JSON de tool_call filtrado al texto del asistente
 * (eco de stringify interno en providers OpenAI-compat).
 */

export function parseLeakedToolCallJson(
  text: string,
): Array<{ id: string; name: string; input: unknown }> | null {
  const t = text.trim();
  if (!t.startsWith("[") || !t.includes("tool_call")) return null;
  try {
    const parsed = JSON.parse(t) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const out: Array<{ id: string; name: string; input: unknown }> = [];
    for (const row of parsed) {
      if (!row || typeof row !== "object") return null;
      const r = row as Record<string, unknown>;
      if (r.type !== "tool_call" || typeof r.name !== "string" || !r.name.trim()) {
        return null;
      }
      out.push({
        id: typeof r.id === "string" && r.id.trim() ? r.id : `tool_${Date.now()}`,
        name: r.name.trim(),
        input: r.input ?? {},
      });
    }
    return out;
  } catch {
    return null;
  }
}

export function stripLeakedToolCallJson(text: string): string {
  const raw = text ?? "";
  if (parseLeakedToolCallJson(raw)) return "";
  const trimmed = raw.replace(
    /\n*\s*\[\s*\{\s*"type"\s*:\s*"tool_call"[\s\S]*\]\s*$/m,
    "",
  );
  return trimmed === raw ? raw : trimmed.trimEnd();
}
