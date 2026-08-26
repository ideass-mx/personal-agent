# PHASE 18 — Cliente HTTP de Workspace

**Estado:** CLOSED (paquete `@mxideass/workspace-http`; Android y WS intactos).  
**Fecha:** 2026-08-25.

## Diagnóstico

No había cliente HTTP del Gateway. Android `HubClient` es **solo WebSocket** (chat). OpenClaw es otro backend. `/health` no tiene consumidor de Workspace. `HUB_TOKEN` vive en `hub/.env` y en `AppPreferences` del móvil (WS `auth`). La API PHASE 16 ya existía.

**Decisión:** capa reutilizable TypeScript, no UI Android (el chat no necesita Workspace todavía). El token lo pasa el caller; no hay almacén nuevo.

## Cliente

`packages/workspace-http` → `createWorkspaceHttpClient({ baseUrl, token, fetch? })`.

Auth: `Authorization: Bearer <token>` (contrato PHASE 16). Sin `deviceId`. Sin User.

| Operación | HTTP |
|-----------|------|
| `listWorkspaces` | GET `/workspaces` |
| `createWorkspace` | POST `/workspaces` |
| `getWorkspace` | GET `/workspaces/:id` |
| `updateWorkspace` | PATCH `/workspaces/:id` |
| `deleteWorkspace` | DELETE `/workspaces/:id` |
| `getConversation` | GET `/conversations/:id` |
| `getConversationWorkspace` | GET `/conversations/:id/workspace` → `Workspace \| null` |
| `setConversationWorkspace` | PATCH `…/workspace` `{ workspaceId }` |
| `clearConversationWorkspace` | PATCH `…/workspace` `{ workspaceId: null }` |

`null` = Conversation casual (`workspace_id` NULL). No es Active Workspace ni default de dispositivo.

404 → error (`WorkspaceHttpError` `not_found`), no `null` silencioso. 401/403 `unauthorized`. 400/422 `bad_request`. 409 `conflict` (inconsistencia de FK, si el Gateway la emite). 5xx `gateway`.

DELETE Workspace: el cliente no hace cascada local; el Gateway aplica SET NULL.

Sin `getActiveWorkspace` / `setActiveWorkspace`. Sin `user_message`. El Runtime no importa este paquete.

```text
Caller
  └── WorkspaceHttpClient  →  Gateway HTTP  →  WorkspaceStore / Conversation
Chat WS
  └── user_message { conversationId }  →  Agent Runtime (sin Workspace)
```

## FUTURE

UI Android/desktop que use este cliente. Active Workspace (PHASE 17). Knowledge / Artifacts / A2A: no.

## PHASE 19 (propuesta)

Pantalla o flujo mínimo que liste Workspaces y asocie el `conversationId` ya persistido en el cliente Hub. Sigue sin `workspaceId` en WS y sin Runtime.
