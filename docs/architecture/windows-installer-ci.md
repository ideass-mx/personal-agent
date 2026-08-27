# Windows Installer CI (GitHub Actions)

**Estado:** documentado para packaging CI  
**Fecha:** 2026-08-27  

## Qué hace el workflow

Archivo: [`.github/workflows/windows-installer.yml`](../../.github/workflows/windows-installer.yml)

En un runner **`windows-latest`**:

1. Checkout del repositorio  
2. Node.js **22** (alineado con `scripts/build.mjs` → `target: "node22"`)  
3. `npm ci` en `hub/`, `agent/`, `web/`, `packages/protocol`, `packages/workspace-http`  
4. `FETCH_NODE_WIN=1` + `FETCH_ELECTRON_WIN=1` → `npm run package:windows`  
5. Diagnóstico de layout (`node.exe`, `electron.exe`, Console, Hub, Agent)  
6. `REQUIRE_WINDOWS_RUNTIMES=1 npm run validate:windows-package` (falla si faltan runtimes)  
7. Tests de arquitectura PHASE 51  
8. `npm run smoke:package` (con placeholders de env; no son secretos de producción)  
9. Instala **Inno Setup 6** vía Chocolatey (paquete `innosetup`)  
10. Compila `installer/windows/personal-agent.iss` → `dist/windows/PersonalAgent-Setup.exe`  
11. Verifica existencia y tamaño mínimo del EXE  
12. Publica el artefacto **`PersonalAgent-Windows-Installer`**

**No** crea GitHub Releases.  
**No** instala ni valida Personal Agent en una PC física.

---

## Cómo ejecutarlo manualmente

1. GitHub → repo → **Actions**  
2. Workflow **Windows Installer**  
3. **Run workflow** (`workflow_dispatch`)  
4. Elige la rama que contiene el workflow + packaging PHASE 51  
5. **Run workflow**

También se dispara al hacer push de tags `v*` (solo artifact; sin Release).

---

## Dónde aparece el artifact

Tras un run exitoso:

**Actions → run → Artifacts → `PersonalAgent-Windows-Installer`**

Contiene:

`PersonalAgent-Setup.exe`

---

## Cómo descargar `PersonalAgent-Setup.exe`

1. Abre el run del workflow  
2. Baja el artifact `PersonalAgent-Windows-Installer`  
3. Descomprime el ZIP del artifact  
4. Obtienes `PersonalAgent-Setup.exe`

CLI (con `gh` autenticado):

```bash
gh run list --workflow=windows-installer.yml --limit 5
gh run download <RUN_ID> --name PersonalAgent-Windows-Installer
```

---

## Qué significa PASS

> **CI exitoso significa que el instalador fue compilado en un Windows runner.**  
> **No significa que PersonalAgent haya sido instalado y validado en una PC Windows física.**

PASS implica:

- Layout `dist/windows/PersonalAgent/` generado  
- Node + Electron Windows embebidos presentes  
- Validación de package en modo estricto  
- `PersonalAgent-Setup.exe` generado y subido como artifact  

PASS **no** implica:

- First-run real en hardware  
- AGENT READY en campo  
- Android / LAN / Excel  
- PHASE 52 field testing  

---

## Variables relevantes (sin secretos de producción)

| Variable | Uso |
|----------|-----|
| `FETCH_NODE_WIN=1` | Descarga Node portable win-x64 (script existente) |
| `FETCH_ELECTRON_WIN=1` | Descarga Electron win-x64 (script existente) |
| `REQUIRE_WINDOWS_RUNTIMES=1` | Hace fallar `validate:windows-package` si faltan runtimes |
| `ANTHROPIC_API_KEY` / `HUB_TOKEN` | Placeholders solo para smoke/config load en CI |

El workflow **no** imprime estos valores.

---

## Fallos preexistentes conocidos

- Test de arquitectura **PHASE 32 documentation drift** (si se ejecuta la suite completa del Hub) — **no** se ejecuta en este workflow; no se “arregla” aquí.

---

## Relación con PHASE 51 / 52

- PHASE 51: packaging + Inno source + tray/Console integration  
- Este CI: genera el EXE de forma reproducible en GitHub  
- PHASE 52 (no iniciada): validación field en Windows/Android reales  
