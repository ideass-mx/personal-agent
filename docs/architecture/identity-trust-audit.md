# PHASE 57 — Identity & Trust v1 · Security / Identity Audit

**Estado:** AUDIT ONLY (STEP 1)  
**Fecha:** 2026-09-06  
**Alcance:** Solo lectura de código existente. Sin implementación.

Principios de producto asumidos (contexto, no código): local-first; un Personal Agent por usuario; multi-device / multi-node; multi-plataforma; complejidad de seguridad dentro del sistema; el usuario no debe manejar tokens/JWT/certs/puertos.

---

## A. Current architecture

### A.1 Flujo real de autenticación y confianza

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ INSTALLATION (= posesión de HUB_TOKEN / cookie browser como "install") │
│  Desktop secrets.json · gateway env HUB_TOKEN · optional browser cookie  │
└─────────────────────────────────────────────────────────────────────────┘
         │
         ├─ HTTP Bearer HUB_TOKEN ──► pairing control, workspace, setup, …
         ├─ WS authKind=install   ──► AgentRuntime (deviceId inventado por cliente)
         └─ Cookie pa_browser_auth ──► HTTP principal install + WS auto-auth
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ TRUSTED DEVICE (pairing)                                                 │
│  SQLite trusted_devices · credential_hash · status ACTIVE|REVOKED        │
│  Android DataStore: hub_token = deviceCredential, authKind=device         │
└─────────────────────────────────────────────────────────────────────────┘
         │
         ├─ WS authKind=device + deviceId ──► AgentRuntime
         └─ HTTP Bearer + X-Device-Id     ──► diagnostics / artifacts (no pairing)

Client WS Session (ephemeral)
  session.id (ws_*) · authenticated · deviceId · confirmationWaiter
         │
         ▼
AgentRuntime (Gateway)
  ToolPolicy · HITL confirm · conversationId · deviceId?
         │
         ▼
MCP stdio (local child Node) — SIN autenticación
         │
         ▼
