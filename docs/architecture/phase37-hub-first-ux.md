# PHASE 37 — Hub-first UX (Audit + Implementation Plan)

**Estado:** PHASE 37 CLOSED / P0 IMPLEMENTED (ver [`phase37-hub-first-ux-implementation.md`](./phase37-hub-first-ux-implementation.md)).  
**Fecha:** 2026-08-26.

**Decision (plan):** **READY FOR IMPLEMENTATION** → **PASS** (P0).

Android era **Chat-first** y **Gateway-default**. P0 implementado: Hub default, first-run Connection, OpenClaw Avanzado/Legacy.

**PHASE 38 CLOSED** (ver [`phase38-hitl-global-product-ux.md`](./phase38-hitl-global-product-ux.md)).  
**PHASE 39 NOT STARTED.**

---

## 1. Executive Summary

| Pregunta | Respuesta |
|----------|-----------|
| ¿Hub es el camino feliz hoy? | **No** |
| ¿Bloqueo arquitectónico? | **No** |
| ¿Se puede implementar sin rediseñar plataforma? | **Sí** |
| ¿Borrar OpenClaw? | **No** — legacy/debug |
| ¿HITL global en esta fase? | **No implementar** — planificado PHASE 38; auditado aquí |
| Siguiente paso tras autorización | Implementar **P0 Hub-first** listados abajo |

---

## 2. Current Android UX

### Home / navegación (evidencia)

| Hecho | Evidencia | Clasificación |
|-------|-----------|---------------|
| `startDestination = Boot` → siempre **Chat** | `MainActivity.kt` `AppNav` LaunchedEffect | REAL |
| Connection **no** es first-run obligatorio | Comment: “Gateway es opcional”; Settings → Conexión | REAL / fricción producto |
| Default backend **GATEWAY** | `ConnectionPrefsPolicy.backendFromStored` → GATEWAY; `ConnectionUiState.backend` default | REAL / **anti Hub-first** |
| Selector Hub/Gateway **debug-only** | `toggleBackendSelector` no-op si `!debugBuild`; UI long-press título | REAL (D-35-01) |
| Tras Hub auth → Chat | `ConnectionScreen.onConnected` → Chat | REAL |
| Sin prefs → Chat vacío “sin configurar” | Boot → Chat; header connection | EXISTE PERO FRICCIÓN |

### Clasificación de componentes

| Componente | Dominio |
|------------|---------|
| `HubChatConnection`, `HubClient`, `HubConversationHistorySync`, Workspace HTTP UI | **Hub** |
| `GatewayChatConnection`, `GatewayClient`, `ChatHistorySync`, pairing OpenClaw, `PersistedSessionProvider` (modelo OpenClaw) | **OpenClaw legacy** |
| `RoutingChatConnection`, `ChatStore`, `ChatScreen`, `SessionsScreen`, `AgentService`, `AppPreferences` | **Infra compartida** |

---

## 3. Camino feliz MVP (marcado)

| # | Paso | Estado |
|---|------|--------|
| 1 | Usuario abre Android | **EXISTE** |
| 2 | Detecta/configura Hub | **EXISTE PERO TIENE FRICCIÓN** (default GATEWAY; Hub debug) |
| 3 | Conecta/autentica `HUB_TOKEN` | **EXISTE** (si elige Hub) |
| 4 | Android presenta Hub como principal | **FALTA** |
| 5 | Entra a Chat | **EXISTE** (incluso sin Hub — vacío) |
| 6 | Crea/recupera Conversation | **EXISTE** (Hub Sessions/HTTP; fricción títulos/sessionKey) |
| 7 | Escribe mensaje | **EXISTE** |
| 8–9 | Gateway + Runtime | **EXISTE** (servidor) |
| 10 | Tool automática | **EXISTE** |
| 11–12 | HITL confirm | **EXISTE PERO TIENE FRICCIÓN** (solo ChatScreen) |
| 13–14 | Resultado + assistant | **EXISTE** |
| 15 | Persistida SQLite | **EXISTE** |
| 16 | Reconnect | **EXISTE** |
| 17 | History rehidrata | **EXISTE** (fallos silenciosos → P1) |

OpenClaw en pasos 2–4: **LEGACY** compitiendo con Hub.

---

## 4. OpenClaw Legacy Audit

