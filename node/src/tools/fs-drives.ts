/**
 * Detección de raíces de búsqueda (unidades / volúmenes).
 * Windows: letras disponibles. Unix: HOME (+ / si se pide explícitamente).
 */
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

const WIN_DRIVE_LETTERS = "CDEFGHIJKLMNOPQRSTUVWXYZAB";

async function existsAccessible(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * Unidades / raíces candidatas para filesystem.search sin path explícito.
 * No eleva privilegios: solo lo que el usuario actual puede ver.
 */
export async function detectSearchRoots(): Promise<string[]> {
  if (process.platform === "win32") {
    const roots: string[] = [];
    for (const letter of WIN_DRIVE_LETTERS) {
      const drive = `${letter}:\\`;
      if (await existsAccessible(drive)) {
        roots.push(drive);
      }
    }
    return roots;
  }

  const home = homedir();
  const roots: string[] = [];
  if (home && (await existsAccessible(home))) {
    roots.push(path.resolve(home));
  }
  // Evitar barrer `/` entero en CI/dev Unix; el agente puede pasar path="/".
  return roots;
}
