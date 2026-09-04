/**
 * filesystem.write — escribe un archivo de texto desde el proceso Agent.
 *
 * Hub: executionMode confirm. Esta tool NO confirma.
 * Agent: validación técnica + contención opcional (filesystem.root).
 *
 * Sin root: relativos → cwd; absolutos aceptados; '..' se rechaza.
 * Con root: relativos → root; absolutos solo dentro; realpath contra
 * escapes por symlink. TOCTOU residual documentado en safe-path.ts.
 */
import { lstat, writeFile } from "node:fs/promises";
import { resolveSafePath } from "./safe-path.ts";
import type { AgentTool, ToolResult } from "./types.ts";

/** Límite único: no escribir contenidos mayores a este tamaño. */
export const MAX_FILE_WRITE_BYTES = 1_048_576;

export const FILESYSTEM_WRITE_NAME = "filesystem.write";

export const FILESYSTEM_WRITE_DESCRIPTION =
  "Escribe un archivo de texto en la máquina local. Requiere confirmación en el Hub.";

export const FILESYSTEM_WRITE_INPUT_SCHEMA = {
  type: "object",
  properties: {
    path: { type: "string" },
    content: { type: "string" },
  },
  required: ["path", "content"],
  additionalProperties: false,
} as const;

export type FilesystemWriteOptions = {
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

export function createFilesystemWriteTool(
  options: FilesystemWriteOptions = {},
): AgentTool {
  const root = options.root;

  return {
    name: FILESYSTEM_WRITE_NAME,
    description: FILESYSTEM_WRITE_DESCRIPTION,
    inputSchema: FILESYSTEM_WRITE_INPUT_SCHEMA,
    executionMode: "confirm",
    async execute(input): Promise<ToolResult> {
      if (typeof input !== "object" || input === null) {
        return fail(
          "invalid_input",
          "Se espera { path: string, content: string }.",
        );
      }
      const rec = input as { path?: unknown; content?: unknown };
      if (typeof rec.path !== "string" || typeof rec.content !== "string") {
        return fail(
          "invalid_input",
          "Se espera { path: string, content: string }.",
        );
      }
      const filePath = rec.path;
      const content = rec.content;
      if (filePath.length === 0 || filePath.trim().length === 0) {
        return fail("invalid_input", "path no puede estar vacío.");
      }

      const byteLength = Buffer.byteLength(content, "utf8");
      if (byteLength > MAX_FILE_WRITE_BYTES) {
        return fail(
          "file_too_large",
          `El contenido supera el límite de ${MAX_FILE_WRITE_BYTES} bytes.`,
        );
      }

      const resolved = await resolveSafePath(filePath, root);
      if (!resolved.ok) return resolved.result;

      try {
        try {
          const info = await lstat(resolved.resolved);
          if (info.isDirectory()) {
            return fail(
              "not_a_file",
              "La ruta apunta a un directorio, no a un archivo.",
            );
          }
        } catch (err) {
          const code = nodeErrorCode(err);
          if (code !== "ENOENT") {
            const message =
              err instanceof Error ? err.message : "Error inspeccionando la ruta";
            return fail("file_write_error", message);
          }
        }

        await writeFile(resolved.resolved, content, "utf8");
        return {
          ok: true,
          content: { path: resolved.resolved, bytes: byteLength },
        };
      } catch (err) {
        const code = nodeErrorCode(err);
        if (code === "EISDIR") {
          return fail(
            "not_a_file",
            "La ruta apunta a un directorio, no a un archivo.",
          );
        }
        const message =
          err instanceof Error ? err.message : "Error escribiendo el archivo";
        return fail("file_write_error", message);
      }
    },
  };
}

/** Instancia sin root (compatibilidad). El proceso usa loadAgentConfig(). */
export const filesystemWriteTool = createFilesystemWriteTool();

export const FILESYSTEM_WRITE = {
  name: filesystemWriteTool.name,
  description: filesystemWriteTool.description,
  inputSchema: filesystemWriteTool.inputSchema,
  executionMode: filesystemWriteTool.executionMode,
} as const;
