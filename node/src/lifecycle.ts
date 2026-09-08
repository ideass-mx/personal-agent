/**
 * Lifecycle del MCP Server local (proceso `agent/`): start → tools → MCP → shutdown.
 * No es un Agent lógico. Portable (sin systemd / Windows Service / launchd).
 */
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { NodeConfig } from "./config.ts";
import { createAgentMcpServer } from "./mcp/server.ts";
import { createDefaultToolRegistry } from "./tools/defaults.ts";
import { abortActiveProcessExecutes } from "./tools/process-execute.ts";
import { shutdownExcelCom } from "./tools/excel-com-lock.ts";
import { shutdownElectronSerp } from "./research/providers/electron-serp.ts";
import type { ToolRegistry } from "./tools/registry.ts";

export interface LocalAgent {
  readonly registry: ToolRegistry;
  readonly mcp: McpServer;
  readonly started: boolean;
  shutdown(): Promise<void>;
}

export type StartLocalAgentOptions = {
  registry?: ToolRegistry;
  config?: NodeConfig;
};

function isRegistry(
  value: ToolRegistry | StartLocalAgentOptions | undefined,
): value is ToolRegistry {
  return (
    value !== undefined &&
    typeof (value as ToolRegistry).register === "function" &&
    typeof (value as ToolRegistry).list === "function" &&
    typeof (value as ToolRegistry).get === "function"
  );
}

export async function startLocalAgent(
  transport: Transport,
  registryOrOptions?: ToolRegistry | StartLocalAgentOptions,
): Promise<LocalAgent> {
  const options: StartLocalAgentOptions = isRegistry(registryOrOptions)
    ? { registry: registryOrOptions }
    : (registryOrOptions ?? {});
  const registry =
    options.registry ?? createDefaultToolRegistry(options.config ?? {});
  const mcp = createAgentMcpServer(registry);
  await mcp.connect(transport);

  let closed = false;
  const shutdown = async () => {
    if (closed) return;
    closed = true;
    await abortActiveProcessExecutes();
    await shutdownExcelCom();
    await shutdownElectronSerp();
    try {
      await mcp.close();
    } catch {
      /* ya cerrado */
    }
  };

  const previousOnclose = transport.onclose;
  transport.onclose = () => {
    previousOnclose?.();
    void shutdown();
  };

  return {
    registry,
    mcp,
    get started() {
      return !closed;
    },
    shutdown,
  };
}
