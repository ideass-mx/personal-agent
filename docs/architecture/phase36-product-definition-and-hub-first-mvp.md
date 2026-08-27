# PHASE 36 — Product Definition & Hub-First MVP

**Estado:** PHASE 36 CLOSED / PRODUCT DEFINITION ONLY  
**Fecha:** 2026-08-25.

**Decision:** **READY FOR PHASE 37**

PHASE 35 cerró la arquitectura (**MVP-READY WITH DEBT**). Esta fase **no** audita arquitectura: define el **producto** concreto a construir sobre el Single Node ya validado.

**PHASE 37 CLOSED** (ver [`phase37-hub-first-ux.md`](./phase37-hub-first-ux.md) — READY FOR IMPLEMENTATION).  
**PHASE 38 NOT STARTED.** Código productivo PHASE 36: **NONE**.

---

## 1. Producto actual (reconstrucción desde código)

### 1.1 Componentes reales

| Componente | Rol | Clasificación |
|------------|-----|---------------|
| Gateway (`hub/`) | HTTP + WS + Agent Runtime + SQLite + MCP client | **REAL** |
| Local Node (`agent/`) | MCP Server + Tools | **REAL** (README aún dice “placeholder” → **DEBT/F**) |
| Android app | Cliente chat/voice/conexión | **REAL** |
| Protocol WS | Auth, chat, confirm, chunks | **REAL** |
| `@mxideass/workspace-http` | CRUD Workspace + History | **REAL** |
| Packaging / smoke | dist + handshake | **REAL** |
| OpenClaw Gateway path | Cliente Android paralelo | **LEGACY** (producto) |
| Voice (Sherpa/on-device) | UI + pipeline | **PARCIAL** / **EXPERIMENTAL** para Hub MVP |
| User / ACL / multi-node | — | **NO EXISTE** |

### 1.2 Capacidad usuario → clasificación

| Capacidad | Clasificación | Evidencia breve |
|-----------|---------------|-----------------|
| Instalar/dev Single Node | **PARCIAL** | README + `.env`; sin instalador |
| Conectar Android → Hub | **PARCIAL** | Funciona; Hub selector **debug-only** (D-35-01) |
| Auth `HUB_TOKEN` | **REAL** | WS + HTTP Bearer |
| Crear / listar Conversation | **REAL** | HTTP + Sessions Hub |
| Chat + streaming | **REAL** | Hub WS + routing `conversationId` |
| History recovery | **REAL** | GET messages + `HubConversationHistorySync` |
| Workspace asociar | **REAL** | Hub-only UI |
| Tools RO automáticas | **REAL** | policy `automatic` |
| Tools mutantes + confirm | **PARCIAL** | Confirm solo si Chat compuesto (D-34-01) |
| Filesystem under root | **PARCIAL** | Root opcional → legacy path (E-34-01) |
| Process execute | **REAL** | confirm |
| Excel read/write | **PARCIAL** | Windows/COM; no núcleo Linux MVP |
| Node death fail-closed | **REAL** | tools fallan; health stale |
| Gateway / Android restart | **REAL** | SQLite + History |
| Diagnóstico operador | **PARCIAL** | stderr; sin runbook |
| OpenClaw chat | **LEGACY** | default backend release |
| Voice hands-free | **EXPERIMENTAL** | existe; no requisito Hub MVP |

### 1.3 Hipótesis de visión vs repositorio

> “Un agente personal que vive en la computadora del usuario, al que puede acceder desde su teléfono y que puede realizar acciones reales sobre su computadora bajo autorización.”

**Validada** por topología Gateway-en-PC + Node local + Android + Tools + HITL.

**Ajustes de wording (producto):**

1. Hoy el “cerebro” es el **Gateway en la PC** (LLM + Runtime); el teléfono es **cliente**.  
2. “Vive en la computadora” = instalación Single Node, no cloud multi-tenant.  
3. OpenClaw en la app **no** es el producto MVP; es legado.  
4. Voice existe pero **no** define el MVP Hub-first.

---

## 2. Product vision

