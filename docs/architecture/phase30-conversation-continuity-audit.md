# PHASE 30 — Conversation Continuity & Recovery Audit

**Estado:** PHASE 30 CLOSED / AUDIT ONLY  
**Fecha:** 2026-08-25.

**Decisión:** **READY WITH DEBT**

La **Conversation** es una unidad persistente en SQLite del Gateway (`conversations` + `messages`, FK Workspace con `ON DELETE SET NULL`). La identidad `conversationId` sobrevive a restart del Gateway y se reutiliza por HTTP y WS. **No** es aún una unidad de producto **completamente recuperable** en el cliente Hub: no hay GET de mensajes, el historial visible depende de DataStore local, los chunks WS sin `conversationId` pueden mezclarse al cambiar de hilo, y el transcript de tools no se persiste entre turnos.

**PHASE 31 CLOSED** (ver [`phase31-conversation-product-continuity.md`](./phase31-conversation-product-continuity.md)). Código productivo PHASE 30: ninguno.

---

## 1. Executive Summary

PHASE 29 demostró la cadena Runtime → MCP → Node. PHASE 30 audita si esa cadena mantiene **continuidad conversacional** ante reconnect, restarts, tools, confirmaciones y cambio de hilo.

| Área | Veredicto |
|------|-----------|
| Identidad `conversationId` en Gateway | **A** — SQLite, HTTP GET, WS `assistant_done` |
| Persistencia user/assistant | **A** — inserts antes/después del turno (con matices) |
| Transcript de tools en SQLite | **E** — solo memoria LLM dentro del turno |
| Recuperación historial Hub en Android | **D/E** — sin API; DataStore local |
| Cross-talk UI al cambiar hilo mid-turn | **D** — chunks/errors Hub sin `conversationId` |
| Confirmation vs Conversation | **A** — RAM/Session; no SQLite |
| Node death / tool failure | **A** — fail-closed; Conversation utilizable |
| MCP timeout conversacional | **E** — turno termina; Node puede seguir (E-29-02) |
| Idempotencia cliente | **E/G** — sin dedup de `user_message` |

No hay **B** ni **C** bloqueantes de integridad Gateway. Deuda de producto: historial Hub, enrutamiento WS de streaming, transcript tools.

---

## 2. Conversation creation audit

### Rutas

| Ruta | Código | ID | workspace_id | title |
|------|--------|-----|--------------|-------|
| Casual HTTP | `POST /conversations` `{}` o `{ workspaceId: null }` | `c_${uuid}` | NULL | opcional |
| Workspace HTTP | `POST /conversations { workspaceId: X }` | `c_${uuid}` | X (FK) | opcional |
| WS implícito | `user_message` sin `conversationId` | `ensureConversation()` → `c_${uuid}` | NULL | NULL |
| WS con id | `user_message { conversationId: C }` | reutiliza o INSERT | no pisa | no pisa |
| WS id arbitrario | `ensureConversation("agent:main:…")` | INSERT esa id | NULL | NULL |

**Evidencia:** `hub/src/memory/conversation-workspace.ts` (`createConversation`), `hub/src/memory/history.ts` (`ensureConversation`).

### Hallazgos

| ID | Clasificación | Descripción |
|----|---------------|-------------|
| A-30-01 | **A** | `ensureConversation` reutiliza fila existente; no duplica. |
| A-30-02 | **A** | `ensureConversation` INSERT solo `(id)` — **no** sobrescribe `workspace_id` ni `title` de POST previo. |
| E-30-01 | **E** | `ensureConversation` acepta **cualquier** string como id (p. ej. keys Gateway legacy). Sin validación de prefijo `c_`. |
| E-30-02 | **E** | Cada `user_message` sin id crea Conversation nueva (casual implícita). No hay “hilo default” en Gateway. |
| A-30-03 | **A** | Primer mensaje no se pierde: `addMessage(user)` ocurre **antes** del LLM (`runtime.ts`). |
| A-30-04 | **A** | Android Hub crea vía `POST /conversations` + `registerAndActivate(created.id)` (`SessionsViewModel`). |

---

## 3. Message persistence audit

### Schema

