# PHASE 13 — Conversation / Workspace association

**Estado:** CLOSED (FK opcional; sin protocolo, Active Workspace ni Runtime).  
**Fecha:** 2026-08-25.

## Auditoría

PHASE 12 CLOSED: `workspaces` + `WorkspaceStore`. TurnMemory solo `ensureConversation` / mensajes. `INSERT INTO conversations (id)` = hilo casual. Protocolo: `conversationId` opcional, sin `workspaceId`. Session sin Workspace. Runtime sin Workspace. SQLite del proyecto: `foreign_keys = ON`; `ALTER TABLE ADD COLUMN ... REFERENCES ... ON DELETE SET NULL` es el mecanismo usado (sin rebuild de tabla).

## CURRENT

```text
Gateway
├── Session                         transporte
├── Conversation                    diálogo
│      └── workspace_id NULLABLE ──► Workspace
├── WorkspaceStore
├── AgentDefinition
├── Agent Runtime                   no ve Workspace
└── MCP → Node → MCP Servers → Tools
```

`conversations.workspace_id TEXT NULL REFERENCES workspaces(id) ON DELETE SET NULL`.

NULL = sin Workspace (casual). No se crea Workspace al crear Conversation, ni al revés.

**deleteWorkspace:** las Conversations siguen; `workspace_id` pasa a NULL; `messages` intactos.

Funciones (Gateway, no Runtime): `createConversation`, `getConversation`, `setConversationWorkspace` en `hub/src/memory/conversation-workspace.ts`. TurnMemory **no** se extendió.

## Protocolo

**Sin cambios.** `user_message` con solo `conversationId` sigue válido. Una operación futura podrá asociar `conversationId` → `workspaceId` sin hacer el campo obligatorio.

## FUTURE (no PHASE 13)

Active Workspace, interacción Workspace-aware, Artifacts, Knowledge, Resources, multi-Agent, A2A.

## Decisiones

- Relación Conversation → Workspace, no al revés como lista primaria.
- Sin inferencia (title, messages, root, session, device).
- Datos existentes: `workspace_id = NULL` (columna nueva).
- Sin `WorkspaceManager` / `ContextManager`.
