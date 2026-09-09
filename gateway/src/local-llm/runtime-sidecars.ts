/**
 * Sidecars VC++ x64 necesarios para llama-server win-cpu (PHASE 61.2.3).
 *
 * Evidencia PE (b10537): llama-server.exe / impl importan
 * VCRUNTIME140.dll, VCRUNTIME140_1.dll, MSVCP140.dll — no vienen en el zip ggml.
 * Exit code Windows 0xC0000135 = STATUS_DLL_NOT_FOUND sin estos.
 *
 * Redistribución: Microsoft Visual C++ Redistributable (VS 2015–2022) x64,
 * extraídas del paquete oficial vc_redist.x64.exe (cab a12 / Additional Runtime).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** DLLs requeridas junto a llama-server.exe (nombres exactos Windows). */
export const WIN_VC140_SIDE_BY_SIDE_DLLS = [
  "vcruntime140.dll",
  "vcruntime140_1.dll",
  "msvcp140.dll",
] as const;

function moduleDir(): string {
  try {
    const url = import.meta.url;
    if (typeof url === "string" && url.length > 0 && url !== "file://") {
      return path.dirname(fileURLToPath(url));
    }
  } catch {
    /* CJS bundle */
  }
  // eslint-disable-next-line no-undef
  if (typeof __dirname === "string" && __dirname) return __dirname;
  if (typeof process.argv[1] === "string" && process.argv[1]) {
    return path.dirname(process.argv[1]);
  }
  return process.cwd();
}

export function resolveWinVc140AssetDir(): string {
  const here = moduleDir();
  const candidates = [
    // Dev: gateway/src/local-llm → ../../assets/...
    path.resolve(here, "../../assets/local-llm/win-x64-vc140"),
    // Packaged: next to gateway.cjs
    path.join(here, "assets", "local-llm", "win-x64-vc140"),
    path.join(path.dirname(here), "assets", "local-llm", "win-x64-vc140"),
    path.join(process.cwd(), "assets", "local-llm", "win-x64-vc140"),
    path.join(process.cwd(), "gateway", "assets", "local-llm", "win-x64-vc140"),
  ];
  for (const dir of candidates) {
    if (
      fs.existsSync(path.join(dir, "vcruntime140.dll")) &&
      fs.existsSync(path.join(dir, "msvcp140.dll"))
    ) {
      return dir;
    }
  }
  return candidates[0]!;
}

/**
 * Copia sidecars VC140 al directorio del runtime (app-local).
 * Idempotente; no sobrescribe si el destino ya existe y tiene tamaño > 0
 * salvo `force`.
 */
export function ensureWindowsVc140Sidecars(
  installRoot: string,
  opts?: { force?: boolean; assetDir?: string },
): { copied: string[]; alreadyPresent: string[]; missingAssets: string[] } {
  const assetDir = opts?.assetDir ?? resolveWinVc140AssetDir();
  fs.mkdirSync(installRoot, { recursive: true });
  const copied: string[] = [];
  const alreadyPresent: string[] = [];
  const missingAssets: string[] = [];
  for (const name of WIN_VC140_SIDE_BY_SIDE_DLLS) {
    const src = path.join(assetDir, name);
    const dest = path.join(installRoot, name);
    if (!fs.existsSync(src)) {
      missingAssets.push(name);
      continue;
    }
    if (!opts?.force && fs.existsSync(dest) && fs.statSync(dest).size > 0) {
      alreadyPresent.push(name);
      continue;
    }
    fs.copyFileSync(src, dest);
    copied.push(name);
  }
  return { copied, alreadyPresent, missingAssets };
}

export function listMissingWindowsVc140Sidecars(
  installRoot: string,
): string[] {
  return WIN_VC140_SIDE_BY_SIDE_DLLS.filter(
    (name) => !fs.existsSync(path.join(installRoot, name)),
  );
}
