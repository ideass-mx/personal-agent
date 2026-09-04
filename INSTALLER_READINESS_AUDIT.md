# INSTALLER READINESS AUDIT
## Pre-PHASE 65 — Production Installer & Runtime Readiness

Fecha: 2026-09-04  
Método: **solo lectura / evidencia de código + layout empaquetado** (sin instalar en Windows limpia).  
Host de auditoría: Linux.  
**Este audit ≠ PHASE 65 field validation.**

---

## INSTALLER READINESS STATUS: CONDITIONAL GO

Condición: PHASE 65 debe usar **`PersonalAgent-Setup.exe` construido en `windows-latest` (GitHub Actions)**, no un layout empaquetado desde Linux.

---

## 1. Tecnología real del instalador

| Pregunta | Evidencia |
|----------|-----------|
| Tecnología | **Inno Setup 6** (`installer/windows/personal-agent.iss`) |
| Empaquetado previo | `scripts/package-windows.mjs` → `dist/windows/PersonalAgent/` |
| Shell UI | Electron portable embebido (no electron-builder / no Squirrel / no MSIX / no WiX / no NSIS) |
| Artefacto usuario | `PersonalAgent-Setup.exe` (OutputBaseFilename) |
| Privileges | `PrivilegesRequired=lowest` (per-user) |
| Install dir | `{localappdata}\Programs\PersonalAgent` |

---

## 2. Artefacto que recibe el usuario

```text
filename:     PersonalAgent-Setup.exe
version:      0.1.0 (iss MyAppVersion; layout VERSION=0.1.0-phase51)
architecture: win-x64 (Node + Electron win32-x64)
build source: npm run package:windows + ISCC personal-agent.iss
CI:           .github/workflows/windows-installer.yml → artifact PersonalAgent-Windows-Installer
```

**Reproducible:** sí, vía workflow `windows-installer` (documentado en `docs/architecture/windows-installer-ci.md`).

**En esta sesión Linux:** layout + runtimes embebidos **sí**; Setup.exe **no** (sin ISCC).

---

## 3. Clean install — dependencias externas

| Dependency | Class | Notes |
|------------|-------|-------|
| Node.js del sistema | NOT REQUIRED | Embebido: `runtime/node/node.exe` |
| npm / yarn / pnpm / Git / IDE / repo | NOT REQUIRED | Launcher falla si faltan runtimes y pide reinstalar |
| Electron del sistema | NOT REQUIRED | Embebido: `runtime/electron/electron.exe` |
| **Tailscale** | **REQUIRED (runtime)** | No lo instala Inno; onboarding detecta CLI y bloquea Agent hasta READY |
| Anthropic API key | REQUIRED (onboarding) | Usuario la introduce; no va en el instalador |
| Microsoft Excel + winax | OPTIONAL | Solo capabilities Office; winax se copia si existe en build |
| Windows Firewall rules | NOT CONFIGURED | Puerto 8787 por defecto — WARNING |

---

## 4. Ubicaciones: programa vs datos

### Instalación (`{app}`)

```text
%LOCALAPPDATA%\Programs\PersonalAgent\
  AgentePersonal.bat
  runtime/node/node.exe
  runtime/electron/electron.exe
  gateway/gateway.cjs (+ better-sqlite3, …)
  node/node.cjs
  desktop/
  console/
  migrations/
  …
```

### User data (AppData — fuera de `{app}`)

```text
%LOCALAPPDATA%\Ideass\PersonalAgent\
  config/product.json
  config/secrets.json      (hubToken, anthropicApiKey, agentId)
  config/onboarding.json
  logs/gateway.log
  logs/onboarding.log
  data/personal-agent.db
  objects/                 (LocalObjectStorage)
  credentials/             (SecretStore file backend)
  runtime/
```

Inno crea en install: `config`, `logs`, `data`, `runtime` bajo Ideass\PersonalAgent.  
`objects/` y `credentials/` los crea Desktop `ensureDirs()` al arrancar (`desktop/lib/config.cjs`).

**Separación install ≠ user data:** PASS (diseño).

---

## 5. agentId

| Propiedad | Evidencia |
|-----------|-----------|
| Formato | UUID (`crypto.randomUUID`) |
| Persistencia | `config/secrets.json` vía `ensureAgentId()` |
| Supervivencia reinicios | Diseño: sí (AppData) |
| Fresh install | Nuevo UUID en primer `ensureAgentId` |
| No regenerar cada boot | Sí — retorna existente si válido |

---

## 6. Cadena Desktop → Gateway → Node → MCP

```text
AgentePersonal.bat
  → PERSONAL_AGENT_PRODUCT_ROOT={app}
  → electron.exe {app}\desktop
  → agent-process.cjs: node.exe {app}\gateway\gateway.cjs
       env: HUB_TOKEN, HUB_PORT, PERSONAL_AGENT_ID, DB, OBJECTS, CREDENTIALS, …
  → attachLocalNode → ../node/node.cjs (mismo node.exe, MCP stdio)
  → tools/list → CapabilityIndex sync → CapabilityExecutor
```

Producción **no** usa `tsx` / `npm run` / TypeScript source.

Marker READY: `[gateway] READY`. Health probe: `http://127.0.0.1:{port}/health`.

---

## 7. Onboarding / Tailscale / Pairing

```text
PREFLIGHT → NETWORK_* → NETWORK_READY → AGENT_* → PAIRING → CONFIGURING → READY
```

