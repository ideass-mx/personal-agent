# PHASE 31 — Conversation Product Continuity Audit

**Estado:** PHASE 31 CLOSED / AUDIT ONLY  
**Fecha:** 2026-08-25.

**Decisión:** **READY WITH DEBT**

PHASE 30 estableció que el Gateway persiste Conversation/Messages correctamente. PHASE 31 profundiza si eso basta para **producto end-to-end**: identidad, recuperación, aislamiento entre hilos, coherencia Android ↔ SQLite.

**Conclusión:** Conversation es unidad persistente **en el Gateway**; **no** es unidad de producto **recuperable, aislable y coherente end-to-end** hoy. No hay B/C bloqueantes.

**PHASE 32 CLOSED** (ver [`phase32-conversation-recovery-and-stream-routing.md`](./phase32-conversation-recovery-and-stream-routing.md)). Código productivo PHASE 31: ninguno.

---

## Executive Summary

| Dimensión | Veredicto |
|-----------|-----------|
| Identidad `conversationId` (Gateway) | **A** — SQLite autoridad; HTTP + WS |
| Identidad en Android Hub | **A/E** — `sessionKey` = transporte UI; debe coincidir con `c_…` por convención |
| Recuperación historial | **G/D** — sin History API; DataStore = cache local |
| Aislamiento mid-turn (Hub chat) | **D** — cross-talk reproducible A→chunk→B |
| Multi-device | **G** — sin lock; `session.replying` solo por WS |
| Seguridad | **A** — `HUB_TOKEN` = identidad instalación; sin ownership por diseño |
| Tool transcript | **E** — deliberado en Runtime; pérdida observabilidad |
| Product semantics | **E/G** — agrupador persistente de mensajes, no hilo completo de producto |

---

## Conversation identity

### Autoridades

| Capa | Autoridad | Evidencia |
|------|-----------|-----------|
| Creación HTTP | Gateway `createConversation` → `c_${uuid}` | `conversation-workspace.ts` |
| Creación WS | `ensureConversation(id?)` | `history.ts` |
| Persistencia | SQLite `conversations.id` | `schema.sql` |
| Android Hub UI | `SessionProvider.sessionKey` | `PersistedSessionProvider.kt` |
| Runtime turno | `input.conversationId` vía WS | `ws.ts` → `runtime.ts` |

### Flujo Android Hub → Gateway

```text
SessionsViewModel.createHubConversation
  → POST /conversations
  → registerAndActivate(created.id)
  → ChatViewModel.send()
  → sendUserMessage(text, currentConversationId())
  → user_message.conversationId = sessionKey
  → ensureConversation(conversationId)
  → SQLite
```

### `sessionKey = conversationId`

**No es equivalencia conceptual:** Session WS = `ws_${uuid}` (transporte efímero). En Android Hub, `sessionKey` **representa** el `conversationId` del Gateway por convención de producto (`SessionsViewModel`, `ChatViewModel`). OpenClaw usa `agent:main:…` — otro modelo (D-31-05).

| Escenario | Comportamiento |
|-----------|----------------|
| Falta `conversationId` en WS | Nuevo `c_` cada vez (**E-31-01**) |
| Id inválido / arbitrario | INSERT si no existe (**E-31-02**) |
| Reutilización | OK; no pisa `workspace_id`/`title` (**A-31-01**) |
| Cambio mid-turn | Gateway sigue turno con id del `user_message` original (**A-31-02**) |
| Restart Gateway | SQLite conserva id (**A-31-03**) |
| Reconnect Android | Mismo `sessionKey` en DataStore (**A-31-04**) |
| PROTOCOL pide reutilizar id post-`assistant_done` | Documentado; Android Hub **no** auto-registra id desde `assistant_done` si no hay sesión (**E-31-03**) |

---

## Message identity

### Modelo actual (Gateway)

```text
messages: id (m_uuid), conversation_id, role, content, device_id, created_at
```

