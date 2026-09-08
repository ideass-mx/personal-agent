# PHASE 23 — Workspace UX / Conversation Lifecycle Audit

**Estado:** AUDIT CLOSED / NO CODE CHANGE  
**Fecha:** 2026-08-25.

**Resultado A:** el lifecycle Workspace + Conversation es consistente. No hace falta Active Workspace ni nuevas abstracciones para continuar el producto.

---

## NULL

En todos los clientes (Gateway, `@mxideass/workspace-http`, Android Hub):

```text
workspace = null  /  workspace_id NULL
```

significa **Conversation sin Workspace** (casual).

No significa Workspace activo, desconocido, heredado ni por defecto.

---

## 1. Workspace lifecycle

CRUD HTTP (PHASE 16) sobre `WorkspaceStore` / SQLite `workspaces`. Auth Bearer `HUB_TOKEN`. `/health` público.

| Operación | Contrato |
|-----------|----------|
| create | `POST /workspaces` |
| list | `GET /workspaces` |
| get | `GET /workspaces/:id` |
| update | `PATCH /workspaces/:id` |
| delete | `DELETE /workspaces/:id` → `ON DELETE SET NULL` |

Sin Conversations: Workspace válido; listado de hilos `[]`. Con varias: `GET /workspaces/:id/conversations` las devuelve. Tras DELETE: Conversation y Messages permanecen; `workspace_id = NULL`; el GET de listado de ese id es **404** (el Workspace ya no existe). Persistencia: mismo SQLite al reiniciar el Gateway (`createSqliteWorkspaceStore()` y `conversation-workspace` usan `db`). Tests: `workspace-http.test.ts`, `conversation-workspace.test.ts`, reopen de archivo.

No hay cascade delete.

---

## 2. Conversation lifecycle

Dos caminos explícitos:

```text
CASUAL     POST /conversations { workspaceId: null | omitido }  → workspace_id NULL
WORKSPACE  POST /conversations { workspaceId: X }               → workspace_id X
```

X inexistente → 404; no se crea Workspace. Cambio posterior: `PATCH /conversations/:id/workspace`. Borrar Workspace → SET NULL. El primer `user_message` con `conversationId` de un POST reutiliza la fila (`ensureConversation`); no pisa `workspace_id`.

**Implícito:** `user_message` sin `conversationId` → `ensureConversation()` → `INSERT INTO conversations (id)` → NULL. No infiere Session, deviceId, último Workspace ni Android.

Android Hub: casual vs «Nueva conversación en X» (PHASE 21). Gateway legacy: `sessions.create`, sin Workspace.

---

## 3. Conversation ↔ Workspace

Única fuente persistente: `conversations.workspace_id` → `workspaces.id` (nullable, 1:N).

```text
C → X
GET /conversations/C/workspace     → Workspace X
GET /workspaces/X/conversations    → contiene C

PATCH C workspaceId=null
GET /conversations/C/workspace     → null
GET /workspaces/X/conversations    → C no aparece
```

Sin inferencia. Sin Active Workspace. Sin segunda autoridad.

---

## 4. Android UX

```text
Sesiones
  ├── Workspaces (Hub) → listado HTTP de hilos (listingWorkspace, local a la pantalla)
  └── Sesiones (catálogo local, incluye casuales)
        → registerAndActivate(conversationId) → Chat
              → header conversationWorkspace vía GET HTTP
```

El Chat **no** lee Workspace de Session, WS, Active Workspace ni «último usado». `ChatViewModel` usa `sessionKey` como `conversationId` y `GET …/workspace`. `ON_RESUME` recarga. Errores HTTP (401/404/red) salen en el coordinador. Vacío: copy de listado sin hilos. Sin conexión: Hub create exige config HTTP; Gateway legacy exige WS.

Crear Workspace: diálogo del header (PHASE 19). Asociar/cambiar/quitar: selector del hilo actual.

---

## 5. Identidad

| Id | Rol |
|----|-----|
| `deviceId` | Aparato (`auth`). No es dueño de Workspace. |
| `ws_*` | Session de transporte. Muere al disconnect. |
| `conversationId` | Hilo persistente. |
| `workspaceId` / `w_*` | Contexto de trabajo persistente. |
| `AgentDefinition` | Config del Agent. |
| proceso `agent/` | Local Node. |

Sin User. Sin preferencias por dispositivo. Sin `agentId`/`nodeId` de plataforma.

---

## 6. Reconnect / restart

**A — WS drop/reconnect:** el cliente reenvía `conversationId`. Workspace sigue en SQLite. HTTP lo vuelve a resolver.

**B — Gateway restart:** SQLite conserva Workspace, Conversation y FK.

**C — Android restart:** `PersistedSessionProvider` conserva `sessionKey` (= conversationId en Hub). No persiste `workspaceId` como autoridad. Al abrir Chat, GET HTTP.

---

## 7. `ensureConversation`

`TurnMemory` / `history.ts`. Sin Workspace. Runtime: `memory.ensureConversation(input.conversationId)`. `user_message` no lleva `workspaceId`. Hilo en Workspace: POST HTTP **antes** del primer mensaje.

---

## 8. HTTP (PHASE 16–22)

Workspace: GET/POST `/workspaces`, GET/PATCH/DELETE `/workspaces/:id`, GET `/workspaces/:id/conversations`.  
Conversation: POST `/conversations`, GET `/conversations/:id`, GET/PATCH `/conversations/:id/workspace`.

Auth en todas salvo `/health`. Códigos: 401 token, 404 inexistente, 400 payload, 409 Workspace inconsistente (FK huérfana, no debería ocurrir con SQLite). PATCH `workspaceId: null` desasocia; repetir el mismo id es idempotente a nivel de fila. Lista de hilos: **array JSON** (`[]` vacío), no `{ conversations }`. Lista de Workspaces: `{ workspaces }`. Los clientes coinciden con cada forma.

No se añaden endpoints en esta fase.

---

## 9. Clientes

Gateway, TypeScript y Android Hub: `null` = casual. Android no interpreta NULL como último Workspace.

---

## 10. Gateway legacy

```text
Hub      → API Workspace
Gateway legacy → no
```

Colisión **solo de UI**: `SessionsScreen` mezcla `sessionKey` Gateway legacy (`agent:…`) y `conversationId` Hub (`c_…`). No son el mismo concepto. No se unifican. No se lleva Workspace al protocolo Gateway legacy.

---

## 11. Arquitectura

Workspace vive en Gateway (SQLite + HTTP). **No** en Agent Runtime, `AgentTurnInput`, `ToolContext`, LLM, MCP, Local Node, Session ni frames WS.

---

## Deuda real (no implementar ahora)

- No hay `GET /conversations` global: las casuales no se listan por HTTP entre dispositivos; el catálogo Android es local.
- Misma pantalla de Sesiones para Gateway legacy y Hub.
- Voz: hilo nuevo = casual.
- Sin paginación del listado por Workspace.

---

## PHASE 24

El modelo actual **es suficiente**. No Active Workspace, no Runtime Workspace-aware, no A2A.

Siguiente trabajo **solo** si hay consumidor: por ejemplo listar casuales por HTTP (multi-dispositivo) o separar UX Hub/Gateway legacy. Si no hay producto nuevo: detenerse.
