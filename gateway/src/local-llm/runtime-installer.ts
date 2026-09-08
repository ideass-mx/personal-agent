/**
 * Descarga + validación + extracción del runtime llama-server.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { LocalModelError, userMessageForCode } from "./errors.ts";
import type { RuntimeManifest } from "./runtime-manifest.ts";
import {
  ensureRuntimeDirs,
  isRuntimeBinaryPresent,
  resolveRuntimeStorage,
  type RuntimeStoragePaths,
} from "./runtime-storage.ts";
import { sha256File } from "./validator.ts";

async function downloadArchive(
  url: string,
  dest: string,
  expectedBytes: number,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  let res: Response;
  try {
    res = await fetchImpl(url, {
      redirect: "follow",
      signal,
      headers: { "User-Agent": "PersonalAgent/1.0" },
    });
  } catch (err) {
    throw new LocalModelError(
      "RUNTIME_NOT_INSTALLED",
      userMessageForCode("RUNTIME_NOT_INSTALLED"),
      err,
    );
  }
  if (!res.ok || !res.body) {
    throw new LocalModelError(
      "RUNTIME_NOT_INSTALLED",
      userMessageForCode("RUNTIME_NOT_INSTALLED"),
    );
  }
  const file = fs.createWriteStream(dest);
  let received = 0;
  try {
    const reader = res.body.getReader();
    for (;;) {
      if (signal?.aborted) {
        throw new LocalModelError(
          "GENERATION_CANCELLED",
          userMessageForCode("GENERATION_CANCELLED"),
        );
      }
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      received += value.byteLength;
      await new Promise<void>((resolve, reject) => {
        file.write(Buffer.from(value), (err) => (err ? reject(err) : resolve()));
      });
    }
    await new Promise<void>((resolve, reject) => {
      file.end(() => resolve());
      file.on("error", reject);
    });
  } catch (err) {
    try {
      file.close();
    } catch {
      /* ignore */
    }
    try {
      fs.unlinkSync(dest);
    } catch {
      /* ignore */
    }
    if (err instanceof LocalModelError) throw err;
    throw new LocalModelError(
      "RUNTIME_NOT_INSTALLED",
      userMessageForCode("RUNTIME_NOT_INSTALLED"),
      err,
    );
  }
  if (Math.abs(received - expectedBytes) > 64) {
    try {
      fs.unlinkSync(dest);
    } catch {
      /* ignore */
    }
    throw new LocalModelError(
      "RUNTIME_VALIDATION_FAILED",
      userMessageForCode("RUNTIME_VALIDATION_FAILED"),
    );
  }
}