| Superficie | Dónde | Acción producto |
|------------|-------|-----------------|
| Default backend | `ConnectionPrefsPolicy`, `ConnectionUiState` | P0: default **HUB** |
| Formulario Connection | campos setup-code, agentId, sessionKey si GATEWAY | P0: ocultar en happy path |
| Selector debug | long-press título | P0: Hub visible; Gateway = “Avanzado”/debug |
| Copy pairing | `openclaw devices approve` | P0: solo si legacy path |
| Settings subtitle | “Gateway, token…” | P0: copy Hub/agente PC |
| `RoutingChatConnection` initial `active = gateway` | hasta primer collect prefs | P0: no asumir gateway |
| `ChatHistorySync` + `HubConversationHistorySync` ambos start | `AgentService` | OK técnico (self-gate); P1: no arrancar legacy si Hub-only |
| Voice / session OpenClaw model | Voice + `PersistedSessionProvider` | P2 / fuera MVP chat |
| Código Gateway* | permanece | **No borrar**; marcar legacy en docs/comments P0 mínimos |

**Objetivo:** OpenClaw puede compilar y usarse en avanzado; **no** aparece en first-run ni en copy principal.

---

## 5. Onboarding Audit

### Falta para el mensaje producto

> “Tu agente vive en tu PC. Este teléfono lo controla.”

| Necesidad | Hoy | Gap |
|-----------|-----|-----|
| Identificar Hub (host:port) | Formulario si backend Hub | First-run no fuerza Connection Hub |
| Auth token | Campo token Hub | Igual |
| Verificar conexión | `probe` + latency | OK |
| Estado Node | **No hay UX** | Messaging honesto P1/41 (health snapshot) |
| Llegar Chat Hub | Tras connect | OK |
| Conversation | Sessions Hub create | Empty chat sin guía P1 |
| Copy soberanía PC | Ausente / “Gateway” | **P0** |

### `AGENT_FILESYSTEM_ROOT`

| Opción | Decisión PHASE 37 |
|--------|-------------------|
| ¿Obligatorio MVP? | **Sí en PC** (operador); no campo Android |
| ¿Default? | No inventar path mágico; exigir en `.env` / runbook |
| ¿UI Android? | **Avanzado / docs**: “En la PC, limita archivos con AGENT_FILESYSTEM_ROOT” — enlace o texto Settings |
| ¿Explicar usuario? | **Sí** en onboarding Connection (una frase) + README |

No implementar Node sandbox ni cambiar agent config en esta fase de plan; producto docs + copy P0/P1.

---

## 6. Connection UX Audit

| Estado | Qué ve hoy | Puede | Recovery | ¿Entrar Chat? | ¿Induce error? |
|--------|------------|-------|----------|---------------|----------------|
| Sin configurar | Chat vacío; “sin configurar” | Ir Settings→Conexión | Configurar | Sí (vacío) | **Sí** — parece producto roto |
| Connecting | “Conectando…” en Connection | Cancelar | Reintentar | N/A en Connection | No |
| Connected + AuthOk | “en línea” | Chatear | — | Sí | No |
| Invalid token | Mensaje error probe/auth | Corregir token | Reconectar | Sí vía Settings | Parcial |
| Reconnecting | banner “Sin conexión con tu hub…” | Cola mensajes | Auto backoff | Sí | Copy OK (Hub-worded) |
| Gateway unavailable | igual reconnect/error | — | — | Sí | OK |
| Node unavailable | **Nada específico** | — | Reiniciar PC (no dicho) | Sí | **Sí** — Tools fallan sin explicación Node |
| MCP unavailable | Solo al boot Gateway (exit 1) — Android no distingue | — | — | — | N/A app |
| Timeout confirm | Sin UI countdown | — | — | — | Ver HITL |

**P0:** first-run → Connection Hub; estados Hub con copy claro.  
**P1:** “Herramientas no disponibles” cuando tools fallan por Node.

---

## 7. HITL UX Audit (solo UX; protocolo intacto)

