# PHASE 51 — Windows Installer + Agent Console Integration

**Estado:** PHASE 51 CLOSED / IMPLEMENTED (packaging + shell)  
**Fecha:** 2026-08-27  

**Decision:** **READY WITH DEBT**

Field / installer compilation on real Windows: **BLOCKED / NOT TESTED** (this environment is Linux; Inno and Android hardware unavailable).

**Productive code changed:** **YES**

---

## 1. Objective

Convertir el sistema en un producto Windows instalable y preparar la primera
validación real Windows + Android — sin rediseñar arquitectura.

```text
PersonalAgent-Setup.exe → First Run → AGENT READY → Agent Console → Android
```

Agent Console Web = UI principal. Electron = tray/launcher mínimo.

---

## 2. What changed (51A–51H)

| Área | Cambio |
|------|--------|
| **51A Packaging** | `package-windows.mjs` incluye `console/` + `web/dist`, Electron runtime slot, Node runtime slot, bat sin npm |
| **51B Inno** | `PersonalAgent-Setup.exe`; ISPP `#error` exige node.exe + electron.exe + console **al compilar**; `CurStepChanged` verifica `{app}` post-install; sin secretos. **No** usar `InitializeSetup` + `FileExists(SourceRoot)` (rompe en la PC del usuario). |
| **51C First-run** | Wizard: Welcome → Workspace → API key → Boot status → AGENT READY → Open Console |
| **51D Workspace** | Persiste en AppData `product.json`; spawn con `AGENT_FILESYSTEM_ROOT` (48A) |
| **51E Console** | Static en paquete; `AGENT_CONSOLE_STATIC` + `../console` desde Gateway cwd |
| **51F Tray** | Start / Stop / Restart / Open Console / Diagnostics / Logs / Quit — **no Chat** |
| **51G Pairing** | LAN WS URLs + Console HTTP URLs + token copy (masked UI) |
| **51H Diagnostics** | Snapshot Gateway/Node/MCP/Tools/Workspace/Console; secrets redacted |

---

## 3. No npm on target

`AgentePersonal.bat`:

- Requiere `runtime\electron\electron.exe` y `runtime\node\node.exe`
- **No** menciona `npm install`
- Fallo explícito si faltan runtimes embebidos

Empaquetado con red:

```bash
FETCH_NODE_WIN=1 FETCH_ELECTRON_WIN=1 npm run package:windows
```

---

## 4. Layout

```text
dist/windows/PersonalAgent/
  runtime/node/node.exe          # required before Inno
  runtime/electron/electron.exe  # required before Inno
  gateway/
  agent/
  console/                       # Agent Console static
  web/dist/                      # alternate resolve path
  desktop/                       # tray sources (no node_modules)
  migrations/
  AgentePersonal.bat
  manifest.json
```

Config real: `%LOCALAPPDATA%\Ideass\PersonalAgent\` (secrets fuera del bundle).

---

## 5. Architecture

**Sí:** packaging, first-run shell, Console serving, tray infra.

**No:** Runtime/MCP/policy en Electron o browser; User/ACL; PermissionManager;
protocol frames; Internet remote; QR identity.

---

## 6. Debt carried

- D-50-01 … D-50-06 (trackeados; no expandidos salvo lo necesario)
- D-51-01: Inno compile + install en Windows real — **BLOCKED** en Linux packager
- D-51-02: Android hardware LAN — **NOT TESTED**
- D-51-03: Excel on Windows — **NOT TESTED**
- Pre-existing PHASE 32 doc drift

---

## 7. Validation distinction

| Tipo | Resultado |
|------|-----------|
| AUTOMATED / MOCK (layout, tests, builds) | Ejecutado en esta sesión |
| REAL WINDOWS / ANDROID FIELD | **NOT EXECUTED / BLOCKED** |

Ver [`phase51-windows-installation-validation.md`](./phase51-windows-installation-validation.md).

---

## 8. PHASE 52 (proposal only — not started)

Field execution on clean Windows + physical Android using the compiled Setup.exe,
following the validation protocol end-to-end.

---

## 9. PHASE 51B (onboarding red segura)

Post-install Tailscale gate + máquina de estados persistente: [`phase51b-onboarding-secure-network.md`](./phase51b-onboarding-secure-network.md). Inno sigue empaquetando binarios; el onboarding vive en `desktop/`.