function extractArchive(archivePath: string, destDir: string): void {
  fs.mkdirSync(destDir, { recursive: true });
  if (archivePath.endsWith(".zip")) {
    if (process.platform === "win32") {
      const ps = spawnSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-Command",
          `Expand-Archive -LiteralPath '${archivePath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
        ],
        { encoding: "utf8" },
      );
      if (ps.status !== 0) {
        throw new LocalModelError(
          "RUNTIME_VALIDATION_FAILED",
          userMessageForCode("RUNTIME_VALIDATION_FAILED"),
          ps.stderr,
        );
      }
      return;
    }
    const uz = spawnSync("unzip", ["-o", archivePath, "-d", destDir], {
      encoding: "utf8",
    });
    if (uz.status !== 0) {
      throw new LocalModelError(
        "RUNTIME_VALIDATION_FAILED",
        userMessageForCode("RUNTIME_VALIDATION_FAILED"),
        uz.stderr,
      );
    }
    return;
  }
  // tar.gz
  const tar = spawnSync("tar", ["-xzf", archivePath, "-C", destDir], {
    encoding: "utf8",
  });
  if (tar.status !== 0) {
    throw new LocalModelError(
      "RUNTIME_VALIDATION_FAILED",
      userMessageForCode("RUNTIME_VALIDATION_FAILED"),
      tar.stderr,
    );
  }
}

export type InstallRuntimeResult = {
  paths: RuntimeStoragePaths;
  manifest: RuntimeManifest;
};

/**
 * Instala runtime si falta. Valida SHA-256 antes de extraer/ejecutar.
 */
export async function installLlamaServerRuntime(input: {
  manifest: RuntimeManifest;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  /** Tests: archivo local ya descargado. */
  sourceArchive?: string;
  skipHash?: boolean;
}): Promise<InstallRuntimeResult> {
  const paths = resolveRuntimeStorage(input.manifest);
  ensureRuntimeDirs(paths);
  if (isRuntimeBinaryPresent(paths)) {
    return { paths, manifest: input.manifest };
  }

  const archivePath =
    input.sourceArchive ??
    path.join(paths.downloadsDir, input.manifest.archiveName);

  if (!input.sourceArchive) {
    await downloadArchive(
      input.manifest.downloadUrl,
      archivePath,
      input.manifest.expectedBytes,
      input.signal,
      input.fetchImpl,
    );
  } else {
    fs.copyFileSync(input.sourceArchive, archivePath);
  }

  if (!input.skipHash) {
    const digest = await sha256File(archivePath);
    if (digest.toLowerCase() !== input.manifest.sha256.toLowerCase()) {
      try {
        fs.unlinkSync(archivePath);
      } catch {
        /* ignore */
      }
      throw new LocalModelError(
        "RUNTIME_VALIDATION_FAILED",
        userMessageForCode("RUNTIME_VALIDATION_FAILED"),
      );
    }
  }

  // Limpiar install previo incompleto
  try {
    fs.rmSync(paths.installRoot, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  ensureRuntimeDirs(paths);
  extractArchive(archivePath, paths.installRoot);

  if (!isRuntimeBinaryPresent(paths)) {
    throw new LocalModelError(
      "RUNTIME_VALIDATION_FAILED",
      userMessageForCode("RUNTIME_VALIDATION_FAILED"),
    );
  }

  // Ejecutable
  try {
    fs.chmodSync(paths.binaryPath, 0o755);
  } catch {
    /* Windows ignore */
  }

  // Marker de instalación
  const marker = {
    runtimeId: input.manifest.runtimeId,
    version: input.manifest.version,
    sha256: input.manifest.sha256,
    installedAt: new Date().toISOString(),
    binaryPath: paths.binaryPath,
  };
  fs.writeFileSync(
    path.join(paths.installRoot, "runtime.json"),
    JSON.stringify(marker, null, 2),
    "utf8",
  );

  return { paths, manifest: input.manifest };
}

/** Verifica marker + binario (no re-hash del zip). */
export function validateInstalledRuntime(
  manifest: RuntimeManifest,
): RuntimeStoragePaths {
  const paths = resolveRuntimeStorage(manifest);
  if (!isRuntimeBinaryPresent(paths)) {
    throw new LocalModelError(
      "RUNTIME_NOT_INSTALLED",
      userMessageForCode("RUNTIME_NOT_INSTALLED"),
    );
  }
  const markerPath = path.join(paths.installRoot, "runtime.json");
  if (!fs.existsSync(markerPath)) {
    throw new LocalModelError(
      "RUNTIME_VALIDATION_FAILED",
      userMessageForCode("RUNTIME_VALIDATION_FAILED"),
    );
  }
  try {
    const raw = JSON.parse(fs.readFileSync(markerPath, "utf8")) as {
      sha256?: string;
      version?: string;
    };
    if (
      raw.sha256?.toLowerCase() !== manifest.sha256.toLowerCase() ||
      raw.version !== manifest.version
    ) {
      throw new LocalModelError(
        "RUNTIME_VALIDATION_FAILED",
        userMessageForCode("RUNTIME_VALIDATION_FAILED"),
      );
    }
  } catch (err) {
    if (err instanceof LocalModelError) throw err;
    throw new LocalModelError(
      "RUNTIME_VALIDATION_FAILED",
      userMessageForCode("RUNTIME_VALIDATION_FAILED"),
      err,
    );
  }
  return paths;
}
