# PHASE 63.1 — DESIGN (Capability Semantics)

## Matriz canónica

| Dimension       | Answers          | Example              |
| --------------- | ---------------- | -------------------- |
| Capability      | WHAT             | `office.excel.write` |
| Implementation  | HOW implemented  | `native`             |
| ExecutionTarget | WHERE            | `node-b`             |
| Transport       | HOW reached      | `MCP/stdio`          |
| Credential      | WITH WHAT secret | credential reference |
| Artifact        | managed output   | `artifactId`         |

```text
native ≠ Gateway
MCP ≠ Node
remote ≠ transport
Capability ≠ execution target
Capability ≠ Tool Implementation
Node → ExecutionTarget (válido); ExecutionTarget → Node (NO universal)
```

## Cadena

```text
Capability → Tool Implementation → Execution Target → Transport → Execution
```

## ImplementationKind

```ts
type ImplementationKind = "native" | "mcp" | "remote"
```

- **native** — tooling de la plataforma Personal Agent (no implica Gateway ni in-process).
- **mcp** — implementación cuyo contrato de integración es MCP (p. ej. servidor MCP externo).
- **remote** — implementación fuera del boundary local de despliegue (no implica HTTP ni MCP).

## Topology actual

```text
Gateway (Agent Runtime / coordinación)
   │ stdio (transport)
   ▼
node-local (ExecutionTarget kind=node)
   │ MCP (protocol/integration)
   ▼
Node MCP Server
   ▼
Native Tools  (implementationKind=native)
```

Gateway **no** es Universal Tool Host. Puede hospedar capabilities nativas propias
(artifact metadata, session/platform). Filesystem/Excel/GPU/etc. viven en Nodes.

## Topology futura (documental)

```text
Gateway
  ├── Node-A (native Excel, …)
  ├── Node-B (MCP service, …)
  └── Node-C (native GPU, …)
```

Misma capability, múltiples implementations; Agent solo ve el CapabilityId.

## Fixtures (arquitectónicos, no runtime)

| # | Capability | Kind | Target | Transport |
|---|------------|------|--------|-----------|
| A | artifact.metadata | native | gateway | in-process |
| B | office.excel.write | native | node-b | mcp/stdio |
| C | external.search | mcp | remote-mcp | mcp/http |
| D | gpu.inference | native | node-c | (future remote) |

## Deferred → PHASE 64

Routing / selección de “best” implementation, failover, affinity, remote Node protocol.
