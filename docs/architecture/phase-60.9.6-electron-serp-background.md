# PHASE 60.9.6 — Chromium/Electron programático para SERP en background

**Estado:** completo (experimental / diagnóstico)  
**Fecha:** 2026-09-08  
**Producción:** sin cambios (`research.search`, Gateway, MCP, clientes intactos)

## Objetivo

Comprobar si un **Electron propio**, lanzado programáticamente con `BrowserWindow` **oculta** (sin UI visible), puede obtener el mismo SERP que el Chromium/Electron manual de Cursor — frente al challenge de Playwright Headless.

Consulta fija: `PostgreSQL 17`.

## Restricciones respetadas

- Sin stealth / sin mutar `navigator.webdriver` / sin spoof de UA, WebGL, canvas, cookies, headers
- Sin CAPTCHA solving / sin proxies
- Perfil aislado (`userDataDir` temporal); **no** perfil de Cursor/Chrome del usuario
- Sin depender de Cursor como runtime
- `--no-sandbox` solo como workaround Linux cuando `chrome-sandbox` no es setuid root (arranque del proceso, **no** anti-detection)

## Runtime experimental

```text
node/src/research/experimental/electron-serp/
  types.ts
  diagnostics.ts
  duckduckgo.ts
  runtime.ts          # host Node ↔ child Electron (stdio NDJSON)
  session.ts          # reutilización secundaria launch→N searches→close
  electron-main.cjs   # BrowserWindow show:false
  index.ts
```

API mínima: `launch` → `navigate` / `evaluate` / `searchDuckDuckGo` → `close`.

Benchmark: `npm run research:benchmark:60.9.6 -w @mxideass/node`  
Artefactos: `research/phase-60.9.6-electron-serp-benchmark-*.json|md`

## Resultados (3 ejecuciones)

```text
                         Cursor      Playwright       Electron BG
------------------------------------------------------------------
Query entered              3/3           3/3              3/3
Query submitted            3/3           3/3              3/3
Navigation                 3/3           3/3              3/3
Challenge                  0/3           3/3              0/3
Organic results            3/3           0/3              3/3
postgresql.org             3/3           0/3              3/3
```

Referencia Cursor/Playwright: PHASE 60.9.4 / 60.9.5 (misma consulta).

## Entorno Electron BG (observado, nativo)


| Campo        | Electron BG                 | Cursor (60.9.5)            | Playwright (60.9.5) |
| ------------ | --------------------------- | -------------------------- | ------------------- |
| `webdriver`  | `false`                     | `false`                    | `true`              |
| Canal        | Electron/33.4.11 Chrome/130 | Cursor/Electron Chrome/142 | HeadlessChrome/150  |
| WebGL        | Mesa Intel (RPL-S)          | Mesa Intel (RPL-S)         | SwiftShader         |
| Viewport     | 1920×1080                   | 1920×1080                  | 1280×800            |
| DPR          | 2                           | 2                          | 1                   |
| languages    | en-US,en,en                 | en-US,en,en                | en-US               |
| deviceMemory | 8                           | 8                          | 32                  |
| Ventana      | `show: false`               | visible IDE                | headless            |


## Clasificación

**Caso A**

```text
Cursor Electron       ✓ SERP
Electron Background   ✓ SERP
Playwright Headless   ✗ Challenge
```

## Pregunta final (solo evidencia)

> ¿Podemos utilizar nuestro propio Chromium/Electron programático, ejecutado en background y sin UI visible, como base del General SERP Discovery de Personal Agent?

**En esta muestra (3/3, misma máquina/IP/consulta): sí es viable como base experimental.**  
El runtime Electron oculto obtuvo SERP orgánico con `postgresql.org`, sin challenge, alineado con Cursor y distinto de Playwright Headless.

Límites explícitos de esta fase:

1. **No** está integrado en `research.search` / MCP / producción.
2. **No** prueba causalidad de `webdriver` u otro factor aislado.
3. **No** demuestra robustez multi-host, Windows packaging, ni estabilidad a largo plazo.
4. Requiere dependencia `electron` (dev/experimental) y workaround `--no-sandbox` en este Linux.

Decisión de producto sugerida por la evidencia: **explorar** un *SERP Browser Runtime* basado en Electron background en fases siguientes; **no** adoptar Playwright headless para discovery.

## Tests

`node/tests/research/electron-serp-60.9.6.test.ts` — lifecycle/cleanup contrato, challenge, orgánicos, sanitización, sin secretos.  
Live DDG solo vía benchmark explícito.

## Typecheck

`npm run typecheck -w @mxideass/node` — OK tras esta fase.