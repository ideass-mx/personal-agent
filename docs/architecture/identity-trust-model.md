# PHASE 57.1 — Identity Model & Trust Contract

**Estado:** DESIGN ONLY  
**Fecha:** 2026-09-06  
**Entrada:** [`identity-trust-audit.md`](./identity-trust-audit.md)  
**Alcance:** Contrato de dominio mínimo para fases de implementación. Sin código, sin schema, sin protocolo, sin UI.

---

## 1. Executive summary

Hoy el dueño efectivo del sistema es quien posee `HUB_TOKEN` (o una cookie de browser tratada como **install**). Eso es incompatible con el producto deseado: un **User** local-first, un **PersonalAgent**, múltiples **Devices** y **Nodes**, sesiones temporales y políticas — sin que el usuario manipule tokens.

Este documento fija el **contrato de identidad** que las fases siguientes implementarán de forma incremental.

**Dirección:**

```text
Legacy HUB_TOKEN (compat)
        ↓
User → PersonalAgent → Device | Node → Session → Policy → Tool
```

**Reutilizar sin rediseñar:** pairing PHASE 52 (QR → Trusted Device), ToolPolicy + HITL en Gateway, `agentId` de instalación, bootstrap HttpOnly del browser (evolucionando scopes).

**No introducir:** Firebase, OAuth/OIDC, email obligatorio, cloud identity, multi-tenancy, tokens manuales para el usuario.

---

## 2. Domain model

### 2.1 Principio de producto

- Local-first  
- Un Personal Agent por User  
- Multi-device, multi-node, multi-platform  
- Complejidad de seguridad **dentro** del producto  

El usuario no gestiona: Gateway tokens, JWTs, certificados, claves, puertos, TLS, MCP credentials.

### 2.2 Diagrama de dominio

```text
User (local-first)
  userId
     │
     │ 1 : 1  (modelo de producto actual)
     ▼
PersonalAgent
  agentId
  ownerUserId
     │
     ├── Devices[]     (clientes de interacción)
     ├── Nodes[]       (entornos de ejecución)
     ├── Sessions[]    (relaciones autenticadas temporales)
     ├── Credentials[] (service secrets — NO identidad)
     └── Policies[]    (autorización de tools / acciones)
```

**Non-goals de dominio:** Organization, Team, Tenant, shared agents.

---

## 3. Entity definitions

### 3.1 User

Identidad humana **local-first**. No requiere email, password, OAuth ni cuenta cloud.

**Mínimo requerido:**

| Campo | Tipo | Rol |
|-------|------|-----|
| `userId` | string estable (UUID) | Identidad de dominio |
| `displayName` | string | UX (“Tony”, “Yo”) |
| `createdAt` | timestamp | Auditoría |

**Opcional diferido (no bloquea v1):** `linkedCloudIdentityId`, `locale`, `avatar`.

**Creación inicial**

1. En el primer arranque del host Desktop (o primera instalación Gateway), el sistema crea **un** User local si no existe.  
2. Sin diálogo de “cuenta”: `displayName` por defecto (p. ej. nombre de perfil OS solo como *sugerencia de etiqueta*, nunca como `userId`).  
3. Persistido en SQLite del Gateway (misma DB de producto).  

**Supervivencia**

- `userId` vive en persistence del agente, no en el proceso ni en el browser.  
- Reinicios de Gateway/Desktop no regeneran `userId`.  
- Reinstalación limpia = nuevo User (recovery cloud = fase futura).

**Asociación con PersonalAgent**

- Al crear el User se crea (o se adopta) exactamente un `PersonalAgent` con `ownerUserId = userId`.  
- El `agentId` existente de instalación se **adopta** como `PersonalAgent.id` cuando esté presente (`PERSONAL_AGENT_ID` / Desktop `secrets.json`), para no romper pairing QR que ya incluye `agent`.

**Cloud linking futuro (MODE B)**

```text
Local User.userId  ←→  optional CloudIdentity (provider subject)
```

El cloud identity es un **proveedor adicional de prueba**, no reemplaza `userId`. El core no cambia.

---

### 3.2 PersonalAgent

Instancia lógica del agente personal del usuario.

**Mínimo requerido:**

