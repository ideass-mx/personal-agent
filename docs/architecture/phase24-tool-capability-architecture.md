# PHASE 24 — Tool / Capability Architecture Audit

**Estado:** AUDIT CLOSED / NO CODE CHANGE  
**Fecha:** 2026-08-25.

**Decisión: A — Tool es suficiente.**

No existe diferencia observable que justifique un tipo `Capability`. Terminology ya prohíbe Capability como entidad independiente. No hay consumidor.

---

## 1. Flujo real de Tools

```text
AgentDefinition.toolPolicy
        ↓
attachLocalAgent (Gateway)
        ↓
MCP Client (stdio) → tools/list
        ↓
registerDiscoveredAgentTools  (filtra + executionMode)
        ↓
ToolRegistry (Gateway)  →  AgentRuntimeTools
        ↓
Agent Runtime  list() → LLM
        ↓
tools.get(name) → AgentTool.execute
        ↓
RemoteAgentTool → MCP Adapter (callTool)
        ↓
Local Node MCP Server
        ↓
Agent Extension → AgentTool.execute (proceso agent/)
```

Decisiones:

| Dónde | Qué decide |
|-------|------------|
| `AgentDefinition.toolPolicy` | Qué nombres entran al catálogo y si son `automatic` o `confirm`. Omitir = deny. |
| `registerDiscoveredAgentTools` | Enforcement: policy no anunciada aborta; anunciada sin policy se omite. |
| `ToolRegistry` | Catálogo que el Runtime ve. No autoriza. |
| Runtime `tools.get` | Si no está, `tool_not_found` (no relee policy). |
| `executionMode === "confirm"` | Runtime espera `ConfirmationPort`; no ejecuta hasta approve. |
| Node `filesystem.root` | Contención de paths. No es toolPolicy. |
| MCP Server | Expone y despacha Tools ya registradas en el proceso Node. |

---

## 2. Flujo de autorización / confirmación

```text
user_message
  → runTurn
  → LLM tool_call
  → tools.get(name)
       ausente → tool_not_found
       automatic → execute (MCP)
       confirm → ConfirmationPort.wait (input congelado)
            → WS confirm_request
            → confirm_response (solo id + approved)
            → ConfirmationWaiter.respond (binding Session/device)
            → execute con FrozenConfirmationOperation
            → ToolResult al LLM
```

- **Crea** la confirmation: Runtime (`cf_*` + request).
- **Estado:** `ConfirmationWaiter` en memoria de Session. Sin SQLite.
- **Resuelve:** cliente WS; claimant = `sessionId` (+ `deviceId`).
- **Reconnect / disconnect:** `cancelAll`. Timeout 60s. No persistencia.
- Pertenece al **turno + Session (Gateway)**, no al Tool, no al AgentDefinition, no al Node.

`availability` ≠ `authorization` ≠ `confirmation` ≠ `execution`:

- Availability: aparece en `tools/list` del Node.
- Authorization (catálogo): `toolPolicy` en discovery del Gateway.
- Confirmation: gate humano en el turno.
- Execution: Node vía MCP.

Hoy policy **filtra catálogo y fija executionMode**. No es un Permission System. El Runtime **no** vuelve a aplicar policy; confía en el registry que le pasan.

---

## 3. Conceptos (código)

### Tool

Unidad ejecutable. `AgentTool`: `name`, `description`, `inputSchema`, `executionMode`, `execute`.  
Identidad = **nombre** (`filesystem.read`, …). No hay `toolId`.  
Vive en el Node (implementación) y en el Gateway como `RemoteAgentTool`.  
Puede existir **fuera de MCP** en tests (in-process). Producción: solo MCP.  
Sin permisos como tipo. `executionMode` es metadata de confirmación, no ACL.

### Capability

**No existe** (ni implícita con semántica distinta). `AgentExtension` es empaque estático de `AgentTool[]` en el Node, no una Capability de plataforma.

### MCP Server

Hoy: un servidor in-process en `agent/` (`createAgentMcpServer`).  
Es **proveedor + frontera de proceso + transporte stdio**. No es runtime de “capacidades” aparte de despachar Tools. Nombre MCP: `mxideass-agent` (etiqueta, no `serverId`).

