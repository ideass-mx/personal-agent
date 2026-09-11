/**
 * Detalle seguro para `tool_progress.detail` (UI). Sin secretos ni dumps.
 */
export function safeToolProgressDetail(
  toolName: string,
  input: unknown,
): string | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }
  const o = input as Record<string, unknown>;
  const clip = (s: string, max = 96) => {
    const t = s.replace(/\s+/g, " ").trim();
    if (!t) return undefined;
    return t.length > max ? `${t.slice(0, max - 1)}…` : t;
  };

  if (
    toolName === "research.search" ||
    toolName === "filesystem.search"
  ) {
    const q =
      typeof o.query === "string"
        ? o.query
        : typeof o.pattern === "string"
          ? o.pattern
          : typeof o.q === "string"
            ? o.q
            : undefined;
    return q ? clip(q) : undefined;
  }

  if (toolName === "research.fetch") {
    const url = typeof o.url === "string" ? o.url : undefined;
    if (!url) return undefined;
    try {
      return clip(new URL(url).hostname, 64);
    } catch {
      return undefined;
    }
  }

  if (
    toolName === "filesystem.read" ||
    toolName === "filesystem.write" ||
    toolName === "filesystem.list" ||
    toolName === "filesystem.delete"
  ) {
    const path =
      typeof o.path === "string"
        ? o.path
        : typeof o.relativePath === "string"
          ? o.relativePath
          : undefined;
    if (!path) return undefined;
    const base = path.replace(/\\/g, "/").split("/").filter(Boolean).pop();
    return base ? clip(base, 64) : undefined;
  }

  if (toolName === "process.execute") {
    const cmd =
      typeof o.command === "string"
        ? o.command
        : typeof o.cmd === "string"
          ? o.cmd
          : undefined;
    return cmd ? clip(cmd, 72) : undefined;
  }

  return undefined;
}