| Escenario | Hoy | Producto deseado (PHASE 38) |
|-----------|-----|------------------------------|
| `confirm_request` en Chat | `AlertDialog` tool + input | Mantener + countdown |
| Fuera de Chat (Sessions/Settings) | Pending en `ChatStore`; **sin UI** | Banner/diálogo global / notif FGS |
| Cambia Conversation | Pending global; Done misma conv limpia | Banner con Conversation afectada |
| Background | WakeLock en confirm; sin notif de aprobación | Notificación “El agente pide autorización” |
| Expira (60s servidor) | Sin countdown cliente; Done puede limpiar | Contador + “expiró — rechazado” |
| Reject | Botón / dismiss = reject | Igual + toast claro |
| Timeout | Silencioso hacia tool cancel | Mensaje en hilo |
| Entender acción | Muestra `tool` + `input` | Mantener; copy humano P1 |

**PHASE 37:** no implementar HITL global (scope 38). Criterio Hub-first P0 **no** exige cerrar D-34-01 aquí.

---

## 8. Conversation UX Audit

| Tema | Hoy | MVP need |
|------|-----|----------|
| Conversation actual | sessionKey ↔ conversationId Hub | OK |
| Nueva | Sessions Hub HTTP | OK; P1 empty CTA en Chat |
| Recuperar | History sync | OK; P1 loading/error |
| Cambiar | Sessions | OK |
| Eliminar | Sessions (Gateway-shaped) | Hub delete si existe; no inventar |
| Títulos | title ?: id | P1 |
| Empty / loading | Ausente en Chat | P1 |
| Reconnect / errores | Banner + cola | OK / P1 history error |

No inventar Active Workspace ni multi-device.

---

## 9. Product Boundary Audit

| Capa | Responsabilidad | ¿Android invade? |
|------|-----------------|------------------|
| Android | UI, UX, cache DataStore, conexión, presentación, confirm usuario | OK; DataStore = cache (PHASE 32) |
| Gateway | Conversation authority, persistencia, Runtime, policy, confirm waiter, MCP, Node lifecycle | OK |
| Node | FS/process/Excel/tools | OK |

**Mantener fronteras.** Hub-first = presentación/defaults Android, no mover autoridad al teléfono.

---

## 10. Cambios mínimos

### P0 — necesario Hub-first (implementar cuando se autorice)

1. Default `ConnectionBackend.HUB` (prefs vacías + `ConnectionUiState`).  
2. First-run: si `!configured` → navegar a **Connection** (Hub), no Chat vacío como home conceptual.  
3. Connection UI Hub-first: dirección + token + device name; copy “Tu agente vive en tu PC…”.  
4. OpenClaw/Gateway solo sección **Avanzado** (o debugBuild).  
5. Settings / strings: Hub, no “Gateway” en camino feliz.  
6. `RoutingChatConnection`: no fijar `active = gateway` de forma que gane el first paint si prefs dicen Hub (o default Hub).  
7. Tests unitarios prefs/nav/policy actualizados (GATEWAY→HUB first-run).

### P1 — importante, no bloquea Hub-first ship interno

- Empty/loading/error History en Chat  
- CTA “Nueva conversación” en vacío  
- No start `ChatHistorySync` si backend Hub (ahorro)  
- Banner Node/tools unavailable  
- Frase FS root en Settings  
- Countdown confirm (parcial overlap 38)

### P2 — post-MVP

- Borrar/extraer módulo OpenClaw  
- Voice Hub-native  
- Installer/OTA  
- User/ACL / multi-device  
- HITL por voz  

---

## 11. File-level Implementation Plan (P0 only)

| Archivo | Símbolo | Actual | Deseado | Riesgo | Deps | Tests |
|---------|---------|--------|---------|--------|------|-------|
| `ConnectionPrefsPolicy.kt` | `backendFromStored` | default GATEWAY | default **HUB** | Bajo; cambia first-run tests | — | `ConnectionPrefsPolicyTest` |
| `ConnectionViewModel.kt` | `ConnectionUiState.backend` | GATEWAY | HUB | Bajo | policy | unit |
| `ConnectionScreen.kt` | título, campos, selector | Gateway primary; Hub debug | Hub primary; Gateway avanzado | Medio UX | strings | manual + unit si extract |
| `MainActivity.kt` / `AppNav` | Boot LaunchedEffect | siempre Chat | `!configured` → Connection; `configured` → Chat | Medio nav | prefs | unit/nav test si existe |
| `strings.xml` / Settings | copy Gateway | Hub / agente PC | Bajo | — | snapshot opcional |
| `RoutingChatConnection.kt` | `active` inicial | gateway | hub o según prefs sync | Bajo race | prefs flow | unit |
| `AppPreferences` / save paths | — | OK Hub save | sin cambio modelo | — | — | existing |
| Docs README / `.env.example` | agent placeholder; FS root | Alinear onboarding | Bajo | — | — |

