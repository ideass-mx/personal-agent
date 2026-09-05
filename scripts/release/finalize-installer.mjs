/**
 * Tras ISCC: SHA-256 + metadata junto al instalador canónico.
 * Uso: node scripts/release/finalize-installer.mjs [path-to-setup.exe]
 */
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  expectedInstallerFileName,
  finalizeInstallerArtifacts,
  getRepoRoot,
  resolveProductBuildInfo,
  writeProductVersionArtifacts,
} from "./product-version.mjs";

const repoRoot = getRepoRoot();
const info = resolveProductBuildInfo();
const expectedName = expectedInstallerFileName(info);

let setupPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(repoRoot, "dist", "windows", expectedName);

if (!existsSync(setupPath)) {
  // Fallback: buscar PersonalAgent-Setup-*.exe en dist/windows
  const dir = path.join(repoRoot, "dist", "windows");
  if (existsSync(dir)) {
    const match = readdirSync(dir).find(
      (n) => n.startsWith("PersonalAgent-Setup-") && n.endsWith(".exe"),
    );
    if (match) setupPath = path.join(dir, match);
  }
}

if (!existsSync(setupPath)) {
  process.stderr.write(
    `[finalize-installer] FAIL: missing installer (expected ${expectedName})\n`,
  );
  process.exit(1);
}

// Refresh generated defines / build-info for the release folder metadata.
writeProductVersionArtifacts(
  path.join(repoRoot, "dist", "windows", "PersonalAgent"),
  info,
);

const result = finalizeInstallerArtifacts(setupPath, info);
process.stdout.write(
  `[finalize-installer] ${path.basename(setupPath)}\n` +
    `  sha256=${result.hash}\n` +
    `  buildInfo=${result.infoPath}\n`,
);
