/**
 * Detección de raíces de búsqueda (unidades / volúmenes).
 * Windows: letras disponibles. Unix: HOME (+ / si se pide explícitamente).
 */
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { normalizeWindowsFsPath } from "./fs-windows-path.ts";

const WIN_DRIVE_LETTERS = "CDEFGHIJKLMNOPQRSTUVWXYZAB";

async function existsAccessible(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    // Reintento con X:\. (raíces problemáticas en algunos Node/Windows).
    if (/^[A-Za-z]:\\$/.test(target)) {
      try {
        await access(`${target}.`);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}

/**
 * Unidades / raíces candidatas para filesystem.search sin path explícito.
 * No eleva privilegios: solo lo que el usuario actual puede ver.
 * En Windows también antepone `X:\Users` cuando exista (más útil y rápido).
 */
export async function detectSearchRoots(): Promise<string[]> {
  if (process.platform === "win32") {
    const roots: string[] = [];
    const userRoots: string[] = [];
    for (const letter of WIN_DRIVE_LETTERS) {
      const drive = normalizeWindowsFsPath(`${letter}:\\`);
      if (await existsAccessible(drive)) {
        const users = `${letter}:\\Users`;
        if (await existsAccessible(users)) {
          userRoots.push(normalizeWindowsFsPath(users));
        }
        roots.push(drive);
      }
    }
    // Users primero: mejor señal / menos ruido de SO al inicio.
    return [...userRoots, ...roots];
  }

  const home = homedir();
  const roots: string[] = [];
  if (home && (await existsAccessible(home))) {
    roots.push(path.resolve(home));
  }
  // Evitar barrer `/` entero en CI/dev Unix; el agente puede pasar path="/".
  return roots;
}
