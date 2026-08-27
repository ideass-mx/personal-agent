# PHASE 43 — Product Validation & Agent Experience Lab

**Estado:** PHASE 43 CLOSED  
**Fecha:** 2026-08-26.

**Decision:** **READY WITH DEBT**

**MVP Verdict:** **MVP READY WITH DEBT**

**Productive code changed:** **NONE**

---

## Executive Summary

El MVP técnico construido en PHASES 35–42 **compila, pasa smoke E2E de Gateway/Node/Tools y demuestra por tests automatizados** los invariantes críticos de conversación aislada, HITL fail-closed, ejecución/rechazo de tools y recuperación de History API.

**No se ejecutó en esta sesión un laboratorio manual completo** Android físico + PC con operador humano en todos los escenarios A–K. La validación es **híbrida**:

1. **Proxy automatizado** — tests Hub (Runtime→MCP→Node), HTTP History, Android unit tests.
2. **Revisión estática** — flujos producto documentados en código (Hub-first, HITL global, Capacidades, Tool activity).
3. **Manual pendiente** — tareas diarias naturales (Lab K), Excel Windows (Lab D), background HITL con app en segundo plano prolongado.

**¿Se siente como agente real?** **Parcialmente sí** en el happy path técnico (conversar, autorizar, ejecutar en PC, ver resultado en hilo). **Aún no** como experiencia diaria pulida: calidad narrativa depende del LLM, errores fuera de `agent_disconnected` suelen ser genéricos, Excel no validado aquí, y confirmación en background carece de notificación FGS (deuda PHASE 38 P1).

---

## Environment

| Componente | Valor |
|------------|-------|
| OS lab | Linux x86_64 (Ubuntu 24.04 kernel 7.0) |
| Node | v22.22.0 |
| Android device | **No conectado en esta sesión** |
| Windows + Excel | **No disponible** |
| Repo | `/home/tony/dev/ideass/personal-agent` post PHASE 42 |
| Validación build | typecheck PASS, build PASS, smoke:package PASS, Android assembleDebug PASS |

---

## Methodology

- **Prohibido:** modificar código productivo (cumplido).
- **Escenario manual sin dispositivo:** marcado `NOT TESTED (manual)` — no simular éxito.
- **Escenario con test proxy:** marcado `PROXY PASS` con referencia al test.
- **UX scoring:** aplicado donde hay evidencia; `—` donde no hubo ejecución manual.

---

## Scenario Matrix

### Lab A — Conversation básica

| # | Escenario | Resultado | Evidencia |
|---|-----------|-----------|-----------|
| A1 | Nueva Conversation | PROXY PASS | `phase21-conversation-creation`, Sessions Android |
| A2 | Enviar mensajes / respuestas | PROXY PASS | WS `assistant_chunk`/`done`; smoke handshake |
| A3 | Continuidad contexto mismo hilo | PROXY PASS | Runtime + `TurnMemory`; e2e-8d |
| A4 | Segunda Conversation | PROXY PASS | `SessionProvider`, multi-partition `ChatThreads` |
| A5 | Aislamiento A/B | PROXY PASS | `ChatStoreInboundTest.interleavedSessions_doNotMixBubbles` |
| A6 | Cambiar A↔B | NOT TESTED (manual) | Lógica partition OK; sin UI manual |
| A7 | Sin cross-chunk entre hilos | PROXY PASS | `chunkWithConversationKey_doesNotPaintOtherVisibleThread` |
| A8 | Reiniciar Android | NOT TESTED (manual) | DataStore cache + History sync diseñados |
| A9 | Recuperación History API | PROXY PASS | `conversation-messages.test.ts` (4/4); `HubConversationHistorySync` |

**UX scoring (proxy):** Intención 2, Tool —, HITL —, Ejecución 2, Resultado 2, Recovery 1, Coherencia 2.

---

### Lab B — Filesystem

