# PHASE 61 — AUDIT (Resource Resolution)

Fecha: 2026-09-04.

## 1. Implementación encontrada

| Módulo | Estado |
|--------|--------|
| `resources/extract.ts` | Extrae Resource desde MCP; **no** resuelve ni persiste |
| `resources/types.ts` | `external` \| `embedded` \| `local_ref` |
| `ArtifactManager.createFromResource` | Persistencia **explícita**; exige bytes; no download |
| `ObjectStorage.put` | Solo `Uint8Array` (sin stream de escritura aún) |
| HTTP `/artifacts/:id` | Delivery de Artifact; no Resource |
| Android/Desktop | Artifact HTTP; sin Resource UI |

## 2. Tipos actuales

- **embedded**: `inlineText` / `inlineBytes` en Resource
- **external**: URI desde `resource_link` (sin bytes)
- **local_ref**: kind declarado; sin resolver file:// aún

## 3. Integraciones

- MCP: `NormalizedMcpResult` → `extractResources` (frontera intacta)
- Artifact: solo vía `createFrom*` explícito
- ObjectStorage: independiente; Artifact no contiene bytes
- PHASE 60.1: Resource efímero; Artifact opt-in

## 4. Gaps (esta fase)

1. No hay `resolve(resource, policy)`
2. No hay policy conservadora (`persist=false`, `allowExternal=false`)
3. No hay fetch HTTP con SSRF/redirects
4. `put` no acepta stream (riesgo RAM si download → Buffer)
5. Provenance URI sin sanitizar userinfo/query secrets
6. file:// no validado contra root

## 5. Riesgos

- **SSRF** si se abre HTTP sin validar IP efectiva + redirects
- **Memoria** si download → Buffer ilimitado
- **Falsa seguridad** si solo se filtra hostname `localhost`

## 6. Decisión de implementación

- Añadir `ResourceResolver` + `ResourceResolutionPolicy` en `gateway/src/resources/`
- Extender `ObjectStorage.put` con `stream?: Readable` (bytes XOR stream)
- Persistencia solo vía `ArtifactManager` (nuevo `createFromStream` si hace falta)
- Defaults: **no red**, **no persist**
- Sin ResourceService/Repository/Browser
