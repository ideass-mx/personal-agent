# PHASE 64.2 — AUDIT (Windows Installer CI Optimization)

Fecha: 2026-09-04.

## Alcance

Optimización **exclusiva** del workflow CI `windows-installer.yml`.  
**No** cambia arquitectura de producto, runtime, MCP, Agent Runtime, Capability Model, Artifact, ObjectStorage ni Android.

Referencia previa: `WINDOWS_CI_DEPENDENCY_AUDIT.md`.

---

## Comando lento detectado

| Comando | Duración aproximada (auditoría) | Paquetes (win32) |
|---------|--------------------------------:|------------------:|
| `npm ci --prefix packages/workspace-http` | **~7 min** | ~6 |
| `npm ci --prefix gateway` | ~4 min | ~258 |
| `npm ci --prefix packages/protocol` | ~3 s | 1 |

El paso anómalo era `workspace-http` (tsx / typescript / esbuild), **no** la compilación de `better-sqlite3`.

---

## ¿Por qué `workspace-http` no es necesario para Windows Installer?

Inspección (PASO 1):

| Consumidor | ¿Usa `@mxideass/workspace-http` / `packages/workspace-http`? |
|------------|:-------------------------------------------------------------:|
| `scripts/build.mjs` | NO |
| `scripts/package.mjs` | NO |
| `scripts/package-windows.mjs` | NO |
| `scripts/smoke-package.mjs` | NO |
| `scripts/validate-windows-*.mjs` | NO |
| Inno Setup / `ISCC` | NO |
| `gateway/package.json` | NO (HTTP Workspace vive en `gateway/src/http/workspace-http.ts`) |
| `node/package.json` | NO |
| Steps del job (package / validate / phase51 / smoke / ISCC) | Solo el propio `npm ci` eliminado |

Participación en release path:

1. build Gateway — **NO**  
2. build Node — **NO**  
3. packaging Windows — **NO**  
4. runtime Windows — **NO**  
5. generación del instalador — **NO**  
6. validación módulos nativos — **NO**  
7. scripts del workflow (salvo el `npm ci` redundante) — **NO**

---

## npm ci que permanecen

```text
npm ci --prefix packages/protocol
npm ci --prefix gateway          # OBLIGATORIO (better-sqlite3 → PE en Windows)
npm ci --prefix node
npm ci --prefix web
```

`packages/protocol` se conserva por instrucción explícita de esta fase (no se evalúa eliminación aquí).

---

## Importancia de gateway + better-sqlite3

`package.mjs` copia `gateway/node_modules/better-sqlite3` al layout Windows.  
PHASE 64.1 exige que `*.node` sea **PE** (fail-closed contra ELF/Mach-O).  
Por tanto `npm ci --prefix gateway` **debe** ejecutarse en `windows-latest`.

---

## Cache existente

`actions/setup-node` con `cache: npm` y `cache-dependency-path` **sin cambios** (incluye aún `packages/workspace-http/package-lock.json` para no alterar la clave/política de cache en esta fase).

---

## Ausencia de cambios

| Área | Cambio |
|------|--------|
| package.json / lockfiles | NINGUNO |
| Versiones Node / Electron / better-sqlite3 | NINGUNO |
| Runtime / MCP / Capability / Artifact | NINGUNO |
| `npm audit fix` | NO ejecutado |

---

## Cambio realizado

1. Eliminar `npm ci --prefix packages/workspace-http` del workflow.  
2. Añadir timing PowerShell (`Stopwatch`) por cada `npm ci` restante.  
3. Documentar PHASE 64.2.

---

## Riesgos

| Riesgo | Mitigación |
|--------|------------|
| Algún step oculto necesitara workspace-http | Auditoría previa; job no corre tests de ese package |
| Cache key sigue hasheando workspace-http lock | Intencional (PASO 4: no tocar cache) |
| Timing rompe pwsh | Helper local sin deps externas; `exit $LASTEXITCODE` |

---

## Validaciones realizadas

| Check | Resultado |
|-------|-----------|
| YAML `windows-installer.yml` parseable | PASS |
| `workspace-http` npm ci ausente | PASS |
| protocol / gateway / node / web npm ci + Stopwatch | PASS |
| cache npm intacta (incl. lock workspace-http) | PASS |
| `npm run test:packaging` | PASS (8) |
| `phase64.1-windows-packaging.test.ts` | PASS (5) |
| `phase51-windows-installer-…` | PASS (9) |
| typecheck gateway + node | PASS |
| `npm run build` | PASS |
| `npm run smoke:package` | PASS |

## PHASE 64.2 STATUS: PASS