### Node

Proceso `agent/`. **Hospeda** el MCP Server y registra Tools vía Extensions. **Ejecuta** en `AgentTool.execute`. Node ≠ Tool ≠ MCP Server. Sin `nodeId`.

### Agent policy (`toolPolicy`)

Mapa `{ [toolName]: automatic | confirm }` en `AgentDefinition`.  
Catálogo permitido **y** modo de confirmación. Deny-by-omission.  
No es Permission, no es `filesystem.root`, no es confirmación en sí.

### Confirmation

Safety gate interactivo del turno. Puerto en Runtime; implementación Gateway. Session no es “permiso”; solo binding del pending.

### Permission

**No hay tipo.** No confundir con policy, confirmation ni root.

---

## 4. Fuente de verdad

| Concepto | Fuente de verdad | Owner | Persistencia | Runtime | Gateway | Node |
|----------|------------------|-------|--------------|---------|---------|------|
| Tool | `AgentTool` + `tools/list` | Node implementa; Gateway cataloga Remote | No | Invoca vía puerto | Registry + MCP Client | Registry + execute |
| Tool policy | `AgentDefinition.toolPolicy` | Agent (dato); Gateway enforce en discover | No (memoria) | No relee | attach/discover | No |
| Permission | — | — | — | — | — | — |
| Confirmation | Pending en `ConfirmationWaiter` | Gateway | No (RAM) | `ConfirmationPort.wait` | Waiter + WS | No |
| MCP Server | Proceso `agent/` | Node | No | No (Adapter) | Client/Adapter | Host + Server |
| Node | Proceso `agent/` | Node lifecycle | Config env (`filesystem.root`) | No | spawn `attachLocalAgent` | Sí |

---

## 5. Identidad

Existe: **nombre de Tool**, nombre de Extension, etiqueta MCP server.  
No existe consumidor para `toolId`, `capabilityId`, `nodeId`, `serverId`. No crearlos.

---

## 6. Seguridad (real)

| Riesgo | Qué hace el código |
|--------|-------------------|
| Tool no descubierta | Runtime `tool_not_found` si no está en registry. |
| Saltar toolPolicy | En producción solo entra lo que discover registra. Tests pueden inyectar registry (no es el path de `index.ts`). |
| MCP directo al Node | Posible en el proceso si alguien habla stdio; **policy no vive en el Node**. La frontera de producto es Gateway. |
| Confirmation reuse | Input congelado; binding session/device; disconnect cancela. |
| Session = autorización | No. Session solo transporta y bindea pending. |
| AgentDefinition = permiso de infra | No. `filesystem.root` es Node. |

Mezcla documentada (no refactor): policy = filtro de catálogo **más** executionMode.

---

## 7. Runtime / Node

Runtime no conoce Hono, WS, SQLite, SDK MCP, filesystem ni lifecycle del Node.  
`AgentRuntimeTools` (get/list) es el puerto correcto: no sustituir. Confirmation y MCP quedan fuera.

Node: hospeda MCP Server, registra Extensions, ejecuta Tools. Un MCP Server hoy.

---

## 8. Tests ya cubiertos (no duplicar producto)

Policy/discovery (`tool-policy`, `discover`, office/customer omit). Runtime `tool_not_found`. Confirmation fail-closed. MCP fail-closed. PHASE 6 (sin CapabilityRegistry). Extension independence. Local Agent boundary.

Este PHASE: test documental de frontera.

---

## 9. Deuda (no implementar)

- Policy no se revalida en cada `execute` (aceptable: catálogo congelado al attach).
- Node ejecutará cualquier tool registrada si el cliente MCP no es el Gateway.
- Un solo MCP Server / un Node. Multi-server no tiene consumidor.
- `AgentTool` mezcla descriptor LLM + executionMode + execute (documentado en `types.ts`).

---

## PHASE 25

No introducir Capability. No PermissionManager.  
Siguiente trabajo **solo** con consumidor real (p. ej. segundo MCP Server con identidad). Si no: detenerse.
