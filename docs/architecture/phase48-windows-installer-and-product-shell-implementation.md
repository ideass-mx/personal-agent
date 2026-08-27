# PHASE 48 — Windows Installer & Desktop Product Shell Implementation

**Estado:** PHASE 48 CLOSED / IMPLEMENTED  
**Fecha:** 2026-08-27.

**Decision:** **READY WITH DEBT**

**Productive code:** YES (48A hub boot + desktop shell + package-windows + Inno source)

**WINDOWS FIELD VALIDATION = NOT EXECUTED** (sesión Linux; sin Setup.exe compilado en Windows ni Android físico).

---

## 1. 48A — Filesystem root boot fix

**E-47-01 resuelto en el boot path por defecto.**

| Cambio | Detalle |
|--------|---------|
| `hub/src/index.ts` | `import "dotenv/config"` **antes** de spawn; `resolveAgentFilesystemRoot()` → `attachLocalAgent({ filesystemRoot })` |
| `hub/src/runtime/resolve-filesystem-root.ts` | Helper puro |
| Logs | `[hub] AGENT_FILESYSTEM_ROOT=configured` sin imprimir la ruta |
| Tests | `hub/tests/runtime/filesystem-root-boot.test.ts` |

Legacy: root vacío sigue opcional (sin fail-fast).

---

## 2. Installer architecture

| Pieza | Ubicación |
|-------|-----------|
| Inno Setup script | `installer/windows/personal-agent.iss` |
| Package pipeline | `npm run package:windows` → `scripts/package-windows.mjs` |
| Output layout | `dist/windows/PersonalAgent/` |
| Privileges | `PrivilegesRequired=lowest` (per-user) |
| Uninstall | Pregunta antes de borrar config/DB; **nunca** borra workspace |

**Setup.exe:** se compila en Windows con Inno Setup 6+. **No compilado en esta sesión.**

---

## 3. Package layout

```text
dist/windows/PersonalAgent/
  runtime/node/     # FETCH.txt / optional zip (FETCH_NODE_WIN=1)
  gateway/          # hub.cjs + natives + migrations
  agent/            # agent.cjs (+ winax if present)
  desktop/          # Electron Control Center sources
  resources/        # personal-agent.iss copy
  migrations/
  AgentePersonal.bat
  VERSION
  manifest.json
  README.txt
```

Embedded Node strategy: portable Node 22 win-x64 under `runtime/node/node.exe`. En Linux packer: instrucciones + opcional `FETCH_NODE_WIN=1`.

---

## 4. Desktop Shell (48C)

`desktop/` — Electron tray Control Center.

- First-run: elegir workspace + API key opcional  
- Start/stop/restart Gateway (proceso existente)  
- Estados: NOT_CONFIGURED / STARTING / READY / DEGRADED / ERROR / STOPPED  
- Pairing: IP + port + copiar token (enmascarado en UI)  
- Diagnóstico sanitizado  
- Logs en AppData  
- Cerrar ventana ≠ salir (tray)  

**No Chat. No Runtime. No policy.**

---

## 5. Lifecycle

Desktop Shell inicia Gateway como hijo con env:

- `HUB_TOKEN`, `HUB_PORT`, `AGENT_FILESYSTEM_ROOT`, `ANTHROPIC_API_KEY`  
- `PERSONAL_AGENT_DB` → `%LOCALAPPDATA%\Ideass\PersonalAgent\data\`  

Inicio con Windows: tarea Inno `[Tasks] startup` → shortcut en Startup.  
**Sin Windows Service.**

---

## 6. First-run

Detecta `firstRunComplete` / workspace vacío → panel:

> Tu agente personal vive en esta PC.  
> Elegir carpeta → Continuar → start agent.

---

## 7. Configuration

| Dónde | Qué |
|-------|-----|
| `%LOCALAPPDATA%\Ideass\PersonalAgent\config\product.json` | prefs (sin secretos) |
| `...\config\secrets.json` | token + API key (chmod 600 cuando posible) |
| Install dir | solo binarios |

---

## 8. Filesystem root

Shell persiste workspace → env `AGENT_FILESYSTEM_ROOT` al spawn → 48A attach → Node `loadNodeConfig`.

---

## 9–10. Diagnostics / Logs

- Copiar diagnóstico sin secretos (`desktop/lib/diagnostics.cjs`)  
- Logs: `...\logs\gateway.log`  

---

## 11. Android connection

MVP: mostrar `ws://LAN:port` + copiar `HUB_TOKEN`. Sin QR. Auth model intacto.

---

## 12. Excel

winax se copia si está en `agent/node_modules`. UI: «requiere Microsoft Excel». No se incluye Excel.

---

## 13. Uninstall

Inno `InitializeUninstall`: pregunta borrar config/data/logs. Workspace **nunca**.

---

## 14. Security

- Sin `.env` con secretos en install dir  
- Token no en argv  
- Diagnóstico redactado  
- childEnv sigue filtrando secretos Gateway → Node  

`PERSONAL_AGENT_DB` añadido a `hub/src/config.ts` (ruta DB opcional) — no cambia auth/policy.

---

## 15. Tests

| Suite | Resultado esperado |
|-------|-------------------|
| filesystem-root-boot | PASS |
| desktop shell-unit | PASS |
| phase48 arch | PASS |
| typecheck / build / smoke / Android | PASS |

---

## 16. Known limitations

- Electron no se empaqueta prebuilt en Linux CI; primer run en Windows puede requerir `npm install` en `desktop/`.  
- `node.exe` portable no descargado salvo `FETCH_NODE_WIN=1`.  
- Setup.exe no compilado aquí.  
- Android connected state no live en Shell.  
- `/health.agentReady` sigue siendo snapshot de boot.

---

## 17. Windows validation status

```text
WINDOWS FIELD VALIDATION = NOT EXECUTED
```

---

## 18. Field-test readiness

Tras compilar Setup.exe en Windows + instalar Node portable + Electron deps:

Clean Windows → Setup → First Run → Workspace → READY → Android → checklist 44.

**No se ejecutó ese flujo en PHASE 48.**

---

## Architecture Changes

```text
NONE to Runtime/MCP/policy/protocol.
Product shell + installer packaging + FS root boot wiring only.
```

## Findings

| ID | Clase | Nota |
|----|-------|------|
| E-47-01 | E→A | Corregido en 48A |
| E-48-01 | E | Setup.exe / Node portable / Electron full bundle requieren máquina Windows |
| D-48-01 | D | Primer arranque puede pedir `npm install` en desktop si no hay electron embebido |
