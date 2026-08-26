/**
 * Contención de paths para filesystem del Agent.
 * No es Permission System: el Hub no participa.
 *
 * TOCTOU: entre lstat/realpath y readFile/writeFile/readdir un atacante local
 * podría sustituir un componente por un symlink. Esta función no cierra
 * esa carrera.
 */
import { lstat, realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { ToolResult } from "./types.ts";

export type PathContainment = "exact" | "child" | "outside";

/** Destino esperado. Por defecto archivo (read/write). list usa "directory". */
export type SafePathExpect = "file" | "directory";

export type SafePathResult =
  | { ok: true; resolved: string }
  | { ok: false; result: ToolResult };

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

function hasParentSegment(normalized: string): boolean {
  return normalized.split(/[\\/]/).includes("..");
}

/** Clasifica un path ya resuelto respecto a un root ya resuelto. */
export function classifyContainment(
  candidate: string,
  root: string,
): PathContainment {
  const resolvedCandidate = path.resolve(candidate);
  const resolvedRoot = path.resolve(root);
  if (resolvedCandidate === resolvedRoot) return "exact";
  const rel = path.relative(resolvedRoot, resolvedCandidate);
  if (rel === "") return "exact";
  if (path.isAbsolute(rel)) return "outside";
  if (rel === "..") return "outside";
  if (rel.startsWith(`..${path.sep}`)) return "outside";
  return "child";
}

function legacyResolve(rawPath: string): SafePathResult {
  let resolved: string;
  try {
    resolved = path.resolve(rawPath);
  } catch {
    return {
      ok: false,
      result: fail("invalid_input", "path no se puede resolver."),
    };
  }
  const normalized = path.normalize(rawPath);
  if (hasParentSegment(normalized)) {
    return {
      ok: false,
      result: fail(
        "path_not_allowed",
        "path con '..' no está permitido (traversal).",
      ),
    };
  }
  return { ok: true, resolved };
}

/**
 * Resuelve un path de filesystem.
 * Sin root: compatibilidad (cwd + rechazo de '..').
 * Con root: relativos al root; absolutos solo si quedan dentro; sigue
 * componentes reales (realpath) para no escapar por symlink.
 *
 * expect "file" (defecto): el root no es un archivo válido; un directorio
 * como destino final es not_a_file.
 * expect "directory": el root y sus subdirectorios son válidos; un archivo
 * como destino final es not_a_directory.
 */
export async function resolveSafePath(
  rawPath: string,
  root?: string,
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

  if (root === undefined) {
    return legacyResolve(rawPath);
  }

  let realRoot: string;
  try {
    const absRoot = path.resolve(root);
    const rootInfo = await lstat(absRoot);
    if (!rootInfo.isDirectory() && !rootInfo.isSymbolicLink()) {
      return {
        ok: false,
        result: fail("file_write_error", "filesystem.root no es un directorio."),
      };
    }
    realRoot = await realpath(absRoot);
    const realInfo = await stat(realRoot);
    if (!realInfo.isDirectory()) {
      return {
        ok: false,
        result: fail("file_write_error", "filesystem.root no es un directorio."),
      };
    }
  } catch (err) {
    const code = nodeErrorCode(err);
    if (code === "ENOENT") {
      return {
        ok: false,
        result: fail("file_write_error", "filesystem.root no existe."),
      };
    }
    const message =
      err instanceof Error ? err.message : "No se pudo resolver filesystem.root";
    return { ok: false, result: fail("file_write_error", message) };
  }

  const candidate = path.isAbsolute(rawPath)
    ? path.resolve(rawPath)
    : path.resolve(realRoot, rawPath);

  const lexical = classifyContainment(candidate, realRoot);
  if (lexical === "exact") {
    if (expect === "directory") {
      return { ok: true, resolved: realRoot };
    }
    return {
      ok: false,
      result: fail(
        "path_not_allowed",
        "El root de filesystem no es un archivo válido.",
      ),
    };
  }
  if (lexical === "outside") {
    return {
      ok: false,
      result: fail(
        "path_outside_root",
        "path queda fuera del filesystem.root del Agent.",
      ),
    };
  }

  const rel = path.relative(realRoot, candidate);
  const parts = rel.split(path.sep).filter((p) => p.length > 0);
  let current = realRoot;

  for (let i = 0; i < parts.length; i += 1) {
    const next = path.join(current, parts[i]);
    const isLast = i === parts.length - 1;
    let info;
    try {
      info = await lstat(next);
    } catch (err) {
      const code = nodeErrorCode(err);
      if (code !== "ENOENT") {
        const message =
          err instanceof Error ? err.message : "Error inspeccionando la ruta";
        return { ok: false, result: fail("file_write_error", message) };
      }
      const finalPath = path.join(current, ...parts.slice(i));
      if (classifyContainment(finalPath, realRoot) !== "child") {
        return {
          ok: false,
          result: fail(
            "path_outside_root",
            "path queda fuera del filesystem.root del Agent.",
          ),
        };
      }
      return { ok: true, resolved: finalPath };
    }

    if (info.isSymbolicLink()) {
      let realNext: string;
      try {
        realNext = await realpath(next);
      } catch {
        return {
          ok: false,
          result: fail(
            "symlink_not_allowed",
            "No se pudo resolver un enlace simbólico de la ruta.",
          ),
        };
      }
      const where = classifyContainment(realNext, realRoot);
      if (where === "outside") {
        return {
          ok: false,
          result: fail(
            "symlink_not_allowed",
            "El enlace simbólico apunta fuera del filesystem.root.",
          ),
        };
      }
      if (isLast) {
        if (where === "exact") {
          if (expect === "directory") {
            return { ok: true, resolved: realNext };
          }
          return {
            ok: false,
            result: fail(
              "path_not_allowed",
              "El root de filesystem no es un archivo válido.",
            ),
          };
        }
        const dest = await stat(realNext);
        if (expect === "directory") {
          if (!dest.isDirectory()) {
            return {
              ok: false,
              result: fail(
                "not_a_directory",
                "La ruta no apunta a un directorio.",
              ),
            };
          }
          return { ok: true, resolved: realNext };
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
        return { ok: true, resolved: realNext };
      }
      if (where !== "child" && where !== "exact") {
        return {
          ok: false,
          result: fail(
            "symlink_not_allowed",
            "El enlace simbólico apunta fuera del filesystem.root.",
          ),
        };
      }
      current = realNext;
      continue;
    }

    if (info.isDirectory()) {
      current = await realpath(next);
      if (classifyContainment(current, realRoot) === "outside") {
        return {
          ok: false,
          result: fail(
            "path_outside_root",
            "path queda fuera del filesystem.root del Agent.",
          ),
        };
      }
      if (isLast) {
        if (expect === "directory") {
          return { ok: true, resolved: current };
        }
        return {
          ok: false,
          result: fail(
            "not_a_file",
            "La ruta apunta a un directorio, no a un archivo.",
          ),
        };
      }
      continue;
    }

    if (!isLast) {
      return {
        ok: false,
        result: fail("file_write_error", "Un componente intermedio no es un directorio."),
      };
    }
    if (expect === "directory") {
      return {
        ok: false,
        result: fail(
          "not_a_directory",
          "La ruta no apunta a un directorio.",
        ),
      };
    }
    return { ok: true, resolved: next };
  }

  return {
    ok: false,
    result: fail(
      "path_not_allowed",
      "El root de filesystem no es un archivo válido.",
    ),
  };
}
