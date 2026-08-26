# PHASE 33 — Security & Product Isolation Audit

**Estado:** PHASE 33 CLOSED / AUDIT ONLY  
**Fecha:** 2026-08-25.

**Decisión:** **READY WITH DEBT**

Single Node tiene fronteras de seguridad **claras y coherentes** con el modelo de producto:

```text
HUB_TOKEN = identidad de instalación (hogar)
```

No hay User/ACL; quien posee el token es dueño de la instalación. No se encontró **C** explotable ni **B** de aislamiento entre Conversations/Workspaces en el código actual.

**PHASE 34 CLOSED** (ver [`phase34-product-operational-completeness-audit.md`](./phase34-product-operational-completeness-audit.md)). Código productivo PHASE 33: **NONE**.  
**PHASE 35 NOT STARTED.**

---

## 1. Executive Summary

| Área | Veredicto |
|------|-----------|
| Auth HTTP/WS | **A** — Bearer / WS `auth` + timing-safe |
| `/health` público | **A** (intencional) + **E** (lista `agentTools`/`devices`) |
| Conversation isolation (history/stream) | **A** (PHASE 32) |
| Workspace isolation + SET NULL | **A** |
| Confirmation ≠ authorization | **A** — Session binding + frozen input |
| Tool policy deny-by-default | **A** |
| MCP stdio-only | **A** |
| Node env without Gateway secrets | **A** (PHASE 28) |
| Filesystem root containment | **A** (+ **E** TOCTOU documentado) |
| `process.execute` | **A** deliberado + confirm; no C |
| `HUB_TOKEN` en Android DataStore + `allowBackup` | **E** hardening |
| Arbitrary `conversationId` con token | **A** / **G** — modelo instalación |

---

## 2. HUB_TOKEN audit

### Origen / consumo

| Sitio | Rol |
|-------|-----|
| `hub/.env` / `HUB_TOKEN` | Gateway (`config.ts` `required`) |
| WS `auth.token` | `ws.ts` `tokenMatches` timing-safe |
| HTTP `Authorization: Bearer` | `workspace-http.ts` `requireAuth` |
| Android DataStore `hub_token` | `AppPreferences.saveHubConfig` |
| Cliente npm | `@mxideass/workspace-http` |

### Qué protege

HTTP Workspace/Conversation/History (todos salvo `/health`), WS completo post-auth, confirmaciones (vía Session autenticada).

### Exposición

| Canal | ¿Token visible? |
|-------|-----------------|
| Logs Hub | **No** — solo deviceId conectado/desconectado |
| Logs Android HubClient | **No** — no loguea el valor del token |
| Respuestas HTTP/WS | **No** |
| Query/URL | **No** — Bearer header / WS body |
| SQLite | **No** |
| Paquete `dist/` | **No** secretos embebidos (`.env` no se copia) |

### Android

Token en Preferences DataStore. Sobrevive restart. `AndroidManifest` `allowBackup="true"` → backup del sistema **podría** incluir el token (**E-33-01**).

---

## 3. HTTP security

### Inventario real (`server.ts` + `workspace-http.ts`)

| Método | Path | Auth |
|--------|------|------|
| GET | `/health` | **público** |
| GET | `/workspaces` | Bearer |
| POST | `/workspaces` | Bearer |
| GET | `/workspaces/:id` | Bearer |
| PATCH | `/workspaces/:id` | Bearer |
| DELETE | `/workspaces/:id` | Bearer |
| GET | `/workspaces/:id/conversations` | Bearer |
| POST | `/conversations` | Bearer |
| GET | `/conversations/:id` | Bearer |
| GET | `/conversations/:id/messages` | Bearer |
| GET | `/conversations/:id/workspace` | Bearer |
| PATCH | `/conversations/:id/workspace` | Bearer |

Auth ausente / vacío / incorrecto / malformado → **401**. Correcto → procede.

`/health` expone `devices[]`, `agentReady`, `agentTools[]` (**E-33-02** info disclosure LAN).

---

## 4. HTTP input validation

IDs/strings validados por tipo (string/null). JSON inválido → 400. Workspace inexistente → 404. Sin límites de tamaño de title/body (**E-33-03**). No eleva a C sin DoS demostrable en Single Node.

---

## 5. HTTP error leakage

Errores: `{ error: { code, message } }` controlados. Sin stack traces al cliente. Runtime loguea `console.error` del error interno en servidor (**E-33-04** — solo logs locales).

---

## 6. WebSocket security

| Check | Evidencia |
|-------|-----------|
| Auth obligatoria primero | `ws.ts`: no-auth → `auth_required` + close |
| Token timing-safe | `tokenMatches` |
| Mensajes pre-auth | Rechazados |
| `conversationId` arbitrario | Permitido con token válido — **modelo instalación** (**A-33-01**) |
| `busy` | Un turno por Session |
| Confirm binding | Session/device; no payload redefine operación |