```sql
messages (id, conversation_id, role CHECK user|assistant, content, device_id, created_at)
```

**Evidencia:** `db/schema.sql`, `hub/src/memory/history.ts`.

| Representación | Persistido | Notas |
|----------------|------------|-------|
| user message | **Sí** | inicio de `runTurn` |
| assistant response (texto final) | **Sí** | solo cuando el turno termina sin más tool calls |
| tool call | **No** | bloques en array LLM in-memory |
| tool result | **No** | idem; JSON en contexto LLM del turno |
| error WS | **No** | evento `error`; no fila SQLite |
| confirmación | **No** | RAM (`confirmation-waiter.ts`) |
| chunks streaming | **No** | solo WS; persistencia al `done` |

| ID | Clasificación | Descripción |
|----|---------------|-------------|
| E-30-03 | **E** | Resultado de Tool **no** forma parte del historial SQLite; el LLM del **siguiente** turno solo ve user/assistant previos. |
| A-30-05 | **A** | Orden: `ORDER BY created_at DESC, id DESC` + reverse → cronológico. |
| E-30-04 | **E** | Tras error interno o `MAX_TOOL_ITERATIONS`, **no** se persiste assistant; el user message **sí** queda. |

### Riesgo WS desconectado / Gateway terminó turno

```text
WS muere durante streaming
  → runTurn puede completar en Gateway
  → addMessage(assistant, full) en SQLite
  → cliente Hub no recibe chunks/done
  → historial Gateway completo; UI local incompleta
```

Clasificación: **D** (UX) + **G** (falta History API).

---

## 4. Streaming/persistence audit

```text
LLM stream → text_delta → WS assistant_chunk
           → (tool loop in-memory)
           → addMessage(assistant) → assistant_done + messageId
```

| Evento | Persistencia |
|--------|--------------|
| Inicio turno | user → SQLite |
| Durante stream | solo WS |
| Tras tools OK | assistant final → SQLite |
| Runtime exception | error WS; sin assistant SQLite |
| MCP fail | tool result → LLM; puede haber assistant final |
| Node death mid-tool | `AGENT_DISCONNECTED` → LLM → posible assistant o error |

**A-30-06:** No hay persistencia intermedia de assistant (correcto para el modelo actual).  
**E-30-05:** Conversation puede quedar con user sin assistant emparejado tras fallo.

---

## 5. Reconnect audit

```text
Android: conversationId = sessionKey (SessionProvider + DataStore)
Gateway: nueva Session ws_${uuid}; conversationId viene del cliente
```

| Comportamiento | Evidencia |
|----------------|-----------|
| Android conserva C | `PersistedSessionProvider`, `ChatStore.persistLocked` |
| Gateway conserva C | SQLite |
| Workspace asociado | HTTP GET al cambiar activa (`ConversationWorkspaceCoordinator`) |
| Siguiente mensaje en C | `sendUserMessage(..., currentConversationId())` |
| Nueva Conversation accidental | No, si sessionKey = C |
| Duplicar último mensaje | Cola offline envía una vez (`HubClient.flushPending`); no re-fetch |
| Confirmación pending | Se pierde en disconnect (`dropSession` → `cancelAll`) |

**A-30-07:** Reconnect no altera `conversationId`.  
**D-30-02:** Confirmación pending perdida en disconnect (esperado; turno fail-closed).

---

## 6. Android restart audit

| Persiste | Dónde |
|----------|-------|
| deviceId | `AppPreferences` |
| sessionKey / conversationId | `gateway_session` DataStore + `ChatStore` threads |
| Workspace UI | **No** local como verdad; `GET /conversations/:id/workspace` |
| Historial mensajes Hub | DataStore `threads_json` **solo** |
| HITL pending | RAM (`HubConfirmPending`) |

```text
Android kill → restart → Gateway existente → Conversation C en SQLite
  → Android reabre C si sessionKey persistió
  → mensajes: solo los del DataStore local (puede divergir de Gateway)
```

**D-30-03:** Reinstalar app / borrar datos → historial Hub perdido en cliente; Gateway conserva SQLite.  
**A-30-08:** `workspaceId` local no es fuente de verdad (coordinator HTTP).

