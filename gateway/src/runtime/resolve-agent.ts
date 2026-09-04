/**
 * Resuelve cómo lanzar el Node (MCP): fuente (tsx) vs artefacto empaquetado.
 * Detección por layout en disco, no por NODE_ENV.
 *
 * Canónico (producción): ../node/node.cjs relativo al módulo Gateway.
 * Legacy fallback: ../agent/agent.cjs (instalaciones pre-PHASE 53).
 * No usa node/agent.cjs ni hub.cjs internamente.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type AgentLaunchMode = "development" | "production";

export type AgentLaunch = {
  mode: AgentLaunchMode;
  command: string;
  args: string[];
  cwd: string;
  agentEntry: string;
};

export type ResolveAgentLaunchOptions = {
  /** @deprecated use gatewayModuleDir */
  hubModuleDir?: string;
  gatewayModuleDir?: string;
  execPath?: string;
  platform?: NodeJS.Platform;
  exists?: (filePath: string) => boolean;
  repoRoot?: string;
};

function thisModuleDir(metaUrl: string): string {
  return typeof __dirname === "string"
    ? __dirname
    : path.dirname(fileURLToPath(metaUrl));
}

function pathFor(platform: NodeJS.Platform): path.PlatformPath {
  if (platform === "win32") return path.win32;
  return path.posix;
}

/**
 * Entradas empaquetadas candidatas relativas al módulo Gateway.
 * [0] canónico; [1] solo compatibilidad con layouts antiguos.
 */
export function packagedNodeEntries(
  gatewayModuleDir: string,
  platform: NodeJS.Platform = process.platform,
): string[] {
  const p = pathFor(platform);
  return [
    p.join(gatewayModuleDir, "..", "node", "node.cjs"),
    // LEGACY FALLBACK — instalaciones anteriores a gateway/node layout.
    p.join(gatewayModuleDir, "..", "agent", "agent.cjs"),
  ];
}

/** @deprecated use packagedNodeEntries()[0] */
export function packagedAgentEntry(
  hubModuleDir: string,
  platform: NodeJS.Platform = process.platform,
): string {
  return packagedNodeEntries(hubModuleDir, platform)[0]!;
}

export function developmentAgentEntry(
  repoRoot: string,
  platform: NodeJS.Platform = process.platform,
): string {
  const p = pathFor(platform);
  return p.join(repoRoot, "node", "src", "index.ts");
}

/**
 * Production: Gateway cjs → Node cjs (sin tsx).
 * Development: repo/node/src/index.ts vía tsx.
 */
export function resolveAgentLaunch(
  options: ResolveAgentLaunchOptions = {},
): AgentLaunch {
  const platform = options.platform ?? process.platform;
  const p = pathFor(platform);
  const exists = options.exists ?? existsSync;
  const execPath = options.execPath ?? process.execPath;
  const gatewayModuleDir =
    options.gatewayModuleDir ??
    options.hubModuleDir ??
    thisModuleDir(import.meta.url);

  for (const packaged of packagedNodeEntries(gatewayModuleDir, platform)) {
    if (exists(packaged)) {
      return {
        mode: "production",
        command: execPath,
        args: [packaged],
        cwd: p.dirname(packaged),
        agentEntry: packaged,
      };
    }
  }

  const repoRoot =
    options.repoRoot ?? p.resolve(gatewayModuleDir, "..", "..", "..");
  const entry = developmentAgentEntry(repoRoot, platform);
  const nodeRoot = p.join(repoRoot, "node");
  const tsxCli = p.join(nodeRoot, "node_modules", "tsx", "dist", "cli.mjs");
  return {
    mode: "development",
    command: execPath,
    args: [tsxCli, entry],
    cwd: nodeRoot,
    agentEntry: entry,
  };
}
