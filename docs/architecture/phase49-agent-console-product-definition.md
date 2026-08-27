# PHASE 49 — Agent Console Product Definition & Architecture

**Estado:** PHASE 49 CLOSED / DESIGNED  
**Fecha:** 2026-08-27.

**Decision:** **READY FOR IMPLEMENTATION**

**Productive code changed:** **NONE**

**Madurez:**

| Capa | Estado |
|------|--------|
| Definición de producto | **designed** |
| Frontend web | **not implemented** |
| APIs nuevas | **specified only** (REQUIRED list) |
| Field test | **not field tested** |

Documentos hermanos:

- [`agent-console-navigation.md`](./agent-console-navigation.md)
- [`agent-console-api-contract.md`](./agent-console-api-contract.md)
- [`agent-console-security-boundary.md`](./agent-console-security-boundary.md)
- [`agent-console-first-run.md`](./agent-console-first-run.md)

---

## 1. Product goal / identity

**Agent Console** es la interfaz **Web** principal de Personal Agent para:

- **USE** — conversar, ver resultados, autorizar acciones, capacidades.
- **MANAGE** — estado del Agent Host, workspace, conexiones, configuración segura, diagnóstico.

Es un **cliente**, no una segunda autoridad.  
Android permanece como cliente móvil dedicado.  
Windows se reduce a **Agent Host + tray/launcher mínimo**.

Vocabulario de producto:

| Usar en UI | Evitar en UI normal (OK en Diagnostics) |
|------------|----------------------------------------|
| Personal Agent, Agent Host, Agent Console | Runtime, MCP, Gateway, tool IDs |
| Conversation, Capability, Authorization | policy, protocol, Node |
| Workspace, Agent Ready | filesystem modes técnicos |

---

## 2. Target users

| Persona | Necesidad |
|---------|-----------|
| Early adopter técnico | Chat diario + ver que el agente está READY + pairing Android |
| Operador en casa | Cambiar workspace, reiniciar host, diagnóstico sin terminal |
| Móvil (Android) | Chat + HITL + capacidades; no administración completa del host |

---

## 3. Frontend architecture (PHASE 50)

**Recomendación tecnológica:** SPA moderna (Vite + React o equivalente ligero) servida por el Agent Host o estática detrás del mismo origen.

| Decisión | Elección | Por qué |
|----------|----------|---------|
| Framework | Vite + React (TS) | Ecosistema alineado al monorepo TS; rápido para Chat |
| Estado | Ligero (Zustand/context) | Sin Redux enterprise |
| Estilos | CSS variables + componentes propios | Evitar look “admin dashboard” genérico |
| Transporte | HTTP Bearer + WebSocket `/ws` | Reutilizar protocolo existente |
| Hosting | Mismo origen que Gateway (preferido) | Simplifica CORS/auth |

**No** Next.js SSR obligatorio. **No** Electron como Console.

---

## 4. USE vs MANAGE

| USE | MANAGE |
|-----|--------|
| Chat | Overview |
| Conversations | Workspace |
| Capabilities (informativo) | Connections |
| HITL / tool activity | Configuration |
| History en hilo | Diagnostics / Logs |

Una sola app, una navegación. Sin dos productos.

---

## 5. Navigation & home

Ver [`agent-console-navigation.md`](./agent-console-navigation.md).

**Pantalla inicial:**

| Condición | Destino |
|-----------|---------|
| NOT CONFIGURED / first-run incompleto | **Overview** (o wizard First Run embebido) |
| READY + configurado | **Chat** |

**Justificación:** Overview responde “¿mi agente funciona?” cuando hay incertidumbre; Chat es el trabajo diario una vez READY. Evita dejar al usuario en Settings tras cada arranque.

---

## 6. Screens (summary)

| Screen | Propósito |
|--------|-----------|
| Overview | AGENT READY / DEGRADED / … + componentes boot |
| Chat | Conversation activa + streaming + tool activity + HITL |
| Conversations | Lista, nueva, rename, aislamiento |
| Capabilities | 6 MVP PHASE 41 (sin toggles) |
| Workspace | Path, estado, cambio controlado vía Host |
| Connections | Clientes (Android/Browser), pairing LAN |
| Configuration | Preferencias agente vs host (secretos enmascarados) |
| Diagnostics | Salud + copiar reporte + logs relevantes |

