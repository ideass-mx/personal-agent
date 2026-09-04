/**
 * CapabilityIndex — discover / register / unregister / resolve.
 * No enruta, no balancea, no conoce MCP SDK ni secrets.
 */
import {
  assertCapabilityId,
  assertImplementationKind,
  type CapabilityDescriptor,
  type CapabilityId,
  type ExecutionTarget,
  type ExecutionTargetKind,
  type ExecutionTargetStatus,
  type ToolImplementation,
} from "./types.ts";

function implKey(impl: ToolImplementation): string {
  return `${impl.executionTargetId}::${impl.capabilityId}::${impl.toolName}`;
}

export class CapabilityIndex {
  private readonly descriptors = new Map<CapabilityId, CapabilityDescriptor>();
  private readonly implementations = new Map<string, ToolImplementation>();
  private readonly targets = new Map<string, ExecutionTarget>();

  upsertDescriptor(desc: CapabilityDescriptor): void {
    const id = assertCapabilityId(desc.id);
    this.descriptors.set(id, {
      id,
      name: desc.name,
      description: desc.description,
      inputSchema: desc.inputSchema,
    });
  }

  upsertTarget(input: {
    id: string;
    kind: ExecutionTargetKind;
    status: ExecutionTargetStatus;
  }): void {
    const id = input.id.trim();
    if (!id) throw new Error("ExecutionTarget.id obligatorio");
    const existing = this.targets.get(id);
    const capabilities = existing?.capabilities ?? [];
    this.targets.set(id, {
      id,
      kind: input.kind,
      status: input.status,
      capabilities: [...capabilities],
    });
    this.recomputeTargetCapabilities(id);
  }

  setTargetStatus(targetId: string, status: ExecutionTargetStatus): void {
    const t = this.targets.get(targetId);
    if (!t) return;
    this.targets.set(targetId, { ...t, status });
  }

  registerImplementation(impl: ToolImplementation): void {
    const capabilityId = assertCapabilityId(impl.capabilityId);
    const implementationKind = assertImplementationKind(impl.implementationKind);
    const toolName = impl.toolName.trim();
    const executionTargetId = impl.executionTargetId.trim();
    if (!toolName || !executionTargetId) {
      throw new Error("ToolImplementation incompleta");
    }
    if (!this.descriptors.has(capabilityId)) {
      this.upsertDescriptor({ id: capabilityId });
    }
    if (!this.targets.has(executionTargetId)) {
      this.upsertTarget({
        id: executionTargetId,
        kind: "node",
        status: "available",
      });
    }
    const record: ToolImplementation = {
      capabilityId,
      toolName,
      executionTargetId,
      implementationKind,
      transport: impl.transport,
      metadata: impl.metadata,
    };
    this.implementations.set(implKey(record), record);
    this.recomputeTargetCapabilities(executionTargetId);
  }

  /** Quita implementations de un target. Descriptors lógicos permanecen. */
  unregisterByTarget(targetId: string): void {
    for (const [key, impl] of [...this.implementations.entries()]) {
      if (impl.executionTargetId === targetId) {
        this.implementations.delete(key);
      }
    }
    this.setTargetStatus(targetId, "unavailable");
    this.recomputeTargetCapabilities(targetId);
  }

  resolve(capabilityId: string): ToolImplementation[] {
    const id = assertCapabilityId(capabilityId);
    const out: ToolImplementation[] = [];
    for (const impl of this.implementations.values()) {
      if (impl.capabilityId !== id) continue;
      const target = this.targets.get(impl.executionTargetId);
      if (!target || target.status !== "available") continue;
      out.push(impl);
    }
    return out;
  }

  listDescriptors(): CapabilityDescriptor[] {
    return [...this.descriptors.values()];
  }

  listTargets(): ExecutionTarget[] {
    return [...this.targets.values()];
  }

  listImplementations(): ToolImplementation[] {
    return [...this.implementations.values()];
  }

  hasDescriptor(capabilityId: string): boolean {
    return this.descriptors.has(capabilityId.trim());
  }

  private recomputeTargetCapabilities(targetId: string): void {
    const t = this.targets.get(targetId);
    if (!t) return;
    const caps = new Set<CapabilityId>();
    for (const impl of this.implementations.values()) {
      if (impl.executionTargetId === targetId) {
        caps.add(impl.capabilityId);
      }
    }
    this.targets.set(targetId, {
      ...t,
      capabilities: Object.freeze([...caps].sort()),
    });
  }
}

export function createCapabilityIndex(): CapabilityIndex {
  return new CapabilityIndex();
}