- `canStartAgentRuntime` exige `networkReady === true` **y** estado ≥ NETWORK_READY.
- Tailscale: CLI `tailscale status --json`; fases MISSING / AUTH_REQUIRED / CONNECTED / READY.
- Skip Tailscale solo en builds de desarrollo; prohibido si packaged / PRODUCTION.
- Pairing QR: `personalagent://pair?…` sin HUB_TOKEN; endpoint preferido Tailscale IPv4.
- Onboarding logs: redaction (`onboarding-log.cjs`).

**Installer no instala Tailscale** — solo el producto lo detecta. Clasificado REQUIRED externo.

---

## 8. Security / secrets

| Check | Result |
|-------|--------|
| Secrets en instalador / SourceRoot | Diseño: no (.env no se empaqueta) |
| secrets.json en AppData + chmod 600 | Sí (Windows puede ignorar chmod) |
| CredentialManager / SecretStore | Runtime Gateway; no SQLite plaintext de secretos de negocio |
| HUB_TOKEN en QR | Prohibido por contrato |
| Logs con redaction Desktop | Presente |

---

## 9. Storage / DB / migrations

- Default ObjectStorage: **local** bajo `objects/` (offline).
- Migrations `001`–`007` incluidas en layout `migrations/`.
- Aplicación en arranque Gateway (comportamiento existente).

---

## 10. Uninstall / Upgrade

| Behavior | Evidence |
|----------|----------|
| Uninstall binaries | Inno standard `{app}` |
| Optional wipe config/data/logs | `InitializeUninstall` YES/NO |
| Workspace | **Nunca** borrado |
| objects/ / credentials/ | **No** listados en wipe opcional → WARNING |
| Upgrade AppId | Estable `{{A8E5C2F1-…PERSONALAGENT51}}` |
| agentId en upgrade | Debe sobrevivir (AppData) — NOT VERIFIED en campo |

---

## 11. Crash recovery (actual)

- Desktop supervisor: start / stop / restart / health probe.
- Node disconnect: Gateway fail-closed / capabilities unavailable (PHASE 63/64).
- **No** Windows Service; startup opcional vía carpeta Startup + task Inno.
- **No** failover distribuido (correcto para este audit).

---

## 12. BLOCKER crítico encontrado (build en Linux)

```text
dist/windows/PersonalAgent/gateway/node_modules/better-sqlite3/.../better_sqlite3.node
= ELF 64-bit Linux shared object
```

Si se empaqueta desde Linux y se copia a Windows, Gateway **fallará** al cargar SQLite.

**Mitigación oficial:** CI `windows-latest` hace `npm ci` en Windows → native win32.  
**Regla PHASE 65:** solo Setup.exe del workflow Windows.

---

## 13. Android compatibility (estático)

| Item | Status |
|------|--------|
| QR schema + PairingQrParser | PASS (código + unit tests) |
| authKind=device | PASS (diseño) |
| WS endpoint en QR (Tailscale) | PASS (diseño Desktop) |
| ArtifactHttpClient | WARNING — cliente existe; wiring UX chat incompleto / no field-proven |
| Endpoint generado por producto instalado | PASS en código; NOT VERIFIED en red real |

---

## 14. Architecture boundary

Installer/Desktop **despliegan e inician**; no implementan routing de Capability ni semántica Artifact.  
PHASE 64 CapabilityExecutor permanece en Gateway. **PASS.**

---

## Overall readiness (narrative)

```text
Overall readiness:     CONDITIONAL GO
Installation:          PASS (Inno design) / Setup.exe NOT VERIFIED aquí
Gateway:               PASS (packaged cjs path) — IF win32 natives
Node:                  PASS (relative node.cjs + embedded node.exe)
MCP:                   PASS (diseño + smoke:package)
Tailscale:             WARNING (external REQUIRED; not bundled)
Onboarding:            PASS (state machine + NETWORK_READY gate)
Pairing:               PASS (diseño; field NOT VERIFIED)
Security:              PASS (design) / field log scan NOT VERIFIED
Persistence:           PASS (AppData agentId/db/objects)
Upgrade:               WARNING / NOT VERIFIED field
Uninstall:             WARNING (objects/credentials not in optional wipe)
Android compatibility: PASS static / WARNING artifact UX
Artifact delivery:     PASS Gateway HTTP / WARNING Android E2E UX
```

---

## Counts

```text
Critical blockers: 1  (Linux-built better-sqlite3 if shipped to Windows)
Failures:          0  (against intended Windows CI release path)
Warnings:          6
Not verified:      8  (field / Setup.exe binary in this session)
Pass:              14 (design + automated evidence items in matrix)
```

---

## RECOMMENDED NEXT ACTION

```text
2 + 3 + 1 (en ese orden práctico):
```

1. **Corregir / evitar el blocker de natives:** PHASE 65 **debe** consumir `PersonalAgent-Setup.exe` de Actions `windows-installer` (o build local en Windows). No usar layout Linux para field.
2. **Mejora opcional pre-65 (no bloquea si se sigue CI):** documentar o assert en packaging que `better_sqlite3.node` es PE/win32 cuando `package:windows` corre en Linux (fail-closed) — diferible.
3. **Advertir operador:** Tailscale se instala aparte; Firewall 8787 puede pedir permiso; uninstall limpio no borra `objects/`/`credentials/` por defecto.
4. **Proceder a PHASE 65 field** con CONDITIONAL GO (Windows limpia + Android físico + Setup CI).

**No** declarar PHASE 65 PASS desde este audit.  
**No** iniciar PHASE 66.
