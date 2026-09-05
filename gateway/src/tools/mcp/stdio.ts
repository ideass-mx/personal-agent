/**
 * MCP Adapter (transporte): cliente MCP stdio hacia el Local Node.
 * Único módulo de producción del Hub, junto a mcp-executor, que importa el SDK MCP.
 * No forma parte de AgentRuntime.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { resolveAgentLaunch } from "../../runtime/resolve-agent.ts";

export function defaultAgentStdioCommand(): {
  command: string;
  args: string[];
  cwd: string;
} {
  const launch = resolveAgentLaunch();
  return {
    command: launch.command,
    args: launch.args,
    cwd: launch.cwd,
  };
}

/** Claves de runtime OS que el proceso Node necesita para arrancar y spawn. */
const OS_RUNTIME_KEYS = new Set(
  [
    "PATH",
    "PATHEXT",
    "HOME",
    "USER",
    "USERNAME",
    "LOGNAME",
    "SHELL",
    "TMP",
    "TEMP",
    "TMPDIR",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "TZ",
    "SYSTEMROOT",
    "WINDIR",
    "COMSPEC",
    "OS",
    "PROCESSOR_ARCHITECTURE",
    "NUMBER_OF_PROCESSORS",
    "PROGRAMFILES",
    "PROGRAMFILES(X86)",
    "PROGRAMW6432",
    "PROGRAMDATA",
    "LOCALAPPDATA",
    "APPDATA",
    "HOMEDRIVE",
    "HOMEPATH",
    "USERPROFILE",
    "PUBLIC",
    "ALLUSERSPROFILE",
    "CHROME_CRASHPAD_PIPE_NAME",
  ].map((k) => k.toUpperCase()),
);

const GATEWAY_SECRET_KEY =
  /^(ANTHROPIC_|OPENAI_|AWS_|AZURE_|GOOGLE_)|API[_-]?KEY|SECRET|PASSWORD|CREDENTIAL|PRIVATE[_-]?KEY|(^|_)TOKEN($|_)/i;

function isOsRuntimeKey(key: string): boolean {
  return OS_RUNTIME_KEYS.has(key.toUpperCase());
}

function isGatewaySecretKey(key: string): boolean {
  if (key === "AGENT_FILESYSTEM_ROOT") return false;
  return GATEWAY_SECRET_KEY.test(key);
}

/**
 * Environment del hijo Local Node: runtime OS + overlay explícito (p. ej. filesystem.root).
 * No copia ANTHROPIC_API_KEY, HUB_TOKEN ni el resto de process.env del Gateway.
 */
export function childEnvForLocalNode(
  extra?: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value !== "string") continue;
    if (!isOsRuntimeKey(key)) continue;
    out[key] = value;
  }
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (isGatewaySecretKey(key)) continue;
      out[key] = value;
    }
  }
  return out;
}

export type ConnectAgentStdioOptions = {
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  onClose?: () => void;
};

export type AgentStdioSession = {
  client: Client;
  transport: StdioClientTransport;
  pid: number | undefined;
  close: () => Promise<void>;
};

export async function connectAgentStdioClient(
  options: ConnectAgentStdioOptions = {},
): Promise<AgentStdioSession> {
  const defaults = defaultAgentStdioCommand();
  const transport = new StdioClientTransport({
    command: options.command ?? defaults.command,
    args: options.args ?? defaults.args,
    cwd: options.cwd ?? defaults.cwd,
    env: childEnvForLocalNode(options.env),
    // pipe: avoid attaching a visible console via inherit on Windows.
    stderr: "pipe",
  });
  if (options.onClose) {
    const previous = transport.onclose;
    transport.onclose = () => {
      previous?.();
      options.onClose?.();
    };
  }
  const client = new Client({ name: "mxideass-gateway", version: "0.1.0" });
  try {
    await client.connect(transport);
  } catch (err) {
    try {
      await transport.close();
    } catch {
      /* ignore */
    }
    throw err;
  }
  return {
    client,
    transport,
    pid: transport.pid ?? undefined,
    close: async () => {
      await client.close();
    },
  };
}
