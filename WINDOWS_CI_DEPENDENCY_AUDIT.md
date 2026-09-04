# WINDOWS CI DEPENDENCY AUDIT

Fecha: 2026-09-04  
Alcance: **diagnóstico solo lectura** (sin cambios a código, lockfiles, versiones ni `npm audit fix`).  
Workflow: `.github/workflows/windows-installer.yml`  
Host de auditoría: Linux (repo local). Logs de Actions en vivo: **no disponibles** (`gh` sin auth / repo privado).

---

## Executive Summary

El paso `Install dependencies (npm ci)` ejecuta **cinco** `npm ci` secuenciales. El log observado encaja con:

| Orden | Comando | Paquetes (win32) | Duración observada |
|------:|---------|------------------:|--------------------|
| 1 | `npm ci --prefix packages/protocol` | 1 | **~3s** |
| 2 | `npm ci --prefix packages/workspace-http` | **6** | **~7m** ← más lento |
| 3 | `npm ci --prefix gateway` | **258** | **~4m** (incluye warn `prebuild-install`) |
| 4 | `npm ci --prefix node` | ~99 non-optional | **no aparece en el paste** (sigue después) |
| 5 | `npm ci --prefix web` | ~68 non-optional | **no aparece en el paste** |

**Hallazgo principal:** el retardo anómalo (~7 minutos) **no** es `better-sqlite3` compilando. Es `packages/workspace-http` instalando solo **6** paquetes (tsx/typescript/esbuild). Ese árbol **no** es requerido por `package:windows` / smoke / Inno.

**Hallazgo secundario:** `gateway` (~4m, 258 paquetes) sí corre `better-sqlite3` → `prebuild-install@7.1.3`. Existe prebuild Windows Node 22 (`node-v127-win32-x64`); no hay evidencia de fallback a `node-gyp` en el paste. `winax` **no** está en el lockfile de `node/` y **no** se instala en CI.

`actions/setup-node` tiene `cache: npm` configurado (multi-lockfile). El paste es compatible con **cache fría** + I/O Windows + varios `npm ci` secuenciales.

**Status diagnóstico:** `ROOT_CAUSE_PARTIAL` — comando más lento y owner de `prebuild-install` identificados con evidencia de lockfile; causa exacta del hang de ~7m en el runner (Defender / red / extract) no confirmable sin logs Actions instrumentados.

---

## Workflow Installation Sequence

Fuente: `.github/workflows/windows-installer.yml`.

### Runner / toolchain

| Ítem | Valor |
|------|-------|
| Runner image | `windows-latest` |
| Arquitectura | `X64` (GitHub `RUNNER_ARCH`; workflow imprime OS/ARCH) |
| Node | `22` vía `actions/setup-node@v4` |
| npm | el que trae Node 22 en la imagen (impreso en step Diagnostics; no pinneado) |
| Timeout job | 90 minutos |
| Native toolchain en imagen | Visual Studio 2022 / MSVC suelen venir en `windows-latest` (fallback compile posible si falla prebuild) |
| Scripts npm | `npm ci` **sin** `--ignore-scripts` → lifecycle **habilitado** |

### Env que afecta npm / packaging (no secretos)

```text
FETCH_NODE_WIN=1
FETCH_ELECTRON_WIN=1
REQUIRE_WINDOWS_RUNTIMES=1
ELECTRON_WIN_VERSION=v33.4.11
ANTHROPIC_API_KEY / HUB_TOKEN  (placeholders smoke; no afectan npm ci)
```

No hay `npm_config_*`, `NODE_OPTIONS`, `npm_config_ignore_scripts`, ni `ELECTRON_SKIP_BINARY_DOWNLOAD` en el step de install.

### Orden exacto de instalación

