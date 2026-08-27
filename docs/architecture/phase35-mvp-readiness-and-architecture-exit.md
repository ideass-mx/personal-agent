# PHASE 35 — MVP Product Readiness / Architecture Exit Audit

**Estado:** PHASE 35 CLOSED / AUDIT ONLY  
**Fecha:** 2026-08-25.

**Decisión:** **MVP-READY WITH DEBT**

La arquitectura Single Node está **suficientemente madura** para **dejar de hacer auditorías arquitectónicas** y pasar a **trabajo de producto**.

No hay bloqueadores **B** ni **C**. El happy path Android↔Hub↔Runtime↔MCP↔Node↔Tools↔SQLite↔history es ejecutable. Las deudas restantes son producto, docs, pulido operativo o futuro de plataforma — **no** requieren nuevas abstracciones.

**PHASE 36 CLOSED** (ver [`phase36-product-definition-and-hub-first-mvp.md`](./phase36-product-definition-and-hub-first-mvp.md)). Código productivo PHASE 35: **NONE**.  
**Siguiente trabajo de producto:** PHASE 37 Hub-first UX (no auditoría).

---

## 1. Executive Summary

| Pregunta | Respuesta |
|----------|-----------|
| ¿Arquitectura lista para exit? | **Sí** (criterios A–G PASS) |
| ¿MVP usable operador técnico? | **Sí**, con deuda de producto |
| ¿Bloqueadores B/C? | **Ninguno** |
| ¿Nueva abstracción antes del MVP? | **No** |
| ¿Siguiente trabajo? | **PHASE 37 Hub-first UX** (definición en PHASE 36) |

---

## 2. MVP Definition (capacidades reales)

MVP = instalación Single Node doméstica: un Gateway, un Local Node, un `HUB_TOKEN`, Android en modo Hub, Conversations recuperables, Tools con policy + HITL, Workspace opcional.

| Feature | Existe | Funciona | Persistente | Recuperable | ¿MVP blocker? |
|---------|--------|----------|-------------|-------------|---------------|
| Conectar Android → Hub WS | sí | sí | prefs | sí | **No** |
| Auth `HUB_TOKEN` | sí | sí | env + prefs | sí | **No** |
| Crear Conversation | sí | sí | SQLite | sí | **No** |
| Recuperar Conversation | sí | sí | SQLite + History API | sí | **No** |
| Workspace CRUD/asociación | sí | sí (Hub) | SQLite | sí | **No** |
| Enviar mensaje | sí | sí | user msg | sí | **No** |
| Streaming chunks | sí | sí | assistant final | parcial mid-stream | **No** |
| Tool discovery (boot) | sí | sí | no (RAM) | reattach | **No** |
| Tools automáticas (RO) | sí | sí | no transcript | no | **No** |
| Tools mutantes + confirm | sí | sí si Chat abierto | no | — | **No** (deuda D) |
| HITL Android | sí | ChatScreen | Session RAM | no | **No** (D-34-01) |
| filesystem / process / Excel | sí | sí* | N/A | N/A | **No** (*Excel: Windows) |
| Node failure fail-closed | sí | sí | SQLite intacto | restart Gateway | **No** |
| Gateway restart | sí | sí | SQLite | sí | **No** |
| Android restart | sí | sí | History + cache | sí | **No** |
| History recovery | sí | sí | HTTP GET | sí | **No** |

\* Excel requiere entorno Windows + COM; no bloquea MVP Linux doméstico.

**No** se inventan features (User, multi-device lock, OTA, installer).

---

## 3. Happy path

```text
Android (Hub) → WS auth → user_message(conversationId)
  → ensureConversation → runTurn → LLM
  → ToolRegistry → RemoteAgentTool → MCP stdio
  → Local Node → Tool → result
  → assistant_chunk(conversationId) → Android
  → append user/assistant SQLite
  → disconnect/reconnect → GET /conversations/:id/messages → UI
```

