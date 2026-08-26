/**
 * Arranque local Hub → spawn Agent → MCP initialize → tools/list.
 * No es un supervisor genérico ni un tercer proceso.
 */
import { createMcpRemoteExecutor } from "../tools/mcp-executor.ts";
import {
  connectAgentStdioClient,
  type ConnectAgentStdioOptions,
} from "../tools/mcp-stdio.ts";
import { registerDiscoveredAgentTools } from "../tools/discover.ts";
import type { ToolRegistry } from "../tools/registry.ts";
import {
  AGENT_DISCONNECTED,
  AGENT_SPAWN_ERROR,
  AGENT_STARTUP_ERROR,
  HubAgentError,
  MCP_DISCOVERY_ERROR,
  MCP_INITIALIZE_ERROR,
} from "./errors.ts";
import { cancelAllConfirmations } from "../http/sessions.ts";

export type LocalAgentHandle = {
  readonly ready: boolean;
  readonly toolNames: string[];
  readonly pid: number | undefined;
  isDisconnected(): boolean;
  shutdown(): Promise<void>;
};

export type AttachLocalAgentOptions = {
  registry: ToolRegistry;
  stdio?: ConnectAgentStdioOptions;
  filesystemRoot?: string;
  onDisconnected?: () => void;
  /** Tool Policy del Agent Definition. Default: DEFAULT_TOOL_POLICY. */
  toolPolicy?: unknown;
};

export async function attachLocalAgent(
  options: AttachLocalAgentOptions,
): Promise<LocalAgentHandle> {
  let disconnected = false;
  let ready = false;
  let shuttingDown = false;

  const extraEnv: Record<string, string> = {
    ...(options.stdio?.env ?? {}),
  };
  if (options.filesystemRoot) {
    extraEnv.AGENT_FILESYSTEM_ROOT = options.filesystemRoot;
  }

  const markDisconnected = () => {
    if (disconnected) return;
    disconnected = true;
    if (ready && !shuttingDown) {
      cancelAllConfirmations();
      options.onDisconnected?.();
    }
  };

  let session;
  try {
    session = await connectAgentStdioClient({
      ...options.stdio,
      env: extraEnv,
      onClose: markDisconnected,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/ENOENT|EACCES|spawn /i.test(message)) {
      throw new HubAgentError(
        AGENT_SPAWN_ERROR,
        `No se pudo arrancar el Agent: ${message}`,
      );
    }
    if (/initialize|protocol version|JSON-RPC/i.test(message)) {
      throw new HubAgentError(
        MCP_INITIALIZE_ERROR,
        `MCP initialize falló: ${message}`,
      );
    }
    throw new HubAgentError(
      AGENT_STARTUP_ERROR,
      `No se pudo arrancar el Agent: ${message}`,
    );
  }

  try {
    const executor = createMcpRemoteExecutor(session.client, {
      isDisconnected: () => disconnected || shuttingDown,
    });

    let toolNames: string[];
    try {
      toolNames = await registerDiscoveredAgentTools(
        options.registry,
        session.client,
        executor,
        { policy: options.toolPolicy },
      );
    } catch (err) {
      if (err instanceof HubAgentError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      throw new HubAgentError(
        MCP_DISCOVERY_ERROR,
        `Descubrimiento MCP falló: ${message}`,
      );
    }

    ready = true;
    process.stderr.write(
      `[hub] Agent READY pid=${session.pid ?? "?"} tools=${toolNames.join(",")}\n`,
    );

    let shutdownOnce: Promise<void> | undefined;
    const shutdown = (): Promise<void> => {
      if (!shutdownOnce) {
        shutdownOnce = (async () => {
          shuttingDown = true;
          ready = false;
          try {
            await session.close();
          } catch {
            /* already closed */
          }
          disconnected = true;
        })();
      }
      return shutdownOnce;
    };

    return {
      get ready() {
        return ready && !disconnected;
      },
      toolNames,
      pid: session.pid,
      isDisconnected: () => disconnected || shuttingDown,
      shutdown,
    };
  } catch (err) {
    try {
      await session.close();
    } catch {
      /* ignore */
    }
    throw err;
  }
}

export { AGENT_DISCONNECTED };