- `messageId` en `assistant_done` = id fila SQLite recién insertada.
- Cliente **no** envía id en `user_message`.
- Android local: `UUID` en `ChatMessage.id` (independiente del Gateway).

### ¿Problema real de duplicación?

| Escenario | ¿Duplica? | Evidencia |
|-----------|-----------|-----------|
| Offline queue Hub | No (un flush) | `HubClient.flushPending` |
| Reconnect mid-send | Cola atómica | idem |
| Usuario reenvía manual | Sí — nuevo turno + fila user | Sin dedup |
| Replay WS | No implementado | — |
| Multi-device | Dos users posibles | **G-31-01** |

### ¿Necesario `messageId` cliente?

| Veredicto | Razón |
|-----------|-------|
| **G-31-02** (future) | Útil si retry automático o sync multi-device |
| **E-31-04** (debt) | Reenvío manual duplica; no bloqueante hoy |
| **No necesario ahora** | Un WS send = un turno; cola offline no duplica |

---

## History API

### Estado

**No existe** `GET /conversations/:id/messages` (confirmado D-30-04 / **G-31-03**).

Rutas HTTP actuales: metadata Conversation + Workspace resolve; listado por Workspace; **no** lectura de mensajes.

### ¿Debe existir?

| Criterio | Evaluación |
|----------|------------|
| Recuperación post-wipe Android | **Sí** — bloqueante producto multi-dispositivo |
| Continuidad cross-device | **Sí** |
| Auth | Bearer `HUB_TOKEN` (mismo modelo instalación) |
| Contrato esperado | `{ messages: [{ id, role, content, createdAt, deviceId? }] }`, orden ASC, paginación/limit |
| Mensajes parciales | No en SQLite hasta `assistant_done` |
| Tool calls | No en schema actual |
| Conversation casual / con Workspace | Mismo endpoint; Workspace irrelevante para lectura |

**Clasificación:** **G** (future requirement) + **D** (UX gap actual). **No implementar en PHASE 31.**

---

## Android rehydration

### Qué es DataStore

| Dato | Rol real |
|------|----------|
| `threads_json` (ChatStore) | **Cache UI** — única copia Hub visible al usuario |
| `gateway_session` (SessionProvider) | Catálogo + sesión activa |
| `conversationId` (AppPreferences) | Legacy/mirror de visible key |

**Autoridad historial Hub:** ninguna en cliente; Gateway SQLite es autoridad **servidor** pero **inaccesible** al Android Hub.

### Escenarios

| # | Escenario | Resultado |
|---|-----------|-----------|
| 1 | Reinicio app | Hilos locales restaurados; Gateway no consultado |
| 2 | Pierde conexión | Cola offline; no re-fetch historial |
| 3 | Cambio dispositivo | Historial Hub **perdido** en cliente |
| 4 | Cambia Conversation | `setActive` + `coordinator.load` (Workspace HTTP) |
| 5 | Vuelve a Conversation antigua | Mensajes locales si existían partición; si no, vacío |
| 6 | HTTP 401 | Workspace coordinator error; chat WS auth_failed |
| 7 | HTTP 404 Conversation | Error al resolver Workspace |
| 8 | Pierde WS | Turno puede completar en server |
| 9 | Reconecta | Misma sessionKey; sin sync mensajes |
| 10 | DataStore inconsistente | No hay reconciliación con Gateway |

**D-31-01:** DataStore actúa como **autoridad accidental** para UX Hub porque no hay alternativa.

**ChatHistorySync** solo OpenClaw (`GatewayClient.loadHistory`) — no Hub.

---

## Cross-talk

### Escenario reproducible (Hub chat)

```text
1. sessionKey activa = A; usuario envía mensaje → appendUser(A)
2. Gateway: runTurn(conversationId=A); session.replying=true
3. Usuario cambia a B (SessionProvider.setActive)
4. assistant_chunk llega sin conversationId
5. HubChatConnection → AssistantDelta(sessionKey=null)
6. ChatStore.resolveInboundKeyLocked(null) → activa B
7. Chunks se aplican al hilo B (visible)
8. assistant_done(conversationId=A) → hilo A actualizado; UI muestra B
```

