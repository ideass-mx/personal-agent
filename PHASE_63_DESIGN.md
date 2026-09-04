# PHASE 63 — DESIGN

## Principio

```text
Agent → Capability → Resolution → ToolImplementation → ExecutionTarget → Transport → Execution
```

El Agent **no** razona sobre Node, MCP, stdio ni paths.

## Distinciones

```text
Capability ≠ Tool Implementation
Capability ≠ Node / ExecutionTarget
Capability ≠ MCP
Transport ≠ Capability
Credential ≠ Capability
Artifact ≠ Capability
ObjectStorage ≠ Capability
```

## Tipos mínimos

```ts
CapabilityId = string          // filesystem.read, office.excel.write
CapabilityDescriptor           // qué (sin nodeId/transport/secrets)
ToolImplementation             // capabilityId + toolName + executionTargetId + transport?
ExecutionTarget                // id, kind, status, capability ids
CapabilityIndex                // register / unregister / resolve / list
```

**No:** CapabilityManager, ToolManager, ExecutionManager, NodeRegistry, routing.

## Semántica AgentDefinition

```text
enabledTools = capability IDs (exacto o familia)
toolPolicy keys = capability IDs → automatic|confirm
```

Sin `enabledNodes`. Portabilidad: misma definición con Node-A o Node-B.

## Topology actual (válida, no canónica exclusiva)

```text
Gateway
  └── ExecutionTarget "node-local" (stdio/MCP)
        └── ToolImplementations ← tools/list
```

## Topology futura (representable, no implementada)

```text
Gateway
  ├── node-a
  ├── node-b
  ├── node-c
  └── remote / external MCP
```

## Lifecycle

```text
Node connect → register target + implementations (available)
Node disconnect → target unavailable (descriptors lógicos permanecen)
```

## Deferred

Routing, load balancing, failover, affinity, remote protocol, marketplace, ACL matrix, A2A.

Semántica dimensional endurecida en **PHASE 63.1** (`PHASE_63_1_DESIGN.md`).