| ID | Escenario | Resultado | Evidencia |
|----|-----------|-----------|-----------|
| B1 | Buscar PDFs carpeta | NOT TESTED (manual) | LLM-dependent; `filesystem.list` automatic en policy |
| B2 | Leer archivo / resumir | PROXY PASS | e2e-8d test A: `filesystem.read` 0 confirm, 1 MCP |
| B3 | Crear resumen.md | PROXY PASS | e2e-8d test B: `filesystem.write` approve → write |
| B4 | Modificar archivo | PROXY PASS | write confirm + HITL; reject test C |

**Comprobaciones proxy B3/B4:**

| Criterio | B2 read | B3 write | B4 modify |
|----------|---------|----------|-----------|
| HITL | No | Sí (confirm) | Sí |
| Ejecución tras approve | — | 1 MCP call | 1 MCP call |
| Reject → 0 writes | — | — | PROXY PASS (test C) |
| Narrativa Android | NOT TESTED (manual) | PHASE 42 `ToolResultUx` | idem |

---

### Lab C — Process execution

| Escenario | Resultado | Evidencia |
|-----------|-----------|-----------|
| Comando seguro + approve | PROXY PASS | e2e-8d test D; `process-execute.test.ts` |
| HITL claro | PROXY PASS | `executionMode: confirm` en policy |
| Rechazo → no ejecución | PROXY PASS | e2e-8d test E; 0 MCP calls |
| UI "Ejecutando" tras reject | PROXY PASS | `ToolActivityFlowTest` Failed phase |
| Copy comprensible stdout | PARTIAL | `ToolResultUx.summarizeProcess`; calidad LLM variable |

---

### Lab D — Excel / Windows

**Resultado global:** `NOT TESTED — Windows environment unavailable`

Entorno Linux. Tests Hub existen (`office-excel-write.test.ts`, `office-policy-hardening.test.ts`) pero **no sustituyen** validación producto Android+Excel real.

Copy "Solo Windows" presente en Android (PHASE 41/42) — **PROXY PASS** estático.

---

### Lab E — HITL

| ID | Escenario | Resultado | Evidencia |
|----|-----------|-----------|-----------|
| E1 | Aprobar | PROXY PASS | e2e-8d B/D; `HubConfirmRespondLogicTest` |
| E2 | Rechazar | PROXY PASS | e2e-8d C/E; 0 MCP; `ToolActivityPhase.Failed` |
| E3 | Timeout 60s | PROXY PASS | `process-execute.test.ts` approve post-timeout → 0 exec; `HubConfirmUx.TIMEOUT_MS=60000`; countdown UI |
| E4 | Background (fuera Chat) | PARTIAL | `HubConfirmHost` en `MainActivity` AppNav (global); **sin notificación FGS** — deuda D |
| E5 | Disconnect durante confirm | PROXY PASS | `AgentService` + `HubConfirmViewModel` clear pending; Gateway timeout fail-closed |
| E6 | Android restart durante confirm | PARTIAL | Pending RAM-only → pierde dialog; Gateway timeout; no B, deuda D/E |

---

### Lab F — Node failure

| Paso | Resultado | Evidencia |
|------|-----------|-----------|
| Operación con Node up | PROXY PASS | smoke:package |
| Detener Node mid-run | PARTIAL | `/health.agentReady` snapshot boot; `agent_disconnected` copy PHASE 39 |
| UX error humanizado | PROXY PASS | `OperationalCopyTest.errorAgentDisconnected_showsHumanCopy` |
| Recovery reconectar | NOT TESTED (manual) | Runbook documentado |
| Estados fantasma | PROXY PASS | `onAssistantTurnFinishedLocked` limpia tool activity |

---

### Lab G — Gateway failure

| Paso | Resultado | Evidencia |
|------|-----------|-----------|
| SQLite conserva messages | PROXY PASS | `conversation-messages.test.ts`; schema user/assistant |
| Reinicio Gateway | NOT TESTED (manual) | Migraciones idempotentes en boot |
| Android reconecta + History | PROXY PASS | `HubConversationHistorySync` + retry UI |
| Workspace relation | PROXY PASS | `conversation-workspace.test.ts` |

---

