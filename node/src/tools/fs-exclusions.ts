/**
 * Exclusiones técnicas para búsquedas amplias (PHASE 59).
 * No son Permission System ni UI de permisos: evitan recorrer ruido de SO.
 */
import path from "node:path";

/** Prefijos absolutos (Windows) que se omiten salvo path explícito del usuario. */
export const DEFAULT_WINDOWS_EXCLUSION_PREFIXES: readonly string[] = [
  "C:\\Windows",
  "C:\\Program Files",
  "C:\\Program Files (x86)",
  "C:\\ProgramData",
  "C:\\$Recycle.Bin",
  "C:\\System Volume Information",
  "C:\\Recovery",
  "C:\\PerfLogs",
];

/** Nombres de carpeta a omitir en cualquier unidad (case-insensitive). */
export const DEFAULT_SKIP_DIR_NAMES: readonly string[] = [
  "node_modules",
  ".git",
  ".svn",
  ".hg",
  "__pycache__",
  ".cache",
  "Cache",
  "Caches",
  "Temp",
  "tmp",
  "$Recycle.Bin",
  "System Volume Information",
  "AppData", // bajo Users: demasiado ruido; path explícito sí permitido
];

function looksWindowsPath(p: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(p) || (p.includes("\\") && !p.startsWith("/"));
}

export function normalizePathKey(p: string): string {
  if (looksWindowsPath(p) || process.platform === "win32") {
    return path.win32.resolve(p).replace(/\//g, "\\").toLowerCase();
  }
  return path.resolve(p);
}

export function isUnderPrefix(candidate: string, prefix: string): boolean {
  const c = normalizePathKey(candidate);
  const p = normalizePathKey(prefix);
  if (c === p) return true;
  const win =
    looksWindowsPath(candidate) ||
    looksWindowsPath(prefix) ||
    process.platform === "win32";
  const sep = win ? "\\" : path.sep;
  return c.startsWith(p.endsWith(sep) ? p : `${p}${sep}`);
}

export function isExcludedPath(
  candidate: string,
  prefixes: readonly string[] = DEFAULT_WINDOWS_EXCLUSION_PREFIXES,
): boolean {
  return prefixes.some((prefix) => isUnderPrefix(candidate, prefix));
}

export function shouldSkipDirName(
  name: string,
  skipNames: readonly string[] = DEFAULT_SKIP_DIR_NAMES,
): boolean {
  const lower = name.toLowerCase();
  return skipNames.some((n) => n.toLowerCase() === lower);
}
