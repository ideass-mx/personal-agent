# PHASE 60.1-A — SPIKE `agent-search-mcp`

Evaluación experimental. **No** es dependencia arquitectónica obligatoria.
**No** registra MCP tool ni modifica AgentRuntime.

## Hallazgos de inspección (paquete)

| Campo | Valor |
|-------|--------|
| npm | `agent-search-mcp@3.2.1` |
| License | Apache-2.0 (compatible comercial con atribución/NOTICE) |
| Node | `>=18.17` |
| Browser/Chromium | No (HTTP + cheerio scraping) |
| Python | Opcional (`semantic_bridge.py`); no requerido para search básico |
| API keys | No para motores zero-key (`SEARCH_PROVIDER_MODE=free_only`) |
| API programática | Sí: `searchWithFallback` en `dist/tools/free-search.js` |
| CLI | `fasm search … --json` |
| MCP | stdio / HTTP (`npx agent-search-mcp`) |
| Deps runtime | `@modelcontextprotocol/sdk`, `cheerio`, `pino`, `undici`, `yaml`, `zod@4` |

## Integración experimental

```text
SearchRouter
   └── SearchProvider id=agent-search-mcp
           └── searchWithFallback()  (import dinámico)
                   └── SearchResponse normalizado
```

- optionalDependency en `node/package.json` (no rompe installs sin red de npm).
- Sin wrap frágil de stdout.
- Contrato `SearchProvider` intacto; métricas extra vía `onDiagnostics`.

## Comandos

```bash
# Determinista (suite principal)
npm test --prefix node

# Live Internet (SPIKE)
LOG_LEVEL=silent npm run research:eval:agent-search --prefix node
LOG_LEVEL=silent npm run research:benchmark --prefix node -- --runs 3

# Una query
LOG_LEVEL=silent npm run research:search --prefix node -- \
  --provider agent-search-mcp "Ed25519 Android API 29"
```

