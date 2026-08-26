/**
 * filesystem.read — lee un archivo de texto desde el proceso Agent.
 *
 * Hub: executionMode automatic. Esta tool NO confirma.
 * Agent: validación técnica + la misma contención que filesystem.write
 * (`resolveSafePath` / filesystem.root).
 *
 * TOCTOU: misma limitación que write (ver safe-path.ts).
 */
import { lstat, readFile } from "node:fs/promises";
import { resolveSafePath } from "./safe-path.ts";
import type { AgentTool, ToolResult } from "./types.ts";

/** Límite único: no leer archivos mayores a este tamaño. */
export const MAX_FILE_READ_BYTES = 1_048_576;

export const FILESYSTEM_READ_NAME = "filesystem.read";

export const FILESYSTEM_READ_DESCRIPTION =
  "Lee un archivo de texto en la máquina local (solo lectura).";

export const FILESYSTEM_READ_INPUT_SCHEMA = {
  type: "object",
  properties: {
    path: { type: "string" },
  },
  required: ["path"],
  additionalProperties: false,
} as const;

export type FilesystemReadOptions = {
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

export function createFilesystemReadTool(
  options: FilesystemReadOptions = {},
): AgentTool {
  const root = options.root;

  return {
    name: FILESYSTEM_READ_NAME,
    description: FILESYSTEM_READ_DESCRIPTION,
    inputSchema: FILESYSTEM_READ_INPUT_SCHEMA,
    executionMode: "automatic",
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

      const resolved = await resolveSafePath(filePath, root);
      if (!resolved.ok) return resolved.result;

      try {
        let info;
        try {
          info = await lstat(resolved.resolved);
        } catch (err) {
          const code = nodeErrorCode(err);
          if (code === "ENOENT") {
            return fail("file_not_found", "El archivo no existe.");
          }
          const message =
            err instanceof Error ? err.message : "Error inspeccionando la ruta";
          return fail("file_read_error", message);
        }

        if (info.isDirectory()) {
          return fail(
            "not_a_file",
            "La ruta apunta a un directorio, no a un archivo.",
          );
        }
        if (!info.isFile() && !info.isSymbolicLink()) {
          return fail("not_a_file", "La ruta no es un archivo regular.");
        }
        if (info.size > MAX_FILE_READ_BYTES) {
          return fail(
            "file_too_large",
            `El archivo supera el límite de ${MAX_FILE_READ_BYTES} bytes.`,
          );
        }

        const bytes = await readFile(resolved.resolved);
        if (bytes.byteLength > MAX_FILE_READ_BYTES) {
          return fail(
            "file_too_large",
            `El archivo supera el límite de ${MAX_FILE_READ_BYTES} bytes.`,
          );
        }
        const content = bytes.toString("utf8");
        return {
          ok: true,
          content: {
            path: resolved.resolved,
            content,
            bytes: bytes.byteLength,
          },
        };
      } catch (err) {
        const code = nodeErrorCode(err);
        if (code === "ENOENT") {
          return fail("file_not_found", "El archivo no existe.");
        }
        if (code === "EISDIR") {
          return fail(
            "not_a_file",
            "La ruta apunta a un directorio, no a un archivo.",
          );
        }
        const message =
          err instanceof Error ? err.message : "Error leyendo el archivo";
        return fail("file_read_error", message);
      }
    },
  };
}

/** Instancia sin root (compatibilidad). El proceso usa loadAgentConfig(). */
export const filesystemReadTool = createFilesystemReadTool();

export const FILESYSTEM_READ = {
  name: filesystemReadTool.name,
  description: filesystemReadTool.description,
  inputSchema: filesystemReadTool.inputSchema,
  executionMode: filesystemReadTool.executionMode,
} as const;
