/**
 * Sincroniza discovery MCP → CapabilityIndex (topology local actual).
 *
 * Topology:
 *   Gateway --stdio--> node-local --MCP--> Native Tools
 *
 * Por tanto: implementationKind=native, transport=mcp/stdio, target=node-local.
 * MCP no es el Node; native no es el Gateway.
 */
import type { CapabilityIndex } from "./capability-index.ts";
import {
  LOCAL_NODE_TARGET_ID,
  type CapabilityDescriptor,
  type ImplementationKind,
} from "./types.ts";

export type DiscoveredToolForCapability = {
  readonly name: string;
  readonly description?: string;
  readonly inputSchema?: unknown;
};

/**
 * Registra el Node local como ExecutionTarget y cada tool como implementación nativa.
 * capabilityId === toolName (IDs lógicos actuales).
 */
export function syncLocalNodeCapabilities(
  index: CapabilityIndex,
  tools: readonly DiscoveredToolForCapability[],
  options?: {
    readonly targetId?: string;
    readonly transport?: string;
    readonly implementationKind?: ImplementationKind;
  },
): void {
  const targetId = options?.targetId ?? LOCAL_NODE_TARGET_ID;
  const transport = options?.transport ?? "mcp/stdio";
  const implementationKind = options?.implementationKind ?? "native";

  // Reemplazar implementations previas de este target; descriptors lógicos se conservan.
  index.unregisterByTarget(targetId);
  index.upsertTarget({
    id: targetId,
    kind: "node",
    status: "available",
  });

  for (const tool of tools) {
    const desc: CapabilityDescriptor = {
      id: tool.name,
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    };
    index.upsertDescriptor(desc);
    index.registerImplementation({
      capabilityId: tool.name,
      toolName: tool.name,
      executionTargetId: targetId,
      implementationKind,
      transport,
    });
  }
}

export function markLocalNodeUnavailable(
  index: CapabilityIndex,
  targetId: string = LOCAL_NODE_TARGET_ID,
): void {
  index.unregisterByTarget(targetId);
}
