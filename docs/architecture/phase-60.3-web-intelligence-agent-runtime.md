# PHASE 60.3 — Web Intelligence en AgentRuntime

**Fecha:** 2026-09-07  
**STATUS:** IMPLEMENTATION PASS · Claude live BLOCKED (auth) · Tools live PASS (calidad mixta)

> Numeración: colisión histórica con Object Storage PHASE 60/60.1. Este doc es Web Intelligence 60.3.

## Objetivo

Integrar investigación web al flujo real:

```text
User → AgentRuntime → LLMProvider → research.search|fetch
     → SearchRouter → agent-search-mcp / HTTP fetch → LLM
```


## Implementation

| Pieza | Ubicación |
| --- | --- |
| Extensión MCP | `node/src/extensions/research.ts` (defaults) |
| `research.search` | `node/src/tools/research-search.ts` (fuerza `agent-search-mcp`) |
| `research.fetch` | `node/src/tools/research-fetch.ts` + `node/src/research/fetch.ts` |
| SSRF | `node/src/research/ssrf.ts` |
| Presupuesto | `node/src/research/budget.ts` (6/8/12) → `web_research_limit_reached` |
| Policy Gateway | `research.*` = `automatic` en `DEFAULT_TOOL_POLICY` |
| Prompt | `gateway/src/agents/prompts.ts` (search→fetch→citar→Fuentes) |
| Tests | `node/tests/research/*`, `gateway/tests/agent/research-60.3.test.ts` |
| Live Claude | `gateway/scripts/research-agent-live.ts` |
| Live tools | `gateway/scripts/research-agent-live-tools.ts` |

## Tests deterministas

```text
node research + extensions: 64 passed
gateway research-60.3: 3 passed
gateway suite: 875 passed
node suite: 301 passed, 1 flaky unrelated (process.execute tree timeout)
```

Cubierto: search normalizado, fetch, SSRF, timeout, provider failure, iterative FakeLLM, limits, no secretos en logs.

## Real Internet

### Claude + AgentRuntime

```text
STATUS: NOT_RUN (LLM_AUTH_FAILED http 401)
```

`ANTHROPIC_API_KEY` en `gateway/.env` es rechazada por Anthropic. El harness falla rápido
sin gastar tool calls. **No se pudo medir calidad de investigación del agente Claude.**

### FakeLLM + tools reales (agent-search-mcp + fetch)

```text
STATUS: 5/5 pipeline OK (métrica técnica)
Calidad de resultados: DÉBIL en ES/MX y relevancia
```

| Caso | Searches | Fetches | Fuentes | Notas de calidad |
| --- | ---: | ---: | ---: | --- |
| general (React/Vue 2026) | 2 | 2 | 5 | Wikipedia genérica; una fuente irrelevante (Olympics 2024) |
| mexico (doctorados IA) | 3 | 0 | 0 | Búsquedas “ok” pero **0 resultados** |
| comparative (PhD online) | 2 | 2 | 10 | Resultados poco relacionados (Starlink, Tim Walz, …); 1 fetch `response_too_large` |
| technical (MCP + Claude) | 2 | 2 | 6 | Parcialmente útil (AI agent); ruido (Easyship, Goose) |
| providers (search sin API keys) | 3 | 0 | 0 | **0 resultados** |

```text
Average latency: ~3187 ms
Average searches: 2.4
Average fetches: 1.2
```

## Fortalezas

- Integración AgentRuntime ↔ MCP ↔ tools limpia; errores estructurados no matan el turno.
- Fetch + SSRF + límites + truncado funcionan.
- Iteración search→fetch→search→fetch permitida por el runtime.
- Cero secretos en payloads de research.* / logs de tools.

## Debilidades

- `agent-search-mcp` sigue débil en español/México (vacío frecuente).
- Relevancia pobre: mucho Wikipedia y ruido off-topic.
- Sin Claude autenticado no se evaluó razonamiento ni sección Fuentes del modelo.
- Fetch falla en páginas muy grandes vía `Content-Length` (`response_too_large`).

## Recommendation

```text
KEEP agent-search-mcp AS FALLBACK / EXPERIMENTAL
```

La arquitectura AgentRuntime + tools es suficiente para investigación iterativa.
El cuello de botella actual es la **calidad del proveedor de búsqueda**, no el wiring.
Cuando haya una `ANTHROPIC_API_KEY` válida, re-ejecutar:

```bash
cd gateway && npm run research:agent:live
```

## DoD checklist

- [x] AgentRuntime puede usar `research.search`
- [x] AgentRuntime puede usar `research.fetch`
- [x] `agent-search-mcp` como proveedor inicial de search
- [x] Investigación iterativa (runtime + LLM)
- [x] Leer fuentes encontradas
- [x] Búsquedas adicionales
- [x] Fuentes conservadas en budget snapshot / prompt
- [x] Errores web no rompen conversación
- [x] Límites search/fetch/total
- [x] SSRF
- [x] No secretos en logs (test)
- [x] Tests deterministas
- [~] Pruebas reales Internet: tools sí; Claude bloqueado por auth
- [x] Informe de calidad
