# PHASE 64 — AUDIT (Capability Execution Contract)

Fecha: 2026-09-04.

## 1. Componentes reutilizables

| Componente | Path | Rol |
|------------|------|-----|
| `CapabilityIndex.resolve` | `gateway/src/capabilities/` | Candidatos disponibles |
| `ToolImplementation` / `ExecutionTarget` | idem | Dimensiones PHASE 63.1 |
| `ToolRegistry` + `RemoteAgentTool` | `gateway/src/tools/` | Invocación ejecutable |
| `createMcpRemoteExecutor` | `tools/mcp/executor.ts` | MCP callTool + timeout |
| `ToolResult` (+ `artifacts?`) | `tools/types.ts` | Resultado JSON-safe |
| `ToolPolicy` / `enabledTools` | policy + definition | Autorización |
| `requestId` en RemoteToolRequest | `tools/remote.ts` | Correlación |
| `CredentialRedactor` | `credentials/` | Sanitizar logs (no en tool path hoy) |

## 2. Flujo actual Tool → MCP → Node

```text
LLM tool_call (name = CapabilityId)
  → AgentRuntime (confirm si aplica)
  → AgentTool.execute
  → RemoteAgentTool (requestId rt_*)
  → MCP callTool / stdio
  → Node MCP → Native Tool → ToolResult
```

`CapabilityIndex` se sincroniza en discovery (`syncLocalNodeCapabilities`) pero **no** participa en execute.

## 3. Resolución de Capability hoy

Solo en registro/disconnect. **No** en el path de invocación.

## 4. Ejecución de Tool hoy

`AgentRuntime` → `ToolRegistry.get` → `RemoteAgentTool` → MCP executor.

## 5. Gaps

1. Sin `CapabilityRequest` / Resolution / ExecutionResult formales.
2. Sin selección determinista multi-impl.
3. Policy no revalidada en execute (solo discovery).
4. Runtime no expresa “necesito capability X” vía índice.
5. `requestId` no generado en capa Capability.
6. Cancelación in-flight ausente (fuera de alcance mínimo; timeout sí existe en MCP).

## 6. Propuesta mínima

```text
CapabilityExecutor
  policy → resolve(index) → selectDeterministic → ToolRegistry/RemoteAgentTool
```

- Un solo MCP executor existente.
- Runtime sigue viendo `AgentTool`; composition envuelve `execute` hacia CapabilityExecutor.
- Runtime **no** importa MCP SDK ni selecciona target.

## 7. Riesgos

Dual registry drift; timeout ≠ cancel Node; filtrar secrets en errores; no introducir “Control Plane” / managers.

## 8. Desktop / Android

Sin cambio de protocolo WS/HITL/Artifact HTTP. `toolName` en confirm sigue siendo CapabilityId.

## 9. Conclusión

PHASE 64 = façade de ejecución sobre CapabilityIndex + ToolRegistry/MCP existentes. Sin routing inteligente ni scheduler.
