# PHASE 65 — AUDIT (Product Validation Gate)

Fecha: 2026-09-04.  
Host de auditoría: Linux (`ironman`) — sin Windows VM ni Android físico en esta sesión de agente.

## 1. Cómo se genera el instalador

| Pieza | Detalle |
|-------|---------|
| Empaquetado | `npm run package:windows` → `scripts/package-windows.mjs` |
| Layout | `dist/windows/PersonalAgent/` (gateway, node, desktop, console, runtimes) |
| Instalador | **Inno Setup 6** (`installer/windows/personal-agent.iss`) → `PersonalAgent-Setup.exe` |
| CI | `.github/workflows/windows-installer.yml` (windows-latest + ISCC) |
| No usa | NSIS, electron-builder |

Runtimes opcionales: `FETCH_NODE_WIN=1`, `FETCH_ELECTRON_WIN=1`.

## 2. Gateway / Node en producción

```text
AgentePersonal.bat
  → Electron (runtime/electron)
  → desktop/ → agent-process.cjs
  → runtime/node/node.exe gateway/gateway.cjs
       → attachLocalNode → ../node/node.cjs (MCP stdio)
```

Datos (no en install dir):

```text
%LOCALAPPDATA%\Ideass\PersonalAgent\
  config/product.json
  config/secrets.json   (hubToken, anthropicApiKey, agentId)
  config/onboarding.json
  logs/gateway.log
  data/personal-agent.db
  objects/
  credentials/
```

## 3. agentId

- Creado por `desktop/lib/agent-identity.cjs` (`ensureAgentId`) → `secrets.json`.
- Inyectado al Gateway como `PERSONAL_AGENT_ID`.
- Debe sobrevivir reinicios; no regenerarse cada boot.

## 4. Tailscale

- `desktop/lib/tailscale.cjs`: `MISSING | AUTH_REQUIRED | CONNECTED | READY`.
- Onboarding exige `NETWORK_READY` antes de arrancar Agent (`onboarding.cjs`).
- Skip solo con `PERSONAL_AGENT_SKIP_TAILSCALE=1` y **prohibido** en packaged/production.

## 5. Pairing / QR

- HTTP: `POST /v1/pairing/sessions` (Bearer install = `HUB_TOKEN`).
- QR: `personalagent://pair?v=1&agent=&endpoint=&session=&secret=`
- `containsHubToken: false` — `HUB_TOKEN` **no** va en el QR.
- Secret hasheado; TTL ~5 min; endpoint preferido Tailscale IPv4.

## 6. Android pairing

```text
Camera → PairingQrParser → ConnectionViewModel.pairWithQrUri
  → WS pairing_request → Desktop approve → TrustedDevice
  → deviceCredential + authKind=device
```

## 7. Capability E2E (PHASE 64)

```text
Android WS → AgentRuntime → CapabilityExecutor
  → CapabilityIndex → node-local → MCP/stdio → Node → Tool → Result
```

## 8. Artifact delivery

- Gateway: `GET|HEAD /artifacts/:id` (Bearer install **o** device + `X-Device-Id`).
- Android: `ArtifactHttpClient.kt` existe; wiring UI chat **incompleto** (gap de producto).

## 9. Smoke / validate existentes

| Script | Alcance |
|--------|---------|
| `smoke:package` | Handshake Gateway + MCP tools/list + filesystem.read |
| `validate:windows-package` | Layout Windows (no install real) |
| `field-test-preflight.mjs` | `/health` (+ Bearer opcional) |

## 10. Lo que esta sesión Linux puede / no puede validar

| Puede | No puede (HARD GATE) |
|-------|----------------------|
| Tests Gateway/Node/Desktop | Installer Inno real en Windows limpia |
| typecheck / build / package smoke | Tailscale READY en PC Windows |
| Layout `package:windows` | QR físico + CameraX en dispositivo |
| APK `assembleDebug` + unit tests | TrustedDevice E2E real |
| Architecture PHASE 64 | Artifact download E2E desde chat Android |
| | Windows reboot / Node restart field |

## 11. Conclusión

La cadena de producto está **diseñada e implementada** en código.  
PHASE 65 como *Product Validation Gate* requiere evidencia de campo Windows+Android.  
Sin esa evidencia: **BLOCKED**, no PASS.
