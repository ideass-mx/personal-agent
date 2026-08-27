# PHASE 41 — Agent Capabilities UX Implementation

**Estado:** PHASE 41 CLOSED / IMPLEMENTED  
**Fecha:** 2026-08-26.

**Decision:** **PASS** → **READY FOR PHASE 42**

## Objetivo

Capa de producto Android: presentar tools existentes como «Capacidades» humanas sin duplicar policy, autorización ni protocolo.

## Alcance implementado

| Área | Cambio |
|------|--------|
| Mapping UI | `AgentCapabilityUx.kt` — 6 capacidades MVP, tools internas ocultas |
| Pantalla | Settings → Capacidades (`CapabilitiesScreen.kt`) — estática, sin conexión |
| HITL | `HubConfirmHost.kt` — labels humanos vía mapping |
| Navegación | `MainActivity` route `settings/capabilities` |
| Strings | Copy informativo; sin nombres técnicos en superficie principal |

## Capacidades visibles MVP

1. filesystem.read → Leer archivos  
2. filesystem.list → Explorar archivos  
3. filesystem.write → Escribir archivos (requiere confirmación)  
4. process.execute → Ejecutar comandos (requiere confirmación)  
5. office.excel.read → Leer Excel (Solo Windows)  
6. office.excel.write → Modificar Excel (requiere confirmación, Solo Windows)

## Tools ocultas (internas)

agent.echo, math.*, diagnostics.ping, system.info, customer.demo

## Security boundary

- Gateway sigue siendo autoridad de toolPolicy, HITL y ejecución  
- Android solo presenta copy UX; «Disponible para tu agente» ≠ habilitada  
- Sin CapabilityRegistry, PermissionManager, discovery ni toggles  

## Architecture changes

```text
NONE — Android product UX only
```

## No modificado

Runtime, MCP, Local Node, DB, auth, ConfirmationWaiter, protocolo, confirm_request/confirm_response

## Deuda / PHASE 42 propuesta

- Narración LLM de resultados de tools (conversation-first enriquecida)  
- Señal Node live sin nueva API (si producto lo pide)  
- Notificación FGS durante confirm pendiente (PHASE 38 P1)  

## Productive code changed

**YES** — Android only (`capabilities/`, Settings, MainActivity, HubConfirmHost, strings)
