/**
 * Normalización de paths Windows para lectura (PHASE 59).
 * Evita el clásico `C:` (= cwd del drive) vs `C:\` (= raíz).
 */
import path from "node:path";

export function looksWindowsPath(p: string): boolean {
  return /^[a-zA-Z]:[\\/]?/.test(p) || (p.includes("\\") && !p.startsWith("/"));
}

/**
 * Normaliza input de usuario/LLM a un path usable en Windows.
 * - `C:` / `C:/` → `C:\`
 * - colapsa `\\` duplicados (excepto UNC `\\server\share`)
 * - unifica separadores a `\`
 */
export function normalizeWindowsFsPath(raw: string): string {
  let p = raw.trim();
  if (p.length === 0) return p;

  p = p.replace(/\//g, "\\");

  if (p.startsWith("\\\\")) {
    // UNC: conservar \\ inicial; colapsar el resto.
    const rest = p.slice(2).replace(/\\+/g, "\\");
    p = `\\\\${rest}`;
    return path.win32.normalize(p);
  }

  p = p.replace(/\\+/g, "\\");

  // "C:" → raíz del volumen (no el cwd del drive).
  if (/^[A-Za-z]:$/.test(p)) {
    return `${p}\\`;
  }

  // "C:\" ya es raíz.
  if (/^[A-Za-z]:\\$/.test(p)) {
    return `${p[0].toUpperCase()}:\\`;
  }

  // "C:Users\..." (sin barra tras :) — raro pero lo vemos en LLMs.
  if (/^[A-Za-z]:[^\\]/.test(p)) {
    p = `${p[0]}:\\${p.slice(2)}`;
  }

  const normalized = path.win32.normalize(p);
  // path.win32.normalize("C:\\") → "C:\\"
  if (/^[A-Za-z]:\\$/.test(normalized)) {
    return `${normalized[0].toUpperCase()}:\\`;
  }
  return normalized;
}

export function isWindowsDriveRoot(p: string): boolean {
  const n = normalizeWindowsFsPath(p);
  return /^[A-Za-z]:\\$/.test(n);
}

/** Variantes a probar con readdir en raíces de unidad (bugs Node/libuv). */
export function windowsDriveRootReadCandidates(driveRoot: string): string[] {
  const root = normalizeWindowsFsPath(driveRoot);
  if (!isWindowsDriveRoot(root)) return [driveRoot];
  // `X:\.` evita ENOENT en algunos Node 22 / subst.
  return [root, `${root}.`];
}

/** Carpetas típicas de la raíz de C: si readdir de la unidad falla. */
export const WINDOWS_DRIVE_ROOT_FALLBACK_NAMES: readonly string[] = [
  "Users",
  "Program Files",
  "Program Files (x86)",
  "Windows",
  "ProgramData",
  "PerfLogs",
];
