# PHASE 27 — Product Operational Readiness Audit

**Estado:** PHASE 27 CLOSED / AUDIT ONLY / NO CODE CHANGE  
**Fecha:** 2026-08-25.

**Decisión:** **READY WITH DEBT**

El código (no solo PHASE 1–26) confirma Single Node fail-closed, persistencia SET NULL, HTTP autenticado salvo `/health`, MCP stdio. El cliente Android Hub **no presenta ni responde** `confirm_request`. Health es snapshot. Shutdown puede bloquear con WS. Identidad = `HUB_TOKEN` de instalación, no User.

**PHASE 28 NOT STARTED.** Código productivo: ninguno.

---

## 1. Executive Summary

Single Node está listo para **evolucionar** como producto: fronteras coherentes, SQLite correcto, packaging smoke OK, policy en discovery, Runtime sin Workspace/MCP/Node.

No está listo como experiencia completa de tools `confirm` en el teléfono. Eso es **D (UX / product gap)**, no un fallo del Gateway. No hay C de MCP en red. No hay B de integridad Conversation/Messages al borrar Workspace.

---

## 2. Product Flow Audit

Código seguido:

```text
HubClient WS /ws → Session (sessions.ts)
→ user_message.conversationId = ChatStore.currentConversationId() = sessionKey
→ ws.ts reply → runTurn → ensureConversation (SQLite)
→ tools.get → RemoteAgentTool → mcp-executor callTool → Node MCP → AgentTool
→ addMessage + assistant_* → HubChatConnection (chunk/done/error)
Workspace: HTTP WorkspaceGateway; ChatViewModel coordinator.load(conversationId)
```

| Pregunta | Código |
|----------|--------|
| Session ≠ Conversation | Session = WS RAM `ws_…`; Conversation = fila SQLite `c_…` |
| Conversation ≠ Workspace | `workspace_id` nullable |
| Workspace ≠ Agent | HTTP store vs `AgentDefinition` en memoria |
| Agent ≠ Node | Runtime en Hub; proceso `agent/` |
| Node ≠ MCP Server | `startLocalAgent` hospeda `createAgentMcpServer` |

Sin saltos que exijan abstracción nueva.

---

## 3. Conversation Audit

| Ruta | Evidencia |
|------|-----------|
| Casual | `POST /conversations` `workspaceId` null/omitido → NULL (`conversation-workspace.ts`) |
| Workspace | string + FK; 404 Workspace inexistente |
| Reabrir | `SessionsViewModel.openListedConversation` → `registerAndActivate(record.id)` → `ChatViewModel` `coordinator.load` |
| Cambio / desasociar | PATCH HTTP `setConversationWorkspace` |
| WS sin id | `ensureConversation()` mint `c_` |
| WS id desconocido | INSERT esa id (`history.ts`) — no hereda Workspace |

Hub: `sessionKey` **es** `conversationId`. Gateway legacy: `sessionKey` es otro modelo (D-27-02). Reconnect: cola HubClient. App restart: DataStore local; SQLite Gateway independiente. Gateway restart: hilos SQLite; Session WS nueva.

No asociación automática en `user_message`. No Active Workspace.

---

## 4. Workspace Audit

CRUD en `sqlite-workspace-store.ts` + `workspace-http.ts`. DELETE → SQLite `ON DELETE SET NULL`. Tests `workspace-http.test.ts` (mensajes permanecen). List conversations: 404 si Workspace no existe; `[]` si existe y no hay hilos. Restart: `config.dbFile`. `foreign_keys = ON`.

---

## 5. HTTP Security Audit

| Método | Ruta | Auth | Handler |
|--------|------|------|---------|
| GET | `/health` | **ninguna** | `startServer` |
| GET | `/workspaces` | Bearer | `mountWorkspaceHttp` |
| POST | `/workspaces` | Bearer | idem |
| GET | `/workspaces/:id` | Bearer | idem |
| PATCH | `/workspaces/:id` | Bearer | idem |
| DELETE | `/workspaces/:id` | Bearer | idem |
| GET | `/workspaces/:id/conversations` | Bearer | idem |
| POST | `/conversations` | Bearer | idem |
| GET | `/conversations/:id` | Bearer | idem |
| GET | `/conversations/:id/workspace` | Bearer | idem |
| PATCH | `/conversations/:id/workspace` | Bearer | idem |

WS `/ws` no es HTTP REST. `requireAuth`: ausente/incorrecto/malformed → 401 (`timingSafeEqual`). JSON inválido 400. 404 recurso. 409 workspace inconsistente. Tests 401 en `workspace-http.test.ts`. Sin User/OAuth.

---

## 6. WebSocket Security Audit