---

## 7. Conversation isolation

| Canal | Aislamiento |
|-------|-------------|
| History API | `WHERE conversation_id = ?` |
| Stream PHASE 32 | `conversationId` en chunk/error/done |
| Android ChatThreads | Partición por sessionKey |
| Confirm | Pending por Session WS |

**A-33-02:** No cross-talk history/stream entre A y B en diseño actual.

---

## 8. Workspace isolation

Listado `GET /workspaces/:id/conversations` filtra por `workspace_id`. Resolve GET workspace por Conversation. DELETE → `ON DELETE SET NULL`; Messages/Conversation sobreviven. **A-33-03.**

---

## 9. History API security

Auth Bearer; 404 inexistente; 200 []; casual OK; post-DELETE Workspace history sigue (**correcto**). Mismo token → cualquier Conversation de la instalación (**A/G**, no C).

---

## 10. Confirmation security

| Caso | Comportamiento |
|------|----------------|
| Approve/reject | Session-bound |
| Duplicate / stale | Fail-closed |
| Wrong Session | Pending intacto |
| Node death | `cancelAllConfirmations` |
| Switch Conversation | Pending atado a Session, no a Conversation persistida |
| Reconnect | Pending perdido (RAM) |

`toolPolicy` decide *si* puede pedir confirm; confirmation **no** sustituye policy. **A-33-04.**

---

## 11. Tool security

| Tool | Mode | Notas |
|------|------|-------|
| filesystem.read/list | automatic | Contained by root |
| filesystem.write | confirm | Contained |
| process.execute | confirm | `shell: false`; argv libre tras confirm (**A** producto local) |
| office.excel.* | read auto / write confirm | COM Windows |
| system.info | automatic | Sin `process.env` |
| math.*, echo, diagnostics, customer.demo | automatic | Sin side effect OS |

---

## 12. Tool policy

Deny-by-default (`DEFAULT_TOOL_POLICY`). Discovery omite tools sin policy. Runtime solo ve registry filtrado. **A-33-05.**

---

## 13. MCP boundary

`StdioClientTransport` — pipes padre/hijo. Sin `listen` HTTP MCP en Node. Tercero externo **no** habla MCP sin acceso al proceso local. **A-33-06.**

---

## 14. Node environment

`childEnvForLocalNode`: allowlist OS + `AGENT_FILESYSTEM_ROOT`; bloquea `HUB_TOKEN` / `ANTHROPIC_*` / patrones secret. Tests `mcp-stdio-env.test.ts`. **A-33-07.**

---

## 15. Filesystem security

`resolveSafePath`: rechazo `..`, absolutos fuera, symlinks fuera. Tests `safe-path.test.ts`. TOCTOU documentado en comentarios → **E-33-05** (atacante local concurrente).

---

## 16. process.execute

Confirm obligatorio en policy. `spawn(..., { shell: false })`. cwd bajo root. Usuario **puede** aprobar `bash -c '…'` → poder local deliberado del Agent doméstico, **no C** respecto al contrato Single Node (**A-33-08** / **G** si se quiere sandbox OS).

---

## 17. Excel / COM

Write = confirm. Lifecycle en Agent; fallos no rompen Conversation Gateway. Sin capa extra Office. **A** + **E** residual Windows.

---

## 18. Android security

Token en DataStore (no en logs HubClient). `conversationId` = identificador, no secreto. `allowBackup=true` → **E-33-01**. TLS: cliente puede usar `ws://`/`http://` (**E-33-06** LAN).

---

## 19. Logging

Hub: deviceId, no token. Android: tipos de mensaje, no payloads auth. Runtime: error interno en stderr. **A** con **E-33-04**.

---

## 20. SQLite

Queries parametrizadas (`?`). FK ON. WAL. Sin concatenación de IDs de usuario en SQL. **A-33-09.**

---

## 21. Packaging

`package.mjs` copia JS + better-sqlite3 + migrations + launchers. **No** `.env`. Secretos vía entorno en runtime. **A-33-10.**

---

## 22. Configuration

| Secreto/config | Dónde |
|----------------|-------|
| `ANTHROPIC_API_KEY` | Gateway only |
| `HUB_TOKEN` | Gateway + clientes |
| `AGENT_FILESYSTEM_ROOT` | Node (vía spawn) |
| model/prompt/policy | AgentDefinition memoria |

Sin duplicación de API key al Node. **A-33-11.**

---

## 23. Dependency/supply

Sin tooling CVE en repo. Dependencias MCP/Anthropic/Hono/ws/better-sqlite3 esperadas. Scripts build/package sin postinstall sospechoso. **A** / **G** auditoría CVE externa.

