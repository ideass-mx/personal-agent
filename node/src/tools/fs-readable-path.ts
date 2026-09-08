/**
 * Resolución de paths de solo lectura (PHASE 59).
 * Lectura amplia: no aplica filesystem.root como cerca.
 * Escritura sigue en resolveSafePath + root.
 */
import { access, lstat, realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { SafePathExpect, SafePathResult } from "./safe-path.ts";
import type { ToolResult } from "./types.ts";
import {
  isWindowsDriveRoot,
  looksWindowsPath,
  normalizeWindowsFsPath,
  WINDOWS_DRIVE_ROOT_FALLBACK_NAMES,
  windowsDriveRootReadCandidates,
} from "./fs-windows-path.ts";
import { readdir } from "node:fs/promises";
import type { Dirent } from "node:fs";

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

function preparePathInput(rawPath: string): string {
  if (process.platform === "win32" || looksWindowsPath(rawPath)) {
    return normalizeWindowsFsPath(rawPath);
  }
  return rawPath;
}

/**
 * readdir robusto: en raíces de unidad Windows prueba `X:\` y `X:\.`.
 */
export async function readdirRobust(dir: string): Promise<Dirent[]> {
  const candidates =
    process.platform === "win32" || isWindowsDriveRoot(dir)
      ? windowsDriveRootReadCandidates(dir)
      : [dir];
  let lastErr: unknown;
  for (const candidate of candidates) {
    try {
      return await readdir(candidate, { withFileTypes: true });
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("readdir failed");
}

/**
 * Si la raíz de unidad no se puede listar, enumera carpetas típicas accesibles.
 */
export async function listWindowsDriveRootFallback(
  driveRoot: string,
): Promise<Array<{ name: string; type: "directory" }>> {
  const root = normalizeWindowsFsPath(driveRoot);
  const out: Array<{ name: string; type: "directory" }> = [];
  for (const name of WINDOWS_DRIVE_ROOT_FALLBACK_NAMES) {
    const full = path.win32.join(root, name);
    try {
      await access(full);
      const info = await stat(full);
      if (info.isDirectory()) {
        out.push({ name, type: "directory" });
      }
    } catch {
      // omitir
    }
  }
  return out;
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

  const prepared = preparePathInput(rawPath);

  let candidate: string;
  try {
    if (process.platform === "win32" || looksWindowsPath(prepared)) {
      if (path.win32.isAbsolute(prepared) || isWindowsDriveRoot(prepared)) {
        candidate = path.win32.resolve(prepared);
        // path.win32.resolve("C:\\") → "C:\\"; ensure drive root form.
        if (isWindowsDriveRoot(prepared)) {
          candidate = normalizeWindowsFsPath(prepared);
        }
      } else {
        const baseNorm = base
          ? preparePathInput(base)
          : process.cwd();
        candidate = path.win32.resolve(baseNorm, prepared);
      }
    } else {
      candidate = path.isAbsolute(prepared)
        ? path.resolve(prepared)
        : path.resolve(base ?? process.cwd(), prepared);
    }
  } catch {
    return {
      ok: false,
      result: fail("invalid_input", "path no se puede resolver."),
    };
  }

  // Raíz de unidad: no exige lstat perfecto (algunos Node fallan ahí).
  if (isWindowsDriveRoot(candidate) && expect === "directory") {
    return { ok: true, resolved: normalizeWindowsFsPath(candidate) };
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
      // Reintento: raíz de unidad con variante X:\.
      if (expect === "directory" && isWindowsDriveRoot(candidate)) {
        return { ok: true, resolved: normalizeWindowsFsPath(candidate) };
      }
      return {
        ok: false,
        result: fail(
          "file_not_found",
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
