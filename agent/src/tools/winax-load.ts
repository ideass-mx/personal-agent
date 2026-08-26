/**
 * Carga de `winax` anclada al runtime, no al cwd.
 * winax es addon nativo: esbuild lo deja external; Node lo resuelve
 * desde el .cjs del Agent o desde el binario (argv[1] / execPath).
 * No hay import() de paths de usuario ni búsqueda de extensions.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type WinaxModule = {
  Object: new (progId: string, options?: Record<string, unknown>) => unknown;
  release?: (obj: unknown) => void;
};

function importMetaPath(): string | undefined {
  try {
    const url = import.meta.url;
    if (typeof url !== "string" || url.length === 0) return undefined;
    if (url === "undefined" || url === "file://") return undefined;
    return fileURLToPath(url);
  } catch {
    return undefined;
  }
}

/**
 * Anclas de resolución, en orden. Independientes de process.cwd().
 */
export function winaxRequireAnchors(
  argv1: string | undefined = process.argv[1],
  execPath: string = process.execPath,
): string[] {
  const anchors: string[] = [];
  const add = (raw: string | undefined) => {
    if (typeof raw !== "string" || raw.length === 0) return;
    const resolved = path.resolve(raw);
    if (!anchors.includes(resolved)) anchors.push(resolved);
  };
  add(argv1);
  add(importMetaPath());
  add(execPath);
  return anchors;
}

export function loadWinaxModule(): WinaxModule | undefined {
  if (process.platform !== "win32") return undefined;
  for (const from of winaxRequireAnchors()) {
    try {
      const req = createRequire(from);
      return req("winax") as WinaxModule;
    } catch {
      /* siguiente ancla */
    }
  }
  return undefined;
}