```text
1. actions/checkout@v4
2. actions/setup-node@v4
     node-version: "22"
     cache: npm
     cache-dependency-path:
       - gateway/package-lock.json
       - node/package-lock.json
       - web/package-lock.json
       - packages/protocol/package-lock.json
       - packages/workspace-http/package-lock.json
3. Diagnostics (pre) + Electron URL preflight   # no npm ci
4. Install dependencies (npm ci)  — UN solo step, shell pwsh:
     npm ci --prefix packages/protocol
     npm ci --prefix packages/workspace-http
     npm ci --prefix gateway
     npm ci --prefix node
     npm ci --prefix web
5. npm run package:windows   # después; puede npm install web SOLO si falta node_modules
```

**No** se ejecuta `npm ci` en:

- raíz del repo  
- `desktop/` (Electron se descarga como zip en packaging)  

### ¿Se instala el mismo árbol varias veces?

Sí, **parcialmente** (transitives solapados, raíces distintas):

| Paquete / familia | protocol | workspace-http | gateway | node | web |
|-------------------|:--------:|:--------------:|:-------:|:----:|:---:|
| zod | ✓ | | ✓ | ✓ | |
| tsx / esbuild | | ✓ | ✓ (dev) | ✓ (dev) | ✓ (dev) |
| typescript | | ✓ | ✓ | ✓ | ✓ |
| @modelcontextprotocol/sdk | | | ✓ | ✓ | |
| better-sqlite3 / prebuild-install | | | ✓ | | |
| react / vite | | | | | ✓ |

Cada `npm ci --prefix` escribe su propio `node_modules/` (no monorepo workspaces npm). Intencional para el layout del repo; costoso en CI Windows.

---

## Timing Analysis

### Evidencia de conteo (lockfiles, win32)

```text
packages/protocol         non-optional ≈ 1   → "added 1 package … in 3s"
packages/workspace-http   non-optional 5 + @esbuild/win32-x64 → "added 6 packages"
gateway                   non-optional ≈256 + 2× @esbuild/win32-x64 → "added 258 packages"
node                      non-optional ≈99   (aún no en el paste del usuario)
web                       non-optional ≈68   (aún no en el paste del usuario)
```

### Mapeo comando ↔ duración

```text
Command                                    Duration (from observed log)
----------------------------------------------------------------------
npm ci --prefix packages/protocol          ~3s
npm ci --prefix packages/workspace-http    ~7m     ← SLOWEST observed
npm ci --prefix gateway                    ~4m     (+ deprecated prebuild-install)
npm ci --prefix node                       UNKNOWN (after gateway; likely still running)
npm ci --prefix web                        UNKNOWN
```

**Nota:** el step es un único bloque pwsh sin timestamps por comando. Las duraciones `~7m` / `~4m` vienen del paste del usuario, no de `gh run view --log` (bloqueado sin token).

### Por qué “no progresa”

Tras gateway faltan **node** + **web**. Aunque gateway termine en ~4m, el step de install puede seguir otros muchos minutos. El paste se detiene en el audit de gateway (`20 vulnerabilities`), coherente con “aún dentro de Install dependencies”.

---

## Native Dependency Analysis

| Package | Native | Install mechanism | Prebuild | Compile fallback | Used by |
| ------- | -----: | ----------------- | -------- | ---------------- | ------- |
| better-sqlite3@11.10.0 | YES | `install`: `prebuild-install \|\| node-gyp rebuild --release` | YES (GitHub Releases) | YES (`node-gyp`) | **gateway** (copiado a dist por `package.mjs`) |
| prebuild-install@7.1.3 | NO (tool) | dependency of better-sqlite3 | n/a | n/a | **gateway** only |
| winax | YES (COM) | would be native addon | vendor-specific | typically compile | **optional**; **not in** `node/package.json` / lockfile; copy-if-present only |
| esbuild@0.25 / 0.28 | YES (Go binary) | `hasInstallScript` / optional `@esbuild/<platform>` | platform npm package | n/a | workspace-http, gateway(dev), node(dev), web(dev) |
| fsevents | YES (macOS) | optional | n/a | n/a | skipped on win32 |
| Electron | YES (runtime) | **zip** `FETCH_ELECTRON_WIN` | n/a | n/a | desktop shell; **not** via `npm ci` in this workflow |
| Node portable | YES (runtime) | **zip** `FETCH_NODE_WIN` | n/a | n/a | gateway/node process host |

