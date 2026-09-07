/**
 * Helpers PHASE 58 — etiquetas humanas de conversación (sin IDs).
 */
export function conversationListLabel(c: {
  title: string | null;
  summary?: string | null;
}): string {
  const title = c.title?.trim();
  if (title) return title;
  const summary = c.summary?.trim();
  if (summary) {
    return summary.length > 48 ? `${summary.slice(0, 48).trim()}…` : summary;
  }
  return "Nueva conversación";
}

export function looksLikeTechnicalId(label: string): boolean {
  return (
    /^c_[0-9a-f-]{8}/i.test(label) ||
    /^[0-9a-f]{8}/i.test(label) ||
    label === "local-user" ||
    label === "personal-agent" ||
    /Navegar Personal Agent/i.test(label)
  );
}
