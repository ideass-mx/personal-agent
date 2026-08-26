# PHASE 28 — HITL Android + frontera de environment del Node

**Estado:** PHASE 28 CLOSED  
**Fecha:** 2026-08-25.

## Auditoría (antes de implementar)

### HITL

El protocolo v1 ya tenía `confirm_request` / `confirm_response` (`PROTOCOL.md`, `messages.ts`, `packages/protocol/Messages.kt`). El espejo Android en `mobile/.../protocol/Messages.kt` **no** los tenía: `HubClient.decodeServer` ignoraba el frame. `HubChatConnection` además hacía `else -> Unit`. Clasificación: **UX / bug de cliente** (Gateway correcto). Binding, timeout 60s, fail-closed: sin cambio.

### Environment

`mergeEnv` copiaba **todo** `process.env` al spawn stdio. El Node solo necesita `AGENT_FILESYSTEM_ROOT` + variables OS para ejecutar Node/`spawn`. Secretos Gateway (`ANTHROPIC_API_KEY`, `HUB_TOKEN`) no son requeridos. `process.execute` no lista env. Clasificación: **DEBT / mínimo privilegio**, no C de red (stdio local). `system.info` no vuelca `process.env`.

---

## Cambios mínimos

1. Espejo Kotlin Android alineado al protocolo; `HubChatConnection` emite `ChatInbound.ConfirmRequest`; `HubClient.sendConfirmResponse`; diálogo en `ChatScreen`; pending en `ChatStore` (RAM).
2. `childEnvForLocalNode`: allowlist OS + overlay (`AGENT_FILESYSTEM_ROOT`); excluye secretos.

No se tocó Runtime, Workspace, protocolo WS, toolPolicy.

**PHASE 29 NOT STARTED.**
