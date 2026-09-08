# Search Engine — inventario de licencias (PHASE 60.6 → 60.15)

**Estado:** inventario técnico. Preferencia: MIT / BSD / Apache-2.0.  
**No se incorporó código AGPL de metasearch de terceros.**

## Código propio

| Componente | Ubicación | Licencia |
| --- | --- | --- |
| Personal Agent Search Engine | `node/src/research/search/**` | Ideass / UNLICENSED |
| Electron SERP (DDG) | `node/src/research/electron-serp/**` | Ideass / UNLICENSED |
| Providers DDG-IA, HN, mx-official | propios | Ideass |
| Catálogo MX official | datos de directorio propios | Ideass |
| Fixtures HTML (sintéticos) | `electron-serp/fixtures/**` | Ideass |

## Dependencias npm

Sin dependencias nuevas obligatorias para Web Intelligence base (Electron es opcional de desarrollo).

## Servicios externos

| Provider | Mecanismo | API key | Notas |
| --- | --- | --- | --- |
| DuckDuckGo (Electron SERP) | Browser background | No | General Web productivo |
| DuckDuckGo Instant Answer | JSON | No | Auxiliar |
| Wikipedia OpenSearch | JSON | No | Knowledge |
| Hacker News Algolia | JSON | No | Auxiliar |
| OpenAlex / Crossref / arXiv | REST/Atom | No | Academic |
| mx-official | catalog | No | Official MX |

## Explícitamente no incorporado

| Item | Motivo |
| --- | --- |
| Metasearch AGPL de terceros | decisión de producto / licencia |
| Brave/Bing/Google CSE | API keys |
| Mojeek Search API | API key / planes comerciales |
| CAPTCHA / anti-bot bypass | Fuera de alcance |

```text
LICENSE_REVIEW: complete through PHASE 60.15
AGPL_METASEARCH: NONE
NEW_NPM_DEPS_REQUIRED: NONE
```
