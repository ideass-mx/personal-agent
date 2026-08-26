# PHASE 12 — Workspace persistence & lifecycle

**Estado:** CLOSED (entidad persistente mínima; sin protocolo, sin FK a Conversation).  
**Fecha:** 2026-08-24.

## Invariantes PHASE 10 / 11 (siguen)

Un Agent por proceso Gateway. Sin selección por request. Session ≠ Conversation. Conversation ≠ Workspace. Sin `workspaceId` en WS. Casual no crea Workspace. Active Workspace no implementado (no es de Session). Runtime no administra Workspace.

## CURRENT

```text
Gateway
├── Session              transporte WS
├── Conversation         SQLite messages (sin FK a Workspace)
├── WorkspaceStore       puerto
│     └── SqliteWorkspaceStore
├── AgentDefinition
├── Agent Runtime        no importa Workspace
└── MCP → Node → MCP Server → Tools
```

Tabla `workspaces`: `id`, `name`, `description`, `created_at`, `updated_at`.  
Ids: `w_<uuid>`. Sin `agentId`, `nodeId`, `filesystemRoot`, `ownerId`, `conversationId`.

Composición: `hub/src/index.ts` → `createSqliteWorkspaceStore()` → `startServer({ workspaces })`.  
Sin rutas HTTP/WS nuevas. El store queda en el proceso Gateway.

## Lifecycle

`createWorkspace`, `getWorkspace`, `listWorkspaces`, `updateWorkspace`, `deleteWorkspace`.

**deleteWorkspace:** sí se implementa. No hay FK a Conversation, así que borrar un Workspace **no** borra hilos. No hay consumidor de UI; es CRUD mínimo del puerto.

No: attach conversation, Active Workspace, switching por voz, routing, ownership, permissions.

## Conversation

Sin cambios de schema. Casual («¿qué hora es?») sigue sin Workspace. Existir filas en `workspaces` **no** asigna Conversations.

## Relación futura (no implementada)

```text
Conversation
      │
      └── optional → Workspace
```

Sin FK ahora: se puede añadir `conversations.workspace_id` NULL después sin forzar que todo hilo tenga Workspace.

## Voice / earbuds

Selección de Workspace = Gateway / UX, **no** Session. Una Session puede morir; otra puede reanudar Conversation y más adelante resolver Workspace.

## FUTURE (no código)

- Conversation → optional Workspace  
- Workspace → Artifacts / Knowledge / Resources  
- Active Workspace (preferencia usuario/dispositivo)  
- Interacción Workspace-aware  

A2A, multi-Agent, registries: no.

## Decisiones

- SQLite solo en el adapter (`database.ts` + `SqliteWorkspaceStore`). El puerto `WorkspaceStore` no importa `better-sqlite3`.
- No `WorkspaceManager`.
- `filesystem.root` sigue en NodeConfig.
- Protocolo WS intacto.
- Runtime intacto.

## Deuda

Sin API cliente. Sin Active Workspace. Sin enlace Conversation. `title` de conversations sigue sin relación.