`ws.ts`: primer mensaje `auth` + `HUB_TOKEN`. `deviceId` declarado por el cliente. `sessionId` interno confirmaciones.

¿Cliente autenticado puede usar `conversationId` de “otro cliente”? **Sí**, si comparte `HUB_TOKEN`. No hay ownership, no hay User, no hay ACL por dispositivo. El token es de **instalación/hogar**. Intencional. **No C.**

---

## 7. MCP Boundary Audit

Transporte: stdio (`StdioClientTransport` / `StdioServerTransport`). Sin puerto MCP. Un proceso externo solo habla MCP si **spawnea o hereda** esos pipes. Tools sin Gateway: sí, `node agent.cjs`. Availability ≠ authorization. **No auth MCP.**

---

## 8. Tool Policy Audit

`DEFAULT_TOOL_POLICY` → `registerDiscoveredAgentTools` omite keys ausentes. Registry Gateway = ya filtrado. Runtime `get` miss → `tool_not_found`. Confirmation ≠ policy. Node stdio no reaplica policy.

---

## 9. Confirmation Audit

Gateway: RAM, 60s, Session binding, input congelado (`confirmation-waiter.ts`). Approve/reject/timeout/cancel (WS `dropSession`, Node `cancelAllConfirmations`, `reply` finally). Duplicate/stale → `bad_message`.

Android Hub **no** presenta ni envía `confirm_response`:

```29:37:mobile/android/app/src/main/java/mx/ideass/personal/agent/network/HubChatConnection.kt
                when (msg) {
                    is ServerMessage.AssistantChunk ->
                        _inbound.emit(ChatInbound.AssistantDelta(msg.text))
                    is ServerMessage.AssistantDone ->
                        _inbound.emit(ChatInbound.AssistantDone(msg.conversationId))
                    is ServerMessage.Error ->
                        _inbound.emit(ChatInbound.Error(msg.code, msg.message))
                    else -> Unit
                }
```

Observado: `confirm_request` cae en `else`. Esperado producto móvil: UI + `confirm_response`. Impacto: `filesystem.write` / `process.execute` / `office.excel.write` timeout. Clasificación **D High** (cliente), no B del Gateway.

---

## 10. Timeout Audit

`MCP_TOOL_TIMEOUT_MS` 15s; process/Excel holgura (`discover.ts`). Gateway `Promise.race` se libera. Node puede seguir. **E Low** — aceptado Single Node; no abort. No B (no hay contrato de cancelación cooperativa).

---

## 11. Node Failure Audit

`attach-agent.ts` `onclose` → `cancelAllConfirmations`. Registry intacto. Execute `agent_disconnected` / `remote_tool_error`. Health no cambia. WS sigue. Restart = proceso Gateway nuevo. PHASE 26. Sin respawn.

---

## 12. Health Audit

`index.ts` `agentReady: agent.ready` (boolean una vez). `server.ts` extras. Snapshot de boot + catálogo discovery. No liveness. **E Medium.**

---

## 13. Shutdown Audit

`index.ts`: SIGINT/SIGTERM once → `http.close` → `agent.shutdown` → `exit(0)`. `nodeServer.close` espera conexiones. `attachGateway` no cierra `WebSocketServer`. Riesgo bloqueo. **E Medium.** No ShutdownManager.

---

## 14. SQLite Audit

Migraciones 001–003, `_migrations`, WAL, FK ON, index workspace/messages. DELETE Workspace SET NULL. Conversation/Messages sobreviven (tests HTTP). Un proceso Gateway. `ensureConversation` inserta ids arbitrarios.

---

## 15. Android Audit

Hub WS + HTTP Workspace. Autoridad workspace: `coordinator.load(conversationId)` → GET Gateway. No workspaceId local como SoT. `registerAndActivate(conversationId)`. Historial: DataStore; no HTTP messages; `ChatHistorySync` → Gateway legacy RPC (`GatewayClient.loadHistory`). Hub: no-op si no hay gatewaySession. **D-27-03.**

---

## 16. Hub/Gateway legacy Audit

Misma UI `SessionsScreen`. Keys `c_` / `w_` vs `agent:`. `ensureConversation` no valida prefijo. Riesgo de filas SQLite con ids Gateway legacy si backend Hub. ChatHistorySync solo Gateway legacy. No unificar. **D-27-02.**

---

## 17. Packaging Audit

`package.mjs`: `dist/hub/hub.cjs`, `dist/agent/agent.cjs`, sqlite nativo, `dist/migrations`, launchers. Spawn `../agent/agent.cjs`. Smoke handshake+list+read. `AGENT_FILESYSTEM_ROOT` vía env. DB `../data` respecto a hub.cjs. Node 22+ PATH. `.env` no se copia al dist (operador).

