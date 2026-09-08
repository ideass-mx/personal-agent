# PHASE 32 — Conversation Recovery & Hub Stream Routing

**Estado:** PHASE 32 CLOSED  
**Fecha:** 2026-08-25.

**Decisión:** **CLOSED WITH DEBT**

Implementados únicamente los dos ítems autorizados desde PHASE 31:

1. **G-31-03** — `GET /conversations/:id/messages` (History API Hub)
2. **D-31-02** — routing Hub de `assistant_chunk` / `error` por `conversationId`

**PHASE 33 CLOSED** (ver [`phase33-security-product-isolation-audit.md`](./phase33-security-product-isolation-audit.md)).  
**PHASE 34 CLOSED** (ver [`phase34-product-operational-completeness-audit.md`](./phase34-product-operational-completeness-audit.md)).  
**PHASE 35 NOT STARTED.**

---

## History API

```http
GET /conversations/:conversationId/messages
Authorization: Bearer HUB_TOKEN
```

| Caso | Respuesta |
|------|-----------|
| Conversation con mensajes | `200` array ASC (`created_at`, `id`) |
| Conversation vacía | `200 []` |
| Conversation inexistente | `404` (no `[]`) |
| Casual (`workspace_id` NULL) | igual |
| Sin token / token inválido | `401` |

Implementación: `listConversationMessages` en `hub/src/memory/history.ts`; ruta en `workspace-http.ts`. Reutiliza filas SQLite existentes (`StoredMessage`).

Cliente npm: `getConversationMessages(conversationId)` en `@mxideass/workspace-http`.

---

## Autoridad SQLite

Gateway SQLite sigue siendo autoridad del historial persistido user/assistant. El endpoint **no** expone tool transcript (**E-31-05** pendiente).

---

## Android rehydration

`HubConversationHistorySync`:

```text
Hub backend + WS conectado + sessionKey activa
  → GET /conversations/:id/messages
  → HubHistoryMapper
  → ChatStore.replaceThread (si no hay assistant work en vuelo)
```

Arranca en `AgentService` junto a `ChatHistorySync` (Gateway legacy).

---

## DataStore role

DataStore (`threads_json`) = **cache UI / estado local**. Tras conectar o cambiar Conversation Hub, el transcript se **reemplaza** desde Gateway cuando no hay stream activo. No es autoridad servidor.

---

## Cross-talk root cause

Hub multiplexaba varias Conversations en una WS. `assistant_chunk` / `error` no llevaban `conversationId`; `ChatStore.resolveInboundKeyLocked` caía en la sesión **activa** → chunks de A pintaban en B.

---

## Streaming routing solution

**Opción 1 (elegida):** extensión aditiva del protocolo v1:

- `assistant_chunk`: campo opcional `conversationId` (obligatorio en Gateway actual)
- `error` de turno (`internal`): campo opcional `conversationId`

Gateway: `ws.ts` llama `ensureConversation(msg.conversationId)` **una sola vez** al inicio del turno y pasa ese id a `runTurn` e incluye el mismo id en chunks/errores. Evita mint doble si el cliente omite `conversationId`. **Sin cambios** a `AgentTurnInput`, `ToolContext`, ni semántica de `AgentRuntime` (solo el Gateway fija el id antes del turno).

Android: `HubChatConnection` / `ChatStore.handleServer` mapean `conversationId` → `ChatInbound.sessionKey`.

`assistant_done` sin cambios semánticos.

Confirmaciones (`confirm_request`) sin cambios (PHASE 28).

---

## Protocol impact

Cambio **aditivo** documentado en `PROTOCOL.md`. Clientes antiguos pueden ignorar `conversationId` en chunk; clientes nuevos enrutan correctamente.

Espejos: `packages/protocol/messages.ts`, `Messages.kt` (Android + paquete).

---

## Reconnect

Tras reconectar WS, `HubConversationHistorySync` vuelve a cargar historial desde SQLite vía HTTP si el turno terminó (no `hasAssistantWork`).

---

## Android restart

Misma ruta: sessionKey persistida → al conectar Hub → History API → `replaceThread`. Funciona aunque `threads_json` esté vacío o desactualizado.

---

## Tests

| Área | Archivo |
|------|---------|
| HTTP messages | `hub/tests/http/conversation-messages.test.ts` (semántica sin better-sqlite3; ABI Node 18 = ENVIRONMENTAL en suite completa) |
| Invariantes PHASE 32 | `hub/tests/architecture/phase32-conversation-recovery-and-stream-routing.test.ts` |
| Android routing | `ChatStoreInboundTest.kt` |
| Android protocol | `HubConfirmProtocolTest.kt` |
| HubHistoryMapper | `HubHistoryMapperTest.kt` |
| Workspace HTTP client Android | `WorkspaceHttpClientTest.kt` |

---

## Qué NO se implementó

- Tool transcript SQLite (**E-31-05**)
- Multi-device lock (**G-31-01**)
- messageId / idempotency (**G-31-02**)
- Paginación History API
- User / ownership

---

## Invariantes

- Conversation history never crosses conversation boundaries (HTTP + routing)
- `assistant_chunk(A)` / `error(A)` no actualizan B
- Session ≠ Conversation; Runtime ≠ Workspace
- DataStore ≠ autoridad servidor
- MCP/Node/Tool sin cambios

---

## Final recommendation

> **¿Conversation ahora es una unidad persistente y recuperable end-to-end en Hub?**

**Sí, con deuda acotada.** Gateway SQLite + History API + rehidratación Android permiten reconstruir el transcript user/assistant. Tool transcript (E-31-05) y multi-device (G-31-01) siguen fuera.

> **¿El cross-talk A → B quedó eliminado?**

**Sí**, cuando el Gateway envía `conversationId` en chunk/error (comportamiento actual) y el cliente Hub lo enruta a `sessionKey`.

> **¿Existe algún B/C nuevo?**

**No.**

```text
CLOSED WITH DEBT
```

PHASE 33 **CLOSED** — ver [`phase33-security-product-isolation-audit.md`](./phase33-security-product-isolation-audit.md).  
PHASE 34 **CLOSED** — ver [`phase34-product-operational-completeness-audit.md`](./phase34-product-operational-completeness-audit.md).  
PHASE 35 **NOT STARTED**.
