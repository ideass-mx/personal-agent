# PHASE 60.9.3 — DuckDuckGo Search-Space & Manual Browser Experiment

**Estado:** completo (diagnóstico)  
**Fecha:** 2026-09-08  
**Producción:** sin cambios

## Pregunta de éxito

> ¿Nuestro Browser Runner realmente está realizando la misma operación que un usuario cuando busca en DuckDuckGo?  
> ¿La query entra al input, se envía y llega a una SERP, o el fallo ocurre antes?

## Respuesta corta

1. **Sí:** homepage → localizar input → introducir query → Enter → navegación a `?q=...`.
2. El fallo de Playwright **no** es `BROWSER_RUNNER_FAILURE`.
3. Tras el submit, Playwright recibe **CHALLENGE** (anomaly); el IDE/manual y HTTP obtienen SERP real en esta pasada.
4. Conclusión: **`browser ≠ browser automation`** (Caso **D**, con matiz: HTTP también ✓ aquí).

## Tabla principal

| Query | Manual | Playwright fill | Playwright insertText | Playwright type | HTTP |
| ----- | ------ | --------------- | --------------------- | --------------- | ---- |
| React TypeScript | SUCCESS | CHALLENGE | CHALLENGE | CHALLENGE | SUCCESS |
| PostgreSQL 17 | SUCCESS | CHALLENGE | CHALLENGE | CHALLENGE | SUCCESS |
| universidades doctorado IA México | SUCCESS | CHALLENGE | CHALLENGE | CHALLENGE | SUCCESS |

## Tabla diagnóstico (Playwright)

| Query | Input entered | Submitted | Navigation | Challenge | Organic results |
| ----- | ------------: | --------: | ---------: | --------: | --------------: |
| q1 fill/insertText/type | ✓ | ✓ | ✓ | ✓ | 0 |
| q2 fill/insertText/type | ✓ | ✓ | ✓ | ✓ | 0 |
| q3 fill/insertText/type | ✓ | ✓ | ✓ | ✓ | 0 |

Evidencia típica (fill / q1):

```json
{
  "queryEntered": true,
  "querySubmitted": true,
  "navigationOccurred": true,
  "resultsPageDetected": true,
  "challengeDetected": true,
  "inputValueAfterSubmit": "React TypeScript",
  "currentUrl": "https://duckduckgo.com/?…&q=React+TypeScript",
  "pageTitle": "React TypeScript at DuckDuckGo",
  "resourceCount": 156
}
```

Los 5 “resultados” crudos antes del filtro eran enlaces del shell (App Store / Play / Duck.ai), **no** orgánicos — coherente con challenge UI, no con SERP.

## Manual

Canal: Cursor IDE Chromium (sesión visible, **no** Playwright). Flujo: homepage → input → submit.

| Query | success | challenge | resultCount approx |
| --- | --- | --- | ---: |
| React TypeScript | ✓ | no | ≥10 (ads+organic) |
| PostgreSQL 17 | ✓ | no | ≥10 (postgresql.org visible) |
| doctorado IA México | ✓ | no | ≥10 (UANL/UP/UTM) |

→ **H1 SUPPORTED.** El entorno/IP **no** está totalmente cerrado a DDG para un navegador “normal”.

## Hipótesis

| ID | Resultado |
| --- | --- |
| H1 Manual funciona | **SUPPORTED** |
| H2 Runner no enviaba query | **REJECTED** (entered+submitted+nav en 9/9) |
| H3 Automation obtiene resultados | **REJECTED** (CHALLENGE post-submit) |
| H4 Bloqueo después de interacción | **SUPPORTED** |
| H5 Entorno/IP limitado también en manual | **REJECTED** (manual SUCCESS) |

## Decision tree

Fase define **D** como:

```text
Manual ✓
Playwright CHALLENGE
HTTP ❌
```

Observado:

```text
Manual ✓
Playwright CHALLENGE
HTTP ✓
```

Interpretación alineada con **D** para la pregunta del runner:

- DuckDuckGo distingue **navegador manual/IDE** vs **Playwright automation**.
- No intentar bypass.
- HTTP es un canal distinto (aquí usable); no implica que Playwright deba “igualarse” vía evasión.

No es **C** (runner roto): la divergencia es **después** del submit.

## Implicación para 60.9.2

El `Browser → BLOCKED` previo **no** se explica solo por “no meter la query” cuando el flujo era homepage→input (en 60.9.2 a veces hubo timeout de input / URL directa). En 60.9.3, con interacción forzada y validada, el outcome sigue siendo challenge post-submit.

## Search space (borrador)

Mecanismo básico comprobado solo en 3 categorías:

```text
SEARCH SPACE (DDG)
├── General      ✓ (manual/HTTP) / CHALLENGE (PW)
├── Technical    ✓ / CHALLENGE
├── Mexico       ✓ / CHALLENGE
├── Academic     pendiente
├── Financial    pendiente
├── Local        pendiente
├── Long/Short   pendiente
└── Special chars pendiente
```

No expandir matriz mientras Playwright dispare challenge; no contaminar IP.

## Restricciones respetadas

- Solo DuckDuckGo.
- Sin `goto(?q=)` en la prueba principal.
- Sin stealth / CAPTCHA solving / proxies / Tor.
- Sin cambios a `research.search` / Gateway / MCP / clientes.
- 3×5 = 15 observaciones; no más repeticiones.

## Artefactos

- `research/phase-60.9.3-ddg-search-space/`
- `npm run research:benchmark:60.9.3 -w @mxideass/node`
