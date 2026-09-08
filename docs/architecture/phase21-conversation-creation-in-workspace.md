# PHASE 21 — Creación explícita de Conversation en Workspace

**Estado:** CLOSED  
**Fecha:** 2026-08-25.

## Diagnóstico

Antes: las Conversations del Hub nacían en `ensureConversation` al primer `user_message` (o se reutilizaba un `conversationId` del cliente). `createConversation({ workspaceId? })` ya insertaba `workspace_id` de forma atómica, pero **no había HTTP** para crearla antes del WebSocket. Android Hub no podía abrir un hilo nuevo con Workspace X sin PATCH posterior. PHASE 20 concluyó que Active Workspace no hace falta: hace falta una **acción explícita**.

## Contrato

`POST /conversations` en el Gateway HTTP (`hub/src/http/workspace-http.ts`), Bearer `HUB_TOKEN`.

```json
{ "workspaceId": null, "title": "opcional" }
```

- `workspaceId` omitido o `null` → conversación **casual** (`workspace_id` NULL).
- `workspaceId` = X existente → INSERT atómico con `workspace_id = X`.
- X inexistente → 404. No se crea Workspace. No se infiere. No hay «último Workspace».

Cliente npm: `createWorkspaceHttpClient().createConversation({ workspaceId?, title? })`.

## Flujos

**Casual:** UI → POST `{ workspaceId: null }` → Conversation C NULL → WS `user_message { conversationId: C }` → Runtime. Sin Workspace.

**En Workspace X:** el usuario pulsa «Nueva conversación en X» (el id se captura **en esa acción**) → POST `{ workspaceId: X }` → C nace con X → la UI activa `sessionKey = C` → el primer mensaje pertenece a C. El header muestra `conversationWorkspace` de C (GET), no un Active Workspace.

Crear B no altera A. Casual desde un hilo que estaba en X **no hereda** X.

## Atomicidad

Un solo `INSERT INTO conversations (id, title, workspace_id)`. No INSERT NULL + PATCH.

`ON DELETE SET NULL` del Workspace sigue: la Conversation y sus Messages permanecen.

## Por qué no hay Active Workspace

Un foco global rellenaría hilos nuevos sin que el usuario lo pida. PHASE 21 cubre el caso de uso con una acción explícita. No hay `activeWorkspaceId`, `currentWorkspace` ni preferencia de dispositivo.

## Por qué `workspaceId` no va en WS

El protocolo (`user_message`) solo identifica el hilo. El Workspace es persistencia de Gateway. Session es el socket; no posee Workspace. El Runtime, MCP y Node no conocen Workspace.

## Voz

Sin UX nueva. Un hilo de voz nuevo sigue siendo casual (NULL). No se infiere el Workspace de la Conversation anterior.

## Android

En **Sesiones** (donde ya se crea un hilo): backend Hub ofrece «Nueva conversación» (NULL) y, por cada Workspace listado, «Nueva conversación en {nombre}». Gateway legacy conserva `sessions.create` sin Workspace.

Tras crear, se `registerAndActivate` el id Gateway y se vuelve al chat; el selector recarga `conversationWorkspace`.

## FUTURE

No implementado: User, Active Workspace, `workspaceId` en WS, A2A, multi-Agent.

## Recomendación PHASE 22

Detenerse aquí salvo producto nuevo. Candidatos: listar Conversations por Workspace en HTTP; o UX Hub vs Gateway legacy más clara. **No** Active Workspace.
