# PHASE 22 — Conversation Listing by Workspace

**Estado:** CLOSED  
**Fecha:** 2026-08-25.

## Qué se añade

Lectura Gateway de la relación **Workspace → Conversations**:

```text
GET /workspaces/:id/conversations
Authorization: Bearer <HUB_TOKEN>
```

- Workspace inexistente (o ya eliminado) → `404`.
- Workspace sin hilos → `200` `[]`.
- Con hilos → `200` array de `ConversationRecord` (mismos campos HTTP que GET `/conversations/:id`: `id`, `title`, `createdAt`, `workspaceId`).
- Solo `conversations.workspace_id = :id`. Las casuales (`NULL`) no aparecen.
- No crea, no asocia, no infiere, no muta `workspace_id`.

## Persistencia

La consulta vive en `listConversationsByWorkspace` (`hub/src/memory/conversation-workspace.ts`), el mismo módulo que ya posee Conversation → Workspace. No hay `ConversationStore` nuevo. `WorkspaceStore` solo confirma que el Workspace existe.

```sql
SELECT … FROM conversations
WHERE workspace_id = ?
ORDER BY created_at DESC, id DESC
```

El desempate `id DESC` replica el de `getHistory` en `history.ts`. No hay paginación.

**Índice:** no se añade uno nuevo. PHASE 13 ya creó `idx_conversations_workspace` sobre `conversations(workspace_id)`.

## DELETE

Sin cambios: `ON DELETE SET NULL`. Tras borrar el Workspace, el GET de listado es `404` (el Workspace ya no existe). Conversation y Messages siguen.

## Clientes

`@mxideass/workspace-http`: `listWorkspaceConversations(workspaceId)`. Un `404` es `WorkspaceHttpError` `not_found`, no una lista vacía.

Android: `WorkspaceGateway.listWorkspaceConversations`. En Sesiones (Hub), sección Workspaces → «Ver conversaciones» abre el listado de ese Workspace (`listingWorkspace` local a la pantalla, no Active Workspace). Elegir un hilo hace `registerAndActivate` con su `conversationId` y vuelve al Chat; el header sigue siendo `conversationWorkspace` de PHASE 19.

Las conversaciones casuales siguen en el catálogo de sesiones, no dentro de un Workspace.

## Invariantes

Session ≠ Conversation ≠ Workspace. Runtime, `AgentTurnInput`, `ToolContext`, MCP, Node y WS sin Workspace. Sin `workspaceId` en `user_message`.

## FUTURE

No implementado: paginación, Active Workspace, User, A2A.
