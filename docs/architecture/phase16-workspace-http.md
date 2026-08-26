# PHASE 16 — Primer consumidor Workspace (HTTP)

**Estado:** CLOSED (API HTTP en el Gateway; WS y Runtime intactos).  
**Fecha:** 2026-08-25.

## Diagnóstico

PHASE 12–15: Workspace persistente, `workspace_id` nullable, `resolveWorkspaceForConversation`, sin consumidor. `startServer({ workspaces })` no exponía operaciones. `user_message` no necesita `workspaceId`. Frontera más limpia: HTTP de Hono (ya existe `/health`), no el protocolo WS.

## Consumidor

Rutas Gateway (`hub/src/http/workspace-http.ts`), montadas desde `server.ts` si hay `WorkspaceStore`. Auth: `Authorization: Bearer <HUB_TOKEN>` (el mismo secreto que WS `auth`). `/health` sigue público.

| Método | Ruta | Efecto |
|--------|------|--------|
| GET | `/workspaces` | listar |
| POST | `/workspaces` | crear (`name`, `description?`) |
| GET | `/workspaces/:id` | obtener |
| PATCH | `/workspaces/:id` | actualizar |
| DELETE | `/workspaces/:id` | borrar (`ON DELETE SET NULL`) |
| GET | `/conversations/:id` | Conversation (`workspaceId` nullable) |
| GET | `/conversations/:id/workspace` | resolver → `{ workspace: Workspace \| null }` |
| PATCH | `/conversations/:id/workspace` | asociar (`workspaceId` string) o desasociar (`null`) |

No se crea Workspace al asociar a un id inexistente (404). Casual: GET workspace → `null`. Sin inferencia. Sin `ConversationContext` ni managers.

```text
Client
  ├── HTTP Workspace API  → WorkspaceStore / Conversation.workspace_id
  └── WS user_message { conversationId }  → Agent Runtime (sin Workspace)
```

## FUTURE (no implementado)

UI que use `@mxideass/workspace-http`. Active Workspace (PHASE 17). Knowledge, Artifacts, A2A.

## Recomendación PHASE 17

Cliente (o script) que use esta API para asociar un hilo existente. No meter Workspace en `runTurn` ni en `user_message` hasta que una operación de Tools/MCP lo exija de verdad.
