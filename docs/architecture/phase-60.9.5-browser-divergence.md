# PHASE 60.9.5 — Diagnóstico de divergencia Manual Chromium vs Playwright

**Estado:** completo (diagnóstico observacional)  
**Fecha:** 2026-09-08  
**Producción:** sin cambios (`research.search`, Gateway, MCP, clientes intactos)

## Objetivo

Tras 60.9.4 (Manual SERP 3/3 / Playwright challenge 3/3), documentar **diferencias observables** entre Cursor IDE Chromium y Playwright que coinciden con ese outcome. **No** evadir el challenge; **no** afirmar causalidad sin evidencia.

Consulta fija: `PostgreSQL 17`.

## Metodología

| Método | Canal | Runs | Snapshots |
| --- | --- | ---: | --- |
| Manual | Cursor IDE Chromium (Electron) | 3 | T0 / T1 / T2 |
| Playwright | HeadlessChrome vía Playwright | 3 | T0 / T1 / T2 |

Misma máquina, misma IP/conexión, mismo dominio, misma consulta. Sin stealth, spoofing, proxies ni resolución de CAPTCHA.

Artefactos: `research/phase-60.9.5-browser-divergence/`.  
Lib experimental: `node/src/research/experimental/browser-divergence/`.

## Outcomes (reproducción de 60.9.4)

| | Manual | Playwright |
| --- | ---: | ---: |
| Query entered | 3/3 | 3/3 |
| Query submitted | 3/3 | 3/3 |
| Navigation | 3/3 | 3/3 |
| Challenge | 0/3 | 3/3 |
| Organic (`postgresql.org`) | 3/3 | 0/3 |

## Clasificación

**CASE A** — existe diferencia observable fuerte **antes del submit** (`firstDivergencePoint = T0`).

**CAUSE NOT IDENTIFIED** — las diferencias correlacionan con el outcome; no se demostró que alguna sea la causa del challenge.

## Primera divergencia temporal

```text
T0  Manual ≠ Playwright   (webdriver, UA/canal, WebGL, viewport, …)
T1  mismas diferencias de entorno (pre-submit)
T2  Manual → SERP orgánico
    Playwright → challenge
```

La divergencia de entorno **ya está presente en T0**, antes de teclear la consulta.

## Diferencias observables (T0, representativo)

| Observable | Manual | Playwright | Diff | Relevancia potencial |
| --- | --- | --- | --- | --- |
| `navigator.webdriver` | `false` | `true` | sí | possible (correlación) |
| User-Agent | Cursor/Electron … Chrome/142 | HeadlessChrome/150 | sí | possible |
| WebGL renderer | Mesa Intel (RPL-S) | SwiftShader Subzero | sí | possible |
| WebGL vendor | Google Inc. (Intel) | Google Inc. (Google) | sí | possible |
| Viewport / screen / DPR | 1920×1080 / DPR 2 | 1280×800 / DPR 1 | sí | low |
| `deviceMemory` | 8 | 32 | sí | low |
| `languages` | en-US, en, en | en-US | sí | low |
| `localStorage` keys | `origin_conversions` | `[]` | sí | possible (sesión) |
| timezone / platform / plugins | iguales | iguales | no | none |
| cookie names (`document.cookie`) | `[]` | `[]` | no | none |
| service workers / cache | vacíos | vacíos | no | none |

Notas:

1. Manual = **Electron embebido en Cursor**, no Chrome de escritorio aislado; el UA lo refleja.
2. Playwright en esta corrida = **HeadlessChrome** (observable en UA); no se modificó el canal para igualarlo.
3. Permissions en Manual aparecen `{}` porque no se consultó la Permissions API en CDP; Playwright sí midió `prompt` en notificaciones/geo/cámara/mic. Esa fila **no** debe interpretarse como “permisos distintos concedidos”.
4. Network detallada solo en Playwright; Manual no instrumentó resource counts (null). En Playwright el outcome T2 es challenge tras submit correcto.

## Hipótesis vs evidencia

| H | Hallazgo |
| --- | --- |
| H1 JS env | Sí: UA, webdriver, deviceMemory, languages parciales |
| H2 sesión | Parcial: `localStorage` key en Manual; cookies visibles vacías en ambos |
| H3 fingerprint | Sí: WebGL real vs software; viewport distinto |
| H4 secuencia | No explica el split: enter/submit/nav OK en ambos |
| H5 red | Solo medible en PW; no hay par Manual comparable |
| H6 ninguna diff | **Rechazada** — hay diffs fuertes en T0 |

## Causalidad (límites)

Se puede afirmar:

> `navigator.webdriver`, el canal HeadlessChrome/Electron y el WebGL (Intel vs SwiftShader) presentan diferencias observables en T0 y **coinciden** con SERP vs challenge.

No se puede afirmar:

> “DuckDuckGo challengea *porque* `webdriver === true`” (u otra señal aislada).

Falta evidencia de aislamiento causal (un solo factor cambiado con control), y esta fase **prohíbe** experimentos de evasión/igualación deliberada.

## Respuestas del informe

1. ¿Consulta introducida en ambos? **Sí** (3/3 + 3/3).
2. ¿Submit correcto en ambos? **Sí**.
3. ¿Navegación correcta en ambos? **Sí**.
4. ¿Primera diferencia observable? **T0** (antes de submit).
5. ¿Qué diferencias hay? Ver matriz (webdriver, UA/canal, WebGL, viewport, storage keys, …).
6. ¿Cuáles podrían ser relevantes? webdriver, UA/Headless vs Electron, WebGL; storage keys con menor fuerza.
7. ¿Cuáles solo coinciden sin causalidad? Todas las “possible” — correlación temporal/ambiental, no prueba.
8. ¿Por qué Playwright recibe challenge? **CAUSE NOT IDENTIFIED**.
9. ¿Qué evidencia falta? Aislamiento controlado de un solo factor (fuera de alcance ético/metodológico de esta fase); comparación de red Manual vs PW; opcionalmente headed no-headless sin spoofing (sigue siendo diagnóstico, no bypass).
10. ¿Continuar investigación? **Opcional** solo como diagnóstico adicional; **no** como camino a SERP vía Playwright.

## Decisión arquitectónica

Sin cambio respecto a 60.9.4:

```text
Search Engine  →  discovery / SERP
Browser        →  interacción web
```

**No** usar Playwright como solución de SERP discovery.

## Tests

Deterministas: `node/tests/research/browser-divergence-60.9.5.test.ts`  
(normalización, redaction, URL sanitize, network normalize, comparison, classification).  
Sin dependencia permanente de DuckDuckGo en CI.

## Regenerar comparación

```bash
# Solo re-agregar artefactos existentes (no vuelve a pegar a DDG):
DDG_DIV_SKIP_PLAYWRIGHT=1 npm run research:benchmark:60.9.5 -w @mxideass/node
```
