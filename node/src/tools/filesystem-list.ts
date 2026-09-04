/**
 * filesystem.list — lista un directorio desde el proceso Agent.
 *
 * Hub: executionMode automatic. Esta tool NO confirma.
 * Agent: resolveSafePath(..., "directory") + readdir. Sin recursión,
 * sin leer contenido de archivos.
 *
 * TOCTOU: misma limitación que read/write (ver safe-path.ts).
 */
import { readdir } from "node:fs/promises";
import { resolveSafePath } from "./safe-path.ts";
import type { AgentTool, ToolResult } from "./types.ts";

export const FILESYSTEM_LIST_NAME = "filesystem.list";

export const FILESYSTEM_LIST_DESCRIPTION =
  "Lista las entradas de un directorio en la máquina local (un nivel, sin contenido).";

export const FILESYSTEM_LIST_INPUT_SCHEMA = {
  type: "object",
  properties: {
    path: { type: "string" },
  },
  required: ["path"],
  additionalProperties: false,
} as const;

export type FilesystemListOptions = {
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
  const root = options.root;

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

      const resolved = await resolveSafePath(dirPath, root, "directory");
      if (!resolved.ok) return resolved.result;

      try {
        const dirents = await readdir(resolved.resolved, {
          withFileTypes: true,
        });
        const entries: FilesystemListEntry[] = dirents
          .map((d) => ({ name: d.name, type: entryType(d) }))
          .sort((a, b) => a.name.localeCompare(b.name, "en"));
        return {
          ok: true,
          content: { path: resolved.resolved, entries },
        };
      } catch (err) {
        const code = nodeErrorCode(err);
        if (code === "ENOENT") {
          return fail("file_not_found", "El directorio no existe.");
        }
        if (code === "ENOTDIR") {
          return fail(
            "not_a_directory",
            "La ruta no apunta a un directorio.",
          );
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