| Campo | Tipo | Rol |
|-------|------|-----|
| `agentId` | string estable | ID canónico (reutilizar instalación actual) |
| `ownerUserId` | string | Dueño |
| `createdAt` | timestamp | Auditoría |
| `status` | `ACTIVE` \| `DISABLED` | Opcional pero útil para “pausar” sin borrar |

**Por qué pertenece a User y no a:**

| Alternativa | Por qué no |
|-------------|------------|
| Cuenta Windows/macOS/Linux | OS ≠ producto; multi-OS user / reinstall / shared PC |
| Proceso Gateway | El proceso es runtime, no dueño |
| Directorio de instalación | Paths cambian; migraciones; portable install |
| Browser | Efímero; no es trust root |
| Machine / hostname | Un User puede tener varios PCs (devices/nodes) |

El PersonalAgent es **platform-agnostic**: mismo contrato en Windows, macOS, Linux, Android, Web.

---

### 3.3 Device

Cliente desde el que el usuario **interactúa** con el agente.

Ejemplos: Desktop Win/mac/Linux, Android, (futuro) Web-as-device.

**Mínimo requerido:**

| Campo | Tipo | Rol |
|-------|------|-----|
| `deviceId` | string estable | Identidad de dispositivo |
| `agentId` | string | Agente al que pertenece |
| `ownerUserId` | string | Dueño (denormalizado o via agent) |
| `platform` | enum | `windows` \| `macos` \| `linux` \| `android` \| `web` |
| `displayName` | string | UX |
| `trustStatus` | `PENDING` \| `ACTIVE` \| `REVOKED` | Confianza |
| `credentialHash` / `publicKey` | secret material | AuthN de device (hoy: hash de credential opaco; mañana: pubkey) |
| `createdAt` | timestamp | Pairing time |
| `lastSeenAt` | timestamp \| null | Observabilidad |
| `revokedAt` | timestamp \| null | Revocación |

**No mínimo en v1:** lista rica de `permissions` (sí un scope default); attestation hardware; IP binding.

**Mapeo con hoy:** tabla `trusted_devices` ≈ Device ACTIVE/REVOKED. Faltan `ownerUserId` / `agentId` explícitos en schema (hoy implícitos por instalación única).

---

### 3.4 Node

Entorno de **ejecución** (tools, filesystem, process, GPU, etc.).

Ejemplos: Node local Windows; Node Linux GPU; Node remoto.

**Mínimo requerido:**

| Campo | Tipo | Rol |
|-------|------|-----|
| `nodeId` | string estable | ≠ `deviceId` |
| `agentId` | string | Agente dueño |
| `ownerUserId` | string | Dueño |
| `displayName` | string | UX |
| `trustStatus` | `PENDING` \| `ACTIVE` \| `REVOKED` | Confianza |
| `publicKey` / `credentialHash` | secret material | AuthN Gateway↔Node (futuro remoto) |
| `capabilities` | string[] / JSON | p. ej. `filesystem`, `process`, `gpu` |
| `createdAt` | timestamp | |
| `lastSeenAt` | timestamp \| null | |
| `revokedAt` | timestamp \| null | |

**Device puede hospedar Node:**

```text
Device (Desktop Windows)
  └── hosts → Node (local execution, same machine)

Device (Android)
  └── typically does NOT host a Node
```

**Device ≠ Node** aunque compartan máquina: identidades, revoke y políticas distintos.

**Hoy:** no hay `nodeId` criptográfico; el “Node” es el proceso hijo MCP (`node-local` conceptual). El contrato exige tratarlo ya como **Node local implícito** del agente (`trustStatus=ACTIVE`, `capabilities` desde `tools/list`), y solo más adelante pairing de Nodes remotos.

---

### 3.5 Session

Relación autenticada **temporal** entre un Device (o Node) y el Gateway.

Responde: ¿quién?, ¿qué device?, ¿qué user?, ¿qué agent?, ¿desde cuándo?, ¿hasta cuándo?, ¿revocada?

**Mínimo requerido:**

