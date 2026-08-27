# PHASE 40 — Agent Capabilities / Tool UX Audit

**Estado:** PHASE 40 CLOSED / AUDIT + PRODUCT DEFINITION ONLY  
**Fecha:** 2026-08-26.

**Decision:** **READY FOR IMPLEMENTATION**

Las Tools existentes pueden presentarse como **capacidades de producto** sin cambiar Runtime, MCP, policy, protocolo ni ConfirmationWaiter. Android hoy **no** muestra catálogo: el usuario solo ve Tools vía narrativa del assistant y `confirm_request` (nombre técnico).

**PHASE 41 NOT STARTED.** Código productivo: **NONE**.

---

## 1. Executive Summary

| Pregunta | Respuesta |
|----------|-----------|
| ¿Inventario real? | **14** en Hub policy; Node anuncia también `customer.test` (deny/omit) |
| ¿Android conoce catálogo? | **No** (solo `toolName` en HITL) |
| ¿Capacidades sin nueva arquitectura? | **Sí** |
| ¿Pantalla Tools separada? | **No** como home; Conversation-first + superficie ligera «Capacidades» opcional |
| ¿B/C? | **Ninguno** |
| Architecture impact | **NONE** |

---

## 2. Real Tool Inventory

Evidencia: `hub/src/tools/tool-policy.ts` (`DEFAULT_TOOL_POLICY`), `agent/src/extensions/defaults.ts`, tools en `agent/src/tools/*`.

| Tool | Policy | Side effect | Plataforma | Product class |
|------|--------|-------------|------------|---------------|
| `filesystem.read` | automatic | read FS | all (+ root) | **A** Product |
| `filesystem.list` | automatic | read FS | all (+ root) | **A** Product |
| `filesystem.write` | confirm | write FS | all (+ root) | **A** Product |
| `process.execute` | confirm | spawn | all | **A** Product |
| `office.excel.read` | automatic | Excel COM | Windows | **A** Product* |
| `office.excel.write` | confirm | Excel write | Windows | **A** Product* |
| `system.info` | automatic | none | all | **B** Infra |
| `diagnostics.ping` | automatic | none | all | **B** Infra |
| `agent.echo` | automatic | none | all | **C** Demo/Test |
| `math.add/sub/mul/div` | automatic | none | all | **C** Demo/Test |
| `customer.demo` | automatic | none | all | **C** Demo |
| `customer.test` | **omit** (no policy) | — | announced Node? | **C** — no Hub |

\* Excel: capacidad producto **condicional** (Windows); en Linux/macOS mensaje honesto, no marketplace.

Timeouts (PHASE 29): MCP default ~15s; process hasta timeoutMs+5s; Excel ~20s. Health `agentTools` = snapshot boot en `/health` — Android **no** lo consume hoy.

---

## 3. Product Capability Classification

### A — Product Capability (visibles en UX futura)

| Capacidad UX | Tools internas | Confirm |
|--------------|----------------|---------|
| Leer / listar archivos | `filesystem.read`, `filesystem.list` | no |
| Escribir / modificar archivos | `filesystem.write` | sí |
| Ejecutar en la PC | `process.execute` | sí |
| Excel (Windows) | `office.excel.read/write` | write sí |

### B — Infrastructure (ocultas al usuario final)

`system.info`, `diagnostics.ping` — útiles a Runtime/diagnóstico; no catálogo producto.

### C — Demo/Test (ocultas / debug)

`agent.echo`, `math.*`, `customer.demo` — no formar «Lo que tu agente puede hacer». Pueden seguir en policy para LLM/smoke.

### D — Future

Nuevas Tools (correo, calendario, etc.) — **no** inventar ahora. Sandbox de proceso, transcript Tool en SQLite = G/E previos.

---

## 4. Android Tool UX Audit

| # | Pregunta | Evidencia | Estado |
|---|----------|-----------|--------|
| 1 | ¿Recibe catálogo tools/list? | No frame WS; discovery solo Hub↔Node | **No** |
| 2 | ¿Almacena catálogo? | No en ChatStore/DataStore | **No** |
| 3 | ¿Muestra catálogo? | No pantalla Capacidades | **No** |
| 4 | ¿Descubrimiento? | Solo conversación / HITL | **Parcial** |
| 5 | ¿Nombres internos? | HITL muestra `toolName` crudo (`HubConfirmHost`) | **Sí — deuda D** |
| 6 | ¿Ejecución visible? | Solo texto assistant (+ streaming) | **Parcial** |
| 7 | ¿Error? | `error` WS → burbuja; `agent_disconnected` humanizado (39) | **Parcial A** |
| 8 | ¿Confirmación? | HITL global PHASE 38 | **A** |
| 9 | ¿Resultado Tool? | No `tool_result` al cliente; LLM resume en assistant | **Por diseño** |
| 10 | ¿Auto vs confirm? | Solo confirm tiene UI dedicada | **Parcial** |

`RoutingChatConnection` / `HubChatConnection`: mapean chunks, done, error, confirm — **no** catálogo Tools.

---

## 5. Current Tool Execution UX