---

## 7. Gateway restart audit

| Sobrevive | Evidencia |
|-----------|-----------|
| Conversations | SQLite + `runMigrations()` |
| Messages | idem |
| Workspaces | `sqlite-workspace-store` |
| FK workspace_id | migrations 002–003 |
| conversationId válido | GET `/conversations/:id` |
| ToolRegistry | `attachLocalAgent` en boot |
| Node nuevo | no altera filas Conversation |

**A-30-09:** Gateway restart es transparente para identidad Conversation.

---

## 8. Node failure audit

Escenario: `user_message` → Tool → Node dies.

| Efecto | Evidencia |
|--------|-----------|
| user message persistido | `addMessage` al inicio |
| tool error al LLM | `mcp-executor` → `AGENT_DISCONNECTED` |
| assistant/error al cliente | Runtime continúa o yield error |
| Conversation utilizable | Sí; siguiente turno tras reattach |
| confirmation pending | `cancelAllConfirmations()` (`attach-agent.ts`, `sessions.ts`) |
| Duplicar turno | No automático; `session.replying` serializa |

**A-30-10:** Node death no corrompe Conversation (PHASE 26 coherente).

---

## 9. Tool failure audit

| Código error | Llega al usuario | Turno termina | Persistido |
|--------------|------------------|---------------|------------|
| tool_not_found | vía LLM texto o error | sí | assistant si LLM responde |
| agent_disconnected | idem | sí | idem |
| remote_tool_error | idem | sí | idem |
| remote_tool_timeout | idem | sí | idem |
| validation (Node) | envelope error → LLM | sí | idem |

**A-30-11:** Session queda utilizable (`finally` en `ws.ts` limpia `replying`).  
**E-30-03:** Detalle del tool failure no en SQLite.

---

## 10. Tool timeout audit (impacto conversacional)

```text
Gateway timeout (15s default, Office 20s, process+slack)
  → failResult remote_tool_timeout
  → Runtime sigue loop LLM
  → turno puede terminar con assistant
  → Node puede seguir trabajo (E-29-02)
```

| Riesgo | Clasificación |
|--------|---------------|
| Resultado tardío al cliente | **E** — no hay segundo WS push |
| Doble respuesta usuario | **A** — un turno por `session.replying` |
| Side effect post-turno | **E** — deuda PHASE 29 |
| Persistencia incorrecta | **A** — lo persistido refleja lo que vio el LLM en turno |

---

## 11. Confirmation/Conversation audit

Confirmation = turno + Session WS (`ConfirmationWaiter`). **No** SQLite.

| Caso | Comportamiento |
|------|----------------|
| Aprueba / rechaza | `confirm_response` → ejecuta o `toolResultForDecision` |
| Timeout 60s | `decision: timeout` |
| Cambia Conversation | pending atado a `sessionId`; respond solo misma WS |
| Cierra Chat / WS disconnect | `cancelAll` |
| Node death | `cancelAllConfirmations` global |
| Gateway restart | pending perdido (RAM) |
| Android restart | `HubConfirmPending` perdido |

**A-30-12:** Confirmation no es estado Conversation persistente (correcto).

---

## 12. Conversation switch audit

Android: `ChatThreads` particiona por `sessionKey`. Tests: `ChatStoreInboundTest.interleavedSessions_doNotMixBubbles`.

**Hub wire gap:**

```text
assistant_chunk  — sin conversationId
error            — sin conversationId
assistant_done   — con conversationId
confirm_request  — con conversationId
```

`HubChatConnection` emite deltas/errors sin `sessionKey` → `ChatStore.resolveInboundKeyLocked` usa **sesión activa**.

| ID | Clasificación | Escenario |
|----|---------------|-----------|
| D-30-01 | **D** | Usuario en A envía; cambia a B antes de `assistant_done`; chunks/errors pueden pintarse en B. `assistant_done` va a A. |
| A-30-13 | **A** | Con sesión activa estable, hilos no se mezclan (tests). |

Mitigación futura: `conversationId` en chunk/error (protocolo) o bloquear cambio de hilo con `hasAssistantWork` (UX).

