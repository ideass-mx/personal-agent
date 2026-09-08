/**
 * filesystem.search — localiza archivos en la máquina (PHASE 59).
 *
 * Hub: automatic / ALLOWED. Sin indexador global: recorrido bajo demanda.
 * Contención de escritura no aplica; exclusiones técnicas evitan ruido de SO.
 */
import { open, stat } from "node:fs/promises";
import path from "node:path";
import { detectSearchRoots } from "./fs-drives.ts";
import {
  DEFAULT_SKIP_DIR_NAMES,
  DEFAULT_WINDOWS_EXCLUSION_PREFIXES,
  isExcludedPath,
  shouldSkipDirName,
} from "./fs-exclusions.ts";
import {
  isBinaryExtension,
  isTextContentExtension,
  normalizeFileTypes,
  sampleLooksBinary,
} from "./fs-file-kinds.ts";
import {
  listWindowsDriveRootFallback,
  readdirRobust,
  resolveReadablePath,
} from "./fs-readable-path.ts";
import { isWindowsDriveRoot, normalizeWindowsFsPath } from "./fs-windows-path.ts";
import { unwrapToolBusinessInput } from "./fs-user-paths.ts";
import type { AgentTool, ToolResult } from "./types.ts";

export const FILESYSTEM_SEARCH_NAME = "filesystem.search";

export const FILESYSTEM_SEARCH_DESCRIPTION =
  "Busca archivos en la computadora del usuario por nombre, ruta, tipo, fecha, tamaño o contenido (cuando el formato lo permite). No requiere carpeta previa. Preferible a listar C:\\\\ entero.";

export const FILESYSTEM_SEARCH_INPUT_SCHEMA = {
  type: "object",
  properties: {
    query: {
      type: "string",
      description:
        "Texto a buscar en el nombre o la ruta (p. ej. contrato IDEASS).",
    },
    path: {
      type: "string",
      description:
        "Raíz opcional. Si se omite, se buscan las unidades / ubicaciones accesibles.",
    },
    fileTypes: {
      type: "array",
      items: { type: "string" },
      description: 'Extensiones sin punto o con él (p. ej. ["pdf","docx"]).',
    },
    content: {
      type: "string",
      description:
        "Fragmento a buscar dentro del contenido (solo textos seguros).",
    },
    maxResults: { type: "integer", minimum: 1, maximum: 500 },
    maxDepth: { type: "integer", minimum: 0, maximum: 64 },
    timeoutMs: { type: "integer", minimum: 1000, maximum: 300_000 },
    minSize: { type: "integer", minimum: 0 },
    maxSize: { type: "integer", minimum: 0 },
    modifiedAfter: {
      type: "string",
      description: "ISO-8601: solo archivos modificados después.",
    },
    modifiedBefore: {
      type: "string",
      description: "ISO-8601: solo archivos modificados antes.",
    },
    includeContentSearch: {
      type: "boolean",
      description:
        "Si true y hay query/content, también busca en contenido de texto.",
    },
  },
  additionalProperties: false,
} as const;

export const DEFAULT_SEARCH_MAX_RESULTS = 50;
export const DEFAULT_SEARCH_MAX_DEPTH = 24;
export const DEFAULT_SEARCH_TIMEOUT_MS = 45_000;
export const DEFAULT_CONTENT_MAX_BYTES = 512_000;

export type FilesystemSearchMatchType = "filename" | "path" | "content";

export type FilesystemSearchHit = {
  path: string;
  name: string;
  extension: string;
  size: number;
  modifiedAt: string;
  createdAt?: string;
  matchType: FilesystemSearchMatchType;
};

export type FilesystemSearchOptions = {
  /** Raíces por defecto (tests). Si se omite, detectSearchRoots(). */
  defaultRoots?: string[];
  exclusionPrefixes?: readonly string[];
  skipDirNames?: readonly string[];
  contentMaxBytes?: number;
};

function fail(code: string, message: string): ToolResult {
  return { ok: false, error: { code, message } };
}

