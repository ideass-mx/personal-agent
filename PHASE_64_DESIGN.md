# PHASE 64 — DESIGN (Capability Execution Contract)

## 1. Execution Contract

```text
CapabilityRequest
    → policy check
    → CapabilityIndex.resolve
    → deterministic select
    → CapabilityResolution
    → invoke (RemoteAgentTool / ToolRegistry)
    → CapabilityExecutionResult
```

### CapabilityRequest

```ts
{
  capabilityId: string
  input: unknown
  context: ToolContext   // conversationId, deviceId?, requestId?
  requestId?: string     // si falta → cap_<uuid>
  timeoutMs?: number
}
```

### CapabilityResolution (sin secretos)

```ts
{
  requestId
  capabilityId
  implementationId      // `${executionTargetId}::${toolName}`
  executionTargetId
  toolName
  implementationKind
  transport?
}
```

### CapabilityExecutionResult

```ts
{
  requestId
  status: success | failed | timeout | cancelled | unavailable | denied
  content?
  artifacts?: ArtifactReference[]
  error?: { code, message }   // message client-safe
  resolution?: CapabilityResolution  // omitido si denied/not_found
}
```

Error codes: `capability_not_found`, `implementation_unavailable`, `target_unavailable`,
`policy_denied`, `execution_timeout`, `execution_failed`, `transport_error`.

## 2. Deterministic selection

Candidatos = `CapabilityIndex.resolve(capabilityId)` (solo targets `available`).

Orden estable:

1. `metadata.priority` numérico ascendente (si presente; ausente = `Number.POSITIVE_INFINITY`)
2. `executionTargetId` `localeCompare`
3. `toolName` `localeCompare`
4. `implementationKind` `localeCompare`

Se elige el **primero**. Sin AI routing, failover ni load balancing.

## 3. Boundaries

| Dimension | Role |
|-----------|------|
| Agent | Pide CapabilityId; no elige Node/Target |
| Capability | WHAT |
| Implementation | HOW (`implementationKind`) |
| ExecutionTarget | WHERE |
| Transport | HOW REACHED |
| Credential | aparte; nunca en result/resolution |
| Artifact | `ArtifactReference` opcional en result |
| ObjectStorage | no conoce Capability/Agent/MCP |

## 4. Topology actual

```text
Gateway
  → CapabilityExecutor
  → ToolRegistry / RemoteAgentTool
  → MCP/stdio
  → node-local
  → Native Tool
```

## 5. Topology futura (representable)

```text
Gateway
 ├── node-a
 ├── node-b
 ├── node-c
 └── remote service
```

Misma CapabilityId; selección determinista entre implementations.

## 6. AgentRuntime

Composition envuelve tools:

```text
AgentRuntime → AgentTool.execute → CapabilityExecutor.execute
```

Runtime no importa `capabilities/` ni MCP SDK. No elige target.

## 7. Deferred

AI routing, load balancing, failover, health scoring, affinity, remote Node protocol,
A2A, scheduler, GPU scheduling, marketplace, ACL matrix, cancelación distribuida.
