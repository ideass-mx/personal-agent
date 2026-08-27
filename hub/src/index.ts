import "dotenv/config";
import { createDefaultAgentDefinition } from "./agent/definition.ts";
import { ToolRegistry } from "./tools/registry.ts";
import { attachLocalAgent } from "./runtime/attach-agent.ts";
import { resolveAgentFilesystemRoot } from "./runtime/resolve-filesystem-root.ts";

async function main(): Promise<void> {
  const agentDefinition = createDefaultAgentDefinition();
  const tools = new ToolRegistry();
  const filesystemRoot = resolveAgentFilesystemRoot();

  process.stderr.write("[hub] spawn Agent (MCP stdio)\n");
  if (filesystemRoot) {
    // No imprimir la ruta completa (evita filtrar paths personales en logs).
    process.stderr.write("[hub] AGENT_FILESYSTEM_ROOT=configured\n");
  }
  const agent = await attachLocalAgent({
    registry: tools,
    toolPolicy: agentDefinition.toolPolicy,
    filesystemRoot,
  });

  const handshakeOnly = process.env.HUB_HANDSHAKE_ONLY === "1";
  if (handshakeOnly) {
    process.stderr.write("[hub] HUB_HANDSHAKE_ONLY: handshake OK\n");
    await agent.shutdown();
    process.stderr.write("[hub] Agent detenido\n");
    return;
  }

  const { createAnthropicProvider } = await import("./providers/anthropic.ts");
  const { createAgentRuntime } = await import("./agent/runtime.ts");
  const { startServer } = await import("./http/server.ts");
  const { createSqliteTurnMemory } = await import(
    "./memory/sqlite-turn-memory.ts"
  );
  const { createSqliteWorkspaceStore } = await import(
    "./workspace/sqlite-workspace-store.ts"
  );

  const llm = createAnthropicProvider();
  const agentRuntime = createAgentRuntime({
    agent: agentDefinition,
    memory: createSqliteTurnMemory(),
    llm,
    tools,
  });

  const http = startServer(agentRuntime, {
    agentReady: agent.ready,
    agentTools: agent.toolNames,
    workspaces: createSqliteWorkspaceStore(),
  });
  process.stderr.write("[hub] READY\n");

  let stopping = false;
  const shutdown = async (signal?: NodeJS.Signals) => {
    if (stopping) return;
    stopping = true;
    if (signal) process.stderr.write(`[hub] ${signal}, shutdown\n`);
    try {
      await http.close();
    } catch {
      /* ignore */
    }
    await agent.shutdown();
    process.exit(0);
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

void main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`[hub] fallo al arrancar: ${message}\n`);
  process.exit(1);
});