function nodeErrorCode(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null || !("code" in err)) {
    return undefined;
  }
  const code = (err as { code: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function parseOptionalDate(raw: unknown, field: string): Date | undefined | "bad" {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "string" || raw.trim().length === 0) return "bad";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "bad";
  return d;
}

function parseOptionalInt(
  raw: unknown,
  fallback: number,
  min: number,
  max: number,
): number | "bad" {
  if (raw === undefined || raw === null) return fallback;
  if (typeof raw !== "number" || !Number.isFinite(raw) || !Number.isInteger(raw)) {
    return "bad";
  }
  if (raw < min || raw > max) return "bad";
  return raw;
}

function normalizeQueryTokens(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/[\s_]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

function nameMatches(fileName: string, tokens: string[], fullQuery: string): boolean {
  const lower = fileName.toLowerCase();
  if (fullQuery.length > 0 && lower.includes(fullQuery)) return true;
  if (tokens.length === 0) return true;
  return tokens.every((t) => lower.includes(t));
}

function pathMatches(filePath: string, tokens: string[], fullQuery: string): boolean {
  const lower = filePath.toLowerCase();
  if (fullQuery.length > 0 && lower.includes(fullQuery)) return true;
  if (tokens.length === 0) return false;
  return tokens.every((t) => lower.includes(t));
}

async function readTextSample(
  filePath: string,
  maxBytes: number,
): Promise<string | null> {
  if (isBinaryExtension(filePath)) return null;
  if (!isTextContentExtension(filePath)) return null;
  let handle;
  try {
    handle = await open(filePath, "r");
    const buf = Buffer.alloc(Math.min(maxBytes, DEFAULT_CONTENT_MAX_BYTES));
    const { bytesRead } = await handle.read(buf, 0, buf.byteLength, 0);
    const sample = buf.subarray(0, bytesRead);
    if (sampleLooksBinary(sample)) return null;
    return sample.toString("utf8");
  } catch {
    return null;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

export function createFilesystemSearchTool(
  options: FilesystemSearchOptions = {},
): AgentTool {
  const exclusionPrefixes =
    options.exclusionPrefixes ?? DEFAULT_WINDOWS_EXCLUSION_PREFIXES;
  const skipDirNames = options.skipDirNames ?? DEFAULT_SKIP_DIR_NAMES;
  const contentMaxBytes = options.contentMaxBytes ?? DEFAULT_CONTENT_MAX_BYTES;

  return {
    name: FILESYSTEM_SEARCH_NAME,
    description: FILESYSTEM_SEARCH_DESCRIPTION,
    inputSchema: FILESYSTEM_SEARCH_INPUT_SCHEMA,
    executionMode: "automatic",
    async execute(input): Promise<ToolResult> {
      const business = unwrapToolBusinessInput(input);
      if (typeof business !== "object" || business === null) {
        return fail(
          "invalid_input",
          "Se espera un objeto con query y/o filtros.",
        );
      }
      const rec = business as Record<string, unknown>;

      const query =
        typeof rec.query === "string" ? rec.query.trim() : "";
      const contentNeedle =
        typeof rec.content === "string" ? rec.content.trim() : "";
      const explicitPath =
        typeof rec.path === "string" ? rec.path.trim() : "";

      const fileTypes = normalizeFileTypes(
        Array.isArray(rec.fileTypes)
          ? (rec.fileTypes as string[])
          : undefined,
      );

      const maxResults = parseOptionalInt(
        rec.maxResults,
        DEFAULT_SEARCH_MAX_RESULTS,
        1,
        500,
      );
      if (maxResults === "bad") {
        return fail("invalid_input", "maxResults inválido.");
      }
      const maxDepth = parseOptionalInt(
        rec.maxDepth,
        DEFAULT_SEARCH_MAX_DEPTH,
        0,
        64,
      );
      if (maxDepth === "bad") {
        return fail("invalid_input", "maxDepth inválido.");
      }
      const timeoutMs = parseOptionalInt(
        rec.timeoutMs,
        DEFAULT_SEARCH_TIMEOUT_MS,
        1000,
        300_000,
      );
      if (timeoutMs === "bad") {
        return fail("invalid_input", "timeoutMs inválido.");
      }

      const minSize =
        rec.minSize === undefined || rec.minSize === null
          ? undefined
          : parseOptionalInt(rec.minSize, 0, 0, Number.MAX_SAFE_INTEGER);
      if (minSize === "bad") return fail("invalid_input", "minSize inválido.");
      const maxSize =
        rec.maxSize === undefined || rec.maxSize === null
          ? undefined
          : parseOptionalInt(rec.maxSize, 0, 0, Number.MAX_SAFE_INTEGER);
      if (maxSize === "bad") return fail("invalid_input", "maxSize inválido.");

      const modifiedAfter = parseOptionalDate(rec.modifiedAfter, "modifiedAfter");
      if (modifiedAfter === "bad") {
        return fail("invalid_input", "modifiedAfter inválido.");
      }
      const modifiedBefore = parseOptionalDate(
        rec.modifiedBefore,
        "modifiedBefore",
      );
      if (modifiedBefore === "bad") {
        return fail("invalid_input", "modifiedBefore inválido.");
      }

      const includeContentSearch =
        rec.includeContentSearch === true || contentNeedle.length > 0;

      if (
        query.length === 0 &&
        contentNeedle.length === 0 &&
        !fileTypes &&
        minSize === undefined &&
        maxSize === undefined &&
        !modifiedAfter &&
        !modifiedBefore
      ) {
        return fail(
          "invalid_input",
          "Indica query, content, fileTypes y/o filtros de fecha/tamaño.",
        );
      }

      const queryLower = query.toLowerCase();
      const tokens = normalizeQueryTokens(query);
      const contentLower = contentNeedle.toLowerCase();

      let roots: string[];
      let honorExclusions = true;
      if (explicitPath.length > 0) {
        const resolved = await resolveReadablePath(
          explicitPath,
          undefined,
          "directory",
        );
        if (!resolved.ok) return resolved.result;
        roots = [resolved.resolved];
        // Path explícito: se permite incluso bajo exclusiones habituales.
        honorExclusions = false;
      } else if (options.defaultRoots && options.defaultRoots.length > 0) {
        roots = options.defaultRoots.map((r) =>
          process.platform === "win32"
            ? normalizeWindowsFsPath(r)
            : path.resolve(r),
        );
      } else {
        roots = (await detectSearchRoots()).map((r) =>
          process.platform === "win32" ? normalizeWindowsFsPath(r) : r,
        );
      }

      if (roots.length === 0) {
        return fail(
          "no_search_roots",
          "No se encontraron unidades o ubicaciones accesibles para buscar.",
        );
      }

      const started = Date.now();
      const hits: FilesystemSearchHit[] = [];
      let filesVisited = 0;
      let dirsVisited = 0;
      let accessDenied = 0;
      let truncated = false;
      let timedOut = false;

      type QueueItem = { dir: string; depth: number };
      const queue: QueueItem[] = roots.map((dir) => ({ dir, depth: 0 }));

      while (queue.length > 0) {
        if (Date.now() - started > timeoutMs) {
          timedOut = true;
          truncated = true;
          break;
        }
        if (hits.length >= maxResults) {
          truncated = true;
          break;
        }

        const item = queue.shift();
        if (!item) break;
        const { dir, depth } = item;

        if (honorExclusions && isExcludedPath(dir, exclusionPrefixes)) {
          continue;
        }

        dirsVisited += 1;
        let dirents;
        try {
          dirents = await readdirRobust(dir);
        } catch (err) {
          const code = nodeErrorCode(err);
          if (code === "EACCES" || code === "EPERM") {
            accessDenied += 1;
          }
          // Raíz de unidad ilegible: seguir por Users / carpetas típicas.
          if (isWindowsDriveRoot(dir) && depth === 0) {
            const fallback = await listWindowsDriveRootFallback(dir);
            for (const entry of fallback) {
              const full = path.join(dir, entry.name);
              if (honorExclusions && isExcludedPath(full, exclusionPrefixes)) {
                continue;
              }
              if (shouldSkipDirName(entry.name, skipDirNames)) continue;
              if (depth < maxDepth) {
                queue.push({ dir: full, depth: depth + 1 });
              }
            }
          }
          continue;
        }

        for (const ent of dirents) {
          if (Date.now() - started > timeoutMs) {
            timedOut = true;
            truncated = true;
            break;
          }
          if (hits.length >= maxResults) {
            truncated = true;
            break;
          }

          const full = path.join(dir, ent.name);

          if (ent.isDirectory()) {
            if (shouldSkipDirName(ent.name, skipDirNames)) continue;
            if (honorExclusions && isExcludedPath(full, exclusionPrefixes)) {
              continue;
            }
            if (depth < maxDepth) {
              queue.push({ dir: full, depth: depth + 1 });
            }
            continue;
          }

          if (!ent.isFile() && !ent.isSymbolicLink()) continue;

          filesVisited += 1;

          let info;
          try {
            info = await stat(full);
          } catch (err) {
            const code = nodeErrorCode(err);
            if (code === "EACCES" || code === "EPERM") accessDenied += 1;
            continue;
          }
          if (!info.isFile()) continue;

          const ext = path.extname(full).toLowerCase();
          if (fileTypes && !fileTypes.includes(ext)) continue;

          if (minSize !== undefined && info.size < minSize) continue;
          if (maxSize !== undefined && info.size > maxSize) continue;
          if (modifiedAfter && info.mtime < modifiedAfter) continue;
          if (modifiedBefore && info.mtime > modifiedBefore) continue;

          let matchType: FilesystemSearchMatchType | null = null;

          if (query.length > 0 || tokens.length > 0) {
            if (nameMatches(ent.name, tokens, queryLower)) {
              matchType = "filename";
            } else if (pathMatches(full, tokens, queryLower)) {
              matchType = "path";
            }
          } else if (
            fileTypes ||
            minSize !== undefined ||
            maxSize !== undefined ||
            modifiedAfter ||
            modifiedBefore
          ) {
            // Solo filtros: cualquier archivo que pase cuenta como filename match.
            matchType = "filename";
          }

          if (
            matchType === null &&
            includeContentSearch &&
            (contentLower.length > 0 || queryLower.length > 0)
          ) {
            const text = await readTextSample(full, contentMaxBytes);
            if (text) {
              const hay = text.toLowerCase();
              const needle =
                contentLower.length > 0 ? contentLower : queryLower;
              if (needle.length > 0 && hay.includes(needle)) {
                matchType = "content";
              }
            }
          }

          if (matchType === null) continue;

          const hit: FilesystemSearchHit = {
            path: full,
            name: ent.name,
            extension: ext,
            size: info.size,
            modifiedAt: info.mtime.toISOString(),
            matchType,
          };
          const birth = (info as { birthtime?: Date }).birthtime;
          if (
            birth instanceof Date &&
            !Number.isNaN(birth.getTime()) &&
            birth.getFullYear() > 1970
          ) {
            hit.createdAt = birth.toISOString();
          }
          hits.push(hit);
        }
      }

      process.stderr.write(
        `${JSON.stringify({
          stage: "NODE",
          event: "filesystem_search",
          resultCount: hits.length,
          filesVisited,
          dirsVisited,
          accessDenied,
          timedOut,
          truncated,
          durationMs: Date.now() - started,
        })}\n`,
      );

      return {
        ok: true,
        content: {
          results: hits,
          resultCount: hits.length,
          truncated,
          timedOut,
          accessDeniedCount: accessDenied,
          filesVisited,
          durationMs: Date.now() - started,
          rootsSearched: roots,
        },
      };
    },
  };
}

export const filesystemSearchTool = createFilesystemSearchTool();

export const FILESYSTEM_SEARCH = {
  name: filesystemSearchTool.name,
  description: filesystemSearchTool.description,
  inputSchema: filesystemSearchTool.inputSchema,
  executionMode: filesystemSearchTool.executionMode,
} as const;