1. **¿Qué es el Agent?** Un agente personal soberano: conversa, razona (LLM en Gateway) y actúa en la PC del usuario vía Tools del Local Node, con autorización explícita en acciones mutantes.  
2. **¿Para quién?** Una persona / hogar con una PC (operador técnico al inicio; usuario final tras pulido UX).  
3. **¿Problema?** Controlar y consultar la PC desde el teléfono sin exponer la máquina a un chatbot genérico sin límites.  
4. **¿Dónde vive?** Gateway + Node + SQLite en la PC; app Android como mando.  
5. **¿Interacción?** Chat (principal); voz post-MVP o experimental.  
6. **¿Vs chatbot?** Acciones reales (FS, proceso, Excel…) bajo policy + confirm, no solo texto.  
7. **¿Acciones?** Leer/listar/escribir archivos (root), ejecutar procesos (confirm), Excel (si Windows), demos/math/system.  
8. **¿Por qué autorización?** Mutaciones y ejecución son irreversibles; Session-bound confirm.  
9. **¿Unidad principal?** **Conversation** (hilo recuperable); Workspace agrupa trabajo opcional.

---

## 3. MVP = “terminado”

| Capability | Estado actual | MVP | Post-MVP | Motivo |
|------------|---------------|-----|----------|--------|
| Chat Hub | REAL | **sí** | | Core loop |
| Conversation | REAL | **sí** | | Unidad de trabajo |
| History | REAL | **sí** | | Continuidad |
| Streaming | REAL | **sí** | | Expectativa |
| Tools + discovery + policy | REAL | **sí** | | Diferenciador |
| HITL usable fuera de Chat | PARCIAL | **sí** | | Sin esto, mutaciones frágiles en uso real |
| Filesystem (con root) | PARCIAL | **sí** (root requerido/documentado) | | Seguridad práctica |
| Process execute | REAL | **sí** | | Acción real |
| Excel | PARCIAL | **no** (nice) | **sí** Windows | No bloquea Linux MVP |
| Node + MCP stdio | REAL | **sí** | | Arquitectura |
| Workspace | REAL | **sí** básico | | Ya existe; no Active Workspace |
| Android Hub-first | PARCIAL | **sí** | | D-35-01 |
| Voice | EXPERIMENTAL | **no** | **sí** | No bloquea |
| OpenClaw | LEGACY | **ocultar/degradar** | mantener interno | No producto MVP |
| Onboarding | PARCIAL | **sí** | | First-run |
| Config / FS root | PARCIAL | **sí** docs+UX | | E-34-01 |
| Health liveness | DEBT | **no** | **sí** | stderr suficiente inicial |
| Logs estructurados | DEBT | **no** | **sí** | |
| Diagnostics UI | PARCIAL | **mínimo** (mensajes claros) | panel | |
| Error recovery UX | PARCIAL | **sí** mensajes | | Node offline |
| Multi-device | FUTURE | **no** | | Single instalación |
| User/ACL | FUTURE | **no** | | `HUB_TOKEN` |
| Multi-node / A2A | FUTURE | **no** | | |
| Installer / updater | FUTURE | **no** | | package + docs |
| Cloud | FUTURE | **no** | | |
| Long-term memory | FUTURE | **no** | | |
| Tool transcript SQLite | DEBT | **no** | **sí** | |

**MVP terminado** = un usuario puede: instalar (dev/package), configurar Hub, conectar Android en modo Hub sin truco debug, conversar, recuperar history, usar Tools RO, aprobar Tools mutantes **aunque no esté en Chat**, sobrevivir restarts, y entender Node offline.

---

## 4. Experiencia Hub-first (modelo UX — sin implementar)

### Principios

- **Hub es el producto.** OpenClaw no aparece en el camino feliz (ajustes avanzados / debug).  
- **Conversation** es el objeto central de la UI.  
- El usuario no ve MCP, tool names internos ni “Gateway vs Hub” jerga de ingeniería.  
- Copy: «el agente» / «Agente».

### Modelo de pantallas

| Área | Modelo Hub-first |
|------|------------------|
| **Pantalla inicial** | Si no configurado → Conexión Hub (dirección + token). Si configurado y conectado → **Chat** de la Conversation activa. |
| **Navegación** | Chat (home) · Conversaciones · (Workspace) · Ajustes. Sin bifurcar “backend”. |
| **Sesiones** | Dejar de mezclar semántica OpenClaw `sessionKey` en copy; UI habla de **Conversaciones** (`conversationId`). |
| **Estado Agent** | Conectado / reconectando / sin configurar / error auth. |
| **Estado Node** | Producto: “Herramientas disponibles” vs “Herramientas no disponibles” (derivado de fallos de tool / señal futura; hoy health snapshot — messaging honesto). |
| **Conexión** | Solo Hub address + token; guardado; FGS. |
| **Historial** | Al abrir Conversation: loading → merge History; error visible si falla (no solo cache silencioso). |
| **Herramientas** | Invisibles como catálogo; visibles como **acciones en curso** / resultados en el hilo. |
| **Confirmaciones** | Globales (ver §6), no atadas a ChatScreen. |
| **Errores** | Mensajes accionables (“No se pudo escribir el archivo”, “El agente en la PC no responde”). |
| **Configuración** | Token, dirección, (avanzado) OpenClaw oculto. |
| **Diagnóstico** | Versión app + “última conexión” + hint a logs PC; no panel SRE. |

