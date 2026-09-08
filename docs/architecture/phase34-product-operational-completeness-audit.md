# PHASE 34 — Product Operational Completeness Audit

**Estado:** PHASE 34 CLOSED / AUDIT ONLY  
**Fecha:** 2026-08-25.

**Decisión:** **READY WITH DEBT**

El Single Node es **operacionalmente usable** para un hogar/instalación: arranque fail-closed, packaging smoke, Conversation recuperable (PHASE 32), HITL Android (PHASE 28), Tools reales (PHASE 29), perímetro de seguridad coherente (PHASE 33).

No está “completo” como producto pulido: health es snapshot, shutdown puede bloquearse con WS, sin instalador nativo, sin updates, observabilidad = stderr, HITL solo con Chat visible, README parcialmente desactualizado, `AGENT_FILESYSTEM_ROOT` opcional debilita contención en first-run.

**PHASE 35 CLOSED** (ver [`phase35-mvp-readiness-and-architecture-exit.md`](./phase35-mvp-readiness-and-architecture-exit.md)). Código productivo PHASE 34: **NONE**.  
**PHASE 36 NOT STARTED.**

---

## 1. Executive Summary

| Dimensión | Estado |
|-----------|--------|
| First-run (dev) | **A** con **F** (docs) |
| Startup fail-closed | **A** |
| Config (.env) | **A** |
| Health | **E** (snapshot) |
| Shutdown | **E** (WS puede bloquear close) |
| Packaging / smoke | **A** |
| Installer / update | **G** |
| Observabilidad | **E** / **D** |
| Android connect + chat | **A** con **D** residuales |
| Conversation recovery | **A** (PHASE 32) |
| Tools + HITL | **A** / **D** (HITL solo ChatScreen) |
| Seguridad operativa | **A** (PHASE 33) |

**B:** ninguno operativo bloqueante. **C:** ninguno (heredado PHASE 33).

---

## 2. First-run experience

```text
cp hub/.env.example hub/.env
npm run install:all
npm run hub / npm run dev
→ spawn Node → MCP → tools/list → SQLite migrate → HTTP/WS READY
→ Android ConnectionScreen → auth → Conversation → Tools
```

| Paso | Evidencia | Veredicto |
|------|-----------|-----------|
| Env requerido | `config.ts` `ANTHROPIC_API_KEY`, `HUB_TOKEN` | **A** — fail fast |
| Deps | `install:all` | **A** |
| Spawn Node | `index.ts` → `attachLocalAgent` | **A** |
| Handshake fail | exit 1, no READY | **A** (PHASE 26) |
| Migrations | `runMigrations()` en `startServer` | **A** |
| First Conversation | POST o WS ensureConversation | **A** |
| First tool confirm | ChatScreen diálogo | **A** si Chat abierto |
| `AGENT_FILESYSTEM_ROOT` omitido | tools sin root → legacy path | **E-34-01** / **D** |

Smoke empaquetado (`HUB_HANDSHAKE_ONLY`) demuestra first-run de Node sin Anthropic.

---

## 3. Startup

Orden real (`hub/src/index.ts`):

1. AgentDefinition + empty ToolRegistry  
2. `attachLocalAgent` (spawn + initialize + tools/list + policy)  
3. Si falla → `process.exit(1)`  
4. LLM + Runtime + SQLite memory + Workspace store  
5. `startServer` → migrations + HTTP + WS  
6. `[hub] READY`

Fail-closed correcto. Sin respawn. **A-34-01.**

---

## 4. Configuration

| Variable | Obligatorio | Consumidor |
|----------|-------------|------------|
| `ANTHROPIC_API_KEY` | sí (arranque completo) | Gateway LLM |
| `HUB_TOKEN` | sí | WS + HTTP |
| `HUB_PORT` | no (8787) | HTTP/WS |
| `AGENT_FILESYSTEM_ROOT` | no | Node via spawn |
| `HUB_HANDSHAKE_ONLY` | no | smoke |

`.env.example` documenta lo esencial. **A-34-02.** Falta guía “producción mínima” (**F-34-01**).

---

## 5. Installation

| Modo | Estado |
|------|--------|
| Dev monorepo | Documentado README | **A** |
| `npm run package` → `dist/` | Launchers + sqlite + migrations | **A** |
| Requisito Node 22+ | `dist/README.txt` | **A** / **F** (README raíz no lo enfatiza igual) |
| Instalador OS nativo | Ausente | **G-34-01** |
| Docker | Ausente | **G-34-02** |
| CI workflows | Ausente | **E-34-02** |

README raíz aún dice `agent/` = “placeholder Fase 4” — **F-34-02** desactualizado.

---

## 6. Update / migration

| Área | Comportamiento |
|------|----------------|
| SQLite | Migraciones ordenadas `_migrations` | **A** |
| Rollback | No | **G** |
| App Android | Store/manual APK; sin OTA producto | **G-34-03** |
| Protocolo | Aditivo v1 | **A** |
| Dist recreate | Operador vuelve a `package` | **A** / **D** |

Sin story de upgrade guiado. **E/G.**