---

## 13. Workspace continuity audit

**A-30-14:** `ON DELETE SET NULL` (`db/schema.sql`).  
**A-30-15:** Android redescubre vía `GET /conversations/:id/workspace`.  
**A-30-16:** Cambio de Conversation no altera otras filas; PATCH explícito.

---

## 14. History API audit

**D-27-03 / D-30-04 (confirmado):** No existe `GET /conversations/:id/messages` ni equivalente Hub.

| Pregunta | Respuesta |
|----------|-----------|
| ¿Recuperar mensajes Hub? | Solo vía SQLite en servidor; no expuesto HTTP |
| ¿Android depende de memoria? | DataStore local para Hub; `ChatHistorySync` = Gateway legacy `chat.history` |
| ¿Tras restart? | Local sobrevive; no rehidrata desde Gateway |
| ¿Abrir Conversation listada? | Sí identidad + Workspace HTTP; historial = local vacío si nunca chateó en device |
| ¿Continuar hilo histórico cross-device? | **No** en Hub |

Clasificación: **G** (requerimiento futuro) + **D** (UX gap).

---

## 15. Hub/Gateway legacy audit

| Concepto | Hub | Gateway legacy |
|----------|-----|----------|
| sessionKey | `c_…` (= conversationId) | `agent:main:…` |
| Historial remoto | ninguno | `chat.history` |
| Workspace | HTTP | N/A |

**D-27-02 / D-30-05:** Misma UI `SessionsScreen`; semántica distinta. Usuario avanzado puede confundir keys.

---

## 16. Concurrency audit

| Mecanismo | Alcance |
|-----------|---------|
| `session.replying` | 1 turno por WS; segundo `user_message` → `busy` |
| `confirm_response` | permitido durante busy |
| Multi-device mismo C | sin lock; 2 turnos paralelos posibles (**G**) |

**A-30-17:** Serialización single-WS correcta.  
**G-30-01:** Multi-cliente misma Conversation sin coordinación.

---

## 17. Idempotency audit

Protocolo: `user_message` sin `messageId` cliente. `assistant_done.messageId` solo identifica fila SQLite creada.

| Escenario | Duplicación |
|-----------|-------------|
| Reconnect cola offline | un envío (`flushPending`) |
| Usuario reenvía tras timeout UX | **nuevo** user row SQLite |
| Retry WS manual | no implementado |

**E-30-06:** Sin deduplicación. **G-30-02:** Idempotency keys = requisito futuro si retry automático.

---

## 18. HTTP/WS boundary audit

**A-30-18:**

```text
HTTP  — Workspace CRUD, Conversation CRUD metadata, workspace resolve
WS    — user_message.conversationId, streaming, confirm
```

Sin `workspaceId` en WS. Sin endpoints nuevos introducidos.

---

## 19. Error recovery UX audit

| Error | Correctness | UX | Debt |
|-------|-------------|-----|------|
| HTTP 401 | fail-closed | mensaje coordinator | — |
| HTTP 404 Conversation | no muta | error UI | — |
| WS disconnect | turno puede completar en server | Reconectando + cola | D |
| Node death | tool error | error genérico / LLM | E |
| Tool error | turno termina | burbuja o texto LLM | E |
| Tool timeout | turno termina | mensaje LLM | E |
| Confirm timeout | cancelled tool | D-29-01 HITL solo ChatScreen | D |
| Gateway restart | SQLite OK | reconectar WS | — |

---

## 20. Test coverage audit

| Área | Tests existentes | Gap |
|------|------------------|-----|
| Conversation creation HTTP | `packages/workspace-http/tests/client.test.ts` | — |
| ensureConversation INSERT | **phase30** arch test | nuevo |
| Message roles SQLite | **phase30** arch test | nuevo |
| Reconnect Android | implícito HubClient | sin e2e |
| Gateway restart | lifecycle / SQLite manual | sin test integración |
| Node death | `lifecycle-9a.test.ts` | conversación SQLite indirecto |
| Tool failure | `e2e-8d.test.ts` | fake memory |
| Confirmation | `confirmation-hardening.test.ts` | — |
| Conversation switch | `ChatStoreInboundTest.kt` | Hub sin conversationId en chunk |
| Workspace SET NULL | docs phase23; sin test en hub/ | E |
| History API ausente | **phase30** arch test | nuevo |