| Tramo | Evidencia | Veredicto |
|-------|-----------|-----------|
| Auth WS | `ws.ts` token timing-safe | **A** |
| Turn + id único | `ws.ts` ensureConversation una vez | **A** (PHASE 32) |
| Tools MCP | `attach-agent`, `mcp-executor` | **A** (PHASE 29) |
| Confirm | `confirm_request` → Chat → `confirm_response` | **A** si Chat visible |
| Persist | `runtime` append user/assistant | **A** |
| History | `listConversationMessages` + Android sync | **A** |

**Puede ejecutarse de principio a fin.** Sí.

---

## 4. Failure path

| Failure | User sees | System state | Recovery | MVP blocker? |
|---------|-----------|--------------|----------|--------------|
| Gateway startup fail | proceso exit 1; stderr | no READY | fix env/Node; restart | **No** |
| MCP/handshake fail | exit 1 | no READY | restart | **No** |
| Node death runtime | tool errors; health stale | SQLite OK; tools fail-closed | restart Gateway | **No** |
| Tool failure | error / LLM narrates | Conversation OK | retry turn | **No** |
| Tool timeout | error; Node work may continue (E-29-02) | Conversation OK | operator | **No** |
| Confirm timeout (60s) | tool cancelled | fail-closed | re-ask | **No** |
| Confirm sin Chat | timeout silencioso UX | igual | abrir Chat (D) | **No** |
| WS disconnect | banner; queue | turn may incomplete | reconnect + history | **No** |
| Android restart | reconnect | History hydrate | auto | **No** |
| Gateway restart | offline breve | SQLite preserved | restart | **No** |
| SQLite restart | same DB file | durable | — | **No** |
| Malformed / unauth | auth_failed / HTTP 401 | reject | fix token | **No** |

---

## 5. Product / platform boundary

### Core Platform (mantener; no expandir)

Gateway, Agent Runtime, ToolRegistry, MCP client/server, Local Node, SQLite, protocol WS/HTTP, toolPolicy, ConfirmationPort, packaging.

### Product (siguiente foco)

Android Hub-first UX, onboarding, HITL visibility, Workspace/Conversation UX, empty/loading/error states, history hydrate feedback, settings, copy known-limitations, README/runbook.

### Future Platform (NO construir ahora)

User, ACL, AgentRegistry, NodeRegistry, multi-agent, multi-node, A2A, distributed runtime, Capability, PermissionManager, sandbox de procesos, heartbeat/respawn/supervisor.

**Código actual respeta la frontera:** Runtime sin Workspace/Android/User; sin registries de plataforma; A2A solo en docs como “no implementado”.

---

## 6. Architecture exit criteria

| Criterion | Result | Notes |
|-----------|--------|-------|
| A Identity | **PASS** | Session ≠ Conversation ≠ Workspace; Agent ≠ Node ≠ MCP |
| B Runtime | **PASS** | Sin Workspace/Android/User en `runtime.ts` |
| C Security | **PASS** | Auth HTTP/WS; policy; confirm Session-bound; FS; stdio; env filter |
| D Persistence | **PASS** | Conversations/Messages/Workspaces; SET NULL; History API |
| E Lifecycle | **PASS** | Fail-closed boot/death; restart; shutdown definido (deuda WS hang) |
| F Product flow | **PASS** | Android→Gateway→Runtime→Tool→Android |
| G Packaging | **PASS** | package + smoke + Node + MCP + SQLite + migrations |

**Arquitectura suficientemente madura:** sí.

---

## 7. Known debt triage

