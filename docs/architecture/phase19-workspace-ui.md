# PHASE 19 — UI Workspace (Android)

**Estado:** CLOSED (selector en el chat Hub; WS y Runtime intactos).  
**Fecha:** 2026-08-25.

## Dónde

Única UI de producto: `mobile/android/` (Compose). No hay web.  
El npm `@mxideass/workspace-http` no corre en JVM: Android usa `WorkspaceHttpClient` (OkHttp) con **el mismo contrato HTTP** PHASE 16. No es un segundo diseño ni un cliente WS.

Selector: header de `ChatScreen` (bajo el nombre de sesión). Solo si el backend es **Hub** (`ConnectionBackend.HUB`). OpenClaw no tiene esta API.

## conversationId

El id del hilo es `SessionProvider.activeSession.sessionKey` (el mismo que `user_message.conversationId`).  
`ensureConversation` en el Gateway **persiste ese id** si aún no existe, para que HTTP y chat coincidan.

Al volver al chat: `ON_RESUME` vuelve a `GET /conversations/:id/workspace`.

## HTTP

- GET `/workspaces`, GET `/conversations/:id/workspace`
- PATCH `/conversations/:id/workspace` `{ workspaceId }` o `null`
- POST `/workspaces` — «Solo crear» no asocia; «Crear y usar» asocia de forma explícita

Auth: `Bearer` + token de `HubConfig` (el mismo que WS). Origen HTTP derivado de la URL WS (`HubHttpOrigin`).

`null` / «Sin Workspace» = `conversation.workspace_id` NULL. Campo de UI: `conversationWorkspace`, **no** `activeWorkspace`.

Cambio de Workspace: no toca Session, no reinicia WS, no envía otro turn, no cambia `conversationId`.

Voz: sin Workspace en frames.

## FUTURE

OpenClaw no lista Workspaces. Active Workspace (PHASE 17). UI de creación más rica.
