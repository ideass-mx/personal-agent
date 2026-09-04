/**
 * Prepara dist/ para distribución: JS compilado + better-sqlite3 + launchers.
 * Emite gateway/ + node/ (canónico) y hub/ + agent/ (legacy).
 */
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "./build.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(repoRoot, "dist");

const GATEWAY_UNIX = `#!/bin/sh
exec node "$(dirname "$0")/gateway.cjs" "$@"
`;
const HUB_UNIX = `#!/bin/sh
exec node "$(dirname "$0")/hub.cjs" "$@"
`;
const NODE_UNIX = `#!/bin/sh
exec node "$(dirname "$0")/node.cjs" "$@"
`;
const AGENT_UNIX = `#!/bin/sh
exec node "$(dirname "$0")/agent.cjs" "$@"
`;
const GATEWAY_CMD = `@echo off
node "%~dp0gateway.cjs" %*
`;
const HUB_CMD = `@echo off
node "%~dp0hub.cjs" %*
`;
const NODE_CMD = `@echo off
node "%~dp0node.cjs" %*
`;
const AGENT_CMD = `@echo off
node "%~dp0agent.cjs" %*
`;

function writeLauncher(file, body, unixExecutable) {
  writeFileSync(file, body, { encoding: "utf8" });
  if (unixExecutable && process.platform !== "win32") {
    chmodSync(file, 0o755);
  }
}

function copyNativeTree(src, dest) {
  if (!existsSync(src)) return;
  mkdirSync(path.dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true });
}

export async function pack() {
  await build();

  const sqliteSrc = path.join(repoRoot, "gateway/node_modules/better-sqlite3");
  if (!existsSync(sqliteSrc)) {
    throw new Error(
      "Falta gateway/node_modules/better-sqlite3. Ejecuta npm install en gateway/",
    );
  }
  for (const destRoot of ["gateway", "hub"]) {
    copyNativeTree(sqliteSrc, path.join(dist, destRoot, "node_modules/better-sqlite3"));
    copyNativeTree(
      path.join(repoRoot, "gateway/node_modules/bindings"),
      path.join(dist, destRoot, "node_modules/bindings"),
    );
    copyNativeTree(
      path.join(repoRoot, "gateway/node_modules/file-uri-to-path"),
      path.join(dist, destRoot, "node_modules/file-uri-to-path"),
    );
  }

  const winaxSrc = path.join(repoRoot, "node/node_modules/winax");
  if (existsSync(winaxSrc)) {
    for (const destRoot of ["node", "agent"]) {
      copyNativeTree(winaxSrc, path.join(dist, destRoot, "node_modules/winax"));
    }
  }

  const migrationsSrc = path.join(repoRoot, "db/migrations");
  if (existsSync(migrationsSrc)) {
    cpSync(migrationsSrc, path.join(dist, "migrations"), { recursive: true });
  }

  writeLauncher(path.join(dist, "gateway", "gateway"), GATEWAY_UNIX, true);
  writeLauncher(path.join(dist, "gateway", "hub"), HUB_UNIX, true);
  writeLauncher(path.join(dist, "node", "node"), NODE_UNIX, true);
  writeLauncher(path.join(dist, "node", "agent"), AGENT_UNIX, true);
  writeLauncher(path.join(dist, "hub", "hub"), HUB_UNIX, true);
  writeLauncher(path.join(dist, "agent", "agent"), AGENT_UNIX, true);
  writeLauncher(path.join(dist, "gateway", "gateway.cmd"), GATEWAY_CMD, false);
  writeLauncher(path.join(dist, "gateway", "hub.cmd"), HUB_CMD, false);
  writeLauncher(path.join(dist, "node", "node.cmd"), NODE_CMD, false);
  writeLauncher(path.join(dist, "node", "agent.cmd"), AGENT_CMD, false);
  writeLauncher(path.join(dist, "hub", "hub.cmd"), HUB_CMD, false);
  writeLauncher(path.join(dist, "agent", "agent.cmd"), AGENT_CMD, false);

  writeFileSync(
    path.join(dist, "README.txt"),
    [
      "Personal Agent — Single Node (artefactos v1)",
      "",
      "Topología: Gateway spawnea Node por MCP stdio.",
      "Nombres canónicos: gateway/ + node/",
      "Alias legacy: hub/ + agent/ (mismos binarios).",
      "",
      "Requisito: Node.js 22+ en PATH.",
      "",
      "Arranque Gateway:",
      "  ./gateway/gateway  o  node gateway/gateway.cjs",
      "  legacy: ./hub/hub  o  node hub/hub.cjs",
      "",
      "Node aislado (stdio):",
      "  ./node/node  o  node node/node.cjs",
      "  legacy: ./agent/agent",
      "",
      "HUB_TOKEN = legacy installation credential (no QR / no agentId).",
      "Handshake sin LLM: HUB_HANDSHAKE_ONLY=1",
      "",
    ].join("\n"),
    "utf8",
  );
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  await pack();
}
