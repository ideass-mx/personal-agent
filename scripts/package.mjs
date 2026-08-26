/**
 * Prepara dist/ para distribución: JS compilado + better-sqlite3 + launchers.
 * v1 requiere runtime Node.js (no SEA: Hub usa better-sqlite3).
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

const HUB_UNIX = `#!/bin/sh
exec node "$(dirname "$0")/hub.cjs" "$@"
`;

const AGENT_UNIX = `#!/bin/sh
exec node "$(dirname "$0")/agent.cjs" "$@"
`;

const HUB_CMD = `@echo off
node "%~dp0hub.cjs" %*
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

export async function pack() {
  await build();

  const sqliteSrc = path.join(repoRoot, "hub/node_modules/better-sqlite3");
  if (!existsSync(sqliteSrc)) {
    throw new Error("Falta hub/node_modules/better-sqlite3. Ejecuta npm install en hub/");
  }
  const sqliteDest = path.join(dist, "hub/node_modules/better-sqlite3");
  mkdirSync(path.dirname(sqliteDest), { recursive: true });
  cpSync(sqliteSrc, sqliteDest, { recursive: true });

  // winax: addon nativo optional (Windows). External en esbuild; se copia
  // junto al agent.cjs si está instalado. Node lo resuelve desde argv[1],
  // no desde cwd.
  const winaxSrc = path.join(repoRoot, "agent/node_modules/winax");
  if (existsSync(winaxSrc)) {
    const winaxDest = path.join(dist, "agent/node_modules/winax");
    mkdirSync(path.dirname(winaxDest), { recursive: true });
    cpSync(winaxSrc, winaxDest, { recursive: true });
  }

  const bindings = path.join(repoRoot, "hub/node_modules/bindings");
  if (existsSync(bindings)) {
    cpSync(bindings, path.join(dist, "hub/node_modules/bindings"), {
      recursive: true,
    });
  }
  const fileUri = path.join(repoRoot, "hub/node_modules/file-uri-to-path");
  if (existsSync(fileUri)) {
    cpSync(fileUri, path.join(dist, "hub/node_modules/file-uri-to-path"), {
      recursive: true,
    });
  }

  const migrationsSrc = path.join(repoRoot, "db/migrations");
  if (existsSync(migrationsSrc)) {
    cpSync(migrationsSrc, path.join(dist, "migrations"), { recursive: true });
  }

  writeLauncher(path.join(dist, "hub/hub"), HUB_UNIX, true);
  writeLauncher(path.join(dist, "agent/agent"), AGENT_UNIX, true);
  writeLauncher(path.join(dist, "hub/hub.cmd"), HUB_CMD, false);
  writeLauncher(path.join(dist, "agent/agent.cmd"), AGENT_CMD, false);

  writeFileSync(
    path.join(dist, "README.txt"),
    [
      "Personal Agent — Single Node (artefactos v1)",
      "",
      "Topología: una máquina, dos procesos. El Hub (Gateway) spawnea el Local Node por MCP stdio.",
      "No es un segundo Agent Runtime.",
      "",
      "Requisito: Node.js 22+ en PATH.",
      "No son ejecutables nativos standalone (Hub usa better-sqlite3).",
      "",
      "Arranque Single Node (solo el Gateway; el Node es hijo):",
      "  Linux/macOS:  ./hub/hub     o  node hub/hub.cjs",
      "  Windows:      hub\\hub.cmd     o  node hub\\hub.cjs",
      "",
      "Local Node aislado (stdio; no levanta el Gateway):",
      "  ./agent/agent  o  node agent/agent.cjs",
      "",
      "El Hub localiza el Agent en ../agent/agent.cjs respecto a hub.cjs.",
      "No depende del cwd. AGENT_FILESYSTEM_ROOT se reenvía al Local Node.",
      "office.excel.read (Windows): Excel + node_modules/winax junto a agent.cjs.",
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
