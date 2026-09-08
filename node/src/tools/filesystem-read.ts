/**
 * filesystem.read — lee un archivo de texto desde el proceso Agent.
 *
 * Hub: executionMode automatic. Esta tool NO confirma.
 * PHASE 59: lectura amplia en la máquina (resolveReadablePath).
 * filesystem.root ya no cerca la lectura; la escritura sigue contenida.
 *
 * Binarios / formatos sin parser: fallo controlado (no se vuelcan al LLM).
 */
import { lstat, readFile } from "node:fs/promises";
import {
  isBinaryExtension,
  sampleLooksBinary,
} from "./fs-file-kinds.ts";
import { resolveReadablePath } from "./fs-readable-path.ts";
import { unwrapToolBusinessInput } from "./fs-user-paths.ts";
import type { AgentTool, ToolResult } from "./types.ts";

/** Límite único: no leer archivos mayores a este tamaño. */
export const MAX_FILE_READ_BYTES = 1_048_576;

export const FILESYSTEM_READ_NAME = "filesystem.read";

export const FILESYSTEM_READ_DESCRIPTION =
  "Lee un archivo de texto en la máquina local (solo lectura). No requiere carpeta previa.";

export const FILESYSTEM_READ_INPUT_SCHEMA = {
  type: "object",
  properties: {
    path: { type: "string" },
  },
  required: ["path"],
  additionalProperties: false,
} as const;

export type FilesystemReadOptions = {
  /**
   * Base opcional para rutas relativas (p. ej. cwd del workspace).
   * No limita rutas absolutas.
   */
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
  const base = options.root;

  return {
    name: FILESYSTEM_READ_NAME,
    description: FILESYSTEM_READ_DESCRIPTION,
    inputSchema: FILESYSTEM_READ_INPUT_SCHEMA,
    executionMode: "automatic",
    async execute(input): Promise<ToolResult> {
      const business = unwrapToolBusinessInput(input);
      if (typeof business !== "object" || business === null) {
        return fail("invalid_input", "Se espera { path: string }.");
      }
      const rec = business as { path?: unknown };
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
        let info;
        try {
          info = await lstat(resolved.resolved);
        } catch (err) {
          const code = nodeErrorCode(err);
          if (code === "ENOENT") {
            return fail("file_not_found", "El archivo no existe.");
          }
          if (code === "EACCES" || code === "EPERM") {
            return fail("access_denied", "Sin permiso para leer el archivo.");
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

        if (isBinaryExtension(resolved.resolved)) {
          return fail(
            "unsupported_format",
            "Este tipo de archivo no se puede leer como texto. Usa una herramienta especializada si existe (p. ej. Excel).",
          );
        }

        const bytes = await readFile(resolved.resolved);
        if (bytes.byteLength > MAX_FILE_READ_BYTES) {
          return fail(
            "file_too_large",
            `El archivo supera el límite de ${MAX_FILE_READ_BYTES} bytes.`,
          );
        }
        if (sampleLooksBinary(bytes)) {
          return fail(
            "unsupported_format",
            "El archivo parece binario; no se envía contenido al modelo.",
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
        if (code === "EACCES" || code === "EPERM") {
          return fail("access_denied", "Sin permiso para leer el archivo.");
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
