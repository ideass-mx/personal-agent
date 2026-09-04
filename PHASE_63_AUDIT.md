# PHASE 63 — AUDIT (Distributed Tool & Capability Model)

Fecha: 2026-09-04.

## Estado actual (pre-cambio)

```text
Gateway ToolRegistry ← RemoteAgentTool ← MCP tools/list ← Node (único)
AgentRuntime → tool.name → execute → MCP
```

- **No** había `ExecutionTarget`, `CapabilityId` de plataforma, ni multi-Node.
- PHASE 24–40 prohibían `CapabilityRegistry` / `CapabilityManager` como abstracción prematura.
- `enabledTools` / `ToolPolicy` ya usaban IDs lógicos (`filesystem.read`, `office.excel.write`) — **capability IDs de facto**.
- UX `AgentCapabilityUx` / web `capabilities.ts` = etiquetas UI, no runtime.

## Mapeo conceptual

| Hoy | Modelo PHASE 63 |
|-----|-----------------|
| tool name | CapabilityId |
| RemoteAgentTool + MCP | ToolImplementation (transport=mcp/stdio) |
| Local Node proceso | ExecutionTarget kind=node (`node-local`) |
| ToolRegistry | catálogo ejecutable (sigue siendo la vía Runtime) |
| ToolPolicy / enabledTools | policy sobre CapabilityId |
| CapabilityIndex | discover/register/unregister/resolve |

## Decisión (implementada)

Introducir **`CapabilityIndex`** mínimo + tipos en `gateway/src/capabilities/`.
No CapabilityManager / ToolManager / NodeRegistry / router.
ToolRegistry + MCP intactos; topology actual = un ExecutionTarget.
Disconnect → implementations unavailable; descriptors lógicos permanecen.