**Resultado:** hilo B contaminado con streaming de A; hilo A puede quedar con user + done sin texto stream completo en partición A.

### Contraste VoiceSession

`VoiceSession` **filtra** `msg.sessionKey != key` antes de pintar. Chat UI **no**.

| Clasificación | ID |
|---------------|-----|
| **D** (UX / client routing) | **D-31-02** |
| ¿B en Gateway? | **No** — persistencia correcta en A |
| ¿Falso positivo? | **No** — trazado en código |

**No corregido.** Candidato: `conversationId` en protocolo o enrutar Hub como OpenClaw/Voice.

---

## Streaming

### Campos por frame (protocolo v1)

| Frame | conversationId | sessionId | requestId | messageId |
|-------|----------------|-----------|-----------|-----------|
| `user_message` | opcional (cliente) | implícito WS | — | — |
| `assistant_chunk` | **no** | implícito WS | — | — |
| `assistant_done` | **sí** | implícito WS | — | **sí** (SQLite) |
| `error` | **no** | implícito WS | — | — |
| `confirm_request` | **sí** | implícito WS | — | — |
| `confirm_response` | **no** (frozen server-side) | implícito WS | — | — |

### ¿Seguro por binding Session?

**Parcialmente:** Gateway procesa un turno por WS; chunks salen por la misma conexión que inició el turno. **Pero** Android multiplexa **múltiples conversationIds** en una sola WS y enruta por sesión **activa**, no por conexión. El binding WS **no** sustituye `conversationId` en cliente multi-hilo.

**D-31-02:** ausencia de `conversationId` en chunk/error es **fuente real** de cross-talk en UI Hub.

---

## Multi-device

```text
Device A ──WS──┐
               ├── Gateway (mismo HUB_TOKEN)
Device B ──WS──┘
         Conversation C
```

| Pregunta | Respuesta |
|----------|-----------|
| ¿Ambos pueden enviar? | Sí (WS distintas) |
| ¿Lock global Conversation? | No |
| `session.replying` | Por WS, no por Conversation |
| Intercalación mensajes | Posible en SQLite (orden `created_at`) |
| Producto pretende soportarlo | **No** — instalación única implícita |

**G-31-01:** future requirement si multi-device es objetivo.

---

## Reconnect

```text
WS connected → user_message → disconnect → Gateway continúa runTurn
```

| Pregunta | Respuesta |
|----------|-----------|
| ¿Turno continúa? | Sí (async `reply()` en Gateway) |
| ¿Assistant termina? | Sí si LLM/tools completan |
| ¿Android recibe? | No si desconectado |
| ¿SQLite tiene resultado? | Sí si turno OK |
| ¿Android recupera? | **No** (sin History API) |
| ¿Duplicado? | Cola offline no duplica; reenvío manual sí |
| ¿Puede enviar de nuevo? | Tras reconnect; `busy` hasta `finally` en WS caída el turno remoto sigue pero cliente no sabe |

**D-31-03:** desync cliente/servidor post-disconnect.

---

## Tool transcript

```text
user → tool_call → tool_result → assistant
```

| Capa | Tool call/result |
|------|------------------|
| SQLite | **No** |
| LLM in-memory (turno) | **Sí** |
| WS | Solo texto assistant + confirm_request |
| Android | No ve tools salvo confirm UI |
| Siguiente turno | LLM no ve tools previos |

**E-31-05:** deuda / decisión deliberada — schema solo user/assistant. Pérdida observabilidad y contexto tool-a-tool entre turnos. **No** es bug de persistencia Conversation.

---

## Partial turns

| Caso | User SQLite | Assistant SQLite | WS cliente |
|------|-------------|-------------------|------------|
| Tool timeout | Sí | Si LLM cierra turno | error/partial |
| Node dies | Sí | Depende LLM | error |
| WS disconnect mid-stream | Sí | Si completa en server | pierde stream |
| MAX_TOOL_ITERATIONS | Sí | **No** | error |