**No tocar:** `hub/src/**` Runtime/MCP, `agent/**` tools, protocol, DB, `ConfirmationWaiter`, Workspace store.

---

## 12. Acceptance Criteria (verificables post-implementación)

### Hub-first
- [ ] Abrir app first-run → Connection Hub (o flujo inequívoco Hub), no formulario Gateway  
- [ ] OpenClaw no en camino feliz (solo avanzado/debug)  
- [ ] Tras auth Hub → Chat como home  

### Conversation
- [ ] Usuario llega a Conversation sin jargon MCP/Gateway  
- [ ] History rehidrata tras reconnect (ya existe; no regresión)  

### Connection
- [ ] Estados conectado/reconectando/error con recovery (“Reintentar” / ir a Conexión)  
- [ ] Token inválido mensaje claro  

### HITL (regresión PHASE 37; mejora en 38)
- [ ] Confirm en Chat sigue funcionando  
- [ ] No se empeora D-34-01  

### Onboarding
- [ ] Copy PC + teléfono  
- [ ] FS root mencionado (UI breve o docs enlazadas)  

---

## 13. Test Plan (definir; no implementar salvo arch test)

| Área | Tests |
|------|-------|
| Prefs | first-run → HUB; hub creds → configured |
| Nav | !configured → Connection; configured → Chat |
| Connection UI | Hub fields visibles; Gateway oculto sin avanzado |
| Routing | backend HUB → HubChatConnection |
| OpenClaw isolation | GATEWAY path aún funciona si avanzado |
| HITL | existentes `HubConfirm*` sin rotura |
| History | Hub sync sin regresión |
| Hub routing (servidor) | sin cambios esperados |

UI instrumentation: opcional P1.

---

## 14. Findings A–G

| ID | Finding | Class | Phase |
|----|---------|-------|-------|
| A-37-01 | Chat+Hub auth+History+Tools existen | A | — |
| D-37-01 | Default GATEWAY + selector debug | D | P0 |
| D-37-02 | Boot → Chat sin forzar Connection | D | P0 |
| D-37-03 | Copy/Settings Gateway-oriented | D | P0 |
| D-37-04 | HITL solo ChatScreen | D | PHASE 38 |
| E-37-01 | Sin UX Node unavailable | E | P1/41 |
| E-37-02 | History hydrate silencioso | E | P1 |
| F-37-01 | README agent placeholder; FS root débil | F | P0 docs |
| G-37-01 | Voice/OpenClaw extract | G | P2 |

**B:** ninguno. **C:** ninguno.

---

## 15. Critical Risks

1. Regresión usuarios OpenClaw existentes (mitigar: sección Avanzado + migración prefs `gateway` intacta).  
2. Nav first-run Connection vs Chat-empty (mitigar: tests + back stack claro).  
3. Confundir implementación 37 con HITL 38 (scope creep).

---

## 16. Non-blocking Debt

HITL global, health liveness, empty states, dual syncer always-on, Excel/Windows, voice.

---

## 17. Files created

- `docs/architecture/phase37-hub-first-ux.md`
- `hub/tests/architecture/phase37-hub-first-ux.test.ts`

## 18. Files modified

- `docs/architecture/terminology.md`
- `docs/architecture/boundaries.md`
- `docs/architecture/refactor-plan.md`
- `docs/architecture/phase36-product-definition-and-hub-first-mvp.md` (marcadores)

## 19. Productive code changed

```text
NONE
```

---

## 20. Validation

| Check | Resultado |
|-------|-----------|
| `phase37` + `phase36` arch tests | pass |
| `npm run typecheck` | pass |
| `npm run build` | pass |
| `npm run smoke:package` | pass |
| Android `testDebugUnitTest` + `assembleDebug` | pass |

---

## 21. Final Recommendation

**Autorizar implementación P0 Hub-first** (solo Android UX/prefs/copy/nav + docs mínimas).  
**No** empezar PHASE 38 automáticamente.  
**No** tocar plataforma.

### PHASE 38 (siguiente, no iniciar)

HITL product UX: confirm global / banner / notificación; countdown; claridad reject/timeout — sin PermissionManager ni cambio de protocolo.
