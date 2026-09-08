# PHASE 5 — Workspace boundary

**Estado:** CLOSED (auditoría + frontera documental; sin persistencia, sin protocolo, sin cambio de comportamiento).  
**Fecha:** 2026-08-24.

## Auditoría (código actual)

Conversation vive hoy aquí, no en el Runtime:

| Pieza | Dónde | Qué es |
|-------|--------|--------|
| Filas SQLite | `conversations`, `messages`, `devices` (`db/migrations/001_init.sql`) | Conversation + historial + dispositivo |
| Acceso SQL | `hub/src/memory/history.ts` | `ensureConversation` / `addMessage` / `getHistory`; `touchDevice` |
| Puerto del Runtime | `TurnMemory` (`hub/src/memory/types.ts`) | solo Conversation + mensajes del turno |
| Adapter | `SqliteTurnMemory` | Gateway; Runtime no lo importa |
| Composición | `hub/src/index.ts` | inyecta `TurnMemory` en el Runtime |
| WS / protocolo | `user_message.conversationId` opcional | Session ≠ Conversation |
| Session | `hub/src/sessions/index.ts` | conexión WS + binding de confirmación |
| `filesystem.root` | `AgentConfig` del proceso `agent/` | infraestructura del **Node**, no Workspace |

Schema de `conversations`: `id`, `title`, `created_at`. **No** hay `workspace_id`.

No existen en producción: tipo Workspace, store de Workspace, `workspaceId`, Knowledge, artifacts, ni registries de Agent o Node.

**Qué pertenece a Conversation hoy:** mensajes user/assistant, ventana de historial (`historyWindow`), `conversationId` del protocolo, `deviceId` en mensajes.

**Qué pertenecería conceptualmente a Workspace (no implementado):** continuidad de un trabajo (p. ej. un libro), artifacts/files, Knowledge, metadata de ese trabajo. No el chat trivial ni la hora.

**Qué es Context (turno):** historial recortado + prompt + Tools del catálogo. No es almacenamiento.

## 1. Definiciones

| Término | Definición |
|---------|------------|
| **Workspace** | Contexto **persistente de trabajo** de un Agent. |
| **Conversation** | Interacción conversacional. Puede existir **sin** Workspace. |
| **Agent** | Actor lógico que trabaja (hoy identidad implícita). Eventualmente *dentro de* un Workspace. |
| **Agent Runtime** | Motor común. No es Workspace manager. |
| **Node** | Unidad de ejecución / MCP Servers. |
| **Tool** | Acción vía MCP. Canónico. |
| **MCP** | Agent → Tool. |
| **A2A** | Agent → Agent. **No implementado.** |

```text
Workspace
 ├── Conversations
 ├── Files / artifacts     (conceptual; NO implementado)
 ├── Knowledge             (conceptual; NO implementado)
 └── metadata              (conceptual; sin schema)

Conversation
 ├── messages
 └── referencia a Workspace   (futuro; hoy implícita / ausente)

TurnMemory
 └── persistencia de turnos de una Conversation
```

Workspace **no** contiene lógica del Runtime. El Runtime **no** es dueño del Workspace.

No usar **Project** como término de plataforma ni como sinónimo de Workspace.  
No usar Resources como sustituto de Workspace.  
Tool sigue siendo canónico. Capability no se reintroduce.

## 2. Contrato (deliberadamente no en código)

El código actual **no necesita** un tipo `Workspace` ni `WorkspaceStore`. Nada consume Workspace: el Runtime solo usa `conversationId` + `TurnMemory`.

Inventar `id` / `name` / `createdAt` en TypeScript o SQLite sería prematuro (el schema de Conversation no evidencia un Workspace).

**Identidad de Workspace: implícita (ausente).** Todas las Conversations actuales existen sin Workspace.

Frontera natural futura (no ahora): tabla/puerto en el Gateway, FK opcional `conversations.workspace_id`, **no** el Agent Runtime, **no** el protocolo WS hasta una PHASE que lo requiera.

## 3. Conversation / Workspace / TurnMemory

```text
Workspace          (Gateway; persistencia aplazada)
    │
    └── Conversation   (SQLite history.ts hoy)
             │
             └── TurnMemory   (puerto del Runtime)
```

`history.ts` **no** se convierte en Workspace storage.  
Workspace **no** reemplaza TurnMemory ni Conversation.

## 4. Persistencia

No hay `WorkspaceStore` ni `SqliteWorkspaceStore` en esta fase.

Si más adelante hace falta un puerto: mínimo, independiente de SQLite; adapter SQLite **fuera** del Runtime; composición en el Gateway (`index.ts`).

El Runtime no importará SQLite, `better-sqlite3`, `history.ts` ni implementaciones de Workspace.

## 5. Runtime

El Runtime recibe solo lo necesario para un turno (`AgentTurnInput` + `TurnMemory`).  
No `runtime.createWorkspace()` / `loadWorkspace()` / `saveWorkspace()`.

```text
Gateway
   │
   ├── Workspace          (frontera; sin store)
   │       └── Conversation
   │               └── TurnMemory
   │
   └── Agent Runtime
           │
           └── Tools
                  │
                  └── MCP
                         │
                         └── Node / MCP Server
```

## 6. Protocolo y clientes

El WS solo conoce `conversationId`. **No** se añade `workspaceId`.  
Android / Gateway legacy / `packages/protocol/` **sin cambios**.

Evolución futura (documentada, no implementada): el cliente o el Gateway asociarán Conversation → Workspace cuando exista UX y persistencia. Hasta entonces el protocolo no tiene suficiente información para transportar Workspace.

## 7. Multiconversación (sin detección automática)

Conversation ≠ Workspace. Workspace = continuidad de **trabajo**, no cada intercambio.

| Ejemplo | Qué es |
|---------|--------|
| «¿Cómo va el libro?» | Continuidad de trabajo → Workspace *libro* (cuando exista) |
| «¿Qué opinas de esta acción?» | Otra Conversation; otro Workspace solo si el usuario lo indica |
| «Por cierto, ¿qué hora es?» | Conversation trivial; **no** crear Workspace automáticamente |

La detección automática de Workspace **no** se implementa en PHASE 5.

## 8. Storage futuro (no código)

```text
Workspace
 ├── Conversation storage   (hoy: SQLite messages)
 ├── Artifact storage       (NO: fs de Workspace, S3, MinIO)
 └── Knowledge storage      (NO: vector DB, RAG, embeddings, Knowledge Graph)
```

Cada uno podrá tener su adapter después. `filesystem.root` del Node **no** es el filesystem del Workspace.

Workspace no sustituye MCP ni A2A.

## 9. MCP y A2A

Sin cambios de MCP.

```text
Agent → MCP Client → MCP Server → Tool
```

Nunca Agent → MCP → Agent como colaboración. Futuro:

```text
Agent ── A2A ──> Agent
```

## 10. Decisiones tomadas

- Frontera Workspace documentada; **sin** implementación de persistencia ni tipos de producción.
- Conversation y Workspace son conceptos distintos.
- Runtime no es propietario de Workspace.
- TurnMemory permanece independiente.
- Sin `workspaceId` en protocolo, sin FK SQLite, sin detección automática.
- Sin Project, Capability, Knowledge, registries de Agent o Node, `agentId`/`nodeId`.

## 11. Aplazado

WorkspaceStore, schema SQLite de Workspace, `workspaceId` en WS/Android, artifacts, Knowledge, members/permissions, filesystem de Workspace, asociación Conversation→Workspace, detección automática, Agent definitions (PHASE 6).
