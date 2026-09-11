import "dotenv/config";
import { createDefaultAgentManager } from "./agents/manager.ts";
import { ToolRegistry } from "./tools/registry.ts";
import { attachLocalNode } from "./runtime/attach-node.ts";
import { resolveAgentFilesystemRoot } from "./runtime/resolve-filesystem-root.ts";
import {
  bindToolsToCapabilityExecutor,
  createCapabilityExecutor,
  createCapabilityIndex,
} from "./capabilities/index.ts";
import { toolNameAllowed } from "./agents/runtime.ts";

async function main(): Promise<void> {
  const agents = createDefaultAgentManager();
  const agentDefinition = agents.getActiveDefinition();
  const tools = new ToolRegistry();
  const capabilityIndex = createCapabilityIndex();
  const filesystemRoot = resolveAgentFilesystemRoot();

  process.stderr.write("[gateway] spawn Node (MCP stdio)\n");
  if (filesystemRoot) {
    process.stderr.write("[gateway] AGENT_FILESYSTEM_ROOT=configured\n");
  }
  const localNode = await attachLocalNode({
    registry: tools,
    toolPolicy: agentDefinition.toolPolicy,
    filesystemRoot,
    capabilityIndex,
    onDisconnected: (status) => {
      process.stderr.write(
        `[gateway] Node ${status} (inesperado); tools fail-closed\n`,
      );
    },
  });

  const handshakeOnly = process.env.HUB_HANDSHAKE_ONLY === "1";
  if (handshakeOnly) {
    process.stderr.write("[gateway] HUB_HANDSHAKE_ONLY: handshake OK\n");
    await localNode.shutdown();
    process.stderr.write("[gateway] Node detenido\n");
    return;
  }

  const { createSqliteDiagnosticsStore } = await import(
    "./diagnostics/store.ts"
  );
  const { startServer } = await import("./http/server.ts");
  const { createSqliteTurnMemory } = await import(
    "./memory/sqlite-turn-memory.ts"
  );
  const { createSqliteWorkspaceStore } = await import(
    "./workspace/sqlite-workspace-store.ts"
  );
  const {
    createLocalModelManager,
    createDefaultLocalRuntime,
    writeLlmPreference,
    defaultLocalPreference,
    readLlmPreference,
  } = await import("./local-llm/index.ts");
  const {
    createIntelligenceRouterProvider,
    getIntelligenceConnection,
  } = await import("./providers/intelligence.ts");

  const capabilityExecutor = createCapabilityExecutor({
    index: capabilityIndex,
    tools,
    policy: () => agents.getActiveDefinition().toolPolicy,
    isEnabled: (capabilityId) => {
      const enabled = agents.getActiveDefinition().enabledTools;
      if (!enabled || enabled.length === 0) return true;
      return toolNameAllowed(capabilityId, enabled);
    },
  });
  const boundTools = bindToolsToCapabilityExecutor(tools, capabilityExecutor);

  const diagnostics = createSqliteDiagnosticsStore();
  const localModelManager = createLocalModelManager();
  try {
    if (!readLlmPreference()) {
      writeLlmPreference(defaultLocalPreference());
    }
  } catch {
    /* ignore */
  }

  const localRuntime = await createDefaultLocalRuntime({ diagnostics });
  const llm = createIntelligenceRouterProvider({
    localManager: localModelManager,
    localRuntime,
    diagnostics,
  });
  const selectedConnection = getIntelligenceConnection();
  process.stderr.write(
    `[gateway] LLM mode=${selectedConnection?.mode || "local"} provider=${selectedConnection?.provider || "local"} model=${selectedConnection?.modelId || "qwen3-4b"}\n`,
  );

  const { buildMemoryContextBlock } = await import("./user-memory/index.ts");
  const { LOCAL_USER_ID } = await import("./identity/types.ts");

  const activeDef = agents.getActiveDefinition();
  const agentRuntime = agents.createRuntime({
    agent: activeDef,
    memory: createSqliteTurnMemory(),
    llm,
    tools: boundTools,
    diagnostics,
    resolveUserMemoryContext: ({ userMessage, userId }) =>
      buildMemoryContextBlock({
        userId: userId || LOCAL_USER_ID,
        query: userMessage,
        preferProject: false,
        limit: 6,
      }),
  });

  // PHASE 59: CredentialManager (metadata SQLite + SecretStore). No se pasa al Runtime/LLM.
  const {
    createCredentialManager,
    createDefaultSecretStore,
  } = await import("./credentials/index.ts");
  const { store: secretStore, backend: secretBackend } =
    createDefaultSecretStore();
  const credentialManager = createCredentialManager(secretStore);
  process.stderr.write(
    `[gateway] CredentialManager secretStore=${secretBackend}\n`,
  );

  // PHASE 57–60: ObjectStorage pluggable (DEFAULT local, offline). No acopla AgentRuntime.
  const {
    createObjectStorage,
    resolveObjectsRoot,
    resolveStorageConfigFromEnv,
  } = await import("./storage/index.ts");
  const { createArtifactManager } = await import("./artifacts/index.ts");
  const objectsRoot = resolveObjectsRoot();
  const storageConfig = resolveStorageConfigFromEnv({ objectsRoot });
  const objectStorage = createObjectStorage({
    config: storageConfig,
    credentials: credentialManager,
  });
  const artifactManager = createArtifactManager(objectStorage);
  if (storageConfig.provider === "local") {
    process.stderr.write(
      `[gateway] ObjectStorage provider=local root=${objectsRoot}\n`,
    );
  } else {
    process.stderr.write(
      `[gateway] ObjectStorage provider=${storageConfig.provider} bucket=${storageConfig.bucket}\n`,
    );
  }

  const http = startServer(agentRuntime, {
    getNodeHealth: () => localNode.getHealth(),
    workspaces: createSqliteWorkspaceStore(),
    artifacts: artifactManager,
    diagnostics,
    localModelManager,
  });
  process.stderr.write("[gateway] READY\n");

  let stopping = false;
  const shutdown = async (signal?: NodeJS.Signals) => {
    if (stopping) return;
    stopping = true;
    if (signal) {
      process.stderr.write(`[gateway] ${signal}, shutdown\n`);
    }
    try {
      await http.close();
    } catch {
      /* ignore */
    }
    try {
      await localRuntime.shutdown();
    } catch {
      /* ignore */
    }
    await localNode.shutdown();
    process.exit(0);
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

void main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`[gateway] fallo al arrancar: ${message}\n`);
  process.exit(1);
});