### Lab H — Android restart

| Paso | Resultado | Evidencia |
|------|-----------|-----------|
| Persistencia local DataStore | PROXY PASS | `ChatStore` threads JSON |
| Rehydrate Hub History | PROXY PASS | GET messages merge `ChatHistoryMapper` |
| Aislamiento A/B post-restart | NOT TESTED (manual) | Partition keys en store |
| Identidad HUB_TOKEN | PROXY PASS | `ConnectionPrefsPolicy`, Hub-first default |

---

### Lab I — Cross-talk

| Evento | Resultado | Evidencia |
|--------|-----------|-----------|
| assistant_chunk otra sesión | PROXY PASS | `ChatStoreInboundTest` (3 tests routing) |
| error otra sesión | PROXY PASS | `errorWithConversationKey_doesNotPaintOtherVisibleThread` |
| confirm_request | PROXY PASS | No burbuja en hilo; global pending |
| tool activity | PROXY PASS | `toolActivity` keyed por `visibleSessionKey` |
| Interleaved runs mismo hilo | PROXY PASS | `interleavedRuns_sameSession_keepBothBubblesComplete` |

**Anomalías B/C:** ninguna detectada en tests.

---

### Lab J — Recovery / errores

| Error | Clasificación UX observada | Evidencia |
|-------|---------------------------|-----------|
| agent_disconnected | **Bueno** (copy accionable PC) | PHASE 39 |
| confirmation_rejected | **Aceptable** (LLM narra; UI Failed banner) | Runtime test C |
| confirmation_timeout | **Aceptable** (Gateway; UI countdown clear) | fail-closed tests |
| archivo inexistente | **Variable** (LLM-dependent) | NOT TESTED manual |
| comando inválido | **Variable** | NOT TESTED manual |
| History failure | **Bueno** (retry + cache local) | PHASE 39 hydration UI |
| Generic internal error | **Aceptable/Malo** según message wire | `OperationalCopy` fallback genérico |

---

### Lab K — Daily Agent Tasks

| ID | Tarea natural | Resultado |
|----|---------------|-----------|
| K1 | Documentos importantes carpeta | NOT TESTED (manual) |
| K2 | Leer y resumir | NOT TESTED (manual) |
| K3 | Crear archivo resumen | NOT TESTED (manual) |
| K4 | Comparar archivos | NOT TESTED (manual) |
| K5 | Tarea sencilla PC | NOT TESTED (manual) |
| K6 | Modificar archivo | NOT TESTED (manual) |
| K7 | Continuar Conversation anterior | NOT TESTED (manual) |

**Nota:** Infraestructura soporta estas tareas; calidad depende de LLM, prompts Gateway y operador. **Requiere sesión manual dedicada** antes de elevar veredicto a MVP READY sin deuda.

---

## UX Findings (D)

| ID | Hallazgo | Clase |
|----|----------|-------|
| D-43-01 | Errores no-`agent_disconnected` a menudo genéricos | D |
| D-43-02 | Resultado final depende de narración LLM; JSON crudo posible si LLM no narra | D |
| D-43-03 | Sin notificación FGS durante HITL en background | D (deuda 38 P1) |
| D-43-04 | Confirm pending se pierde en restart Android (RAM) | D |
| D-43-05 | `/health.agentReady` no refleja Node mid-run | D (conocido) |
| D-43-06 | History no incluye roles tool/system | D (by design) |

---

## Agent Capability Findings

| Capacidad | Estado MVP |
|-----------|------------|
| filesystem.read/list | PROXY PASS |
| filesystem.write | PROXY PASS + HITL |
| process.execute | PROXY PASS + HITL |
| office.excel.* | NOT TESTED producto (Windows) |
| Capacidades ocultas (math, echo) | Funcionan internamente; no en UI producto |

**G:** comparación multi-archivo inteligente, búsqueda semántica documentos — fuera MVP.

---

## Reliability Findings

