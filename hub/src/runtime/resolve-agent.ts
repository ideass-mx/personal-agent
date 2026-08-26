/**
 * Resuelve cómo lanzar el Agent: fuente (tsx) vs artefacto empaquetado.
 * Detección por layout en disco, no por NODE_ENV.
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
  /** Directorio del módulo Hub que resuelve (src/runtime o dist/hub). */
  hubModuleDir?: string;
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

export function packagedAgentEntry(
  hubModuleDir: string,
  platform: NodeJS.Platform = process.platform,
): string {
  const p = pathFor(platform);
  return p.join(hubModuleDir, "..", "agent", "agent.cjs");
}

export function developmentAgentEntry(
  repoRoot: string,
  platform: NodeJS.Platform = process.platform,
): string {
  const p = pathFor(platform);
  return p.join(repoRoot, "agent", "src", "index.ts");
}

/**
 * Production: dist/hub/hub.cjs → dist/agent/agent.cjs (Node, sin tsx).
 * Development: repo/agent/src/index.ts vía tsx.
 */
export function resolveAgentLaunch(
  options: ResolveAgentLaunchOptions = {},
): AgentLaunch {
  const platform = options.platform ?? process.platform;
  const p = pathFor(platform);
  const exists = options.exists ?? existsSync;
  const execPath = options.execPath ?? process.execPath;
  const hubModuleDir =
    options.hubModuleDir ?? thisModuleDir(import.meta.url);

  const packaged = packagedAgentEntry(hubModuleDir, platform);
  if (exists(packaged)) {
    const cwd = p.dirname(packaged);
    return {
      mode: "production",
      command: execPath,
      args: [packaged],
      cwd,
      agentEntry: packaged,
    };
  }

  const repoRoot =
    options.repoRoot ?? p.resolve(hubModuleDir, "..", "..", "..");
  const entry = developmentAgentEntry(repoRoot, platform);
  const agentRoot = p.join(repoRoot, "agent");
  const tsxCli = p.join(agentRoot, "node_modules", "tsx", "dist", "cli.mjs");
  return {
    mode: "development",
    command: execPath,
    args: [tsxCli, entry],
    cwd: agentRoot,
    agentEntry: entry,
  };
}
