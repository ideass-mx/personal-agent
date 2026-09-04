/**
 * Arranque local Gateway → spawn Node → MCP initialize → tools/list.
 * No es un supervisor genérico ni un tercer proceso.
 */
import { createMcpRemoteExecutor } from "../tools/mcp/executor.ts";
import {
  connectAgentStdioClient,
  type ConnectAgentStdioOptions,
} from "../tools/mcp/stdio.ts";
import { registerDiscoveredAgentTools } from "../tools/discover.ts";
import type { ToolRegistry } from "../tools/registry.ts";
import {
  markLocalNodeUnavailable,
  type CapabilityIndex,
} from "../capabilities/index.ts";
import {
  AGENT_DISCONNECTED,
  AGENT_SPAWN_ERROR,
  AGENT_STARTUP_ERROR,
  MCP_DISCOVERY_ERROR,
  MCP_INITIALIZE_ERROR,
  NodeProcessError,
} from "./errors.ts";
import {
  nodeHealthFromStatus,
  type NodeHealthSnapshot,
  type NodeLifecycleStatus,
} from "./node-lifecycle.ts";
import { cancelAllConfirmations } from "../sessions/index.ts";

export type LocalNodeHandle = {
  /** Estado dinámico del Node (no snapshot de boot). */
  readonly status: NodeLifecycleStatus;
  /** true solo cuando status === READY. */
  readonly ready: boolean;
  readonly toolNames: string[];
  readonly pid: number | undefined;
  isDisconnected(): boolean;
  getHealth(): NodeHealthSnapshot;
  shutdown(): Promise<void>;
};

/** @deprecated use LocalNodeHandle */
export type LocalAgentHandle = LocalNodeHandle;

export type AttachLocalNodeOptions = {
  registry: ToolRegistry;
  stdio?: ConnectAgentStdioOptions;
  filesystemRoot?: string;
  /** Crash / cierre inesperado (no shutdown intencional). */
  onDisconnected?: (status: NodeLifecycleStatus) => void;
  /** Tool Policy del Agent Definition. Default: DEFAULT_TOOL_POLICY. */
  toolPolicy?: unknown;
  /** CapabilityIndex (PHASE 63): registra implementations del Node local. */
  capabilityIndex?: CapabilityIndex;
};

/** @deprecated use AttachLocalNodeOptions */
export type AttachLocalAgentOptions = AttachLocalNodeOptions;

export async function attachLocalNode(
  options: AttachLocalNodeOptions,
): Promise<LocalNodeHandle> {
  let disconnected = false;
  let shuttingDown = false;
  let status: NodeLifecycleStatus = "STARTING";
  let toolNames: string[] = [];

  const extraEnv: Record<string, string> = {
    ...(options.stdio?.env ?? {}),
  };
  if (options.filesystemRoot) {
    extraEnv.AGENT_FILESYSTEM_ROOT = options.filesystemRoot;
  }

  const markDisconnected = () => {
    if (disconnected) return;
    disconnected = true;
    // Shutdown intencional: STOPPING; crash tras READY: DISCONNECTED.
    if (shuttingDown) {
      status = "STOPPING";
      if (options.capabilityIndex) {
        markLocalNodeUnavailable(options.capabilityIndex);
      }
      return;
    }
    if (status === "READY" || status === "STARTING") {
      status = "DISCONNECTED";
      cancelAllConfirmations();
      if (options.capabilityIndex) {
        markLocalNodeUnavailable(options.capabilityIndex);
      }
      options.onDisconnected?.(status);
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
      throw new NodeProcessError(
        AGENT_SPAWN_ERROR,
        `No se pudo arrancar el Node: ${message}`,
      );
    }
    if (/initialize|protocol version|JSON-RPC/i.test(message)) {
      throw new NodeProcessError(
        MCP_INITIALIZE_ERROR,
        `MCP initialize falló: ${message}`,
      );
    }
    throw new NodeProcessError(
      AGENT_STARTUP_ERROR,
      `No se pudo arrancar el Node: ${message}`,
    );
  }

  try {
    const executor = createMcpRemoteExecutor(session.client, {
      isDisconnected: () => disconnected || shuttingDown,
    });

    try {
      toolNames = await registerDiscoveredAgentTools(
        options.registry,
        session.client,
        executor,
        {
          policy: options.toolPolicy,
          capabilityIndex: options.capabilityIndex,
        },
      );
    } catch (err) {
      if (err instanceof NodeProcessError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      throw new NodeProcessError(
        MCP_DISCOVERY_ERROR,
        `Descubrimiento MCP falló: ${message}`,
      );
    }

    if (disconnected) {
      status = "DISCONNECTED";
      throw new NodeProcessError(
        AGENT_DISCONNECTED,
        "Node se desconectó durante el arranque.",
      );
    }

    status = "READY";
    process.stderr.write(
      `[node] READY pid=${session.pid ?? "?"} tools=${toolNames.join(",")}\n`,
    );
    process.stderr.write(
      `[gateway] Node READY pid=${session.pid ?? "?"} tools=${toolNames.join(",")}\n`,
    );

    let shutdownOnce: Promise<void> | undefined;
    const shutdown = (): Promise<void> => {
      if (!shutdownOnce) {
        shutdownOnce = (async () => {
          shuttingDown = true;
          status = "STOPPING";
          try {
            await session.close();
          } catch {
            /* already closed */
          }
          disconnected = true;
          // Shutdown normal: no queda como DISCONNECTED/crash.
          status = "STOPPING";
        })();
      }
      return shutdownOnce;
    };

    return {
      get status() {
        return status;
      },
      get ready() {
        return status === "READY";
      },
      get toolNames() {
        return toolNames;
      },
      pid: session.pid,
      isDisconnected: () => disconnected || shuttingDown || status !== "READY",
      getHealth: () => nodeHealthFromStatus(status, toolNames),
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

/** @deprecated use attachLocalNode */
export const attachLocalAgent = attachLocalNode;

export { AGENT_DISCONNECTED };
export type { NodeLifecycleStatus, NodeHealthSnapshot };
