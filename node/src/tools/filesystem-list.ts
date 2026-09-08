/**
 * filesystem.list — lista un directorio desde el proceso Agent.
 *
 * Hub: executionMode automatic. Esta tool NO confirma.
 * PHASE 59: lectura amplia (resolveReadablePath). Sin recursión,
 * sin leer contenido de archivos. Sin autorización por carpeta.
 */
import {
  listWindowsDriveRootFallback,
  readdirRobust,
  resolveReadablePath,
} from "./fs-readable-path.ts";
import { isWindowsDriveRoot } from "./fs-windows-path.ts";
import type { AgentTool, ToolResult } from "./types.ts";

export const FILESYSTEM_LIST_NAME = "filesystem.list";

export const FILESYSTEM_LIST_DESCRIPTION =
  "Lista las entradas de un directorio en la máquina local (un nivel, sin contenido). Acepta raíces de unidad como C:\\\\. No requiere autorización por carpeta.";

export const FILESYSTEM_LIST_INPUT_SCHEMA = {
  type: "object",
  properties: {
    path: {
      type: "string",
      description:
        'Ruta absoluta o relativa. En Windows usa C:\\\\ o C:/ (no solo "C:").',
    },
  },
  required: ["path"],
  additionalProperties: false,
} as const;

export type FilesystemListOptions = {
  /** Base opcional para rutas relativas. No limita rutas absolutas. */
  root?: string;
};

export type FilesystemListEntryType =
  | "file"
  | "directory"
  | "symlink"
  | "other";

export type FilesystemListEntry = {
  name: string;
  type: FilesystemListEntryType;
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

function entryType(dirent: {
  isSymbolicLink(): boolean;
  isDirectory(): boolean;
  isFile(): boolean;
}): FilesystemListEntryType {
  if (dirent.isSymbolicLink()) return "symlink";
  if (dirent.isDirectory()) return "directory";
  if (dirent.isFile()) return "file";
  return "other";
}

export function createFilesystemListTool(
  options: FilesystemListOptions = {},
): AgentTool {
  const base = options.root;

  return {
    name: FILESYSTEM_LIST_NAME,
    description: FILESYSTEM_LIST_DESCRIPTION,
    inputSchema: FILESYSTEM_LIST_INPUT_SCHEMA,
    executionMode: "automatic",
    async execute(input): Promise<ToolResult> {
      if (typeof input !== "object" || input === null) {
        return fail("invalid_input", "Se espera { path: string }.");
      }
      const rec = input as { path?: unknown };
      if (typeof rec.path !== "string") {
        return fail("invalid_input", "Se espera { path: string }.");
      }
      const dirPath = rec.path;
      if (dirPath.length === 0 || dirPath.trim().length === 0) {
        return fail("invalid_input", "path no puede estar vacío.");
      }

      const resolved = await resolveReadablePath(dirPath, base, "directory");
      if (!resolved.ok) return resolved.result;

      try {
        const dirents = await readdirRobust(resolved.resolved);
        const entries: FilesystemListEntry[] = dirents
          .map((d) => ({ name: d.name, type: entryType(d) }))
          .sort((a, b) => a.name.localeCompare(b.name, "en"));
        return {
          ok: true,
          content: { path: resolved.resolved, entries },
        };
      } catch (err) {
        const code = nodeErrorCode(err);
        if (
          (code === "ENOENT" ||
            code === "EACCES" ||
            code === "EPERM" ||
            code === "UNKNOWN") &&
          isWindowsDriveRoot(resolved.resolved)
        ) {
          const fallback = await listWindowsDriveRootFallback(
            resolved.resolved,
          );
          if (fallback.length > 0) {
            return {
              ok: true,
              content: {
                path: resolved.resolved,
                entries: fallback,
                partial: true,
                note: "Listado parcial de la unidad: no se pudo leer la raíz completa.",
              },
            };
          }
        }
        if (code === "ENOENT") {
          return fail("file_not_found", "El directorio no existe.");
        }
        if (code === "ENOTDIR") {
          return fail(
            "not_a_directory",
            "La ruta no apunta a un directorio.",
          );
        }
        if (code === "EACCES" || code === "EPERM") {
          return fail("access_denied", "Sin permiso para listar el directorio.");
        }
        const message =
          err instanceof Error ? err.message : "Error listando el directorio";
        return fail("file_list_error", message);
      }
    },
  };
}

export const filesystemListTool = createFilesystemListTool();

export const FILESYSTEM_LIST = {
  name: filesystemListTool.name,
  description: filesystemListTool.description,
  inputSchema: filesystemListTool.inputSchema,
  executionMode: filesystemListTool.executionMode,
} as const;