| ID | Triage | Notas |
|----|--------|-------|
| D-34-01 HITL solo ChatScreen | **pre-MVP producto** | No bloquea operador en Chat; priorizar UX |
| D-35-01 Hub selector debug / default GATEWAY | **pre-MVP producto** | Fricción fuerte para MVP Hub-first |
| E-34-01 FS root opcional | **pre-MVP hardening** (opcional) | Docs o require; no abstracción |
| E-34-04 observabilidad stderr | **post-MVP** | Suficiente doméstico |
| E-34-05 health snapshot | **post-MVP** | Operador ve stderr Node death |
| E-34-06 shutdown + WS | **post-MVP** | Rare en hogar |
| F-34-02/03 README/runbook | **pre-MVP docs** | Sin código |
| G-34-01/02/03 installer/Docker/OTA | **future** | No arquitectura |
| E-31-05 tool transcript SQLite | **post-MVP** | No pérdida Conversation user/assistant |
| G-31-01 multi-device | **future** | Single instalación |
| G-31-02 idempotency | **post-MVP** | |
| E-29-02 timeout no aborta Node | **post-MVP** | |
| G-33-01 User/ACL | **future** | |
| G-33-02 process sandbox | **future** | |

---

## 8. Product vs platform (sobrearqitectura)

| Señal | Presente en código productivo? | Class |
|-------|-------------------------------|-------|
| multi-user / ACL | no | G |
| multi-agent / AgentRegistry | no | G |
| multi-node / NodeRegistry | no | G |
| A2A | solo docs “no” | G |
| PermissionManager / Capability | ausentes (tests lo afirman) | G |
| Plugin marketplace | no | G |
| Dual Hub+OpenClaw en Android | sí (legado producto) | **D-35-01** / E producto — no nueva plataforma |

No hay código productivo “futurista” que deba eliminarse para exit. OpenClaw path es deuda de producto, no plataforma nueva.

---

## 9. Android MVP checklist

| # | Capacidad | Estado |
|---|-----------|--------|
| 1 | Conectar | **A** |
| 2 | Autenticarse | **A** |
| 3 | Crear Conversation | **A** |
| 4 | Seleccionar Conversation | **A** |
| 5 | Recuperar Conversation | **A** |
| 6 | Streaming | **A** |
| 7 | Errores | **A** / D genérico |
| 8 | Recibir confirmation | **A** si Chat composed |
| 9 | Aprobar/rechazar | **A** si Chat composed |
| 10 | Usar Tools | **A** |
| 11 | Sobrevivir restart | **A** |
| 12 | History | **A** (fail silencioso → cache) |

Gaps producto: empty chat; history sin loading/error UI; HITL fuera de Chat; Hub no first-class en release (**D-35-01**).

---

## 10. Tool MVP

14 tools Hub vía policy (15 anunciadas Node; `customer.test` omitido). Núcleo razonable: echo, FS, process, math, system, diagnostics, customer.demo, Excel.

| Dimensión | Estado |
|-----------|--------|
| Discoverability | boot tools/list | **A** |
| Policy deny-by-default | **A** |
| Confirmation mutantes | **A** |
| Execution E2E | **A** (PHASE 29) |
| Result → LLM/Android | **A** |
| Failure fail-closed | **A** |
| Timeout | **E-29-02** post-MVP |
| Security containment | **A** con E-34-01 |

**No agregar Tools** para cerrar arquitectura.

---

## 11. Configuration / onboarding

| Paso | Doc status |
|------|------------|
| Node 22+ (package) | Partially (`dist/README.txt`; raíz débil) |
| `npm run install:all` | Documented |
| `hub/.env` ANTHROPIC + HUB_TOKEN | Documented (`.env.example`) |
| `AGENT_FILESYSTEM_ROOT` | Partially — opcional; riesgo no enfatizado |
| `npm run hub` / package launchers | Documented / package |
| Android address + token | Documented UI |
| Seleccionar backend Hub | **Undocumented / debug-only** → **D-35-01** |
| Backup SQLite | Undocumented (**F**) |
| Known limitations | Partial (phases; no runbook) |

Sin installer en esta fase.

---

## 12. Production operability

| Pregunta | Respuesta | Class |
|----------|-----------|-------|
| ¿Gateway arrancó? | stderr READY + `/health` | A / E |
| ¿Node murió? | tools fallan; health **no** lo dice | E-34-05 |
| ¿MCP fail al boot? | exit 1 | A |
| ¿Tool failure? | error WS + logs | A / D |
| ¿Recuperar Gateway? | restart proceso | A |
| ¿Recuperar Conversation? | SQLite + History | A |

