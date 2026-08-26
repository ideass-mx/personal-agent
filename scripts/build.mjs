/**
 * Compila Hub y Agent a JavaScript de producción (esbuild).
 * No empaqueta native addons ni launchers; eso es `package`.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { mkdirSync, rmSync } from "node:fs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(repoRoot, "hub/package.json"));
const esbuild = require("esbuild");

const dist = path.join(repoRoot, "dist");

export async function build() {
  rmSync(dist, { recursive: true, force: true });
  mkdirSync(path.join(dist, "hub"), { recursive: true });
  mkdirSync(path.join(dist, "agent"), { recursive: true });

  const common = {
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    sourcemap: true,
    logLevel: "info",
  };

  await esbuild.build({
    ...common,
    entryPoints: [path.join(repoRoot, "hub/src/index.ts")],
    outfile: path.join(dist, "hub/hub.cjs"),
    external: ["better-sqlite3"],
  });

  await esbuild.build({
    ...common,
    entryPoints: [path.join(repoRoot, "agent/src/index.ts")],
    outfile: path.join(dist, "agent/agent.cjs"),
    external: ["winax"],
  });
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  await build();
}