**E-31-06:** puede existir Conversation cuyo último par user/assistant **no refleja** lo vivido en UI (disconnect) o turno abortado (error sin assistant).

---

## Ordering

Gateway: `ORDER BY created_at DESC, id DESC LIMIT N` → reverse → cronológico.

- `created_at` default `datetime('now')` — resolución segundo; empate por `id`.
- Concurrent WS same Conversation: orden insert = orden commit SQLite (WAL).
- Android: orden lista en `ChatThreads` (append order).
- **A-31-05:** suficiente para producto actual single-device.

---

## Conversation switching

| Evento tardío | Destino (Hub) |
|---------------|---------------|
| `assistant_chunk` | **Activa** (bug routing D-31-02) |
| `assistant_done` | conversationId correcto |
| `error` | **Activa** |
| `confirm_request` | RAM global `_pendingHubConfirm`; filtrado por conversationId en clear |
| Queued messages | Por sessionKey al send |

OpenClaw/Gateway path: eventos con `sessionKey` → routing correcto (tests `ChatStoreInboundTest`).

---

## Workspace continuity

**A-31-06:** Sin cambios respecto PHASE 30. `workspace_id` en Conversation; SET NULL; Android `GET /conversations/:id/workspace`.

---

## Hub/OpenClaw

Misma `SessionsScreen`; keys `c_…` vs `agent:…`. Listado Workspace solo Hub. Historial remoto solo OpenClaw.

**D-31-04:** confusión real para usuario que alterna backends.

---

## Security

| Vector | Estado |
|--------|--------|
| HTTP Conversation/Messages | Bearer `HUB_TOKEN`; sin GET messages |
| WS | Token + cualquier `conversationId` válido |
| Cross-device | Mismo token = acceso total |
| ID guessing | UUID; 401 sin token |

**A-31-07:** no hay vulnerabilidad extra; **no hay ownership** porque identidad = instalación (`HUB_TOKEN`). **No** introducir User.

---

## Persistence

SQLite: WAL, `foreign_keys=ON`, migraciones 001–003.

| Check | Estado |
|-------|--------|
| FK messages→conversations | Sí |
| FK conversations→workspaces SET NULL | Sí |
| Index `(conversation_id, created_at)` | Sí |
| Restart | `config.dbFile` persistente |
| Concurrent writes | better-sqlite3 sync; un proceso Hub |
| Empty Conversation | Válida (sin messages) |

**A-31-08:** integridad referencial correcta.

---

## Product semantics

**Evidencia de código:**

- Gateway: Conversation = fila id + title opcional + workspace_id; Messages = texto plano user/assistant.
- No hay estado de turno, unread, ni tool history en Conversation.
- Android: partición UI por sessionKey; persistencia local best-effort.
- Docs PHASE 21–23: intención de hilo persistente **asociable** a Workspace.

**Veredicto semántico:**

> Hoy Conversation = **identificador persistente para agrupar mensajes** en Gateway, con aspiración de producto a **hilo persistente completo**, **no cumplida end-to-end** en cliente Hub.

---

## Test coverage

| Área | Tests |
|------|-------|
| Creation HTTP | `workspace-http/client.test.ts` |
| Cross-thread (OpenClaw keys) | `ChatStoreInboundTest.kt` |
| Hub cross-talk | **Ausente** (gap) |
| PHASE 30/31 invariants | arch tests |
| Reconnect | implícito HubClient; sin e2e SQLite |
| History Hub | arch test (ausencia endpoint) |
| Multi-device | ninguno |
| Voice filter sessionKey | `VoiceSession.kt`; sin test Hub gap |

---

## Findings A–G

