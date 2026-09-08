/**
 * Expansión de atajos de path del usuario (PHASE 59 hotfix).
 * Desktop / Documents / ~ / %USERPROFILE% → rutas absolutas reales.
 */
import { homedir } from "node:os";
import path from "node:path";
import { looksWindowsPath, normalizeWindowsFsPath } from "./fs-windows-path.ts";

const HOME_SHORTCUTS: Readonly<Record<string, string>> = Object.freeze({
  desktop: "Desktop",
  documents: "Documents",
  downloads: "Downloads",
  pictures: "Pictures",
  music: "Music",
  videos: "Videos",
  // ES
  escritorio: "Desktop",
  documentos: "Documents",
  descargas: "Downloads",
  imagenes: "Pictures",
  imágenes: "Pictures",
  musica: "Music",
  música: "Music",
});

function expandEnvVars(raw: string): string {
  return raw.replace(/%([^%]+)%/g, (full, name: string) => {
    const v = process.env[name] ?? process.env[name.toUpperCase()];
    return typeof v === "string" && v.length > 0 ? v : full;
  });
}

/**
 * Convierte atajos amigables en paths absolutos cuando aplica.
 * No cambia rutas absolutas ya válidas (salvo env vars / ~).
 */
export function expandUserPathShortcuts(rawPath: string): string {
  let p = rawPath.trim();
  if (p.length === 0) return p;

  p = expandEnvVars(p);

  if (p === "~" || p === "~/" || p === "~\\") {
    return homedir();
  }
  if (p.startsWith("~/") || p.startsWith("~\\")) {
    return path.join(homedir(), p.slice(2));
  }

  const win = process.platform === "win32" || looksWindowsPath(p);
  if (win) {
    p = normalizeWindowsFsPath(p);
  }

  // Absolute ya (C:\... o /...)
  if (path.isAbsolute(p) || (win && /^[A-Za-z]:\\/.test(p))) {
    return p;
  }

  // Un solo segmento: Desktop, Documents, Users, etc.
  const cleaned = p.replace(/^[\\/]+|[\\/]+$/g, "");
  if (!cleaned.includes("/") && !cleaned.includes("\\")) {
    const key = cleaned.toLowerCase();
    if (key === "users" && process.platform === "win32") {
      const drive = process.env.SystemDrive || "C:";
      return normalizeWindowsFsPath(`${drive}\\Users`);
    }
    const mapped = HOME_SHORTCUTS[key];
    if (mapped) {
      return path.join(homedir(), mapped);
    }
    if (key === "home" || key === "userprofile" || key === "perfil") {
      return homedir();
    }
  }

  return p;
}

/**
 * Si el LLM anidó el envelope MCP por error, extrae el input de negocio.
 */
export function unwrapToolBusinessInput(input: unknown): unknown {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return input;
  }
  const rec = input as Record<string, unknown>;
  const hasEnvelopeKeys =
    typeof rec.requestId === "string" &&
    typeof rec.context === "object" &&
    rec.context !== null &&
    "input" in rec;
  if (!hasEnvelopeKeys) return input;
  return rec.input;
}