---

## 18. Configuration Audit

AgentDefinition: prompt/model/toolPolicy. GatewayConfig: key, token, port, db, migrations, maxTokens, historyWindow. NodeConfig: filesystem.root. `mergeEnv` clona `process.env` → API key en el hijo. **E-27-03.** Model no en Node.

---

## 19. Naming Audit

Histórico/ambiguo: `attachLocalAgent`, `LocalAgent`, `[hub] Agent READY`, `agentReady`, `AgentConfig` (= NodeConfig). Correcto: MCP Server in-process, Node. Peligroso (colisión): Android `gateway` = Gateway legacy. No rename.

---

## 20. Test Coverage Audit

Existe: spawn fail, handshake, tools/list, policy, confirmation Hub, Node death execute, shutdown sin HTTP, Workspace CRUD/SET NULL/401, smoke, architecture 21–26.  
No existe: confirmación Android Hub E2E; shutdown+WS; health live.  
Test PHASE 27: protege inventario HTTP, SET NULL, ignore confirm Hub, reload Workspace — invariante de producto no cubierta en PHASE 26.

---

## 21. Findings A–G

### D-27-01

- **Clasificación:** D  
- **Severidad:** High  
- **Archivo:** `HubChatConnection.kt`  
- **Símbolo:** `init` / `when (msg)`  
- **Evidencia:** `else -> Unit` (líneas 29–37)  
- **Observado:** no UI, no `confirm_response`  
- **Esperado:** HITL para tools `confirm`  
- **Impacto:** timeout 60s en write/process/excel write desde el teléfono  
- **¿Requiere código?** Sí (cliente), con autorización  
- **Recomendación:** UI confirm Hub; no PermissionManager  

### D-27-02

- **Clasificación:** D · Medium  
- **Archivo:** `SessionsViewModel.kt`, `history.ts` `ensureConversation`  
- **Evidencia:** catálogo único; INSERT de cualquier conversationId  
- **Observado:** keys `agent:` pueden entrar a SQLite Hub  
- **Esperado:** modelos separados visualmente (no unificación)  
- **¿Requiere código?** Solo si se pide UX  
- **Recomendación:** distinguir en UI  

### D-27-03

- **Clasificación:** D · Medium  
- **Archivo:** `ChatHistorySync.kt` → `GatewayClient.loadHistory`  
- **Evidencia:** RPC Gateway legacy; Hub sin GET messages  
- **Observado:** reinstall → UI vacía, SQLite con hilos  
- **¿Requiere código?** Opcional  
- **Recomendación:** documentar o HTTP history futuro  

### E-27-01 … E-27-05, F-27-01, G-27-01

Health snapshot (`server.ts` / `index.ts`); shutdown WS; `mergeEnv`; timeout huérfano; nombres; `docs/architecture.md` “garras”; User/respawn futuros.

**B:** ninguno demostrado. **C:** ninguno (modelo token). **A:** topología, FK, HTTP auth, MCP stdio, policy Gateway, fail-closed Node.

---

## 22. Critical Risks

1. Tools `confirm` inutilizables en Android Hub.  
2. `/health.agentReady` tras Node crash.  
3. SIGINT con WS abierto.  
4. Mezcla Gateway legacy/Hub en un hilo SQLite.

---

## 23. Non-blocking Debt

Nombres; registry no se limpia al disconnect; `onDisconnected` no cableado; env completo al Node; ABI sqlite vs Node 18 local.

---

## 24. Files Created/Modified

**Creados:** este archivo; `hub/tests/architecture/phase27-product-operational-readiness.test.ts`  
**Modificados (docs):** `terminology.md`, `boundaries.md`, `refactor-plan.md`  
**Productivo:** ninguno  

---

## 25. Tests

PHASE 27 architecture: PASS. Typecheck: PASS. Hub sqlite bajo Node 18: ENVIRONMENTAL (ABI). Architecture suite: 1 FAIL environmental (`phase2-1-memory-boundary` sqlite).

---

## 26. Build

PASS (`npm run build`; warnings `import.meta` CJS).

---

## 27. Smoke

PASS `npm run smoke:package`.

---

## 28. Recommendation

**El Single Node actual está listo para evolucionar hacia producto.** No hay B/C que deban corregirse antes de seguir la arquitectura. El problema concreto de **experiencia** (confirm Android) debe autorizarse como trabajo de cliente, no como nueva capa de plataforma. No PHASE 28 automático.

```text
PHASE 27 CLOSED
PHASE 28 NOT STARTED
No productive code was implemented during PHASE 27.
```
