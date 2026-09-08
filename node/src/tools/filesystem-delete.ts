/**
 * filesystem.delete — elimina un archivo (PHASE 59).
 *
 * Hub: executionMode confirm. Esta tool NO confirma.
 * Destructiva: siempre CONFIRMATION_REQUIRED vía Tool Policy.
 * Path amplio (como lectura); la confirmación es la barrera.
 */
import { lstat, unlink } from "node:fs/promises";
import { resolveReadablePath } from "./fs-readable-path.ts";
import type { AgentTool, ToolResult } from "./types.ts";

export const FILESYSTEM_DELETE_NAME = "filesystem.delete";

export const FILESYSTEM_DELETE_DESCRIPTION =
  "Elimina un archivo en la máquina local. Requiere confirmación explícita del usuario.";

export const FILESYSTEM_DELETE_INPUT_SCHEMA = {
  type: "object",
  properties: {
    path: { type: "string" },
  },
  required: ["path"],
  additionalProperties: false,
} as const;

export type FilesystemDeleteOptions = {
  root?: string;
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

export function createFilesystemDeleteTool(
  options: FilesystemDeleteOptions = {},
): AgentTool {
  const base = options.root;

  return {
    name: FILESYSTEM_DELETE_NAME,
    description: FILESYSTEM_DELETE_DESCRIPTION,
    inputSchema: FILESYSTEM_DELETE_INPUT_SCHEMA,
    executionMode: "confirm",
    async execute(input): Promise<ToolResult> {
      if (typeof input !== "object" || input === null) {
        return fail("invalid_input", "Se espera { path: string }.");
      }
      const rec = input as { path?: unknown };
      if (typeof rec.path !== "string") {
        return fail("invalid_input", "Se espera { path: string }.");
      }
      const filePath = rec.path;
      if (filePath.length === 0 || filePath.trim().length === 0) {
        return fail("invalid_input", "path no puede estar vacío.");
      }

      const resolved = await resolveReadablePath(filePath, base, "file");
      if (!resolved.ok) return resolved.result;

      try {
        const info = await lstat(resolved.resolved);
        if (info.isDirectory()) {
          return fail(
            "not_a_file",
            "Solo se pueden eliminar archivos, no directorios.",
          );
        }
        if (!info.isFile() && !info.isSymbolicLink()) {
          return fail("not_a_file", "La ruta no es un archivo regular.");
        }
        await unlink(resolved.resolved);
        return {
          ok: true,
          content: { path: resolved.resolved, deleted: true },
        };
      } catch (err) {
        const code = nodeErrorCode(err);
        if (code === "ENOENT") {
          return fail("file_not_found", "El archivo no existe.");
        }
        if (code === "EACCES" || code === "EPERM") {
          return fail("access_denied", "Sin permiso para eliminar el archivo.");
        }
        const message =
          err instanceof Error ? err.message : "Error eliminando el archivo";
        return fail("file_delete_error", message);
      }
    },
  };
}

export const filesystemDeleteTool = createFilesystemDeleteTool();

export const FILESYSTEM_DELETE = {
  name: filesystemDeleteTool.name,
  description: filesystemDeleteTool.description,
  inputSchema: filesystemDeleteTool.inputSchema,
  executionMode: filesystemDeleteTool.executionMode,
} as const;
