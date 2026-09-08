/**
 * Tipos de archivo y detección binaria para lectura / content-search (PHASE 59).
 */
import path from "node:path";

/** Extensiones de texto seguro para content search / read UTF-8. */
export const TEXT_CONTENT_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".json",
  ".csv",
  ".xml",
  ".html",
  ".htm",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".java",
  ".py",
  ".kt",
  ".kts",
  ".c",
  ".cpp",
  ".cc",
  ".cxx",
  ".h",
  ".hpp",
  ".sql",
  ".yaml",
  ".yml",
  ".log",
  ".ini",
  ".cfg",
  ".conf",
  ".toml",
  ".rs",
  ".go",
  ".sh",
  ".bat",
  ".ps1",
  ".css",
  ".scss",
  ".env",
  ".gitignore",
  ".dockerignore",
]);

/** Extensiones binarias / comprimidas: no content-search ni UTF-8 al LLM. */
export const BINARY_EXTENSIONS = new Set([
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".bin",
  ".iso",
  ".img",
  ".dmg",
  ".zip",
  ".7z",
  ".rar",
  ".gz",
  ".tar",
  ".bz2",
  ".xz",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".bmp",
  ".mp3",
  ".mp4",
  ".avi",
  ".mkv",
  ".mov",
  ".wav",
  ".flac",
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".odt",
  ".ods",
  ".class",
  ".jar",
  ".war",
  ".pyc",
  ".o",
  ".obj",
  ".lib",
  ".a",
  ".wasm",
]);

export function fileExtension(filePath: string): string {
  return path.extname(filePath).toLowerCase();
}

export function isBinaryExtension(filePath: string): boolean {
  return BINARY_EXTENSIONS.has(fileExtension(filePath));
}

export function isTextContentExtension(filePath: string): boolean {
  const ext = fileExtension(filePath);
  if (ext === "") return false;
  return TEXT_CONTENT_EXTENSIONS.has(ext);
}

/** Heurística: NUL en la muestra ⇒ binario. */
export function sampleLooksBinary(sample: Buffer): boolean {
  const n = Math.min(sample.byteLength, 8192);
  for (let i = 0; i < n; i += 1) {
    if (sample[i] === 0) return true;
  }
  return false;
}

export function normalizeFileTypes(
  fileTypes: readonly string[] | undefined,
): string[] | undefined {
  if (!fileTypes || fileTypes.length === 0) return undefined;
  const out: string[] = [];
  for (const raw of fileTypes) {
    if (typeof raw !== "string" || raw.trim().length === 0) continue;
    let t = raw.trim().toLowerCase();
    if (t.startsWith("*.")) t = t.slice(2);
    if (t.startsWith(".")) t = t.slice(1);
    if (t.length > 0) out.push(`.${t}`);
  }
  return out.length > 0 ? out : undefined;
}