---

## 7. Errors (operador / usuario)

| Capa | Qué ve el usuario |
|------|-------------------|
| Startup fail | stderr Hub; proceso no READY | **A** |
| HTTP | `{ error: { code, message } }` | **A** |
| WS | `error` codes protocol | **A** |
| Tool | LLM + burbuja error Android | **A** / **D** genérico |
| Node death | tool fail; health stale | **E** (health) |
| Confirm timeout | tool cancelled; UX Chat | **D** si Chat no visible |

Sin panel de diagnóstico operador. **E-34-03.**

---

## 8. Observability

| Señal | Existe |
|-------|--------|
| stderr logs Hub/Agent | sí |
| Structured logging | no |
| Metrics / tracing | no |
| Version en `/health` | no |
| Correlation turnId | no |

**E-34-04.** Suficiente para Single Node doméstico; insuficiente para flota.

---

## 9. Logs

Hub: connect/disconnect deviceId, READY, migraciones, errores agent.  
Android: estados conexión, no token.  
**A** (PHASE 33). Sin log rotation/producto (**E**).

---

## 10. Health

```text
GET /health → { ok, name, devices, agentReady, agentTools }
```

- Público (PHASE 33 **E**).  
- `agentReady` = snapshot de boot; Node death no lo apaga (**E-34-05**, PHASE 26/27).  
- Útil para “¿arranqué?”; no para “¿vivo ahora?”.

---

## 11. Shutdown

```text
SIGINT/SIGTERM → http.close → agent.shutdown → exit(0)
```

`http.close` espera conexiones HTTP; WSS puede impedir cierre limpio (**E-34-06**, PHASE 27). Turnos in-flight no se drenan explícitamente (**E-34-07**). Agent hijo se cierra (smoke verifica pid muerto).

---

## 12. Android operational completeness

| Capacidad | Estado |
|-----------|--------|
| ConnectionScreen (Hub address/token) | **A** |
| FGS + reconnect | **A** |
| Chat + streaming | **A** |
| HITL confirm UI | **A** si ChatScreen activo; **D-34-01** si no |
| Workspace selector | **A** |
| History rehydrate Hub | **A** (PHASE 32) |
| Hub vs Gateway legacy same UI | **D-34-02** |
| Battery/Doze guidance | parcial (ConnectionScreen) | **D/E** |
| allowBackup | **E** (PHASE 33) |

---

## 13. Gateway operational

Proceso único: HTTP+WS+Runtime+SQLite+MCP client. Spawn Node. Fail-closed. **A-34-03.**

---

## 14. Local Node operational

Hijo stdio; env filtrado; extensions estáticas; Excel Windows opcional. Sin root → legacy FS (**E-34-01**). Arranque aislado `node agent.cjs` posible (docs package). **A** con deuda root.

---

## 15. MCP operational

stdio only; discovery en boot; sin reconnect MCP. Node death → tools fail-closed. **A.**

---

## 16. Workspace / Conversation ops

CRUD HTTP; association; History API; Android rehydrate; SET NULL. **A** (PHASE 20–32). Multi-device sin lock = **G** (PHASE 31).

---

## 17. Tools / HITL ops

14 tools; policy; confirm path Android cableado. Gaps: schema LLM genérico (**E-29-01**); HITL solo Chat (**D-34-01**); MCP timeout no aborta Node (**E-29-02**); tool transcript no SQLite (**E-31-05**).

---

## 18. Persistence ops

SQLite WAL + migrations + Conversation/Messages/Workspaces. DB bajo `hub/data` (dev) / relativo a `hub.cjs` (package). Backup DB = responsabilidad operador (**F/G**).

---

## 19. Packaging ops

`build` → `package` → `smoke:package` (handshake + tools/list + filesystem.read). Sin Anthropic en smoke. **A-34-04.** No SEA/instalador.

---

## 20. Recovery ops

| Escenario | Recuperación |
|-----------|--------------|
| Gateway restart | SQLite + reattach Node | **A** |
| Android restart | sessionKey + History API | **A** |
| WS drop mid-turn | History post-reconnect | **A** / **D** UX |
| Node death | fail-closed; restart Gateway | **A** |
| Confirm mid-death | cancel | **A** |

---

## 21. UX completeness (producto)

Usable: chat, voice (roadmap), workspace, confirm, tools.  
Incompleto: onboarding “token=casa”, health live, HITL fuera de Chat, Gateway legacy confusion, first-run sin filesystem root, sin update UX.

---

## 22. Documentation completeness

| Doc | Gap |
|------|-----|
| README | agent “placeholder”; poco package/Node 22 | **F-34-02** |
| dist/README.txt | bueno para package | **A** |
| .env.example | bueno | **A** |
| architecture phases 25–33 | sólidos | **A** |
| Runbook operador | ausente | **F-34-03** |

---

## 23. Test coverage (ops)

| Cubierto | Gap |
|----------|-----|
| lifecycle-9a, smoke:package | E2E Anthropic+dispositivo |
| History/routing arch | Update/install |
| HITL protocol Android | HITL con Chat background |
| safe-path, env Node | Health liveness |

