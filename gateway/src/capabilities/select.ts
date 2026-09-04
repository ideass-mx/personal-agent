/**
 * Selección determinista entre implementations disponibles.
 * Sin AI routing, failover ni scoring.
 */
import type { ToolImplementation } from "./types.ts";
import { implementationIdFor } from "./execution-types.ts";

function priorityOf(impl: ToolImplementation): number {
  const raw = impl.metadata?.priority;
  return typeof raw === "number" && Number.isFinite(raw)
    ? raw
    : Number.POSITIVE_INFINITY;
}

/**
 * Orden estable:
 * 1. metadata.priority asc
 * 2. executionTargetId
 * 3. toolName
 * 4. implementationKind
 */
export function compareImplementations(
  a: ToolImplementation,
  b: ToolImplementation,
): number {
  const pa = priorityOf(a);
  const pb = priorityOf(b);
  if (pa !== pb) return pa < pb ? -1 : 1;
  const t = a.executionTargetId.localeCompare(b.executionTargetId);
  if (t !== 0) return t;
  const n = a.toolName.localeCompare(b.toolName);
  if (n !== 0) return n;
  return a.implementationKind.localeCompare(b.implementationKind);
}

export function selectDeterministicImplementation(
  candidates: readonly ToolImplementation[],
): ToolImplementation | undefined {
  if (candidates.length === 0) return undefined;
  const sorted = [...candidates].sort(compareImplementations);
  return sorted[0];
}

export function toImplementationId(impl: ToolImplementation): string {
  return implementationIdFor({
    executionTargetId: impl.executionTargetId,
    toolName: impl.toolName,
  });
}
