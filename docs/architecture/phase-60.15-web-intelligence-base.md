# PHASE 60.15 — Web Intelligence Base Integration & MCP Verification

**Estado:** Web Intelligence Base = **CLOSED** (no “production-ready final”)  
**Fecha:** 2026-09-08  
**Alcance:** integración + verificación + hardening de capacidades ya existentes

## Pregunta de cierre

> ¿Puede Personal Agent realizar una investigación web básica de extremo a extremo, utilizando MCP, fuentes generales y estructuradas, recuperar fuentes originales y entregar resultados trazables al agente sin que éste conozca la implementación interna de los providers?

**Respuesta: YES** — con las limitaciones documentadas abajo.

## Arquitectura consolidada

```text
                         PERSONAL AGENT
                              │
                              ▼
                        AgentRuntime
                              │
                              ▼
                             MCP
                              │
                              ▼
                             Node
                              │
                              ▼
                       Research Engine
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
          ▼                   ▼                   ▼
      General Web         Academic            Knowledge
          │                   │                   │
      Electron/DDG      OpenAlex/Crossref    Wikipedia
                          arXiv                    │
                                                   ▼
                                              Official (MX)
                                          (catálogo mx-official)
                              │
                              ▼
                           Results
                              │
                              ▼
                       research.fetch
                              │
                              ▼
                         Source Content
```

Principio: el agente opera con **search / fetch** (y browser solo si se incorpora después). No elige `OpenAlex` ni `DuckDuckGo`.

## Contratos MCP

| Tool | Rol | Estado |
| --- | --- | --- |
| `research.search` | Discovery normalizado | **PRODUCTION** (base) |
| `research.fetch` | Lectura de URL + SSRF | **PRODUCTION** (base) |
| `research.browser` | Interacción de sitio | **NOT IMPLEMENTED** como tool MCP |

El LLM ve `provider: "web"` y `sourceFamily` ∈ `web | knowledge | academic | official`.  
`source` / `domain` siguen siendo el dominio (compatibilidad).

Campos de resultado (semántica):

- `title`, `url`, `snippet`, `domain`, `sourceFamily`, `position`, `agreementCount?`

## QueryPlan y selección

```text
research.search(query)
  → planQuery (intent, language, region, freshness, categories)
  → shouldUseElectronForPlan? → Electron DuckDuckGo
  → PaSearch (providers estructurados seleccionados por facetas)
  → dedupe + rank + diversity
  → SearchResponse provider="web"
```

- **Provider selection** ≠ **failure recovery**.
- Si una rama falla y otra del plan produce resultados, se continúa (paralelo explícito, no “A falla → probar B no seleccionado”).
- HTML scrapers `duckduckgo` / `mojeek`: **disabled** por defecto (no General Web productivo).
- Sin Playwright headless, sin APIs pagadas / API keys, sin metasearch de terceros.

## Estado de fuentes

| Capacidad | Estado | Notas |
| --- | --- | --- |
| General Web (Electron → DuckDuckGo) | **PRODUCTION** (base) | `BrowserWindow(show:false)`, idle reuse 60.12 |
| Wikipedia | **PRODUCTION** (base) | vía PaSearch structured |
| OpenAlex | **PRODUCTION** (base) | vía PaSearch structured |
| Crossref | **PRODUCTION** (base) | vía PaSearch structured |
| arXiv | **PRODUCTION** (base) | vía PaSearch structured |
| Official MX (`mx-official`) | **PRODUCTION** (base) | catálogo curado SAT/DOF/Banxico/… — no crawler |
| DuckDuckGo Instant Answer | **EXPERIMENTAL** / auxiliar | structured catalog |
| Hacker News | **EXPERIMENTAL** / auxiliar | structured catalog |
| Brave Electron SERP | **EXPERIMENTAL** | no cableado a MCP productivo |
| `research.browser` MCP | **NOT IMPLEMENTED** | — |

## Matriz de verificación

| Capability  | Direct | MCP | AgentRuntime | Real Internet |
| ----------- | -----: | --: | -----------: | ------------: |
| General Web |      ✓ |   ✓ |            ✓ |             ✓* |
| Wikipedia   |      ✓ |   ✓ |            ✓ |             ✓* |
| OpenAlex    |      ✓ |   ✓ |            ✓ |             ✓* |
| Crossref    |      ✓ |   ✓ |            ✓ |             ✓* |
| arXiv       |      ✓ |   ✓ |            ✓ |             ✓* |
| Official    |      ✓ |   ✓ |            ✓ |             ✓* |
| Fetch       |      ✓ |   ✓ |            ✓ |             ✓* |
| Browser     |      — |   — |            — |             — |

`*` Live opt-in: `WEB_INTELLIGENCE_LIVE=1` (Node) y scripts `research:agent:live` (Gateway + Anthropic).

## Evidencia (tests)

| Área | Ubicación |
| --- | --- |
| Composición engine, escenarios A–C, dedupe, errores | `node/tests/research/web-intelligence-60.15.test.ts` |
| SSRF / límites presupuesto | mismo + `node/tests/research/fetch-ssrf.test.ts` |
| AgentRuntime → MCP multi-step + error resilience | `gateway/tests/agent/research-60.15.test.ts` |
| Electron primary / idle (histórico 60.12) | `node/tests/research/electron-serp-60.12.test.ts` |
| FakeLLM search→fetch (60.3) | `gateway/tests/agent/research-60.3.test.ts` |

## Escenarios

| ID | Prompt conceptual | Esperado |
| --- | --- | --- |
| A | Novedades PostgreSQL 17 | General Web (Electron) |
| B | Qué es backpropagation | Knowledge (Wikipedia) + web si aplica |
| C | Investigaciones LLM agents | Academic (OpenAlex/Crossref/arXiv) |
| D | Investiga + fuentes primarias | search → fetch |
| E | Compara dos tecnologías | search → fetch → search → fetch |

## Seguridad y límites

- SSRF: localhost, loopback, private, link-local, metadata, `file://` → bloqueado.
- Presupuesto por conversación: `maxSearches=6`, `maxFetches=8`, `maxTotalWebOperations=12`.
- Fetch: timeout, max bytes, max text chars.
- Logs: queryHash / domain; no secretos (API keys, cookies, `HUB_TOKEN`).
- Aislamiento: presupuesto y tools anclados a `conversationId` (UserContext existente; sin auth nueva).
- Memoria: resultados de research **no** se convierten en KB global automática.
- Electron: sin warm-up al arranque; idle timeout; shutdown limpia sesión.

## Limitaciones conocidas

- Consultas tipo «¿Qué es X?» en español pueden devolver **EMPTY** en Wikipedia (OpenSearch no encuentra título); preferir el término canónico (`PostgreSQL`, `backpropagation`) o combinar con General Web (Electron).
- `research.browser` **no** forma parte del contrato MCP en esta fase.
- Fallo de un provider externo = **PROVIDER FAILURE**, no SYSTEM FAILURE.
- Calidad de ranking / cobertura = mejorable en fases posteriores.

## Definition of Done (checklist)

- [x] `research.search` / `research.fetch` vía MCP
- [x] AgentRuntime puede usarlas (FakeLLM E2E)
- [x] General Web = Electron/DDG; structured = Wiki/OpenAlex/Crossref/arXiv/MX
- [x] Search → Fetch y multi-step
- [x] Errores estructurados; SSRF; límites; sin fallback silencioso
- [x] Sin Playwright / APIs pagadas / API keys obligatorias
- [x] Documentación actualizada

## Siguientes fases (fuera de base)

coverage · quality · ranking · latency · caching · browser · deep research