Node tools — SIN AuthZ de usuario/dispositivo; solo contención técnica
```

**No existe hoy:** `userId`, entidad User, entidad PersonalAgent como dueño criptográfico, `nodeId` criptográfico, Session persistente con cookie de dispositivo, Policy por dispositivo/usuario, multi-tenant.

**Identidad de instalación vs dispositivo:**

| Concepto en docs (PHASE 52) | Representación en código |
|-----------------------------|--------------------------|
| Agent Identity (`agentId`) | Desktop `secrets.json` / `PERSONAL_AGENT_ID` — instalación, no User |
| Install credential | `HUB_TOKEN` (legacy; no va en QR) |
| Pairing Session | `pairing_sessions` (TTL 5m, secret hashed) |
| Trusted Device | `trusted_devices` + `deviceCredential` (plaintext una vez) |
| WS Session | Memoria en `gateway/src/ws` — no persistida |

### A.2 Quién autentica qué

| Canal | AuthN | Principal resultante |
|-------|-------|----------------------|
| HTTP pairing | Solo Bearer == `HUB_TOKEN` | install |
| HTTP workspace | Solo Bearer == `HUB_TOKEN` | install |
| HTTP setup / browser-session create | `authenticateHttpRequest` → install (token **o** cookie) | install |
| HTTP diagnostics / artifacts | install **o** device | install \| device |
| HTTP `/health` | Ninguna | anónimo |
| WS | `auth` install/device **o** cookie browser | install-like / device |
| WS pre-auth | Solo `pairing_request` | no autenticado |
| MCP Node | Ninguna (stdio local) | N/A |

Código clave:

- `gateway/src/http/bearer-auth.ts` — `authenticateHttpRequest`
- `gateway/src/ws/index.ts` — `handleAuth`, cookie auto-auth
- `gateway/src/pairing/store.ts` — pairing + trusted devices
- `gateway/src/http/browser-session.ts` — launch one-shot + cookie 12h
- `gateway/src/tools/mcp/stdio.ts` — `childEnvForLocalNode` (sin secretos Gateway)
- `gateway/src/agents/runtime.ts` + `sessions/confirmation-waiter.ts` — HITL

---

## B. Existing mechanisms

| Mecanismo | ¿Reutilizable? | Notas |
|-----------|----------------|-------|
| Pairing Session (TTL, hash, one-shot approve) | **Sí — núcleo** | Ya separa QR de `HUB_TOKEN` (PHASE 52) |
| Trusted Device + `deviceCredential` hashed | **Sí — núcleo** | Auth WS/HTTP device; revoke server-side |
| `authKind: install \| device` en protocolo | **Sí** | No cambiar protocolo en este audit |
| ConfirmationWaiter + frozen tool ops | **Sí** | HITL bound a `sessionId` + `deviceId` |
| ToolPolicy `executionMode` (confirm/automatic) | **Sí** | AuthZ de herramienta a nivel Gateway |
| Browser bootstrap + HttpOnly cookie | **Parcial** | Buena dirección; cookie = install (demasiado poder) |
| `agentId` de instalación | **Parcial** | No es User; útil como PersonalAgent.id de instalación |
| Desktop `secrets.json` + chmod 600 | **Parcial** | Persistencia local; no DPAPI/Keychain aún |
| CredentialManager / Windows CredMan (PHASE 59) | **No para identidad de sesión** | Secrets de tools/MCP; explícitamente no pairing |
| Anthropic key files `credentials/llm/*` | **Sí para provider creds** | Gateway-only; Node no las recibe |
| Diagnostics redaction | **Sí** | Evita tokens en store |
| Tailscale en Desktop para QR endpoint | **Sí como reachability** | No es firewall del bind Gateway |
| Android DataStore device credential | **Parcial** | Funciona; plaintext en prefs Hub path |
| Gateway legacy Keystore path (Android) | **No mezclar** | Camino avanzado distinto del QR Hub |

---

## C. Security gaps

Solo gaps reales observados en código:

1. **`HUB_TOKEN` = ownership total de la instalación.** Quien lo posee controla pairing approve, workspace, setup (escribir API keys), chat WS con `deviceId` arbitrario.
2. **Gateway escucha en todas las interfaces** (`serve({ port })` sin `hostname`). No es loopback-only. Exposición LAN/Tailscale depende de red + firewall OS, no de bind restrictivo.
3. **`/health` es público** — filtra devices conectados, tools, metadata de build.
4. **Cookie `pa_browser_auth` mapea a principal `install`** — puede escribir LLM keys vía setup, mint más browser sessions, diagnostics; no es un “browser guest”.
5. **Web manual path guarda `HUB_TOKEN` en `sessionStorage`** — accesible a JS del origen; no HttpOnly.
6. **Install WS no amarra `deviceId` al token** — spoof de `deviceId` por poseedor de install credential.
7. **`trusted_devices.permissions` no se aplica** en AuthZ (decorativo).
8. **Artifact read ACL siempre `true`** (`authorizeArtifactRead`).
9. **Node/MCP sin AuthN** — confianza = “soy el hijo stdio del Gateway”. Atacante local con stdin = tools sin HITL.
10. **No hay User / PersonalAgent dueño** — no se puede revocar “usuario”; solo device o rotar install token.
11. **Revoke trusted device no notifica Android** — cliente reintenta; no limpia prefs automáticamente.
12. **Browser sessions in-memory** — reinicio Gateway invalida cookies; no hay rotación/revocación explícita de cookie.
13. **Bootstrap activate valida `Host` header loopback**, no `remoteAddress` — spoof de Host si hay reachability TCP (mitigado por UUID one-shot 60s).
14. **CapabilityExecutor sin Runtime no aplica HITL** — riesgo si un caller futuro invoca tools confirm fuera de Runtime.
15. **`deviceId`/`conversationId` llegan a Node pero no se usan para AuthZ.**

---

## D. Threat matrix

| Threat | Current exposure | Current protection | Risk | Required fix |
|--------|------------------|--------------------|------|--------------|
| **T1 Unknown LAN attacker** | Gateway reachable if no OS firewall; `/health` open | Pairing/workspace/setup need `HUB_TOKEN`; WS needs credential | **High** if token leaked; **Med** info disclosure | Bind loopback default + auth for health metadata; never rely on “obscurity of port” |
| **T2 Unknown browser** | Can open static console; cannot cookie-auth without bootstrap | Bootstrap requires install + loopback Host + one-shot | **Med** if `HUB_TOKEN` entered in Setup | Browser session ≠ install; HttpOnly session scoped |
| **T3 Malicious localhost process** | Same OS user can read `secrets.json` / env of Gateway child; can hit localhost APIs with stolen token | File perms 600 best-effort; cookie HttpOnly vs XSS | **High** (same-user) | OS keystore; reduce install power of browser; short-lived sessions |
| **T4 Unknown Node** | No remote Node registration; only Gateway-spawned stdio child | Process boundary only | **Low** remote; **High** local stdin hijack | Node identity + mutual auth before any remote Node |
| **T5 Stolen Android** | Active credential until revoke | Server revoke exists (install Bearer) | **High** until revoke | Remote revoke UX + wipe; short-lived device sessions |
| **T6 Revoked device** | `verifyDeviceCredential` fails; WS `auth_failed` | Hash cleared on revoke | **Low** if revoke executed | Client clear + session kill list |
| **T7 Captured pairing code** | Secret one-shot; TTL 5m; hash at rest | Approve required on Desktop | **Low–Med** if QR live + Desktop left approving | Keep TTL; bind approve to local presence |
| **T8 Compromised Node** | Full FS/process tools as OS user of Node | HITL only on Gateway path; local MCP bypasses HITL | **Critical** if Node remote later | Node ≠ trust root; policy + attestation; no auto confirm-class tools |
| **T9 Tool escalation** | Authenticated device can request any tool LLM chooses | ToolPolicy + HITL for confirm tools | **Med** | Policy per device/agent; deny-by-default stays |
| **T10 Multiple OS users** | Other OS user: no shared `secrets.json` if per-user dirs; shared bind still listens | Per-user Desktop config paths | **Med** | Explicit per-user data root; loopback + user-scoped socket later |

---

## E. Identity model proposal

```text
User
  userId                          # dueño humano (local-first; cloud opcional después)
  └── PersonalAgent
        agentId                   # = instalación lógica (reutilizar agentId actual)
        conversations / projects / tasks / memory
        credentials[]             # provider keys scoped to agent
        policies[]
        devices[]
          deviceId
          publicKey | credential
          status: ACTIVE|REVOKED
          platform: windows|macos|linux|android|web
        nodes[]
          nodeId                  # ≠ deviceId
          publicKey | credential
          capabilities / location
          status: ACTIVE|REVOKED
        sessions[]
          sessionId
          deviceId | nodeId
          issuedAt / expiresAt
          scopes
```

**Reglas:**

- Device ≠ Node (un Desktop puede ser Device + host de Node local).
- OS account ≠ User de Personal Agent.
- `HUB_TOKEN` deja de ser “identidad de usuario”; queda como **bootstrap de instalación** a deprecar.
- Identificadores estables y OS-agnósticos; OS solo aporta *secure storage* de claves privadas.

---

## F. Authentication proposal

### Local authentication (primera instalación)

1. Desktop/host genera `agentId` + material criptográfico local (keystore OS).
2. Install bootstrap solo en loopback / proceso host (reutilizar browser bootstrap).
3. Usuario no copia tokens.

### Device authentication

1. Pairing Session temporal (ya existe) → Trusted Device.
2. Evolucionar `deviceCredential` opaco → prueba criptográfica (device keypair) sin cambiar UX de QR.
3. Sesiones de dispositivo de corta duración derivadas del credential de largo plazo.

### Pairing

1. **KEEP** flujo PHASE 52 (QR sin `HUB_TOKEN`, TTL, approve humano, credential once).
2. Extender el mismo patrón a **Nodes** (pair node ≠ pair device).
3. Approve siempre desde Device ya confiable (Desktop host), no desde LAN anónimo.

### Session authentication

1. Web: sesión HttpOnly (ya iniciado) **sin** privilegios install; scopes: `console.chat`, etc.
2. WS: amarrar sesión a `deviceId` verificado (no inventado en install auth).
3. Revoke device → invalidar sesiones activas de ese device.

### Gateway authentication

1. Clientes: device session o browser session scoped.
2. Control plane (pairing approve, credentials write): solo **local host principal** / device admin, no cookie de consola genérica.
3. Nodes: mutual auth Gateway↔Node antes de tools.

---

## G. Authorization proposal

```text
User
  ↓
PersonalAgent (agentId)
  ↓
Session (deviceId | nodeId, scopes)
  ↓
Policy (tool → allow|confirm|deny; device/node constraints)
  ↓
AgentRuntime (HITL if confirm)
  ↓
Tool / MCP
  ↓
Execution (Node)
```

- **AuthN** en borde Gateway; **AuthZ + HITL** antes de MCP (ya casi así).
- Propagar `agentId`, `deviceId`, `sessionId`, `userId` (cuando exista) en contexto de auditoría; Node no confía ciegamente — Gateway firma o canal autenticado.
- Policy por agente; permisos de `trusted_devices` deben **aplicarse** (hoy no).

---

## H. Cross-platform abstraction

| Capa | Independiente de OS | Implementación por plataforma |
|------|---------------------|-------------------------------|
| User / PersonalAgent / Device / Node / Session / Policy IDs | Sí | — |
| Pairing URI + protocolo WS/HTTP | Sí | — |
| ToolPolicy + HITL | Sí | — |
| Secure private key / secret storage | API abstracta | Windows CredMan/DPAPI; macOS Keychain; Linux secret service/file 600; Android Keystore |
| Loopback browser open | Sí conceptualmente | Desktop shell por OS |
| Node local spawn | Sí | paths/binarios por OS |
| Tailscale / remote reachability | Opcional | Integraciones Desktop |

**Prohibido:** `Windows username` / SID como `userId` de producto.

---

## I. Migration plan (mínimo incremental)

Preferir reutilizar pairing, ToolPolicy, HITL, browser cookie, `agentId`.

1. **Documentar y endurecer exposición de red:** default bind loopback; opt-in LAN/Tailscale explícito.
2. **Separar privilegios cookie browser de install** (scopes); setup LLM / pairing HTTP solo host local.
3. **Dejar de poner `HUB_TOKEN` en `sessionStorage`** cuando haya cookie/session scoped (manual setup → migrar a session mint).
4. **Aplicar `permissions` de trusted devices** + deny-by-default en HTTP device.
5. **Session registry** en Gateway: listar/kill sesiones al revoke device.
6. **Android:** manejar `auth_failed` → clear credential + UX re-pair; opcional Keystore para Hub credential.
7. **Introducir User local mínimo** (un usuario por instalación) sin email/cloud.
8. **Node identity v1** solo cuando exista Node remoto; hasta entonces documentar trust = proceso hijo.
9. **Deprecar uso diario de `HUB_TOKEN`** hacia pairing + local bootstrap; token solo recovery/admin.
10. Cloud identity (email/OAuth) — **fase posterior explícita**, no PHASE 57 core.

---

## J. Explicit non-goals

Esta fase **NO** introduce:

- Firebase  
- OAuth / OIDC  
- Email obligatorio  
- Cuenta cloud obligatoria  
- Multi-tenancy / Organizations  
- Gestión compleja de usuarios  
- Tokens/certs manuales para el usuario  
- Cambio de protocolo WS en este STEP 1  
- Cambio de UI en este STEP 1  

---

## Answers to success-criteria questions

| # | Pregunta | Respuesta actual (hechos) | Dirección propuesta |
|---|----------|---------------------------|---------------------|
| 1 | ¿Quién posee el Personal Agent? | Quien posee `HUB_TOKEN` / cookie install | `User` → `PersonalAgent (agentId)` |
| 2 | ¿Cómo se representa el dueño? | No hay User; solo install credential | `userId` local-first |
| 3 | ¿Primer device confiable? | Desktop host que genera `HUB_TOKEN` + browser bootstrap | Host = first device + local bootstrap |
| 4 | ¿Segundo device? | Pairing QR PHASE 52 → trusted device | KEEP + sessions |
| 5 | ¿Segundo Node? | No hay; solo Node local spawn | Pairing Node futuro |
| 6 | ¿Gateway los autentica? | install token / device credential / cookie | Sessions scoped + crypto device |
| 7 | ¿Distingue devices? | `deviceId` + credential hash (device); install puede spoofear | Solo device auth para claims |
| 8 | ¿Distingue sessions? | WS `session.id` efímero; no cookie device session | Session store + revoke |
| 9 | ¿AuthZ antes de tools? | ToolPolicy + HITL en Runtime | + policy por device/agent |
| 10 | ¿Revoke device? | HTTP revoke trusted device | + kill sessions + client wipe |
| 11 | ¿Sesiones tras revoke? | Nuevos WS fallan; in-flight no enumerated | Explicit session kill |
| 12 | ¿Atacante Wi‑Fi? | Reachable si bind abierto; sin token limitado; con token = full install | Loopback default |
| 13 | ¿Win/mac/Linux? | Modelo lógico ya OS-agnóstico; storage Windows CredMan solo PHASE 59 secrets | Abstract secure store |
| 14 | ¿Usuario maneja token? | Hoy sí en Setup manual / legacy | No — pairing + bootstrap |
| 15 | ¿Email? | No | No (local-first) |
| 16 | ¿Local-first? | Sí operativamente | Mantener |
| 17 | ¿Cambio mínimo de código? | Bind + scopes cookie + no sessionStorage token + apply device permissions + session revoke | Ver §I |

---

### KEEP

- Pairing Session + Trusted Device + QR sin `HUB_TOKEN` (PHASE 52).  
- `authKind` install \| device en protocolo.  
- ToolPolicy + HITL ConfirmationWaiter (Gateway before MCP).  
- Node sin provider secrets (`childEnvForLocalNode`).  
- Diagnostics redaction.  
- Browser bootstrap one-shot + HttpOnly cookie (dirección correcta).  
- `agentId` de instalación.  
- Deny-by-default tools sin policy key.

### CHANGE

- Privilegio de cookie browser: **no** = install pleno.  
- Bind address: default loopback; remote opt-in.  
- Web: eliminar dependencia de `HUB_TOKEN` en `sessionStorage` para host path; reducir exposición en manual path.  
- Install WS: no aceptar `deviceId` no verificado como identidad fuerte.  
- Aplicar `permissions` de trusted devices.  
- `/health` público: reducir datos sensibles o exigir auth.  
- Android: reacción a revoke + almacenamiento más seguro del credential Hub.

### ADD

- Modelo User (local) → PersonalAgent ownership.  
- Session registry (device/browser) con revoke.  
- Scopes en sesiones.  
- Abstracción SecureSecretStore multi-OS (para identidad, no solo tools).  
- (Más adelante) Node identity + mutual auth para Nodes remotos.  
- (Más adelante) Pairing de Nodes distinto de Devices.

### REMOVE (eventualmente)

- Uso diario de “copiar `HUB_TOKEN` / pegar en otro dispositivo”.  
- Equivalencia cookie browser ≡ install admin.  
- Confianza implícita “cualquiera en LAN si conoce el puerto” (mitigar con bind).  
- `permissions` decorativos sin enforcement.

### SECURITY CRITICAL

Antes de exponer Gateway remoto (LAN/Tailscale) de forma intencional:

1. No escuchar `0.0.0.0` por defecto sin autenticación fuerte.  
2. Poseer `HUB_TOKEN` no debe ser el único modelo para clientes remotos — pairing device obligatorio.  
3. Cookie/browser no debe escribir provider credentials ni aprobar pairing.  
4. Revoke device debe invalidar acceso de inmediato.  
5. `/health` no debe filtrar inventario útil a anónimos en interfaces no loopback.

### SAFE FOR NOW

- Node local stdio sin `nodeId` (mientras solo exista hijo local).  
- Ausencia de User cloud / email.  
- CredMan Windows solo para secrets de tools (PHASE 59).  
- Structured UI / protocolo de chat.  
- Multi-node remoto (aún no implementado).

### RECOMMENDED PHASE 57 IMPLEMENTATION ORDER

1. **Network harden:** bind loopback by default; document/opt-in remote; trim anonymous `/health` on non-loopback.  
2. **Session scopes:** browser cookie ≠ install; split admin vs console.  
3. **Stop install-token-in-JS** for host bootstrap path; mint scoped console session only.  
4. **Enforce trusted-device permissions** on HTTP/WS.  
5. **Session registry + revoke propagation** (Gateway kill + Android clear).  
6. **Local User ↔ PersonalAgent (`agentId`) ownership** without cloud.  
7. **Secure storage abstraction** for long-lived device/install keys.  
8. **Deprecate daily `HUB_TOKEN` sharing**; keep as recovery/admin only.  
9. **Node remote identity** only when second Node is a real product requirement.  
10. **Optional cloud identity** (future phase) — never block local-first.

---

## Appendix — Code anchors

| Tema | Ruta |
|------|------|
| HTTP principals | `gateway/src/http/bearer-auth.ts` |
| WS auth / pairing / HITL wire | `gateway/src/ws/index.ts` |
| Pairing + trusted devices | `gateway/src/pairing/store.ts`, `gateway/src/http/pairing-http.ts` |
| Browser bootstrap | `gateway/src/http/browser-bootstrap-http.ts`, `browser-session.ts` |
| Listen | `gateway/src/http/server.ts` (`serve({ port })`) |
| Config token | `gateway/src/config.ts` (`HUB_TOKEN`) |
| Desktop token | `desktop/lib/config.cjs` (`ensureHubToken`) |
| Web session | `web/src/state/session.ts`, `web/src/state/AppContext.tsx` |
| Android pairing | `PairingQrParser.kt`, `HubClient.kt`, `AppPreferences.kt` |
| Tool policy / HITL | `gateway/src/tools/policy.ts`, `agents/runtime.ts`, `sessions/confirmation-waiter.ts` |
| MCP / Node env | `gateway/src/tools/mcp/stdio.ts`, `node/src/index.ts` |
| Provider keys | `gateway/src/setup/llm-key.ts` |
| Prior pairing design | `docs/architecture/phase52-pairing-trusted-device.md` |

---

**Fin STEP 1.** Esperar instrucción siguiente antes de implementar.