| ID | Finding | Classification | Severity | Evidence | Code required |
| -- | ------- | -------------- | -------- | -------- | ------------- |
| A-31-01 | ensureConversation no pisa workspace/title | A | — | `history.ts` | No |
| A-31-02 | Turno Gateway fijado al conversationId del send | A | — | `ws.ts`, `runtime.ts` | No |
| A-31-03 | conversationId sobrevive Gateway restart | A | — | SQLite | No |
| A-31-04 | Android persiste sessionKey tras restart | A | — | DataStore | No |
| A-31-05 | Orden messages created_at+id suficiente | A | — | `history.ts` | No |
| A-31-06 | Workspace SET NULL + HTTP resolve | A | — | schema, coordinator | No |
| A-31-07 | Seguridad = HUB_TOKEN instalación; sin ownership | A | — | `workspace-http.ts`, `ws.ts` | No |
| A-31-08 | FK e integridad SQLite | A | — | `schema.sql`, `database.ts` | No |
| D-31-01 | DataStore = autoridad UX accidental Hub | D | Medium | ChatStore, no History API | Sí (History API o sync) |
| D-31-02 | Cross-talk A→chunk→B reproducible Hub chat | D | Medium | HubChatConnection, ChatStore | Sí (protocolo o routing) |
| D-31-03 | Desync post-disconnect sin recuperación | D | Medium | reconnect + no GET messages | Sí (History API) |
| D-31-04 | Hub/OpenClaw misma UI, distinto modelo | D | Low | SessionsViewModel | Doc/UX |
| E-31-01 | WS sin id crea Conversation nueva | E | Low | `ensureConversation` | Opcional |
| E-31-02 | IDs arbitrarios en ensureConversation | E | Low | `history.ts` | Opcional |
| E-31-03 | Android no adopta conversationId de assistant_done | E | Low | PROTOCOL vs ChatViewModel | Sí si flujo casual |
| E-31-04 | Sin idempotency user_message | E | Low | protocol | G si retry auto |
| E-31-05 | Tool transcript no en SQLite | E | Medium | `runtime.ts`, schema | Product decision |
| E-31-06 | Partial turn / error sin assistant | E | Low | `runtime.ts` | Opcional |
| G-31-01 | Multi-device misma Conversation | G | — | no lock | Futuro |
| G-31-02 | messageId cliente | G | — | audit | Futuro |
| G-31-03 | History API Hub | G | High | no endpoint | Sí (autorizado) |
| F-31-01 | PROTOCOL documenta reutilizar id; Android parcial | F | Low | PROTOCOL.md | Doc |

**B:** ninguno. **C:** ninguno.

---

## Critical risks

Ningún B/C. Riesgo producto: usuario asume hilo persistente recuperable; Hub solo garantiza persistencia **servidor** invisible al cliente tras wipe/disconnect/cambio dispositivo.

---

## Non-blocking debt

1. **G-31-03** History API
2. **D-31-02** routing chunks/errors Hub
3. **E-31-05** tool transcript (decisión producto)
4. **G-31-01** multi-device policy
5. Test e2e cross-talk Hub (cuando se autorice fix)

---

## Files created

- `docs/architecture/phase31-conversation-product-continuity.md`
- `hub/tests/architecture/phase31-conversation-product-continuity.test.ts`

---

## Files modified

- `docs/architecture/terminology.md`
- `docs/architecture/boundaries.md`
- `docs/architecture/refactor-plan.md`

---

## Productive code changed

**Ninguno.**

---

## Tests

```bash
npx tsx --test hub/tests/architecture/phase31-conversation-product-continuity.test.ts
```

---

## Typecheck / Build / Smoke / Android

Ejecutados al cierre de fase (ver informe entregado al usuario).

---

## Final recommendation

> **¿Conversation ya es una unidad de producto persistente y recuperable end-to-end?**

**No.** Es persistente y coherente **Gateway-side**. End-to-end **falla recuperación, aislamiento UI Hub mid-turn, y paridad multi-dispositivo**.

> **¿Existe algún B/C que deba corregirse antes de continuar?**

**No.**

```text
READY WITH DEBT
```

PHASE 32 **CLOSED WITH DEBT** — ver [`phase32-conversation-recovery-and-stream-routing.md`](./phase32-conversation-recovery-and-stream-routing.md).