Búsqueda en lockfiles: `prebuild-install`, `better-sqlite3` → **solo** `gateway/package-lock.json`.  
`winax`, `node-pre-gyp` → **ausentes**.  
`node-gyp` → no como dependencia directa del producto; entra solo vía fallback del script de better-sqlite3 / toolchain global.

---

## prebuild-install Dependency Chain

Verificado con `npm ls` en `gateway/` (node_modules presente) y lockfile:

```text
@mxideass/gateway
  ↓
better-sqlite3@11.10.0
  ↓
prebuild-install@7.1.3   (deprecated warning en CI)
  ↓ (runtime deps: node-abi, simple-get, tar-fs, detect-libc, …)
```

Otros roots:

```text
packages/protocol        → (empty for prebuild-install)
packages/workspace-http  → no prebuild-install (solo esbuild vía tsx)
node/                    → no prebuild-install, no winax
web/                     → no prebuild-install
```

---

## better-sqlite3 Analysis

| Campo | Valor |
|-------|-------|
| Versión lock | 11.10.0 |
| `hasInstallScript` | true |
| Script | `prebuild-install \|\| node-gyp rebuild --release` |
| Target en este workflow | **Node.js 22** del runner (proceso Gateway empaquetado) |
| Node ABI | **127** (`NODE_MODULE_VERSION` Node 22) |
| Platform/arch CI | win32 / x64 |
| Prebuild URL | `https://github.com/WiseLibs/better-sqlite3/releases/download/v11.10.0/better-sqlite3-v11.10.0-node-v127-win32-x64.tar.gz` |
| Prebuild disponible | **YES** (HEAD → 200, ~915 KB; verificado desde host de auditoría) |
| Host descarga | `github.com` / `objects.githubusercontent.com` (redirect) |
| ¿Compilación esperada en CI sano? | **NO** (si el download de prebuild funciona) |
| ¿Rebuild para Electron? | **NO en packaging actual** — Gateway corre bajo Node portable, no bajo Electron ABI |

El warn `npm warn deprecated prebuild-install@7.1.3` es cosmético; no implica por sí solo compile fallback.

---

## winax Analysis

| Campo | Valor |
|-------|-------|
| En `node/package.json` | **NO** |
| En `node/package-lock.json` | **NO** |
| `npm ls winax` (node/) | vacío |
| Packaging | `scripts/package.mjs` copia `node/node_modules/winax` **solo si existe** |
| Contribución al delay de `npm ci` en CI | **NINGUNA** |

---

## Node/Electron ABI Analysis

| Runtime | Versión en producto/CI | ABI (`NODE_MODULE_VERSION`) | better-sqlite3 |
|---------|------------------------|----------------------------:|----------------|
| Node (setup-node + portable `FETCH_NODE_WIN`) | 22.x | **127** | Instalado en `gateway/`; prebuild `node-v127-win32-x64` **YES** |
| Electron (desktop shell) | **33.4.11** (`ELECTRON_WIN_VERSION` / `desktop/package.json`) | **130** | **No** se instala vía `npm ci` desktop; zip portable; shell no carga better-sqlite3 |

```text
better-sqlite3
  target runtime = Node 22 (Gateway process)
  ABI = 127
  prebuild available = YES (win32-x64)

Electron
  ABI = 130
  native rebuild for better-sqlite3 in this workflow = NOT APPLICABLE
```

No hay `@electron/rebuild` / `electron-rebuild` en el workflow de install. Correcto para el modelo actual (nativo SQLite en proceso Node, UI en Electron).

---

## npm Cache Analysis

```text
npm cache: CONFIGURED
```

Detalle:

- `actions/setup-node@v4` con `cache: npm`
- `cache-dependency-path` lista **cinco** lockfiles (gateway, node, web, protocol, workspace-http)
- Una sola cache key hashea **todos** esos paths → **cualquier** cambio en un lockfile invalida la cache completa
- La cache acelera descarga de tarballs hacia `~/.npm`; **no** evita:
  - extracción a cada `node_modules/`
  - scripts `install` (`better-sqlite3`, `esbuild`)
  - cinco extracciones secuenciales

