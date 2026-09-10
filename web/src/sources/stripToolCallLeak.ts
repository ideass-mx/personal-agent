/**
 * Quita JSON de tool_call filtrado al texto del asistente (eco de providers).
 */
export function stripLeakedToolCallJson(text: string): string {
  const raw = text ?? "";
  const t = raw.trim();
  if (t.startsWith("[") && t.includes("tool_call")) {
    try {
      const parsed = JSON.parse(t) as unknown;
      if (
        Array.isArray(parsed) &&
        parsed.length > 0 &&
        parsed.every(
          (row) =>
            row &&
            typeof row === "object" &&
            (row as { type?: unknown }).type === "tool_call" &&
            typeof (row as { name?: unknown }).name === "string",
        )
      ) {
        return "";
      }
    } catch {
      /* no es JSON completo */
    }
  }
  const trimmed = raw.replace(
    /\n*\s*\[\s*\{\s*"type"\s*:\s*"tool_call"[\s\S]*\]\s*$/m,
    "",
  );
  return trimmed === raw ? raw : trimmed.trimEnd();
}
