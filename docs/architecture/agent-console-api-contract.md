# Agent Console — API & WebSocket Contract

Hermano de [`phase49-agent-console-product-definition.md`](./phase49-agent-console-product-definition.md).  
Clasificación: **EXISTING | REUSE | REQUIRED | FUTURE**.  
PHASE 49 no implementa APIs. PHASE 50 solo añade **REQUIRED** justificados.

---

## Authentication

| Mecanismo | Clasificación | Notas |
|-----------|---------------|-------|
| WS `auth` `{ token, deviceId, deviceName? }` | EXISTING | `HUB_TOKEN` |
| HTTP `Authorization: Bearer <HUB_TOKEN>` | EXISTING | Workspace/History |
| HTTP session cookie | FUTURE | Opcional same-origin |
| OAuth / User login | FUTURE / non-goal MVP | Sin User/ACL |

---

## HTTP — EXISTING (REUSE)

| Method | Path | Auth | Uso Console |
|--------|------|------|-------------|
| GET | `/health` | Public | Overview snapshot, devices hint |
| GET | `/workspaces` | Bearer | Workspace list |
| POST | `/workspaces` | Bearer | Crear workspace lógico (HTTP) |
| GET/PATCH/DELETE | `/workspaces/:id` | Bearer | CRUD |
| GET | `/workspaces/:id/conversations` | Bearer | Conversations por workspace |
| POST | `/conversations` | Bearer | Nueva Conversation |
| GET | `/conversations/:id` | Bearer | Meta |
| GET | `/conversations/:id/messages` | Bearer | History hydrate |
| GET/PATCH | `/conversations/:id/workspace` | Bearer | Asociación Conversation↔Workspace |

Fuente: `hub/src/http/server.ts`, `hub/src/http/workspace-http.ts`.

---

## WebSocket — EXISTING (REUSE)

Transport: `ws://host:port/ws` — `packages/protocol/PROTOCOL.md`.

| Direction | type | Uso Console |
|-----------|------|-------------|
| C→S | `auth` | Login |
| C→S | `user_message` | Chat send |
| C→S | `confirm_response` | HITL |
| C→S | `ping` | Keepalive |
| S→C | `auth_ok` | Connected |
| S→C | `assistant_chunk` | Streaming |
| S→C | `assistant_done` | Turn end |
| S→C | `confirm_request` | HITL |
| S→C | `error` | Errors |
| S→C | `pong` | Keepalive |

**No** modificar protocolo en PHASE 49.

Tool activity UI: derivar de confirm + streaming + `pending` local (como Android PHASE 42) — **sin** `tool_progress` (FUTURE).

---

## REQUIRED (mínimo para PHASE 50 si falta)

Solo si no se puede completar Overview/First-run/Workspace change con EXISTING + tray:

| ID | Propuesta | Justificación | Alternativa sin API |
|----|-----------|---------------|---------------------|
| R-49-01 | Servir SPA static desde Gateway (same-origin) o CORS allowlist LAN | Browser Console | Abrir file:// no viable |
| R-49-02 | `GET /agent/status` enriquecido **opcional** | Overview más claro | Usar `/health` + copy de límite snapshot |
| R-49-03 | `POST /host/workspace` `{ path }` validate+persist FS root | Cambiar workspace desde Web | First-run solo en tray (OS folder picker) |
| R-49-04 | `POST /host/restart` | Restart desde Diagnostics | Solo tray Restart |
| R-49-05 | `GET /host/config` redacted + `PUT` secrets write-only | Configuration UI | Config solo tray |

**Preferencia PHASE 50:** maximizar REUSE; implementar R-49-01 (serving/CORS) casi seguro; R-49-03/04/05 solo si se prioriza admin Web sobre tray.

**No** REQUIRED: User model, live Node ping, tool catalog protocol, QR identity.

---

## FUTURE

| Item | Nota |
|------|------|
| `tool_progress` WS | Protocol reserved |
| Live Node liveness | E-47-02 |
| Conversation rename HTTP | Si no existe hoy |
| Log tail API | Diagnostics remoto |
| TLS / remote access | Internet |
| Device revoke | Connections admin |

---

## /health field map → Overview

| Field | Overview row | Precisión |
|-------|--------------|-----------|
| `ok` | Gateway reachable | Live HTTP |
| `agentReady` | Node/MCP boot | **Snapshot boot** |
| `agentTools` | Tools available (count/names) | **Snapshot boot** |
| `devices` | Connected clients hint | Live WS sessions |
| (missing) | Workspace path | Config Host / REQUIRED |
| (missing) | Database ok | Infer from History call or FUTURE |

---

## Capability catalog

| Fuente | Clasificación |
|--------|---------------|
| Static MVP list (mirror PHASE 41) | REUSE concept / REQUIRED copy en TS |
| Live tools/list to client | FUTURE (no protocol today) |
| `/health.agentTools` | REUSE hint only |

---

## Security notes for API consumers

- Nunca loguear Bearer/token.
- Sanitizar `confirm_request.input` en UI (como `HubConfirmUx`).
- `/health` público: no añadir secretos; `devices`/`agentTools` ya son E-33-02 debt — no empeorar.