```text
Usuario mensaje → Runtime → (tool automatic | confirm_request)
  → MCP → Node → ToolResult → LLM → assistant_chunk(s) → Android
```

El teléfono **no** ve el `ToolResult` estructurado. Ve:

1. Narrativa del modelo, y/o  
2. Diálogo HITL con `toolName` + `input` sanitizado, y/o  
3. Burbuja de error.

**Implicación producto:** no hace falta frame nuevo para MVP de capacidades; hace falta **copy/mapping UX** y opcionalmente tarjetas en el hilo derivadas de `confirm_request` / errores conocidos.

---

## 6. Modelo UX recomendado

### Agrupaciones (basadas en Tools reales)

| Grupo UX | Capacidades |
|----------|-------------|
| **Archivos** | Listar, leer, escribir (en carpeta de trabajo) |
| **PC** | Ejecutar programas/comandos |
| **Excel** | Leer / modificar hojas (si Windows) |

El usuario no debe ver MCP/Node/ToolRegistry/stdio.

### Opción de superficie (elegir **una**)

| Opción | Descripción | Veredicto |
|--------|-------------|-----------|
| **A** Conversation-only | Todo en el hilo | Base MVP |
| **B** Conversation + «Capacidades» | Sheet/lista corta de descubrimiento | **Recomendada** |
| **C** Capacidades contextuales complejas | Inferencia UI pesada | Rechazada ahora |

**Recomendación: A + B ligera.**

- Home = Conversation (Conversation-first / Hub-first).  
- Entrada Settings o menú Chat: **«Lo que tu agente puede hacer»** — 3–6 filas con nombre UX + ejemplo («Lista archivos en tu carpeta de trabajo»).  
- Sin marketplace, sin toggles de permisos Android, sin registry.

---

## 7. Tool states (protocol vs UX)

| Estado UX | ¿Existe en protocolo? | Cómo mostrar |
|-----------|----------------------|--------------|
| Disponible | implícito (policy + Node up) | Capacidades list / copy |
| Ejecutando | no frame dedicado | streaming / «el agente está trabajando» (futuro UI) |
| Requiere autorización | `confirm_request` | HITL global (38) |
| Autorizada / Rechazada | `confirm_response` | dismiss diálogo; turno continúa |
| Completada | `assistant_chunk` / done | texto |
| Error | `error` + tool fail→LLM | burbuja humanizada |
| Timeout | Gateway confirm 60s; MCP timeout | HITL countdown; mensaje genérico |
| Agente desconectado | `agent_disconnected` | copy PHASE 39 |

**No crear frames nuevos** (`tool_progress` ya marcado futuro en PROTOCOL).

---

## 8. HITL Integration

Reglas (sin cambio):

- Gateway = autoridad; policy + ConfirmationWaiter.  
- Android solo muestra y responde.  
- Dismiss = reject; timeout fail-closed.  
- Sin PermissionManager.

**Convivencia Tool UX + HITL:**

1. Capacidades list puede decir «Requiere tu autorización» en filas mutantes.  
2. En ejecución real, el diálogo global (38) es la fuente de verdad.  
3. Opcional: chip en el hilo «Autorización pedida: Escribir archivos» — **no** duplicar approve fuera del host.  
4. HITL debería mostrar **nombre UX** (`Escribir archivos`) y tool técnica secundaria/colapsada — D-40-01.

---

## 9. Tool Result UX (por Tool)

| Tool | Hoy | Gap UX |
|------|-----|--------|
| filesystem.read/list | LLM resume contenido/lista | Paths crudos posibles; acotar copy «carpeta de trabajo» |
| filesystem.write | LLM + HITL previo | Confirmar path relativo al root en diálogo |
| process.execute | stdout/stderr vía LLM | Evitar dumps enormes; HITL debe mostrar comando |
| excel.* | LLM | Advertir Windows; errores COM humanizados |
| math/echo/demo | LLM | Ocultar de capacidades |

Errores: mantener traducción humana (39); ampliar mapa códigos Tool si aparecen en `error.message` (**F/E**, no protocolo).

---

## 10. Tool naming (mapping; no rename interno)

| Interno | Nombre UX | Descripción corta |
|---------|-----------|-------------------|
| `filesystem.list` | Listar archivos | Ver qué hay en tu carpeta de trabajo |
| `filesystem.read` | Leer archivo | Leer el contenido de un archivo |
| `filesystem.write` | Escribir archivo | Crear o modificar un archivo (**autorización**) |
| `process.execute` | Ejecutar en la PC | Lanzar un comando o programa (**autorización**) |
| `office.excel.read` | Leer Excel | Leer celdas (Windows) |
| `office.excel.write` | Modificar Excel | Escribir celdas (**autorización**, Windows) |

Infra/demo: sin nombre UX de producto (ocultos).

---

## 11. Demo / Infrastructure classification

| Tool | Destino | Justificación |
|------|---------|---------------|
| `agent.echo` | hidden / debug | smoke/LLM |
| `math.*` | hidden | no valor producto hogar |
| `diagnostics.ping` | infrastructure hidden | health interno |
| `system.info` | infrastructure hidden | contexto LLM |
| `customer.demo` | hidden / demo | no catálogo |
| `customer.test` | absent Hub | deny-by-default |