| Campo | Tipo | Rol |
|-------|------|-----|
| `sessionId` | string | ID de sesión |
| `userId` | string | |
| `agentId` | string | |
| `deviceId` | string \| null | Cliente interactivo |
| `nodeId` | string \| null | Si la sesión es de Node (canal control) |
| `kind` | `device` \| `browser` \| `node` \| `install_compat` | Discriminante |
| `scopes` | string[] | Autorización gruesa de sesión |
| `createdAt` | timestamp | |
| `expiresAt` | timestamp | |
| `revokedAt` | timestamp \| null | |
| `lastSeenAt` | timestamp \| null | |

**Nota:** la sesión WS efímera actual (`ws_*`) es el precursor; el contrato pide **registro de sesión** revocable (al menos para browser + device), no solo variables en memoria del socket.

**Scopes ejemplo (mínimo):**

| Scope | Uso |
|-------|-----|
| `agent.chat` | WS chat / streaming |
| `agent.confirm` | responder HITL |
| `console.read` | UI lectura |
| `console.admin` | setup LLM, pairing approve, revoke — **no** en browser genérico |
| `node.execute` | canal Node (futuro) |

---

### 3.6 Credential (service)

**No es identidad.** Son secretos de servicios (Anthropic, OpenAI, …) pertenecientes al contexto PersonalAgent/User.

**Mínimo conceptual:**

| Campo | Rol |
|-------|-----|
| `credentialId` | ID |
| `agentId` / `ownerUserId` | Dueño |
| `provider` | `anthropic`, … |
| `metadata` | no secreto (model hints, createdAt) |
| secret material | fuera de identidad; SecureStore |

---

### 3.7 Policy

Frontera de **autorización** (qué puede hacerse), no de autenticación.

**Mínimo conceptual:**

| Campo | Rol |
|-------|-----|
| `policyId` | ID |
| `agentId` | Scope del agente |
| `rules` | tool / action → `allow` \| `confirm` \| `deny` |
| opcional | constraints por `deviceId` / `nodeId` / `session.kind` |

Hoy: `ToolPolicy` + `executionMode` en Gateway ≈ Policy v0.

---

## 4. Entity relationships

```text
User 1 ── owns ── 1 PersonalAgent

PersonalAgent 1 ── has many ── Device
PersonalAgent 1 ── has many ── Node
PersonalAgent 1 ── has many ── Session
PersonalAgent 1 ── has many ── Credential (service)
PersonalAgent 1 ── has many ── Policy

Device 0..1 ── may host ── 0..* Node     (same machine possible)
Session ── bound to ── Device XOR Node   (kind discriminates)
Session ── subject to ── Policy          (via agent + scopes)
```

**Invariant:** en el modelo de producto actual, no hay PersonalAgent sin User, ni Device/Node de otro User.

---

## 5. Authentication model

**Authentication = “¿Quién eres?”**

```text
Proof (device credential | browser session | node credential | install_compat)
        ↓
Gateway verifies
        ↓
Session issued (sessionId, userId, agentId, deviceId|nodeId, scopes, expiresAt)
```

### 5.1 Actores y pruebas

| Actor | Prueba de AuthN (objetivo) | Resultado |
|-------|----------------------------|-----------|
| Trusted Device | Credential / keypair de device | Session `kind=device` |
| Browser | Session cookie scoped (no master) | Session `kind=browser` |
| Node | Credential / keypair de node (remoto); local hijo = trust de proceso | Session `kind=node` o canal MCP autenticado |
| Legacy install | `HUB_TOKEN` | Session `kind=install_compat` (migración) |

### 5.2 Lo que HUB_TOKEN **no** es a largo plazo

No es User. No es PersonalAgent. No es Device. No es Session permanente.

Es **legacy installation authority** durante la migración.

### 5.3 Flujo objetivo (post-migración)

```text
Device/Browser
  → AuthN
  → Session (scopes)
  → requests carry session proof
  → Gateway attaches { userId, agentId, deviceId, sessionId }
```

---

## 6. Authorization model

**Authorization = “¿Qué puedes hacer?”**

```text
User
  ↓
Device / Session (scopes)
  ↓
PersonalAgent
  ↓
Policy (tool → allow | confirm | deny)
  ↓
AgentRuntime (+ HITL if confirm)
  ↓
Tool
  ↓
Node execution
```

