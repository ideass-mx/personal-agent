# INSTALLER READINESS MATRIX
## Pre-PHASE 65

Clasificación: `PASS` | `WARNING` | `FAIL` | `BLOCKER` | `NOT VERIFIED`

Evidencia: código/scripts/layout en repo; no instalación Windows física en esta sesión.

| # | Requirement | Status | Evidence / note |
|---|-------------|--------|-----------------|
| 1 | Installer technology identified | PASS | Inno Setup 6 `personal-agent.iss` |
| 2 | User artifact = Setup.exe | PASS | `OutputBaseFilename=PersonalAgent-Setup` |
| 3 | Setup.exe reproducible from CI | PASS | `windows-installer.yml` + docs |
| 4 | Setup.exe present in this audit host | NOT VERIFIED | Linux sin ISCC |
| 5 | Clean install without system Node/npm | PASS | Embedded `runtime/node` + `runtime/electron` |
| 6 | Clean install without Tailscale | WARNING | Tailscale **REQUIRED** for NETWORK_READY; not bundled |
| 7 | Install location per-user | PASS | `{localappdata}\Programs\PersonalAgent` |
| 8 | No repo-relative paths at runtime | PASS | `PERSONAL_AGENT_PRODUCT_ROOT` + relative `../node/node.cjs` |
| 9 | No `/home`/`/workspace` in product launchers | PASS | `AgentePersonal.bat` uses `%~dp0` |
| 10 | User data under Ideass\PersonalAgent | PASS | `desktop/lib/config.cjs` |
| 11 | config/logs/data dirs created | PASS | Inno `[Dirs]` + runtime `ensureDirs` |
| 12 | objects/ credentials/ created | PASS | Runtime `ensureDirs` (not Inno) |
| 13 | No secrets in installer payload | PASS | Design; SourceRoot sin `.env` |
| 14 | agentId UUID persistent | PASS | `agent-identity.cjs` → secrets.json |
| 15 | agentId survives reboot (field) | NOT VERIFIED | Design yes; field pending |
| 16 | Gateway starts from packaged product | PASS | Desktop supervisor → gateway.cjs |
| 17 | Node spawned by Gateway MCP | PASS | `attachLocalNode` / `resolve-agent.ts` |
| 18 | MCP without tsx/npm run | PASS | Compiled `.cjs` only |
| 19 | MCP smoke (packaged) | PASS | `smoke:package` |
| 20 | Desktop supervises Gateway | PASS | `agent-process.cjs` start/stop/restart/health |
| 21 | Onboarding NETWORK_READY gate | PASS | `canStartAgentRuntime` |
| 22 | Tailscale phases MISSING→READY | PASS | `tailscale.cjs` |
| 23 | Tailscale creds not in installer/QR | PASS | Probe-only; QR contract |
| 24 | Skip Tailscale blocked when packaged | PASS | `isDevelopmentBuild` / PRODUCTION |
| 25 | Windows startup optional | PASS | Inno task → `{userstartup}` |
| 26 | Windows Service | PASS | Not used (supervisor model OK) |
| 27 | Firewall automation | WARNING | No installer firewall rules; port 8787 |
| 28 | Pairing endpoint Tailscale IPv4 | PASS | `begin-pairing` in `main.js` |
| 29 | Pairing without HUB_TOKEN in QR | PASS | Protocol + UI copy |
| 30 | CredentialManager / no plaintext secrets DB | PASS | PHASE 59 design |
| 31 | LocalObjectStorage offline default | PASS | objects/ + local provider |
| 32 | Migrations 001–007 packaged | PASS | layout `migrations/` |
| 33 | Uninstall preserves workspace | PASS | iss comments + Code |
| 34 | Uninstall optional wipe config/data/logs | PASS | `InitializeUninstall` |
| 35 | Uninstall wipes objects/credentials | WARNING | Not in DelTree list |
| 36 | Upgrade preserves agentId | NOT VERIFIED | Stable AppId; field pending |
| 37 | Upgrade preserves trusted devices/artifacts | NOT VERIFIED | Field pending |
| 38 | win32 better-sqlite3 in **Windows CI** build | PASS | `npm ci` on windows-latest |
| 39 | win32 better-sqlite3 in **Linux** package:windows | BLOCKER | ELF `.node` observed in layout |
| 40 | Crash: Gateway/Node recovery | WARNING | Manual restart/supervisor; no auto-respawn service |
| 41 | Log secret redaction (Desktop) | PASS | diagnostics / onboarding-log |
| 42 | Field log security scan | NOT VERIFIED | Needs PHASE 65 |
| 43 | Android QR/parser/authKind static | PASS | Kotlin + unit tests |
| 44 | Android Artifact download E2E wired | WARNING | Client exists; product UX incomplete |
| 45 | Architecture: installer ≠ capability router | PASS | Boundaries held |
| 46 | Real Tailscale + Android pairing | NOT VERIFIED | PHASE 65 |
| 47 | Real Capability E2E on install | NOT VERIFIED | PHASE 65 |
| 48 | Real Artifact E2E on install | NOT VERIFIED | PHASE 65 |
| 49 | Fresh Windows install field | NOT VERIFIED | PHASE 65 |
| 50 | Package layout validate + FETCH runtimes | PASS | validate:windows-package PASS (with FETCH) |

---

## Score method

No pesos arbitrarios. Score =  
`PASS / (PASS + WARNING + FAIL + BLOCKER + NOT VERIFIED)` sobre filas de la matriz.

```text
PASS:          28
WARNING:        6
FAIL:           0
BLOCKER:        1
NOT VERIFIED:   8
Total rows:    50

Installer Readiness Score = 28/50 = 56%
Design/CI path score (excluding NOT VERIFIED + treating Linux-native BLOCKER as avoided by CI) ≈
  28 / (28+6+0+0) = 82% of decidable non-field items if BLOCKER mitigated by Windows CI only.
```

Interpretación:

- **56%** incluye deuda de field (NOT VERIFIED) — esperado pre-PHASE 65.
- El **único BLOCKER** es operativo: no distribuir paquetes Linux a Windows.
- Con Setup.exe de CI Windows → readiness de *instalador* suficiente para **CONDITIONAL GO** a field.

---

## Summary counts

```text
Critical blockers: 1
Failures:          0
Warnings:          6
Not verified:      8
Pass:             28
```

---

## GO / NO-GO

```text
INSTALLER READINESS STATUS: CONDITIONAL GO
```

Condiciones obligatorias antes/durante PHASE 65:

1. Usar **solo** `PersonalAgent-Setup.exe` del workflow **windows-latest**.
2. Tener Tailscale instalable en la PC de prueba (dependencia externa).
3. Aceptar warnings: firewall, uninstall objects/credentials, artifact Android UX.
4. No confundir este audit con PHASE 65 PASS.