`desktop/package-lock.json` **no** está en la cache path (y desktop no se `npm ci` en este workflow).

---

## Duplicate Installation Analysis

```text
Necessary duplicate install: YES
  (raíces de paquete independientes: gateway ≠ node ≠ web; layout del monorepo)

Potential redundant install: YES
  Evidence:
  1. npm ci packages/workspace-http — NO usado por package-windows / build / smoke /
     phase51 test de este job; gateway usa gateway/src/http/workspace-http.ts, no el npm package.
  2. npm ci packages/protocol — probablemente innecesario para packaging (verificar consumidores
     del bundle; no es dependencia npm de gateway en package.json).
  3. Transitives repetidos: esbuild/tsx/typescript en workspace-http + gateway + node + web;
     @modelcontextprotocol/sdk en gateway + node.
  4. Tras Install, package-windows puede volver a `npm install` en web/ si faltara node_modules
     (en CI normal ya existe → no re-instala).
```

---

## Security Audit Analysis

Del paste de CI (gateway `npm ci` final):

```text
20 vulnerabilities
18 moderate
1 high
1 critical
```

Reproducción local `npm audit --omit=dev --prefix gateway`: **UNAVAILABLE** (API `registry.npmjs.org/-/npm/v1/security/audits` sin respuesta útil en este entorno; **no** se ejecutó `npm audit fix`).

Clasificación provisional (sin JSON de audit):

| Categoría | Estado |
|-----------|--------|
| Production | Desconocido sin audit JSON; better-sqlite3 / AWS SDK / MCP / hono están en `dependencies` → parte del grafo prod |
| Development | esbuild/tsx/typescript son `devDependencies` en varios packages; npm ci **sin** `--omit=dev` los instala y pueden aparecer en el conteo de audit default |
| Native build tooling | `prebuild-install` es dependencia **de producción** de better-sqlite3 (no solo tooling suelto) |
| Transitive | Muy probable que la mayoría de los 20 sean transitivos |

**Conclusión:** el banner de vulnerabilidades **no** explica el wall-clock de ~7–11m; es ruido post-install del grafo grande de gateway.

---

## Root Cause

### Clasificación

| Code | Aplica | Rol |
|------|:------:|-----|
| A | Sí (secundario) | better-sqlite3 descarga prebuild desde GitHub en `gateway` npm ci (~incluido en ~4m) |
| B | No (evidencia) | Prebuild win32 Node 127 existe; paste no muestra `node-gyp` / VS errors |
| C | Posible | Hang de red en runner no descartado para el caso de 6 paquetes / 7m |
| D | Sí | Cinco `npm ci` secuenciales; **workspace-http** redundante para este job |
| E | Parcial | Cache configurada pero puede estar fría / invalidada por multi-lock hash |
| F | Sí (secundario) | gateway ~258 paquetes (AWS SDK, MCP, etc.) |
| G | Sí (secundario) | lifecycle de better-sqlite3 + esbuild |
| H | No | ABI Node 127 matched; Electron 130 no aplica a better-sqlite3 aquí |
| I | Sí (primario sospechoso) | ~7m para 6 paquetes es patológico → I/O / AV / npm en Windows runner |
| J | — | — |

**Síntesis:**

1. **Anomalía dominante (~7m):** `npm ci --prefix packages/workspace-http` (6 paquetes). No es native compile de SQLite. Apunta a **I + D (+ C/E)**.
2. **Carga secundaria (~4m):** `npm ci --prefix gateway` (258 paquetes + `prebuild-install` de better-sqlite3) → **F + A + G**.
3. **Trabajo aún no mostrado:** `node` + `web` alargan el mismo step.

---

## Evidence

