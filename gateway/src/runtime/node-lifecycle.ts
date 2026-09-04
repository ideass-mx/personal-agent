/**
 * Estado de lifecycle del Node local (proceso MCP).
 * Independiente de AgentUiState del Desktop (Android conectado ≠ Node vivo).
 */
export const NODE_LIFECYCLE_STATUSES = [
  "STARTING",
  "READY",
  "DEGRADED",
  "DISCONNECTED",
  "STOPPING",
] as const;

export type NodeLifecycleStatus = (typeof NODE_LIFECYCLE_STATUSES)[number];

export type NodeHealthSnapshot = {
  /** Compat: true solo si status === READY. */
  agentReady: boolean;
  nodeStatus: NodeLifecycleStatus;
  agentTools: string[];
};

export function nodeHealthFromStatus(
  status: NodeLifecycleStatus,
  toolNames: readonly string[],
): NodeHealthSnapshot {
  return {
    agentReady: status === "READY",
    nodeStatus: status,
    agentTools: [...toolNames],
  };
}
