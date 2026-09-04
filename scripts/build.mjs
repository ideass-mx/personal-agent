/**
 * Compila Gateway y Node a JavaScript de producción (esbuild).
 * Emite nombres canónicos + alias legacy (hub.cjs / agent.cjs).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(repoRoot, "gateway/package.json"));
const esbuild = require("esbuild");

const dist = path.join(repoRoot, "dist");

export async function build() {
  // No borrar dist/ entero: preserva dist/windows/ (PHASE 48 package:windows).
  for (const dir of ["gateway", "node", "hub", "agent"]) {
    rmSync(path.join(dist, dir), { recursive: true, force: true });
  }
  mkdirSync(path.join(dist, "gateway"), { recursive: true });
  mkdirSync(path.join(dist, "node"), { recursive: true });

  const common = {
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    sourcemap: true,
    logLevel: "info",
  };

  const gatewayOut = path.join(dist, "gateway", "gateway.cjs");
  const nodeOut = path.join(dist, "node", "node.cjs");

  await esbuild.build({
    ...common,
    entryPoints: [path.join(repoRoot, "gateway/src/index.ts")],
    outfile: gatewayOut,
    external: ["better-sqlite3"],
  });

  await esbuild.build({
    ...common,
    entryPoints: [path.join(repoRoot, "node/src/index.ts")],
    outfile: nodeOut,
    external: ["winax"],
  });

  // Legacy aliases = thin shims (una implementación, varios entrypoints).
  writeFileSync(
    path.join(dist, "gateway", "hub.cjs"),
    '"use strict";\nrequire("./gateway.cjs");\n',
  );
  writeFileSync(
    path.join(dist, "node", "agent.cjs"),
    '"use strict";\nrequire("./node.cjs");\n',
  );
  mkdirSync(path.join(dist, "hub"), { recursive: true });
  mkdirSync(path.join(dist, "agent"), { recursive: true });
  writeFileSync(
    path.join(dist, "hub", "hub.cjs"),
    '"use strict";\nrequire("../gateway/gateway.cjs");\n',
  );
  writeFileSync(
    path.join(dist, "agent", "agent.cjs"),
    '"use strict";\nrequire("../node/node.cjs");\n',
  );
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  await build();
}