---

## 24. Attack scenarios

| ID | Acción | Resultado | Class |
|----|--------|-----------|-------|
| S1 | Sin token | 401 / WS close | A |
| S2 | Con token | Acceso instalación | A |
| S3 | conversationId arbitrario | Accede si existe o se crea | A/G |
| S4 | Workspace inexistente | 404 | A |
| S5 | History arbitraria | 404 o datos instalación | A |
| S6 | Confirm ajena | Fail-closed | A |
| S7 | Path escape | path_outside_root | A |
| S8 | Tool → secretos Gateway | Env Node limpio | A |
| S9 | Node → API key | No en env | A |
| S10 | MCP red | Solo stdio | A |
| S11 | Switch mid-stream | Enruta por conversationId | A |
| S12 | Gateway restart | Confirm RAM lost; SQLite OK | A |
| S13 | Node death mid-confirm | cancelAll | A |
| S14 | Payload malformed | 400 / bad_message | A |

---

## 25. Findings A–G

| ID | Finding | Classification | Severity | Evidence | Code required |
| -- | ------- | -------------- | -------- | -------- | ------------- |
| A-33-01 | Token = identidad instalación; conversationId libre con token | A | — | `ws.ts`, docs PHASE 27/31 | No |
| A-33-02 | Isolation Conversation history/stream | A | — | History API, PHASE 32 | No |
| A-33-03 | Workspace list/SET NULL | A | — | schema, workspace-http | No |
| A-33-04 | Confirmation Session-bound ≠ policy | A | — | confirmation-waiter, runtime | No |
| A-33-05 | Policy deny-by-default | A | — | tool-policy.ts, discover | No |
| A-33-06 | MCP stdio only | A | — | mcp-stdio.ts | No |
| A-33-07 | Node env sin secretos Gateway | A | — | childEnvForLocalNode | No |
| A-33-08 | process.execute confirm + shell:false; poder local deliberado | A | — | process-execute.ts | No |
| A-33-09 | SQL parametrizado | A | — | history.ts, conversation-workspace | No |
| A-33-10 | Package sin .env | A | — | package.mjs | No |
| A-33-11 | Config boundaries correctas | A | — | config.ts, AgentDefinition | No |
| E-33-01 | Android allowBackup puede incluir hub_token | E | Low | AndroidManifest.xml | Opcional |
| E-33-02 | /health lista devices + agentTools | E | Low | server.ts | Opcional |
| E-33-03 | Sin límites tamaño body/title | E | Low | workspace-http | Opcional |
| E-33-04 | console.error runtime puede loguear detalle interno | E | Low | runtime.ts | Opcional |
| E-33-05 | TOCTOU filesystem documentado | E | Low | safe-path.ts | No urgente |
| E-33-06 | ws://http:// sin forzar TLS | E | Low | HubClient | Producto LAN |
| G-33-01 | User/ACL/ownership multi-usuario | G | — | modelo actual | Futuro |
| G-33-02 | Sandbox OS para process.execute | G | — | — | Futuro |
| F-33-01 | Documentar amenaza «token = casa» en onboarding | F | Low | — | Docs |

**B:** ninguno. **C:** ninguno.

---

## 26. Critical security risks

**Explotables (C):** ninguno identificado.

**Hardening (E):** backup Android, health info, TLS opcional, body limits, TOCTOU.

**Producto futuro (G):** multi-usuario, sandbox process.

---

## 27. Non-blocking debt

E-33-01 … E-33-06; F-33-01; G-33-01/02. Deuda previa: E-31-05 tool transcript, G-31-01 multi-device.

---

## 28. Files created

- `docs/architecture/phase33-security-product-isolation-audit.md`
- `hub/tests/architecture/phase33-security-product-isolation-audit.test.ts`

---

## 29. Files modified

- `docs/architecture/terminology.md`
- `docs/architecture/boundaries.md`
- `docs/architecture/refactor-plan.md` (si aplica)

---

## 30. Productive code changed

```text
NONE
```

---

## 31–35. Validation

Ver informe de cierre en respuesta al usuario (typecheck/build/smoke/Android).

---

## 36. Final recommendation

> **¿Existe alguna vulnerabilidad C real?**  
**No.**

> **¿Existe algún bug B que afecte seguridad o aislamiento?**  
**No.**

> **¿El Single Node tiene fronteras suficientemente claras para seguir evolucionando?**  
**Sí.** Auth de instalación, policy, confirm, filesystem root, MCP stdio y env Node forman un perímetro coherente.

> **¿Qué debe corregirse antes de seguir, si algo?**  
**Nada bloqueante.** Hardening opcional: `allowBackup`, reducir `/health`, TLS en despliegues no-LAN.

```text
READY WITH DEBT
```