---

## 13. Data recovery

| Durable | Ephemeral | Partial |
|---------|-----------|---------|
| Workspace, Conversation, Messages (user/assistant) | Session, confirmations, ToolRegistry, Runtime, Node, MCP | Android DataStore cache, UI, pending queue |

**Pérdida que contradiga MVP:** no. Tool transcript no durable (**E-31-05**) no borra Conversation. Mid-stream drop: assistant puede quedar incompleto hasta history del final persistido — aceptable post-MVP.

---

## 14. User expectations (semántica)

| Expectativa | Realidad | Class |
|-------------|----------|-------|
| Conversation recuperable | sí (History) | A |
| Workspace persistente | sí | A |
| Tool result “registrado” en hilo | solo vía texto assistant; no tool rows | D/F |
| Confirm fuera de Chat | no | D-34-01 |
| `/health` = Node vivo | no (snapshot) | D/F |
| Gateway restart conserva datos | sí SQLite | A |

---

## 15. Documentation exit

| Tema | Suficiente para exit? |
|------|------------------------|
| Install/config/startup | Parcial — falta runbook + Hub-first |
| Android + token | Parcial |
| Filesystem root | Parcial |
| Tools / confirmations | Phases 28–29 | OK para tech |
| Troubleshooting / restart / backup | Débil (**F-34-03**) |
| Known limitations | En phases; no usuario final |

Docs no bloquean exit de **arquitectura**; sí priorizan trabajo **producto/docs**.

---

## 16. Test exit