---

## 5. User journeys

### First run

```text
PC: package/dev → .env (ANTHROPIC, HUB_TOKEN, AGENT_FILESYSTEM_ROOT)
  → Gateway spawn Node → MCP → tools/list → SQLite → READY
Android: abrir app → Conexión Hub → auth OK → Chat vacío
  → Nueva Conversation → primer mensaje → respuesta
```

**Estados UX:** Setup → Connecting → Ready → Empty conversation → Active turn.

### Normal use

```text
Abrir app → Conversation (o lista) → mensaje
  → streaming → (tool automática) → texto final → persistido
```

### Confirmación

```text
Pedido mutante → Agent elige Tool confirm
  → UI: pending approval (global) → Aprobar | Rechazar | Expirar(60s)
  → ejecuta / cancela → resultado en Conversation
```

### Failure (Node)

```text
Tool falla / AGENT_DISCONNECTED
  → UI: “Herramientas no disponibles; reinicia el agente en la PC”
  → chat de solo texto puede seguir o degradarse según Runtime
  → recovery: reiniciar Gateway
```

### Restart

- **Android:** reconnect + History → Conversation recuperada.  
- **Gateway:** SQLite intacto; re-spawn Node; READY; Android reconecta.

---

## 6. HITL como producto (definición)

**Problema:** hoy `confirm_request` solo muestra diálogo si `ChatScreen` está composed; si no, timeout 60s (D-34-01).

### Modelo UX ideal (PHASE 38; no PermissionManager)

| Elemento | Comportamiento |
|----------|----------------|
| **Pending approval** | Estado app-global (Service/Store), no solo Chat |
| **Surfacing** | Banner en cualquier pantalla + notificación FGS opcional |
| **Approval center** | No hace falta “centro” separado en MVP; un sheet/diálogo global basta |
| **Approve / Reject** | Mismos botones; envían `confirm_response` |
| **Expiration** | 60s fail-closed; UI cuenta atrás |
| **Navigation** | Tap banner → enfoca Conversation afectada |
| **Voice** | Post-MVP; no aprobar solo por voz en MVP |
| **Multi-confirm** | Cola FIFO simple si hay >1 |

**No** introducir PermissionManager / ACL.

---

## 7. Tools desde el usuario

| Tool | Rol | MVP UI | Usuario |
|------|-----|--------|---------|
| `filesystem.read/list` | Capacidad real | MVP | “Busca / lista archivos” |
| `filesystem.write` | Capacidad real + confirm | MVP | “Organiza / escribe” |
| `process.execute` | Capacidad real + confirm | MVP | “Ejecuta esto” |
| `office.excel.*` | Capacidad real (Windows) | Post / opcional | “Modifica Excel” |
| `math.*` | Infra / demo LLM | OK ocultas | no catálogo |
| `system.info` / `diagnostics.ping` | Infra | ocultas | diagnóstico interno |
| `agent.echo` | Infra test | ocultas | |
| `customer.demo` | Demo | ocultas o flag | |
| `customer.test` | Deny (no policy) | ausente | |

El usuario habla en tareas; el Agent elige Tools. **No** exponer nombres MCP en UI principal.

Ejemplos cubiertos hoy:

- “Busca este archivo” → read/list  
- “Organiza esta carpeta” → list + write (confirm)  
- “Modifica Excel” → excel.* (Windows)  
- “Ejecuta este proceso” → process.execute (confirm)  
- “Analiza documentos” → read + LLM (no RAG dedicado)

---

## 8. Qué NO construir (MVP)

| Evitar | Por qué |
|--------|---------|
| User / ACL / multi-tenant | Identidad = instalación (`HUB_TOKEN`); PHASE 33/35 |
| Multi-Node / registries / A2A | Single Node suficiente |
| Supervisor / respawn / heartbeat | Fail-closed deliberado |
| PermissionManager / Capability | Confirm + policy bastan |
| Cloud / federation | Fuera de soberanía local |
| Installer/OTA como bloqueante | package + docs alcanzan RC técnico |
| Reabrir auditorías A–G | Cerradas en PHASE 35 |
| Nuevas abstracciones “por si acaso” | AGENTS.md |

---

## 9. Priorización

### MUST HAVE (MVP)