- AuthN en el borde Gateway.  
- AuthZ + HITL **antes** de MCP (como hoy).  
- Node no recibe service credentials ni decide confirmation.  
- Session scopes limitan superficies (chat vs admin).  
- Policy decide herramientas; HITL aplica `confirm`.

**Ejemplos (conceptuales, alineados con ToolPolicy actual):**

| Acción | Policy |
|--------|--------|
| `filesystem.read` | allow |
| `filesystem.write` | confirm |
| `process.execute` | confirm |
| `office.excel.write` | confirm |
| tool desconocido | deny (default) |

---

## 7. Pairing model

**No rediseñar PHASE 52.** Evolucionar el significado:

```text
QR / pairing code (temporary)
  ↓
explicit user approval (Desktop / trusted admin device)
  ↓
Device Identity registered (trusted_devices)
  ↓
long-lived device credential (hashed at rest)
  ↓
authenticated Session (short-lived) derived from device trust
```

### 7.1 Propiedades del QR/código

| Propiedad | ¿Ya existe? (audit) | Contrato |
|-----------|---------------------|----------|
| Temporal / TTL | **Sí** (5 min) | KEEP |
| Secret one-shot / hashed at rest | **Sí** | KEEP |
| No contiene `HUB_TOKEN` | **Sí** | KEEP |
| Requiere approve humano | **Sí** | KEEP |
| No es credential permanente | **Sí** (session secret ≠ deviceCredential) | KEEP |
| Crea Device identity | **Sí** (`device_id` + credential) | KEEP; añadir `userId`/`agentId` explícitos |
| Emite Session de corta duración | **No** (hoy credential opaco = auth directa) | ADD en fases posteriores |
| Pairing de Nodes | **No** | ADD cuando haya Node remoto |
| permissions enforced | **No** (decorativo) | CHANGE |

---

## 8. Browser session model

**Problema actual:** cookie `pa_browser_auth` ≡ principal **install**.

**Contrato futuro:**

```text
Electron Host (local admin / first device)
  ↓
Gateway mint one-shot launch (loopback)
  ↓
Browser receives HttpOnly session cookie
  ↓
Session kind=browser, scopes ⊆ { agent.chat, console.read, agent.confirm }
  ↓
User / PersonalAgent context attached
```

El browser **no** recibe:

- `HUB_TOKEN`  
- `console.admin` (setup LLM write, pairing approve, revoke devices)  
- identidad maestra de la instalación  

**Bootstrap conceptual (sin implementar):**

1. Solo el host local autenticado puede `POST` browser-session create.  
2. Activate one-shot en loopback.  
3. Cookie HttpSameSite Strict; TTL acotado; scopes limitados.  
4. Opcionalmente registrar Device `platform=web` + session, no install clone.  
5. Web UI deja de necesitar `HUB_TOKEN` en `sessionStorage` para el path host.

---

## 9. Node trust model

```text
PersonalAgent
  ├── Node local (v1): spawned by Gateway, same host
  │     trust = process parentage + future nodeId record
  │     MCP: evolve toward authenticated channel when remote appears
  │
  └── Node remoto (later): pairing similar to Device
        QR/approve → node credential → mutual auth Gateway↔Node
```

**Compromised Node:** tratado como trust root de **ejecución**, no de identidad de User. Mitigaciones: revoke `nodeId`, cortar canal, Policy deniega tools peligrosos, HITL no sustituible por el Node.

**Local Node hoy:** documentar como `nodeId = local-default` del `agentId`; sin crypto hasta Node remoto.

---

## 10. Credential separation

```text
IDENTITY                         SERVICE CREDENTIALS
─────────                        ───────────────────
User                             Anthropic API key
PersonalAgent                    OpenAI / others
Device                           (metadata ≠ secret)
Node
Session
```

**Reglas:**

1. Service credentials pertenecen a `PersonalAgent` / `User`.  
2. Solo Gateway (AgentRuntime / LLM provider) las usa.  
3. Nodes y Tools **nunca** reciben el store completo de credenciales.  
4. Un Tool pide un capability; el Gateway inyecta lo mínimo o ejecuta la llamada ella misma (como Anthropic hoy).  
5. Diagnostics no exponen secretos (KEEP redaction).

