/**
 * Resolución de paths de solo lectura (PHASE 59).
 * Lectura amplia: no aplica filesystem.root como cerca.
 * Escritura sigue en resolveSafePath + root.
 */
import { lstat, realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { SafePathExpect, SafePathResult } from "./safe-path.ts";
import type { ToolResult } from "./types.ts";

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

/**
 * Resuelve un path legible en la máquina del usuario.
 * `base` solo ancla rutas relativas (p. ej. cwd o un path de búsqueda);
 * no contiene el destino.
 */
export async function resolveReadablePath(
  rawPath: string,
  base?: string,
  expect: SafePathExpect = "file",
): Promise<SafePathResult> {
  if (rawPath.includes("\0")) {
    return {
      ok: false,
      result: fail("invalid_input", "path contiene caracteres inválidos."),
    };
  }
  if (rawPath.length === 0 || rawPath.trim().length === 0) {
    return {
      ok: false,
      result: fail("invalid_input", "path no puede estar vacío."),
    };
  }

  let candidate: string;
  try {
    candidate = path.isAbsolute(rawPath)
      ? path.resolve(rawPath)
      : path.resolve(base ?? process.cwd(), rawPath);
  } catch {
    return {
      ok: false,
      result: fail("invalid_input", "path no se puede resolver."),
    };
  }

  try {
    const info = await lstat(candidate);
    if (info.isSymbolicLink()) {
      let real: string;
      try {
        real = await realpath(candidate);
      } catch (err) {
        const code = nodeErrorCode(err);
        if (code === "EACCES" || code === "EPERM") {
          return {
            ok: false,
            result: fail("access_denied", "Sin permiso para acceder a la ruta."),
          };
        }
        return {
          ok: false,
          result: fail(
            "symlink_not_allowed",
            "No se pudo resolver un enlace simbólico de la ruta.",
          ),
        };
      }
      const dest = await stat(real);
      if (expect === "directory") {
        if (!dest.isDirectory()) {
          return {
            ok: false,
            result: fail("not_a_directory", "La ruta no apunta a un directorio."),
          };
        }
        return { ok: true, resolved: real };
      }
      if (dest.isDirectory()) {
        return {
          ok: false,
          result: fail(
            "not_a_file",
            "La ruta apunta a un directorio, no a un archivo.",
          ),
        };
      }
      return { ok: true, resolved: real };
    }

    if (expect === "directory") {
      if (!info.isDirectory()) {
        return {
          ok: false,
          result: fail("not_a_directory", "La ruta no apunta a un directorio."),
        };
      }
      return { ok: true, resolved: candidate };
    }

    if (info.isDirectory()) {
      return {
        ok: false,
        result: fail(
          "not_a_file",
          "La ruta apunta a un directorio, no a un archivo.",
        ),
      };
    }
    if (!info.isFile()) {
      return {
        ok: false,
        result: fail("not_a_file", "La ruta no es un archivo regular."),
      };
    }
    return { ok: true, resolved: candidate };
  } catch (err) {
    const code = nodeErrorCode(err);
    if (code === "ENOENT") {
      // Destino aún inexistente: solo útil si expect file y caller crea;
      // para lectura fallamos not found.
      return {
        ok: false,
        result: fail(
          expect === "directory" ? "file_not_found" : "file_not_found",
          expect === "directory"
            ? "El directorio no existe."
            : "El archivo no existe.",
        ),
      };
    }
    if (code === "EACCES" || code === "EPERM") {
      return {
        ok: false,
        result: fail("access_denied", "Sin permiso para acceder a la ruta."),
      };
    }
    const message =
      err instanceof Error ? err.message : "Error inspeccionando la ruta";
    return { ok: false, result: fail("file_read_error", message) };
  }
}