---

## 7. Agent states (product)

| Estado UI | Significado | Evidencia actual |
|-----------|-------------|------------------|
| NOT CONFIGURED | Falta workspace / first-run | Config local / Shell |
| READY | Puede aceptar Conversation | Boot READY + `/health.ok` + `agentReady` snapshot |
| DEGRADED | Parcial | Warnings conocidos; tools/Excel ausente |
| OFFLINE | Host no alcanzable | WS/HTTP fallan |
| ERROR | Fallo de arranque/config | stderr / health fail |
| STOPPED | Detenido a propósito | Tray stop |

**No nueva API liveness en PHASE 49/50 mínimo.**  
`/health.agentReady` = snapshot de boot (limitación documentada E-47-02). UI debe decir “arranque OK”, no fingir “Node vivo ahora”.

---

## 8. Chat / Tool activity / HITL

Reutilizar conceptualmente PHASE 38–42:

```text
User → agent narrative → (confirm?) → execute → result → narrative
```

Estados de actividad: Preparing / Waiting for authorization / Executing / Completed / Failed / Rejected / Timed out.  
Labels humanos (PHASE 41). IDs técnicos solo en detalle.

HITL: dialog global en Console (como Android HubConfirmHost). Gateway = autoridad. Sin PermissionManager.

---

## 9. Capabilities

Visibles (PHASE 41): filesystem.read/list/write, process.execute, office.excel.read/write.  
Ocultas: math.*, agent.echo, diagnostics.ping, system.info, customer.demo.  
“Ver ≠ autorizar”. Excel: Solo Windows.

---

## 10. Workspace / Connections / Configuration / Diagnostics

Ver secciones detalladas en navigation + first-run + API contract.

**Workspace change:** solo vía operación Host (API REQUIRED), validando path; nunca browser FS API como autoridad.

**Connections:** pairing LAN = URL + token enmascarado + copiar; `devices` de `/health` como hint.

**Configuration:** API keys / HUB_TOKEN nunca en claro; write-only o reveal-once.

**Diagnostics:** sanitize secrets (mismo principio que desktop diagnostics PHASE 48).

---

## 11. Windows repositioning (PHASE 48)

**Decisión de producto:**

El Electron Control Center **no** debe evolucionar a una segunda UI administrativa completa.

Windows aporta:

```text
Personal Agent Tray
● Agent Ready / …
Open Agent Console   → browser http://127.0.0.1:<port>/
Restart Agent
Open Logs
Diagnostics (link)
Quit
```

| Mantener en tray/host | Mover a Agent Console |
|-----------------------|------------------------|
| Start/stop proceso Gateway | Chat, Conversations, HITL |
| First-run local (workspace picker OS) puede quedar en tray *o* wizard Web | Overview, Capabilities |
| Secrets en disco AppData | Configuration UI (solicita cambios al Host) |
| Start with Windows | Connections, Diagnostics ricos |

**Electron:** puede reducirse a tray+launcher en PHASE 51; **no eliminar código en PHASE 49**. Documentado para implementación futura.

---

## 12. Android relationship

| Android | Agent Console |
|---------|---------------|
| Chat + HITL + Capabilities + Settings ligeros | Todo lo anterior + Host admin |
| Hub-first PHASE 37–42 intacto | Mismos conceptos visuales |
| No admin completo de host | Workspace/Config/Diagnostics host |

Shared product language; no shared codebase obligatorio en 50 (mapping capabilities puede duplicarse en TS mirror estático).

---

## 13. Responsive

| Breakpoint | Layout |
|------------|--------|
| Desktop ≥1024 | Sidebar + content |
| Tablet | Sidebar icon-rail |
| Mobile browser | Bottom/compact nav |

Android nativo = experiencia móvil dedicada; mobile browser es secundario.

---

## 14. LAN vs Internet

| Escenario | PHASE 50 |
|-----------|----------|
| LAN (laptop → Agent Host) | **In scope** (Bearer + WS; prefer same-origin o CORS mínimo) |
| Internet / relay / TLS público | **FUTURE** — documentado; sin User/ACL/multi-node |

---