---

## 11. Platform abstraction

```text
Core identity (User, Agent, Device, Node, Session, Policy)
        ↓
Identity / SecureStore port (platform-independent interface)
        ↓
┌─────────────┬─────────────┬─────────────┬─────────────┐
│ Windows     │ macOS       │ Linux       │ Android     │
│ CredMan /   │ Keychain    │ Secret      │ Keystore    │
│ DPAPI       │             │ Service /   │             │
│             │             │ file 0600   │             │
└─────────────┴─────────────┴─────────────┴─────────────┘
```

**Interfaz mínima del SecureStore (conceptual):**

```text
storeSecret(keyId, bytes) → void
loadSecret(keyId) → bytes | null
deleteSecret(keyId) → void
```

Usos: material de Device/Node, recovery de install, **no** mapear Windows SID / macOS user a `userId`.

OS account → solo *ubicación de datos* y *primitives de cifrado*.

---

## 12. Threat boundaries

| Escenario | Frontera de confianza objetiva |
|-----------|--------------------------------|
| **Local browser** | Session `kind=browser` + scopes limitados; loopback mint; no admin |
| **Same LAN unknown** | Sin Session válida → rechazo AuthN; Gateway preferible en loopback o firewall; `/health` sin inventario sensible anónimo |
| **Trusted device** | Device ACTIVE + Session válida → chat/HITL según Policy; no necesariamente admin |
| **Trusted node** | Node ACTIVE + canal autenticado → solo ejecución de tools autorizados por Policy/HITL del Gateway |
| **Revoked device** | `trustStatus=REVOKED` → AuthN falla; Sessions de ese device revocadas |
| **Compromised node** | Revoke node; cortar MCP; tools dejan de ser alcanzables; no implica compromise de User identity |

---

## 13. HUB_TOKEN migration strategy

```text
Today
  HUB_TOKEN = installation ownership (User∪Admin∪Device∪Session)

Migration
  HUB_TOKEN = install_compat proof → Session kind=install_compat
               (temporary bridge)

Target
  HUB_TOKEN unused in daily client auth
  retained only as recovery/admin break-glass (optional)
  or rotated away after all devices paired
```

| Pregunta | Respuesta |
|----------|-----------|
| ¿Qué representa durante migración? | Autoridad de **instalación** legacy; emite Session `install_compat` con scopes amplios pero marcados deprecated |
| ¿Dónde desaparece? | De Web `sessionStorage`, de Android como auth diaria, de cookie browser-as-install |
| ¿Instalaciones existentes? | Siguen arrancando; Desktop sigue inyectando env; clients actuales funcionan vía compat |
| ¿No romper Web/Android? | Mantener `authKind=install\|device` en protocolo; añadir Session/User debajo sin exigir clients nuevos en el primer paso |

**Orden de deprecación (conceptual):**

1. Browser deja de ser install.  
2. Web host path sin token en JS.  
3. Android solo `device`.  
4. Admin solo host local + install_compat.  
5. Documentar rotación/eliminación de `HUB_TOKEN` como paso final opcional.

---

## 14. Local-first model (MODE A)

```text
User (local UUID)
  └── PersonalAgent (agentId)
        ├── Devices (pairing)
        ├── Node local
        ├── Sessions
        ├── Credentials (providers)
        └── Policies
```

- Sin email, sin cloud.  
- Funciona offline (salvo providers LLM externos).  
- Un solo User por instalación de producto en el modelo actual.

---

## 15. Future cloud identity model (MODE B)

```text
Local User.userId
      ↕  link (optional, explicit)
Cloud Identity Provider subject
```

- Cloud **no** crea el dominio; solo **enlaza**.  
- Revocar cloud no borra User local.  
- Multi-device cloud sync = fase distinta (datos), no este contrato.

---

## 16. Persistence recommendation

**Preferir SQLite existente del Gateway** (`gateway` DB / migraciones actuales).