No eliminar del Node/policy sin fase explícita.

---

## 12. Node / offline UX (señales existentes)

| Situación | Señal hoy | Copy producto |
|-----------|-----------|---------------|
| Gateway WS up | `Conectado` | Agente listo (39) |
| Gateway down | reconnect/error | Sin conexión |
| Node down mid-run | tool error `agent_disconnected` | copy 39 |
| Tool timeout | error genérico / LLM | «La acción tardó demasiado» (impl futura) |
| MCP fail boot | Hub no READY | first-run / runbook |

Sin API nueva. `/health.agentTools` = snapshot; útil opcional en Capacidades «al arrancar» — no liveness.

---

## 13. Security Boundary

```text
Usuario ve capacidad UX
  ≠ Android autoriza ejecución
Autoridad:
  Gateway toolPolicy → ConfirmationWaiter → Runtime → MCP → Node → FS root
```

Android **nunca** decide policy. Mostrar «disponible» es descubrimiento, no permiso.

---

## 14. Architecture Impact

```text
NONE
```

Cambios futuros de implementación (PHASE 41 sugerida): solo Android copy/UI + opcional mapping estático nombre UX. **No** CapabilityRegistry, **no** protocol tools catalog obligatorio.

Si se quisiera catálogo live en Android: sería **opcional/futuro** (exponer subset de `agentTools` o endpoint) — **G**, no bloquea definición.

---

## 15. Findings A–G

| ID | Finding | Class |
|----|---------|-------|
| A-40-01 | 14 Tools policy + HITL + execution path reales | A |
| A-40-02 | Resultados al cliente vía assistant (diseño actual) | A |
| D-40-01 | HITL muestra `toolName` técnico | D |
| D-40-02 | Sin superficie de descubrimiento de capacidades | D |
| D-40-03 | Ejecución automática invisible salvo texto LLM | D |
| E-40-01 | Schema LLM genérico (E-29-01) | E |
| E-40-02 | Tool transcript no en SQLite (E-31-05) | E |
| E-40-03 | Timeout no aborta Node (E-29-02) | E |
| F-40-01 | Mapping UX nombres no documentado en producto | F → este doc |
| G-40-01 | Catálogo live Android / tool_progress frames | G |

**B:** ninguno. **C:** ninguno.

---

## 16. Critical Risks

1. Usuario cree que ver «Escribir archivos» = permiso Android → mitigar copy frontera.  
2. Excel listado en Capacidades en Linux → frustración; marcar «Windows».  
3. Scope creep hacia CapabilityRegistry — **prohibido** en implementación.

---

## 17. Non-blocking Debt

E-29/31 timeouts/transcript/schema; health snapshot; OpenClaw legacy; Voice.

---

## 18. Test coverage (audit)

| Área | Protección |
|------|------------|
| policy / discover | Protected |
| confirm waiter / e2e tools | Protected |
| Android HITL protocol/UI | Protected (38) |
| Node unavailable copy | Partial (39) |
| Android Tool catalog UX | **Unprotected** (no existe UI) |
| Result structured UX | N/A (no frames) |

Arch test PHASE 40: invariantes documentales solamente.

---

## 19. Implementation sketch (NO implementar aquí)

Cuando se autorice PHASE 41 (o “40 implement”):

1. Mapa estático `toolName → UiCapability` en Android.  
2. HITL: título UX + detalle técnico colapsable.  
3. Pantalla/sheet Capacidades (lista fija A-class).  
4. Opcional: chip en hilo al recibir confirm.  
5. Tests unitarios del mapping.  

**No tocar:** Runtime, MCP, DB, protocol frames, policy server.

---

## 20. Files created

- `docs/architecture/phase40-agent-capabilities-tool-ux.md`
- `hub/tests/architecture/phase40-agent-capabilities-tool-ux.test.ts`

## 21. Files modified

- `docs/architecture/terminology.md`
- `docs/architecture/boundaries.md`
- `docs/architecture/refactor-plan.md`
- marcadores phase39 si aplica

## 22. Productive code changed

```text
NONE
```

## 22b. Validation

| Check | Resultado |
|-------|-----------|
| phase40 arch test | pass |
| typecheck / build / smoke / Android | pass |

---

## 23. Final Recommendation

1. **¿Capacidades sin arquitectura?** Sí.  
2. **¿Visibles?** filesystem.*, process.execute, excel.* (Windows).  
3. **¿Ocultas?** math.*, echo, ping, system.info, customer.demo.  
4. **¿Descubrimiento?** Conversation-first + sheet Capacidades simple.  
5. **¿Ejecución?** Hilo + HITL global; nombres UX.  
6. **¿HITL?** Gateway authority; mapping UX en diálogo.  
7. **¿B/C?** No.  
8. **¿Después?** Implementar mapping + Capacidades + HITL labels (PHASE 41).

### PHASE 41 (propuesta; no iniciar)

**Agent Capabilities UX implementation** — mapping nombres, HITL copy UX, sheet Capacidades; sin protocol/Runtime/MCP.