---

## 21. Findings A–G (índice)

| ID | Tipo | Resumen |
|----|------|---------|
| A-30-01 … A-30-18 | A | Comportamiento correcto (ver secciones) |
| D-30-01 | D | Cross-talk chunks/errors Hub al cambiar hilo mid-turn |
| D-30-02 | D | Confirm pending perdida en disconnect |
| D-30-03 | D | Historial Hub no rehidratable tras wipe cliente |
| D-30-04 | D | Sin History API (reconfirm D-27-03) |
| D-30-05 | D | Hub vs Gateway legacy keys en misma UI |
| E-30-01 | E | ensureConversation acepta ids arbitrarios |
| E-30-02 | E | WS sin id siempre crea Conversation nueva |
| E-30-03 | E | Tool transcript no en SQLite |
| E-30-04 | E | Error turno deja user sin assistant |
| E-30-05 | E | Par user-only tras fallo mid-turn |
| E-30-06 | E | Sin idempotency keys |
| G-30-01 | G | Multi-device mismo conversationId |
| G-30-02 | G | Idempotency framework futuro |
| G-30-03 | G | GET mensajes Hub (History API) |

**B:** ninguno. **C:** ninguno. **F:** N/A.

---

## 22. Critical risks

Ningún **B/C** bloqueante.

Riesgos operativos (deuda):

1. **Historial Hub invisible** tras cambio de dispositivo o wipe (G-30-03 / D-30-04).
2. **Cross-talk UI** Hub si el usuario cambia de hilo durante streaming (D-30-01).
3. **Tool transcript** invisible en turnos siguientes (E-30-03).
4. **MCP timeout** + trabajo Node residual (E-29-02, impacto conversacional acotado).

---

## 23. Non-blocking debt

- History API Hub (`GET /conversations/:id/messages` o paginado).
- `conversationId` en `assistant_chunk` / `error` (protocolo) o guard UX en Android.
- Persistencia opcional tool steps (product decision).
- Validar prefijo `c_` en `ensureConversation` (opcional).
- Tests integración SQLite SET NULL en `hub/tests`.
- Idempotency si hay retry automático.

---

## 24. Files created

- `docs/architecture/phase30-conversation-continuity-audit.md`
- `hub/tests/architecture/phase30-conversation-continuity-audit.test.ts`

---

## 25. Files modified

- `docs/architecture/terminology.md`
- `docs/architecture/boundaries.md`
- `docs/architecture/refactor-plan.md`

---

## 26. Productive code changed

**Ninguno.**

---

## 27. Tests

```bash
npx tsx --test hub/tests/architecture/phase30-conversation-continuity-audit.test.ts
```

---

## 28. Typecheck

```bash
npm run typecheck   # raíz / hub / agent según scripts package.json
```

---

## 29. Build

```bash
npm run build
```

---

## 30. Smoke

```bash
npm run smoke:package
```

---

## 31. Android build

```bash
cd mobile/android && ./gradlew :app:assembleDebug :app:testDebugUnitTest
```

---

## 32. Final recommendation

> **¿La Conversation actual es realmente una unidad persistente, recuperable y coherente de producto?**

**Parcialmente.** En el **Gateway**, sí: identidad estable, mensajes user/assistant, Workspace opcional, supervivencia a restart y DELETE Workspace. En el **producto Hub end-to-end**, **no del todo**: el cliente no puede recuperar historial del Gateway, puede perder continuidad visual tras disconnect/restart del teléfono, y el streaming Hub puede enrutarse al hilo activo equivocado si el usuario cambia de Conversation mid-turn.

> **¿Existe algún B/C concreto que deba corregirse antes de continuar?**

**No.**

```text
READY WITH DEBT
```

Correcciones priorizables (fuera de PHASE 30): History API (G), enrutamiento WS por `conversationId` (D-30-01), HITL fuera de ChatScreen (D-29-01).
