/**
 * Manifest del runtime oficial llama-server (PHASE 61.1).
 * URLs oficiales ggml-org/llama.cpp — CPU only, sin CUDA.
 */
export type RuntimeManifest = {
  runtimeId: string;
  version: string;
  platform: "win32" | "linux" | "darwin";
  architecture: "x64" | "arm64";
  /** Nombre del archivo en el release. */
  archiveName: string;
  downloadUrl: string;
  sha256: string;
  /** Bytes esperados del archivo comprimido. */
  expectedBytes: number;
  /** Nombre del ejecutable dentro del extract. */
  binaryName: string;
  /** Prefijo relativo opcional (p.ej. llama-b10537/). */
  extractPrefix?: string;
};

/** Build pin oficial — ggml-org/llama.cpp b10537 (CPU). */
export const LLAMA_SERVER_RUNTIME_ID = "llama-server";
export const LLAMA_SERVER_VERSION = "b10537";

const WIN_X64: RuntimeManifest = Object.freeze({
  runtimeId: LLAMA_SERVER_RUNTIME_ID,
  version: LLAMA_SERVER_VERSION,
  platform: "win32",
  architecture: "x64",
  archiveName: "llama-b10537-bin-win-cpu-x64.zip",
  downloadUrl:
    "https://github.com/ggml-org/llama.cpp/releases/download/b10537/llama-b10537-bin-win-cpu-x64.zip",
  sha256: "48d02dfdc5a715d1f58e06b9c9622bb548eb214b021af027808c9e8c124c4dec",
  expectedBytes: 18_581_177,
  binaryName: "llama-server.exe",
});

/** Linux x64 (ubuntu) — desarrollo / benchmarks en Linux; producto primario = Windows. */
const LINUX_X64: RuntimeManifest = Object.freeze({
  runtimeId: LLAMA_SERVER_RUNTIME_ID,
  version: LLAMA_SERVER_VERSION,
  platform: "linux",
  architecture: "x64",
  archiveName: "llama-b10537-bin-ubuntu-x64.tar.gz",
  downloadUrl:
    "https://github.com/ggml-org/llama.cpp/releases/download/b10537/llama-b10537-bin-ubuntu-x64.tar.gz",
  sha256: "47963587b8e2eee2ecc2ac0884450b2f50c24b35bcff23d68c92694da1d1ac0f",
  expectedBytes: 16_672_620,
  binaryName: "llama-server",
  extractPrefix: "llama-b10537/",
});

const MANIFESTS: readonly RuntimeManifest[] = Object.freeze([
  WIN_X64,
  LINUX_X64,
]);

export function listRuntimeManifests(): RuntimeManifest[] {
  return MANIFESTS.map((m) => ({ ...m }));
}

export function resolveRuntimeManifest(
  platform = process.platform,
  arch = process.arch,
): RuntimeManifest | null {
  const p =
    platform === "win32" ? "win32" : platform === "linux" ? "linux" : null;
  const a = arch === "x64" || arch === "arm64" ? arch : null;
  if (!p || !a) return null;
  // Producto primario: win-x64. Linux-x64 soportado para desarrollo.
  if (a !== "x64") return null;
  return MANIFESTS.find((m) => m.platform === p && m.architecture === a) ?? null;
}