| Entidad | Dónde |
|---------|-------|
| User | Nueva tabla `users` (migración futura) |
| PersonalAgent | Tabla `agents` o fila única + adoptar `agentId` env/secrets |
| Device | Extender `trusted_devices` (KEEP) |
| Node | Nueva tabla `trusted_nodes` cuando haga falta remoto; fila sintética local entretanto |
| Session | Tabla `sessions` o store memoria+persist selectivo; browser sessions hoy in-memory → persistir/registrar |
| Policy | Extender / versionar ToolPolicy (código + opcional DB overrides) |
| Credential metadata | KEEP files/`credentials` + PHASE 59 CredentialManager; no mezclar con Device |

**No** introducir otra base de datos de producto en PHASE 57.

Desktop `secrets.json` sigue siendo **secure material del host** (token legacy, agentId), no el catálogo de dominio.

---

## 17. Migration plan (alto nivel)

```text
Phase 57.1  Design contract          ← this document
Phase 57.x  Persist User + Agent ownership (adopt agentId)
Phase 57.x  Session registry + scopes; browser ≠ install
Phase 57.x  Network harden (loopback default)
Phase 57.x  Enforce device permissions; revoke → kill sessions
Phase 57.x  HUB_TOKEN as install_compat only
Phase 58+   Node remote identity / mutual auth (when needed)
Later       Cloud link (MODE B)
```

Compatibilidad: protocolo WS actual se mantiene; clients Android/Web existentes siguen con `auth` install/device hasta que las fases endurezcan el server.

---

## MINIMUM IMPLEMENTATION PLAN

Secuencia mínima, riesgo bajo, sin romper Gateway / Web / Android / Node / MCP / pairing / sessions actuales.

### Step 1 — Persist User + bind PersonalAgent

| | |
|--|--|
| **Changes** | Tabla `users`; fila `agents` (o equivalente) con `ownerUserId`; adoptar `agentId` existente |
| **Untouched** | Protocolo, pairing, WS auth, Web UI, Node, MCP, ToolPolicy |
| **Risk** | Bajo — additive schema |
| **Test** | Migración DB; boot crea User+Agent una vez; restart idempotente |

### Step 2 — Annotate trusted_devices with agentId/ownerUserId

| | |
|--|--|
| **Changes** | Columnas nullable → backfill instalación única |
| **Untouched** | Pairing flow, QR, Android credential |
| **Risk** | Bajo |
| **Test** | Pair device; fila tiene `agentId`; revoke sigue funcionando |

### Step 3 — Session scopes for browser cookie

| | |
|--|--|
| **Changes** | Cookie/browser principal deja de mapear a install pleno; scopes `agent.chat` / `console.read` / `agent.confirm`; admin solo install_compat o host |
| **Untouched** | Pairing HTTP (sigue install Bearer); MCP; Android device auth |
| **Risk** | Medio — setup desde browser cookie puede romper si UI asumía admin |
| **Test** | Host bootstrap: chat OK; `POST /v1/setup/llm` con solo cookie → deny; con HUB_TOKEN host → allow |

### Step 4 — Stop storing HUB_TOKEN in Web sessionStorage (host path)

| | |
|--|--|
| **Changes** | Host bootstrap path: token vacío + cookie scoped (ya casi); manual Setup sigue compat |
| **Untouched** | Android; protocolo |
| **Risk** | Bajo–medio en path manual |
| **Test** | Refresh host console; WS auth vía cookie; no token en JS |

### Step 5 — Network harden

| | |
|--|--|
| **Changes** | Bind loopback by default; opt-in remote; reducir `/health` anónimo fuera de loopback |
| **Untouched** | Pairing semantics; ToolPolicy |
| **Risk** | Medio para usuarios Tailscale — debe ser flag explícito Desktop |
| **Test** | Default: LAN sin auth no alcanza control plane; Tailscale opt-in documentado |

### Step 6 — Enforce device permissions + revoke kills sessions

| | |
|--|--|
| **Changes** | Aplicar `permissions`; registry de sessions; revoke → `revokedAt` en sessions + WS disconnect |
| **Untouched** | QR format; Node local spawn |
| **Risk** | Medio |
| **Test** | Device sin scope no llama admin HTTP; revoke → siguiente `auth` falla; Android recibe `auth_failed` |

### Step 7 — Document Node local as first-class record