- **Disconnect WS:** reconexión Android; pending HITL cleared fail-closed.
- **Gateway restart:** SQLite persiste; Android rehydrate vía History API (proxy).
- **Node stop:** error humanizado parcial; reattach manual Gateway (runbook).
- **PRE-EXISTING:** test arquitectónico PHASE 32 falla por doc drift (`PHASE 34 NOT STARTED` vs realidad) — **F**, no regresión producto.

---

## HITL Findings

- Approve/reject/timeout: **fail-closed correcto** (tests Hub).
- Labels humanos PHASE 41: estático verificado.
- Global host PHASE 38: estático verificado.
- Background sin FGS: **gap producto documentado**, no bloqueante técnico.

---

## Conversation Findings

- Partición por `sessionKey`: **sólida** (tests Android).
- History merge sin duplicar: `ChatHistoryMapper` tests.
- Streaming multi-run: soportado.
- Tool activity banner PHASE 42: no persiste (RAM) — coherente con arquitectura.

---

## B / C (bloqueantes / críticos)

```text
B encontrados: 0
C encontrados: 0
```

Ningún bug bloqueante ni riesgo crítico de seguridad/aislamiento demostrado en esta validación.

---

## Debt (D / E / F)

| ID | Deuda | Clase |
|----|-------|-------|
| E-43-01 | Laboratorio manual A–K incompleto en CI | E |
| F-43-01 | PHASE 32 arch test doc drift | F |
| D-43-01–06 | Ver UX Findings | D |

---

## Future (G)

- Notificación FGS HITL background
- Señal liveness Node real
- Excel validación Windows
- Narración Gateway enriquecida post-tool
- Voice, multi-node, ACL — explícitamente fuera MVP

---

## Validation Runs

| Check | Resultado | Notas |
|-------|-----------|-------|
| PHASE 43 arch tests | PASS | Tras crear |
| Hub npm test | 413/414 PASS | 1 PRE-EXISTING (PHASE 32 doc) |
| e2e-8d + confirm + process | 24/24 PASS | Proxy Labs B/C/E |
| conversation-messages | 4/4 PASS | Proxy Lab G/H |
| Android unit tests | PASS | Cross-talk, HITL, tool UX |
| typecheck | PASS | |
| build | PASS | |
| smoke:package | PASS | handshake + tools/list + filesystem.read |
| Android assembleDebug | PASS | |

---

## Final Recommendation

**PHASE 43 cerrada como READY WITH DEBT.**

**MVP READY WITH DEBT** — apto para uso técnico early-adopter con PC+Android configurados y expectativas realistas. **No** declarar listo para usuario final sin:

1. Sesión manual Labs K + D (Windows).
2. Resolver o aceptar deuda FGS HITL background.
3. Runbook operador validado en entorno real del usuario.

**PHASE 44 (recomendación, no iniciar):** Manual Field Test Protocol — script operador + checklist K1–K7 grabado en dispositivo real; o FGS HITL si producto prioriza background.

---

## Pregunta final obligatoria

> **¿Si yo instalara este sistema hoy en mi PC y Android, podría utilizarlo diariamente como mi agente personal?**

**Respuesta: con reservas — sí para un early adopter técnico; no aún para uso diario sin fricción para un usuario general.**

**Evidencia a favor:**

- Happy path conversación → tool read/write/process funciona (tests E2E Hub + smoke).
- HITL global con labels humanos y rechazo fail-closed.
- Hub-first, History API, aislamiento conversaciones (tests Android).
- Copy operacional mejorado (PHASE 39–42).

**Evidencia en contra / reservas:**

- Labs K (tareas naturales) **no ejecutados** manualmente — no hay evidencia de utilidad diaria real.
- Excel **no probado** en este entorno.
- Errores y resultados dependen del LLM; UX inconsistente en edge cases.
- HITL en background sin notificación; restart pierde confirm pending.
- Node liveness opaco mid-run.

**Conclusión:** Instalable y usable hoy para quien acepte operar el Gateway en PC y tolerar deuda UX. Para «mi agente personal diario sin pensar en infraestructura», **falta validación de campo** (Lab K) y cierre de deuda D-43-03/04/05.
