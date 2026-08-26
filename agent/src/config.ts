/**
 * Configuración del Local Node (proceso `agent/`), no de un Agent lógico.
 * filesystem.root pertenece al Node. No es Permission System.
 */
export type NodeFilesystemConfig = {
  root?: string;
};

export type NodeConfig = {
  filesystem?: NodeFilesystemConfig;
};

/** Nombre histórico: es NodeConfig. */
export type AgentFilesystemConfig = NodeFilesystemConfig;
/** Nombre histórico: es NodeConfig, no la definición lógica del Agent. */
export type AgentConfig = NodeConfig;

export const AGENT_FILESYSTEM_ROOT_ENV = "AGENT_FILESYSTEM_ROOT";

export function loadNodeConfig(
  env: NodeJS.ProcessEnv = process.env,
): NodeConfig {
  const raw = env[AGENT_FILESYSTEM_ROOT_ENV];
  const root = typeof raw === "string" ? raw.trim() : "";
  if (root.length === 0) return {};
  return { filesystem: { root } };
}

export function loadAgentConfig(
  env: NodeJS.ProcessEnv = process.env,
): AgentConfig {
  return loadNodeConfig(env);
}