| | |
|--|--|
| **Changes** | Fila `trusted_nodes` sintética `local-default` al boot; sin crypto aún |
| **Untouched** | MCP stdio auth (sigue local); Tools |
| **Risk** | Bajo |
| **Test** | Boot registra node; tools/list sin cambio de comportamiento |

### Step 8 — HUB_TOKEN = install_compat only (docs + server marking)

| | |
|--|--|
| **Changes** | Telemetría/diagnostics marcan uso install; no eliminar token |
| **Untouched** | Desktop env inject |
| **Risk** | Bajo |
| **Test** | Compat clients verdes; checklist de deprecación |

### Explicitly deferred (not in minimum plan)

- Node remoto mutual auth  
- Device keypair crypto (más allá de credential opaco)  
- Cloud identity  
- OAuth/email  
- New database engine  
- Protocol message renames  

---

## Non-goals (confirmación)

Esta fase de diseño **no** introduce Firebase, OAuth, OIDC, email obligatorio, cuenta cloud, multi-tenancy, gestión compleja de usuarios, tokens/certs manuales para el usuario, ni cambios de protocolo/UI/schema en este documento.

---

**Fin PHASE 57.1.** Esperar instrucción siguiente antes de implementar.

---

## Implementation note (PHASE 57.2)

Implementado en código: User + PersonalAgent locales, `UserContext`, anotación Device, compat `HUB_TOKEN` = `install_compat`.

Ver [`identity-foundation.md`](./identity-foundation.md).

**Decisión explícita confirmada:** `PersonalAgent.id` (instalación / `PERSONAL_AGENT_ID`) **≠** `AgentDefinition.id` (runtime LLM `personal-assistant`). No se unifican.

---

## Implementation note (PHASE 57.3)

Implementado: registro `auth_sessions`, Session → UserContext, browser ≠ install, `revokeSession` + WS kill, TTL browser/device, install_compat sin auto-expire local.

Ver [`session-identity.md`](./session-identity.md).

---

## Implementation note (PHASE 57.4)

Implementado: `assertAgentOwner`; host routes = owner + `install_compat` (transporte, no sinónimo); `revokeTrustedDevice` → sessions + WS kill; bind default `127.0.0.1` (`HUB_HOST` opt-in).

Device = auth/revocación, **no** rol. Sin RBAC.

---

## Implementation note (PHASE 57.5)

Tool Safety: `evaluateToolSafety` → ALLOWED / CONFIRMATION_REQUIRED / DENIED sobre `ToolPolicy` existente; HITL sin duplicar; unknown = DENIED.

Ver [`tool-policy.md`](./tool-policy.md).

---

## Implementation note (PHASE 57.6)

Trusted Devices UI + `GET/POST /v1/devices` owner-scoped. Revoke = mecanismo 57.4.

Ver [`trusted-devices.md`](./trusted-devices.md).

---

## Implementation note (PHASE 57.7)

Remote access opt-in (`HUB_HOST`); loopback default; `/health` mínimo off-loopback; `install_compat` / HUB_TOKEN solo loopback; Trusted Device + AuthSession para producto remoto; Tool Safety sin cambio.

Ver [`remote-access.md`](./remote-access.md).

---

## Implementation note (PHASE 57.8)

Device Ed25519: `publicKey` en Gateway; private key solo en dispositivo (`DeviceKeyStore`); challenge-response → AuthSession; pairing puede registrar `publicKey`; legacy enroll vía `/v1/device-auth/enroll`.

Ver [`device-cryptographic-identity.md`](./device-cryptographic-identity.md).

---

## Implementation note (PHASE 57.9)

`WindowsDeviceKeyStore`: Ed25519 + DPAPI (CNG no soporta EdDSA). Persistencia tras reinicio; sin UX; sin cambio de protocolo.

---

## Implementation note (PHASE 57.10)

Enrollment: pairing existente + `publicKey`; Desktop `ensureHostDeviceEnrollment`; Android envía SPKI en `pairing_request`. Legacy sin publicKey intacto.

Ver [`device-cryptographic-identity.md`](./device-cryptographic-identity.md).

**Siguiente:** Android Keystore endurecido / Browser Device Identity (cuando haga falta).