---

## 24. Attack/ops scenarios (operacionales)

| Escenario | Resultado | Class |
|-----------|-----------|-------|
| Arranque sin .env | exit 1 | A |
| Arranque Node missing | exit 1 | A |
| Node muere en runtime | tools fallan; health stale | E |
| Shutdown con WS abierto | posible hang | E |
| First-run sin FS root | tools más permisivas | E/D |
| Usuario solo Gateway legacy UI | no History Hub | D |
| Confirm con Chat cerrado | timeout | D |

---

## 25. Findings A–G

| ID | Finding | Classification | Severity | Evidence | Code required |
| -- | ------- | -------------- | -------- | -------- | ------------- |
| A-34-01 | Startup fail-closed | A | — | index.ts, attach-agent | No |
| A-34-02 | Config .env mínima clara | A | — | config.ts, .env.example | No |
| A-34-03 | Gateway Single Node operable | A | — | hub/ | No |
| A-34-04 | Packaging + smoke | A | — | package.mjs, smoke-package | No |
| A-34-05 | Conversation recovery end-to-end | A | — | PHASE 32 | No |
| D-34-01 | HITL solo con ChatScreen | D | Med | ChatScreen, PHASE 29 | Sí (opcional) |
| D-34-02 | Hub/Gateway legacy misma UI | D | Low | SessionsScreen | Docs/UX |
| E-34-01 | AGENT_FILESYSTEM_ROOT opcional | E | Med | agent config, filesystem | Opcional |
| E-34-02 | Sin CI | E | Low | no .github/workflows | Futuro |
| E-34-03 | Sin panel diagnóstico | E | Low | — | Futuro |
| E-34-04 | Observabilidad = stderr | E | Med | — | Futuro |
| E-34-05 | health snapshot | E | Med | server.ts, PHASE 26 | Opcional |
| E-34-06 | Shutdown bloqueable por WS | E | Med | index.ts close | Opcional |
| E-34-07 | Sin drain de turnos al shutdown | E | Low | ws.ts | Opcional |
| F-34-01 | Guía producción mínima | F | Low | — | Docs |
| F-34-02 | README agent placeholder | F | Low | README.md | Docs |
| F-34-03 | Runbook operador ausente | F | Low | — | Docs |
| G-34-01 | Instalador nativo | G | — | roadmap | Futuro |
| G-34-02 | Docker | G | — | — | Futuro |
| G-34-03 | OTA / update Android | G | — | — | Futuro |

**B:** ninguno. **C:** ninguno.

---

## 26. Critical operational risks

Ninguno bloqueante tipo B/C.

Riesgos operativos (deuda):

1. Operador no pone `AGENT_FILESYSTEM_ROOT` → FS tools menos contenidas.  
2. Health dice READY mientras Node ya murió.  
3. Shutdown colgado por WS.  
4. HITL timeout si el usuario no está en Chat.

---

## 27. Non-blocking debt

E-34-*; D-34-*; F-34-*; G-34-*; más deudas PHASE 29–33 (tool schema, tool transcript, allowBackup, TLS, multi-device).

---

## 28. What is already complete enough

- Arranque Single Node fail-closed  
- Auth instalación  
- Conversation + History + Workspace  
- Tools + confirm Android  
- Packaging smoke  
- Security perimeter PHASE 33  

---

## 29. What is not product-complete yet

- Instalador / update  
- Live health  
- Observabilidad estructurada  
- HITL fuera de Chat  
- Onboarding/docs first-run producción  
- CI  

---

## 30. Files created

- `docs/architecture/phase34-product-operational-completeness-audit.md`
- `hub/tests/architecture/phase34-product-operational-completeness-audit.test.ts`

---

## 31. Files modified

- `docs/architecture/terminology.md`
- `docs/architecture/boundaries.md`
- `docs/architecture/refactor-plan.md` (si aplica)

---

## 32. Productive code changed

```text
NONE
```

---

## 33–36. Validation

| Check | Resultado |
|-------|-----------|
| `phase34` + `phase33` arch tests | pass |
| `npm run typecheck` | pass |
| `npm run build` | pass |
| `npm run smoke:package` | pass |
| Android `testDebugUnitTest` + `assembleDebug` | pass |

---

## 37. Final recommendation

> **¿El producto Single Node está operacionalmente completo para uso real?**

**Sí, para uso doméstico Single Node con operador técnico**, con deuda de pulido.  
**No**, como producto “llave en mano” (instalador, updates, health live, onboarding).

> **¿Existe B/C que deba corregirse antes de continuar?**

**No.**

```text
READY WITH DEBT
```

Candidatos de corrección (solo con autorización): docs README/runbook (**F**); default/require `AGENT_FILESYSTEM_ROOT` (**E**); health liveness (**E**); shutdown WS (**E**); HITL fuera de Chat (**D**).

PHASE 35 **CLOSED** — ver [`phase35-mvp-readiness-and-architecture-exit.md`](./phase35-mvp-readiness-and-architecture-exit.md).  
PHASE 36 **NOT STARTED**.