1. Hub-first UX (default Hub; OpenClaw fuera del camino feliz) — **D-35-01**  
2. HITL global / fuera de Chat — **D-34-01**  
3. Onboarding first-run (conexión Hub clara + copy)  
4. `AGENT_FILESYSTEM_ROOT` requerido o very-hard warning — **E-34-01**  
5. Mensajes de error recovery (Node offline, auth, history)  
6. Runbook / README alineado (agent no “placeholder”) — **F-34-02/03**

### SHOULD HAVE

- Empty/loading states en Chat/History  
- Banner “herramientas no disponibles”  
- Excel messaging “solo Windows”  
- Contador timeout confirm  

### POST-MVP

- Health liveness, shutdown WS, logs estructurados  
- Installer, Docker, OTA  
- Voice pulido Hub  
- Tool transcript SQLite  
- Multi-device, User/ACL, sandbox  
- Memory / RAG  

---

## 10. Roadmap (ajustado)

La secuencia propuesta se **acepta** con un matiz: **onboarding docs/FS root** puede solaparse con 37–39, pero Hub-first UI primero desbloquea todo lo demás.

| Phase | Objetivo | Resultado | Código probable | NO tocar | Aceptación | Depende | Riesgo |
|-------|----------|-----------|-----------------|----------|------------|---------|--------|
| **36** | Definición producto | Este doc | docs + arch test | productivo | Decision READY | 35 | bajo |
| **37** | Hub-first UX | App default Hub; OpenClaw avanzado/oculto | Android connection/nav/copy | protocol, Runtime, MCP, DB | Usuario release conecta Hub sin long-press debug | 36 | medio (regresión OpenClaw) |
| **38** | HITL product UX | Confirm global + notif/banner | Android ChatStore/Service/UI; opcional copy timeout | PermissionManager, protocol (salvo additive) | Confirm usable fuera de Chat | 37 | medio |
| **39** | First-run / onboarding | Flujo setup + docs + FS root | Android Connection; README; `.env.example` hints | schema, Runtime core | First-run documentado y operable | 37 | bajo |
| **40** | Agent capabilities / Tool UX | Acciones visibles como producto; demos ocultas | prompts/copy UI; no nuevas tools obligatorias | ToolRegistry arquitectura, MCP topo | Tareas FS/process claras | 38 | bajo |
| **41** | Operational readiness | Mensajes Node/Gateway; runbook; smoke checklist | UI status; docs; opcional health copy | respawn, multi-node | Operador recupera fallos comunes | 39 | bajo |
| **42** | MVP RC | Checklist §12 PASS | pulido | platform future | Entregable a usuario piloto | 37–41 | medio |

---

## 11. Product boundary

### Dentro del MVP

Hub Single Node · Android Hub-first · Conversation + History · streaming · Tools FS/process (+ Excel opcional) · HITL global · Workspace básico · auth instalación · package/smoke · docs first-run · FS root.

### Fuera del MVP

User/ACL · multi-device policy · multi-node · A2A · voice GA · installer/OTA · cloud · long-term memory · tool transcript durable · health liveness · sandbox.

### Arquitectura que NO debe cambiar

Fail-closed Node · MCP stdio · deny-by-default policy · Confirmation Session-bound · Runtime sin Workspace/User · `HUB_TOKEN` = instalación · sin registries plataforma.

### Deuda aceptada

Health snapshot · shutdown WS · tool timeout no aborta Node · Excel Linux gap · OpenClaw código residual oculto · observabilidad stderr.

### Riesgos aceptados

Operador técnico en first cohorts · un dispositivo a la vez · confirm 60s · sin OTA.

---

## 12. Criterios MVP release (“¿usuario real?”)

| # | Criterio | Evidencia hoy | Para PASS RC |
|---|----------|---------------|--------------|
| 1 | Instalación | package/README | docs + pasos claros |
| 2 | Configuración | `.env` | FS root + token |
| 3 | Conexión Android Hub | PARCIAL debug | **37** Hub-first |
| 4 | Conversación | REAL | keep |
| 5 | Streaming | REAL | keep |
| 6 | History | REAL | UX error (**39**) |
| 7 | Tool execution | REAL | keep |
| 8 | Confirmation usable | PARCIAL Chat | **38** |
| 9 | Node failure UX | PARCIAL | **41** |
| 10 | Gateway restart | REAL | keep |
| 11 | Android restart | REAL | keep |
| 12 | Recovery | REAL | keep |
| 13 | Filesystem safety | PARCIAL root | **39** |
| 14 | Auth | REAL | keep |
| 15 | Packaging smoke | REAL | keep |
| 16 | UX Hub-first | DEBT | **37** |
| 17 | Documentación | PARCIAL | **39/41** |
| 18 | Diagnóstico mínimo | PARCIAL | **41** |

