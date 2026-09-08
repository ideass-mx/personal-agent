/**
 * Rutas del runtime llama-server bajo AppData (no hardcode Windows).
 */
import fs from "node:fs";
import path from "node:path";
import { resolveProductDataRoot } from "./storage.ts";
import type { RuntimeManifest } from "./runtime-manifest.ts";

export type RuntimeStoragePaths = {
  root: string;
  runtimesDir: string;
  downloadsDir: string;
  lockFile: string;
  installRoot: string;
  binaryPath: string;
};

export function resolveRuntimeStorage(
  manifest: RuntimeManifest,
  productRoot = resolveProductDataRoot(),
): RuntimeStoragePaths {
  const runtimesDir = path.join(productRoot, "runtime", "llama-server");
  const installRoot = path.join(
    runtimesDir,
    manifest.version,
    `${manifest.platform}-${manifest.architecture}`,
  );
  const binaryName = manifest.binaryName;
  const binaryPath = manifest.extractPrefix
    ? path.join(installRoot, manifest.extractPrefix, binaryName)
    : path.join(installRoot, binaryName);
  return {
    root: productRoot,
    runtimesDir,
    downloadsDir: path.join(runtimesDir, ".downloads"),
    lockFile: path.join(runtimesDir, "llama-server.lock"),
    installRoot,
    binaryPath: path.normalize(binaryPath),
  };
}

export function ensureRuntimeDirs(paths: RuntimeStoragePaths): void {
  fs.mkdirSync(paths.runtimesDir, { recursive: true });
  fs.mkdirSync(paths.downloadsDir, { recursive: true });
  fs.mkdirSync(paths.installRoot, { recursive: true });
}

export function isRuntimeBinaryPresent(paths: RuntimeStoragePaths): boolean {
  try {
    return fs.existsSync(paths.binaryPath) && fs.statSync(paths.binaryPath).isFile();
  } catch {
    return false;
  }
}
