# PHASE 50 — Agent Console Web MVP Implementation

**Estado:** PHASE 50 CLOSED  
**Fecha:** 2026-08-27  

**Decision:** **READY WITH DEBT**

**Productive code changed:** **YES**

Madurez:

| Capa | Estado |
|------|--------|
| Agent Console Web MVP | **implemented** |
| Same-origin static (R-49-01) | **implemented** |
| Field Windows/LAN/Android | **NOT TESTED** |
| Host admin APIs R-49-03–05 | **FUTURE** |

---

## 1. Audit (EXISTING / REUSE / MODIFY / CREATE / NOT NEEDED)

| Área | Clasificación | Notas |
|------|---------------|-------|
| Frontend Web SPA | **CREATE** `web/` | No existía Vite/React Console |
| `desktop/` Electron | **EXISTING / NOT NEEDED** para Console | Conservado; no pantallas nuevas equivalentes |
| HTTP `/health`, workspaces, conversations, messages | **REUSE** | Overview, Conversations, History |
| WS protocol auth/chat/HITL | **REUSE** | Sin frames nuevos |
| Hub static SPA serve | **CREATE** (R-49-01) | `resolveConsoleStaticRoot` + `serveStatic` |
| CORS producción abierta | **NOT NEEDED** | Same-origin preferido |
| CORS Vite dev | **CREATE** opcional | `AGENT_CONSOLE_DEV_ORIGIN` |
| R-49-02 `/agent/status` | **NOT NEEDED** ahora | `/health` + copy snapshot |
| R-49-03/04/05 Host admin APIs | **FUTURE** | Documentado en Settings/Workspace |
| PermissionManager / Runtime / MCP in Web | **NOT NEEDED** | Prohibido |
| Protocol change | **NOT NEEDED** | |

---

## 2. Arquitectura

```text
Browser (Agent Console)
   ↓ HTTP Bearer + WS auth (HUB_TOKEN)
Agent Host / Gateway (hub/)
   ↓ Policy / ConfirmationWaiter / Runtime
MCP → Tools → PC
```

- **Agent Console** = cliente en `web/` (Vite + React + TypeScript).
- **Agent Host** = autoridad (auth, policy, confirmaciones, Runtime, MCP).
- UI no ejecuta filesystem/process/MCP.

Estructura:

```text
web/
├── src/app shell + features/
├── api/          HTTP client
├── websocket/    HubSocket (protocol existing)
├── state/        session + AppContext
├── lib/          capabilities, sanitize, toolActivity
└── styles/
```

---

## 3. APIs

| API | Clasificación |
|-----|---------------|
| `GET /health` | Existing / Reused |
| Workspace + Conversation HTTP | Existing / Reused |
| `GET .../messages` | Existing / Reused |
| Static `/` Agent Console | **New** (serving only) |
| Dev CORS allowlist | **New** (dev only) |
| `POST /host/workspace` etc. | **Future** |

---

## 4. WebSocket

Reutilizado: `auth`, `user_message`, `assistant_chunk`, `assistant_done`, `confirm_request`, `confirm_response`, `ping`/`pong`, `error`.

Tool activity: derivado localmente (como PHASE 42), sin `tool_progress`.

---

## 5. Auth / Security

- `HUB_TOKEN` vía Bearer HTTP y frame `auth` WS.
- Token en `sessionStorage` (sesión de pestaña); UI muestra `maskToken`.
- Nunca en URL/query.
- Sanitización de `confirm_request.input` y diagnostics.
- No secrets en UI (`ANTHROPIC_API_KEY`, token completo).

---

## 6. Serving (R-49-01)

Preferido:

```text
Agent Host
 ├── /health, /workspaces, /conversations
 ├── /ws
 └── static Agent Console (web/dist o dist/web)
```

Override: `AGENT_CONSOLE_STATIC=/path/to/dist`.

Dev Vite: proxy en `web/vite.config.ts`; CORS solo si `AGENT_CONSOLE_DEV_ORIGIN` está definido.

**LOCAL** y **LAN** en alcance. **INTERNET** — FUTURE.

---

## 7. Build

```bash
npm install --prefix web
npm run build --prefix web   # → web/dist
# opcional: scripts/smoke-web.mjs copia a dist/web
```

Root: `npm run build:web` / `npm run smoke:web`.

Hub busca `web/dist` o `dist/web` relativo al cwd.

---

## 8. Tests

- `web/tests/*.test.ts` — unit (capabilities, sanitize, WS URL, HTTP base).
- `hub/tests/architecture/phase50-agent-console-web.test.ts` — fronteras.
- Integration profunda Hub+WS: cubierta por tests Hub existentes + smoke build; E2E browser **NOT field-tested**.

---

## 9. Limitations / debt

| ID | Deuda |
|----|-------|
| D-50-01 | Path FS `AGENT_FILESYSTEM_ROOT` no en HTTP — Workspace UI solo workspaces lógicos |
| D-50-02 | Restart / config Host (R-49-03–05) no implementados |
| D-50-03 | Node/MCP status = boot snapshot (no live) |
| D-50-04 | Conversations list depende de workspaces; huérfanas pueden no listarse hasta create |
| D-50-05 | Electron tray consolidation — PHASE 51+ |
| D-50-06 | Field Windows/LAN/Android — NOT TESTED |

`desktop/` **no eliminado**.

---

## 10. Next phase (NO iniciar)

**PHASE 51 — Windows Installer + Agent Console Integration + Real Installation Validation**

```text
Windows clean machine → Setup.exe → First Run → Host READY → Console → Android pairing → field test
```

---

## 11. Product diagram

```text
                 PERSONAL AGENT
                       │
             ┌─────────┴─────────┐
             │                   │
      AGENT CONSOLE            ANDROID
          WEB                  MOBILE
             │                   │
             └─────────┬─────────┘
                       │
                  AGENT HOST
```
