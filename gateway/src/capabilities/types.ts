/**
 * Capability model (PHASE 63 / 63.1) — dimensiones independientes:
 * Capability ≠ Implementation ≠ ExecutionTarget ≠ Transport ≠ Provider.
 *
 * native ≠ Gateway; MCP ≠ Node; remote ≠ transport.
 */
export type CapabilityId = string;

/**
 * HOW is the capability implemented (not WHERE, not HOW reached).
 * - native: platform tooling (may run on Gateway, Node-A, Node-B, …)
 * - mcp: integrated primarily as an MCP tool surface
 * - remote: outside the local deployment boundary (≠ HTTP, ≠ MCP necessarily)
 */
export type ImplementationKind = "native" | "mcp" | "remote";

export type CapabilityDescriptor = {
  readonly id: CapabilityId;
  readonly name?: string;
  readonly description?: string;
  readonly inputSchema?: unknown;
};

/** WHERE — Node is one kind of target; not every target is a Node. */
export type ExecutionTargetKind = "gateway" | "node" | "remote";

export type ExecutionTargetStatus = "available" | "unavailable";

export type ExecutionTarget = {
  readonly id: string;
  readonly kind: ExecutionTargetKind;
  readonly status: ExecutionTargetStatus;
  readonly capabilities: readonly CapabilityId[];
};

export type ToolImplementation = {
  readonly capabilityId: CapabilityId;
  readonly toolName: string;
  readonly executionTargetId: string;
  /** HOW implemented — independent of executionTargetId and transport. */
  readonly implementationKind: ImplementationKind;
  /** HOW the Gateway reaches the target — not part of CapabilityId. */
  readonly transport?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
};

/** Target canónico del Node local actual (stdio + MCP → native tools). */
export const LOCAL_NODE_TARGET_ID = "node-local";

/** Target canónico del proceso Gateway (capabilities in-process). */
export const GATEWAY_TARGET_ID = "gateway";

export const CAPABILITY_ID_RE = /^[a-z][a-z0-9._-]{0,127}$/i;

/** Prefijos que codifican transport en el CapabilityId (prohibido). */
const TRANSPORT_ENCODED_PREFIX =
  /^(mcp|stdio|http|https|ws|websocket|in-process|grpc)\./i;

/** Prefijos que codifican ExecutionTarget en el CapabilityId (prohibido). */
const TARGET_ENCODED_PREFIX =
  /^(node-[a-z0-9_-]+|gateway|remote-[a-z0-9_-]+)\./i;

export function assertCapabilityId(id: string): CapabilityId {
  const trimmed = id.trim();
  if (!CAPABILITY_ID_RE.test(trimmed)) {
    throw new Error(`CapabilityId inválido: ${JSON.stringify(id)}`);
  }
  if (trimmed.includes(":")) {
    throw new Error(
      `CapabilityId no debe codificar target/transport con ':': ${JSON.stringify(id)}`,
    );
  }
  if (TRANSPORT_ENCODED_PREFIX.test(trimmed)) {
    throw new Error(
      `CapabilityId no debe codificar transport: ${JSON.stringify(id)}`,
    );
  }
  if (TARGET_ENCODED_PREFIX.test(trimmed)) {
    throw new Error(
      `CapabilityId no debe codificar ExecutionTarget: ${JSON.stringify(id)}`,
    );
  }
  return trimmed;
}

export function assertImplementationKind(value: unknown): ImplementationKind {
  if (value === "native" || value === "mcp" || value === "remote") {
    return value;
  }
  throw new Error(
    `ImplementationKind inválido: ${JSON.stringify(value)} (native|mcp|remote)`,
  );
}

/**
 * enabledTools / ToolPolicy keys son CapabilityIds.
 * No son identidades de Node ni de transport.
 */
export function isCapabilityIdShape(value: string): boolean {
  try {
    assertCapabilityId(value);
    return true;
  } catch {
    return false;
  }
}