1. Workflow YAML: orden exacto de cinco `npm ci`; `cache: npm` multi-lockfile; Node 22; sin `--ignore-scripts`.
2. Conteos lockfile win32: 1 / 6 / 258 alineados con el paste del usuario.
3. `npm ls` gateway: `better-sqlite3@11.10.0` → `prebuild-install@7.1.3`.
4. `npm ls` node: sin winax / sin prebuild-install.
5. Release assets better-sqlite3 v11.10.0 incluyen `node-v127-win32-x64`; HEAD 200.
6. `packages/workspace-http` ausente de `scripts/package*.mjs`, `build.mjs`, smoke; no es dep de `gateway/package.json`.
7. Electron vía zip `FETCH_ELECTRON_WIN`, no `desktop` npm ci.
8. Sin logs Actions autenticados → timestamps oficiales por step/comando no recuperados.

---

## Recommended Minimal Fix

**No implementar en esta fase.** Orden sugerido (menor riesgo primero):

1. **Instrumentar** el step de install: un step de Actions **por** `npm ci` (o `Measure-Command` / timestamps) para confirmar wall-clock en el próximo run.
2. **Quitar** `npm ci --prefix packages/workspace-http` (y su entrada en `cache-dependency-path` si deja de usarse) del workflow `windows-installer` — no aporta al artefacto Setup.exe ni al test phase51 de este job.
3. Evaluar quitar también `packages/protocol` del mismo job si el packaging no lo requiere (verificar una vez con build CI).
4. Mantener `npm ci` de **gateway** en Windows (garantía PE de better-sqlite3 / PHASE 64.1). No sustituir por binarios Linux.
5. Opcional después: `--prefer-offline` tras restore de cache; o paralelizar `gateway` / `node` / `web` en steps concurrentes con `needs` cuidadoso (más cambio).

**No recomendar ahora:** bump de better-sqlite3, `npm audit fix`, quitar scripts de install, ni rebuild Electron para SQLite.

---

## Risk of Recommended Fix

| Cambio | Riesgo |
|--------|--------|
| Steps separados + timing | Muy bajo (solo observabilidad) |
| Eliminar workspace-http `npm ci` del installer workflow | Bajo: ese package no se empaqueta; tests de workspace-http no corren en este job |
| Eliminar protocol `npm ci` | Bajo–medio: confirmar que ningún script del job resuelve `@mxideass/protocol` vía node_modules |
| Paralelizar npm ci | Medio: races de cache npm / carga del runner |
| Tocar better-sqlite3 / ignore-scripts | **Alto** — rompe garantía nativa Windows |

---

## Expected Time Improvement

| Acción | Mejora esperada (orden de magnitud) |
|--------|-------------------------------------|
| Quitar workspace-http `npm ci` | **~$7m** del wall-clock observado (si se confirma en el próximo run) |
| Cache hit estable + prefer-offline | Reduce minutos en gateway/node/web en runs calientes; no elimina scripts |
| Steps paralelos gateway∥node∥web | Puede bajar el step install hacia ~max(gateway,node,web) en lugar de suma |
| Total teórico tras quitar redundantes + cache caliente | Install de ~11m+ hacia **~3–6m** (estimación; validar con timing real) |

---

## Reproducción local (no ejecutada en Windows aquí)

Para el próximo ciclo (cuando haya runner o auth):

```powershell
Measure-Command { npm ci --prefix packages/protocol }
Measure-Command { npm ci --prefix packages/workspace-http }
Measure-Command { npm ci --prefix gateway --foreground-scripts --loglevel verbose }
```

Buscar en verbose: `prebuild-install`, URL `node-v127-win32-x64`, y ausencia de `node-gyp rebuild`.

---

## Success criterion (esta fase)

> ¿Por qué `npm ci` tarda ~7–11 minutos en `windows-latest`, y cuál es el cambio mínimo seguro?

**Respuesta:** el tramo ~7m es casi seguro `npm ci --prefix packages/workspace-http` (6 paquetes, sin better-sqlite3). El tramo ~4m es `npm ci --prefix gateway` (grafo grande + prebuild de better-sqlite3, prebuild disponible). El cambio mínimo seguro es **dejar de instalar `packages/workspace-http` en este workflow** e instrumentar timings; **sin** alterar el camino nativo de better-sqlite3 en Windows.