## 15. Auth model

```text
Client → auth (WS token=HUB_TOKEN) + HTTP Bearer → Gateway
```

Sin segundo sistema de identidad.  
Console: guardar token en **sessionStorage** o memoria + deviceId estable (como Android). Evitar query string / URL. Prefer same-origin + cookie HttpOnly **solo si** se añade endpoint de sesión en fase futura; MVP = Bearer + WS auth como Android.

---

## 16. API / WebSocket inventory

Ver [`agent-console-api-contract.md`](./agent-console-api-contract.md).

---

## 17. Security

Ver [`agent-console-security-boundary.md`](./agent-console-security-boundary.md).

Console → Gateway → Policy → Runtime → Tool.  
Nunca FS/MCP/process directo desde el browser.

---

## 18. First-run / post-install UX

Ver [`agent-console-first-run.md`](./agent-console-first-run.md).

Objetivo: el usuario ve “Installed / Agent Ready / Open Agent Console”, no `npm`/`.env`.

---

## 19. Visual direction

| Eje | Dirección |
|-----|-----------|
| Mood | Agente personal sofisticado en tu PC; sobrio, cálido, confiable |
| Evitar | Dashboard enterprise genérico, IDE, marketplace, cyberpunk, purple-AI cliché |
| Color | Fondo cálido claro (#F6F4EF–#FAFAF8); accent teal/stone profundo; success verde; warn ámbar; error rojo contenido |
| Tipo | Sans humana (p.ej. Source Sans / IBM Plex Sans); display contenido, no grotesca marketing |
| Chat | Burbujas suaves, tipografía 15–16px, tool activity como fila sutil bajo el mensaje |
| Status | Puntos ● con color semántico + texto humano |
| Empty | Una frase + un CTA; sin empty-state ilustraciones genéricas |
| Cards | Solo para interacción (lista conversations, capability row); no cardificar Overview entero |

---

## 20. Explicit non-goals

User/ACL, multi-user, multi-node, A2A, marketplace, OTA, voice, FGS, PermissionManager, new tool registry, Runtime/MCP redesign, new auth model, Internet remote access, implementar frontend en esta fase.

---

## 21. Installer relationship

```text
Installer → Agent Host → Tray/Launcher → Open Agent Console → First Run → READY
```

Installer no contiene lógica de producto. Host = runtime authority.

---

## 22. Implementation plan → PHASE 50

Orden sugerido (no iniciar automáticamente):

1. Shell visual + routing  
2. Auth (WS + Bearer) + CORS/same-origin  
3. Overview  
4. Chat + Conversations + History  
5. HITL + tool activity UX  
6. Capabilities  
7. Workspace (EXISTING + REQUIRED mínimo)  
8. Connections / pairing  
9. Diagnostics  
10. Configuration (mínimo seguro)  
11. First-run wizard  
12. Responsive  
13. Tests + build + package static assets  

APIs REQUIRED mínimas (si faltan para Overview/Config/Workspace change): ver API contract — implementar **solo** las marcadas REQUIRED en 50, no FUTURE.

## PHASE 51 (posterior)

Windows Installer + Console integration + instalación real → field test 44.

---

## 23. Acceptance (PHASE 49)

Todos los criterios §32 del brief: **cumplidos en documentación**. Sin frontend productivo. Sin cambios Runtime/MCP/policy/protocol.

---

## 24. Findings A–G

| ID | Clase | Nota |
|----|-------|------|
| A-49-01 | A | Protocolo WS + History/Workspace HTTP suficientes para Chat MVP |
| A-49-02 | A | Modelo HUB_TOKEN = instalación se mantiene |
| E-49-01 | E | CORS / same-origin serving pendiente de implementación |
| E-49-02 | E | `/health` snapshot; Overview debe comunicar límite |
| E-49-03 | E | Capability mapping solo en Kotlin; mirror TS estático en 50 |
| D-49-01 | D | Electron Control Center solapa Overview — reducir a tray en 51 |
| G-49-01 | G | Internet remote access / TLS / identity |
| G-49-02 | G | Live Node health API |
| G-49-03 | G | tool_progress frame |

**B/C:** ninguno en esta definición.

---

## Architecture Changes

```text
NONE — specification only
```