**Hoy:** arquitectura PASS; producto **no** PASS RC (bloqueado por Hub-first + HITL + onboarding, no por B/C).

---

## 13. Arquitectura vs producto

### Ya resuelto por arquitectura (no reabrir)

Happy path E2E · persistencia Conversation · History API · stream routing · Tools MCP · HITL protocolo · fail-closed · auth · policy · packaging · isolation instalación · exit A–G.

### Pendiente por producto

Hub-first UI · HITL visibility · onboarding · copy errores · FS root productización · docs usuario · ocultar OpenClaw · estados vacíos/loading · (luego) voice/ops polish.

---

## 14. Decisiones concretas

1. **Producto:** Agente personal soberano en la PC del usuario, mandado desde Android, con acciones reales bajo autorización.  
2. **Usuario MVP:** Individuo/hogar con una PC; primeras cohortes = operador semi-técnico.  
3. **Core loop:** Abrir Conversation → mensaje → (tool) → (confirm si muta) → respuesta → history.  
4. **Pantalla principal:** **Chat** de la Conversation activa (Hub).  
5. **Unidad de trabajo:** **Conversation** (Workspace opcional).  
6. **Tools MVP:** filesystem.* · process.execute · (excel.* opcional Windows); resto infra/demo ocultas.  
7. **HITL:** Confirm global app-level + timeout 60s fail-closed; no PermissionManager.  
8. **Agent READY:** Gateway HTTP/WS up + Node/MCP handshake OK al boot (snapshot); producto comunica “conectado” vs “herramientas caídas” por fallos.  
9. **Offline:** Sin Tools (fail-closed); UI explica reiniciar PC agent; chat no finge éxito de herramientas.  
10. **Fuera:** User/ACL, multi-node, A2A, voice GA, installer, cloud, memory.  
11. **Siguiente fase:** **PHASE 37 — Hub-first UX**.  
12. **Implementar primero:** Default/path Android = Hub; selector OpenClaw solo avanzado/debug; copy Conexión Hub.

---

## 15. Findings (producto)

| ID | Finding | Class | Action |
|----|---------|-------|--------|
| P-36-01 | Visión validada vs repo | A | Adoptar |
| P-36-02 | Hub-first es el primer trabajo | D→producto | PHASE 37 |
| P-36-03 | HITL global es segundo | D | PHASE 38 |
| P-36-04 | OpenClaw = legacy de producto | LEGACY | Ocultar en 37 |
| P-36-05 | Voice = post-MVP | FUTURE/EXP | No 37–39 |
| P-36-06 | Excel no bloquea MVP Linux | PARCIAL | Post/opcional |
| P-36-07 | No nuevas abstracciones | A | Hard rule |

**B/C:** ninguno (heredado 35).

---

## 16. Files created

- `docs/architecture/phase36-product-definition-and-hub-first-mvp.md`
- `hub/tests/architecture/phase36-product-definition-and-hub-first-mvp.test.ts`

## 17. Files modified

- `docs/architecture/terminology.md`
- `docs/architecture/boundaries.md`
- `docs/architecture/refactor-plan.md`
- `docs/architecture/phase35-mvp-readiness-and-architecture-exit.md` (marcadores)

## 18. Productive code changed

```text
NONE
```

---

## 19. Validation

| Check | Resultado |
|-------|-----------|
| `phase36` + `phase35` arch tests | pass |
| `npm run typecheck` | pass |
| `npm run build` | pass |
| `npm run smoke:package` | pass |
| Android `testDebugUnitTest` + `assembleDebug` | pass |

---

## 20. Decision final

```text
Decision:
READY FOR PHASE 37

PHASE 37:
Hub-first UX — Android trata Hub como experiencia principal (conexión, default, navegación, copy); OpenClaw fuera del camino feliz.

Productive Code Changed:
**NONE**
```

> **¿Definición suficientemente clara para implementar UX?**  
> **Sí.**

> **¿Primer trabajo de producto?**  
> **PHASE 37 P0 Hub-first UX** (plan cerrado; falta autorización de implementación).

> **¿Qué NO tocar?**  
> Runtime, MCP, protocol (salvo additive autorizado), DB schema, ToolRegistry arquitectura, auth model, Workspace model, User/ACL, multi-node, PermissionManager, auditorías A–G.

**NO implementar P0 ni iniciar PHASE 38** sin autorización explícita.