| Invariante | Protección |
|------------|------------|
| Fail-closed lifecycle | Protected (`lifecycle-9a`) |
| Auth / policy / confirm / FS | Protected (security/*) |
| History + routing | Protected (phase32 + http tests) |
| Packaging smoke | Protected |
| Architecture boundaries | Protected (arch tests) |
| HITL Chat-only | Partially (docs/tests protocol; no UI E2E) |
| Hub-first release UX | Unprotected |
| Health liveness | Unprotected (deliberate) |

**No** se recomienda batería artificial. Tests nuevos solo si producto introduce invariante MVP (p.ej. Hub selector release).

---

## 17. Build / package exit

Validado en cierre (ver §26–30 respuesta). Fallos ambientales Node 18 + better-sqlite3 native ABI: **environmental**, no fallo de producto (package usa Node 22+).

---

## 18. Architecture smells (MVP-relevant)

| Smell | ¿Bloquea MVP? | Notas |
|-------|---------------|-------|
| Runtime → infra indebida | no | PASS |
| Android → Gateway internals | no | protocolo + HTTP client |
| MCP bypass | no | |
| Workspace/Conversation leakage a Runtime | no | |
| Auth bypass | no | `/health` público = E conocido |
| State duplication DataStore vs SQLite | no | cache; History authority |
| Dual OpenClaw+Hub | producto D | no smell plataforma |
| Circular deps críticas | no evidenciadas | |

---

## 19. Final MVP matrix

| Feature | Status | Class | Evidence | MVP impact | Action |
|---------|--------|-------|----------|------------|--------|
| Happy path E2E | works | A | ws/runtime/mcp/Android | none | keep |
| Security perimeter | works | A | PHASE 33 | none | keep |
| Conversation recovery | works | A | PHASE 32 | none | keep |
| HITL Chat-only | works w/ gap | D | ChatScreen | UX | product |
| Hub-first UX | friction | D | ConnectionScreen debug | onboarding | product |
| FS root optional | debt | E | agent config | hardening | docs/config |
| Health snapshot | debt | E | server.ts | ops | post-MVP |
| Tool transcript | debt | E | history roles | audit trail | post-MVP |
| User/ACL | absent | G | — | none | do not build |
| Installer/OTA | absent | G | — | polish | future |

---

## 20. Findings A–G

| ID | Finding | Classification | MVP | Code? |
|----|---------|----------------|-----|-------|
| A-35-01 | Exit criteria A–G PASS | A | — | No |
| A-35-02 | Happy path E2E posible | A | — | No |
| A-35-03 | Sin B/C | A | — | No |
| D-35-01 | Hub backend no first-class en release | D | pre-MVP product | Sí (producto) |
| D-34-01 | HITL solo Chat | D | pre-MVP product | Sí (producto) |
| E-34-01 | FS root opcional | E | pre-MVP optional | Opcional |
| E-34-* / E-31-05 / E-29-02 | ops / transcript / timeout | E | post-MVP | Opcional |
| F-34-02/03 | README/runbook | F | pre-MVP docs | Docs |
| G-* | User/ACL/sandbox/installer/multi-* | G | future | **No** |

**B:** ninguno. **C:** ninguno.

---

## 21. Critical risks

Ninguno bloqueante de arquitectura.

Riesgos de producto al salir a MVP “doméstico”:

1. Usuario release no encuentra modo Hub (**D-35-01**).  
2. Confirm timeout fuera de Chat (**D-34-01**).  
3. First-run sin `AGENT_FILESYSTEM_ROOT` (**E-34-01**).

---

## 22. Non-blocking debt

Todo lo listado en §7 como post-MVP / future / documentation.

---

## 23. What we must NOT build yet

- User / ACL / multi-tenant  
- AgentRegistry / NodeRegistry / multi-agent / multi-node  
- A2A / distributed runtime  
- Capability / PermissionManager / process sandbox  
- Heartbeat / respawn / supervisor  
- Instalador/Docker/OTA como “requisito arquitectura”  
- Nuevas capas “por si acaso”

---

## 24. Critical questions

1. ¿B? **No.**  
2. ¿C? **No.**  
3. ¿Pérdida de datos que contradiga MVP? **No** (user/assistant durables).  
4. ¿Tool sin autorización? **No** (policy + confirm Session-bound; fail-closed).  
5. ¿Romper isolation Conversation? **No** a nivel instalación; multi-device = G futuro.  
6. ¿Android happy path? **Sí** (modo Hub).  
7. ¿Gateway restart conserva Conversation? **Sí.**  
8. ¿Node death corrompe persistencia? **No.**  
9. ¿Usuario recupera history? **Sí.**  
10. ¿Operar sin User/ACL? **Sí** (`HUB_TOKEN` = instalación).  
11. ¿Nueva abstracción antes del MVP? **No.**  
12. ¿Tres trabajos de producto primero?  
    1. **Hub-first onboarding** (selector release + default/docs) — D-35-01  
    2. **HITL visible fuera de Chat** (o banner/notif) — D-34-01  
    3. **Docs/runbook + enfatizar `AGENT_FILESYSTEM_ROOT`** — F / E-34-01  

---

## 25. Files created

- `docs/architecture/phase35-mvp-readiness-and-architecture-exit.md`
- `hub/tests/architecture/phase35-mvp-readiness-and-architecture-exit.test.ts`

## 26. Files modified

- `docs/architecture/terminology.md`
- `docs/architecture/boundaries.md`
- `docs/architecture/refactor-plan.md`
- `docs/architecture/phase34-product-operational-completeness-audit.md` (marcadores de fase)

## 27. Productive code changed

```text
NONE
```

---

## 28–32. Validation

| Check | Resultado |
|-------|-----------|
| `phase35` + `phase34` arch tests | pass |
| `npm run typecheck` | pass |
| `npm run build` | pass |
| `npm run smoke:package` | pass |
| Android `testDebugUnitTest` + `assembleDebug` | pass |

---

## 33. Final decision

```text
MVP-READY WITH DEBT
```

---

## 34. Final recommendation

> **¿Estamos listos para dejar de hacer auditorías arquitectónicas y comenzar trabajo de producto?**

**Sí.**

**PHASE 36 CLOSED** — ver [`phase36-product-definition-and-hub-first-mvp.md`](./phase36-product-definition-and-hub-first-mvp.md).  
**NO iniciar PHASE 37 automáticamente** sin autorización explícita de implementación.
