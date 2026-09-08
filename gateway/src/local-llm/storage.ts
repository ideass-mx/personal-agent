/**
 * ModelStorage — rutas bajo AppData del producto (sin hardcode Windows).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { config } from "../config.ts";

export type ModelStoragePaths = {
  root: string;
  modelsDir: string;
  downloadsDir: string;
  stateFile: string;
};

/** Raíz de datos del producto (misma convención que Desktop). */
export function resolveProductDataRoot(): string {
  const fromEnv = process.env.PERSONAL_AGENT_DATA_DIR?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  // Sibling of DB: …/data/personal-agent.db → …/
  const dbDir = path.dirname(path.resolve(config.dbFile));
  const parent = path.dirname(dbDir);
  if (path.basename(dbDir) === "data") return parent;
  const base =
    process.env.LOCALAPPDATA ||
    process.env.XDG_DATA_HOME ||
    path.join(os.homedir(), ".local", "share");
  return path.join(base, "Ideass", "PersonalAgent");
}

export function resolveModelStorage(
  root = resolveProductDataRoot(),
): ModelStoragePaths {
  const modelsDir = path.join(root, "models");
  return {
    root,
    modelsDir,
    downloadsDir: path.join(modelsDir, ".downloads"),
    stateFile: path.join(modelsDir, "installed.json"),
  };
}

export function ensureModelStorageDirs(paths = resolveModelStorage()): ModelStoragePaths {
  fs.mkdirSync(paths.modelsDir, { recursive: true });
  fs.mkdirSync(paths.downloadsDir, { recursive: true });
  return paths;
}

export function modelFilePath(
  modelId: string,
  variantId: string,
  filename: string,
  paths = resolveModelStorage(),
): string {
  const safeModel = modelId.replace(/[^a-z0-9_-]/gi, "").toLowerCase();
  const safeVariant = variantId.replace(/[^a-z0-9_-]/gi, "").toLowerCase();
  return path.join(paths.modelsDir, safeModel, safeVariant, filename);
}

export function filenameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const base = path.basename(u.pathname);
    return base || "model.gguf";
  } catch {
    return "model.gguf";
  }
}
