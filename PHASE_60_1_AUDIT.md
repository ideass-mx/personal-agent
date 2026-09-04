# PHASE 60.1 — AUDIT (Resource vs Artifact vs ObjectStorage)

Fecha: 2026-09-04. Revisión de responsabilidades; sin Resource Resolution ni sync cloud.

## 1. Estado actual

La cadena documentada en PHASE 57–60 está **implementada y alineada** con el código:

```text
MCP Result → Resource (extract, no persist)
                ↓ (solo si persistencia explícita)
             Artifact (SQLite metadata + ObjectReference)
                ↓
             ObjectStorage (local | s3 | minio | wasabi)
```

No existe `ArtifactRepository`, `ResourceResolver`, ni auto-creación Artifact desde MCP.
AgentRuntime **no** importa artifacts/resources/storage.

## 2. Componentes encontrados

| Path | Rol |
|------|-----|
| `gateway/src/resources/types.ts` | `Resource`, `ResourceKind` |
| `gateway/src/resources/extract.ts` | `extractResources` desde `NormalizedMcpResult` |
| `gateway/src/artifacts/types.ts` | `Artifact`, `ArtifactProvenance` |
| `gateway/src/artifacts/store.ts` | SQLite CRUD metadata |
| `gateway/src/artifacts/manager.ts` | Orquestación create/get/stream/delete |
| `gateway/src/storage/types.ts` | `ObjectStorage`, `ObjectReference` |
| `gateway/src/storage/local.ts` + S3-compatible | Bytes |
| `gateway/src/http/artifact-http.ts` | `GET\|HEAD /artifacts/:artifactId` |
| `db/migrations/005_artifacts.sql` | Tabla metadata |
| Android `ArtifactHttpClient` | Consume HTTP por `artifactId` |
| Desktop `hubArtifactHead` / `hubArtifactDownload` | Idem |

**No encontrados:** `ArtifactRepository`, `objectId` de dominio, `ResourceResolver`.

## 3. Dependencias

```text
artifact-http → ArtifactManager → ObjectStorage (interface)
ArtifactManager → resources/types (solo createFromResource)
ArtifactManager ↛ LocalObjectStorage / @aws-sdk / AgentRuntime / pairing
ObjectStorage ↛ MCP / AgentRuntime / artifacts / Android
extractResources ↛ artifacts / storage
AgentRuntime ↛ resources / artifacts / storage
```

## 4. Mapa de responsabilidades

| Componente | Responsabilidad actual | Responsabilidad correcta | Duplicación |
|------------|------------------------|--------------------------|-------------|
| Resource | Ref/contenido efímero desde MCP; sin SQLite | Contenido/referencia sin ownership | Ninguna fuerte |
| Artifact | ID estable + metadata + provenance + `storage` | Managed object de producto | Parcial: size/mime también en storage side-meta |
| ArtifactManager | create + get + readBytes/stream/delete | Lifecycle + bridge a storage para delivery | Métodos B (proxy) delgados pero justificados |
| ObjectReference | `{ provider, key }` | Solo storage-level reference | **Convención** `key === artifactId` en create |
| ObjectStorage | put/get/stream/head/delete/exists | Bytes + metadata física | Ninguna con Artifact semántica |
| Local / S3 / MinIO / Wasabi | Implementaciones | Idem | — |
| Artifact HTTP | Auth + resolve Artifact + stream | Delivery por identidad de dominio | No habla ObjectStorage directo |

## 5. Duplicaciones detectadas

1. **`artifact.id` ≈ `ObjectReference.key` por convención** en `createFromBytes` (`put({ key: id })`). El tipo `ObjectReference` **no** mezcla identidades; la fábrica de Artifact elige key=id. Riesgo: parecer que Artifact == object key.
2. **size / mimeType** en fila SQLite Artifact y en metadata de ObjectStorage — útil para HTTP sin HEAD remoto; no es doble escritura de bytes.
3. **`readBytes` / `openReadStream` en ArtifactManager** delegan a ObjectStorage tras lookup — no reimplementan put/get; son fachada de delivery, no segundo storage.

## 6. Análisis ArtifactManager (clasificación)

| Método | Clase | Nota |
|--------|-------|------|
| `createFromBytes` | A (+ coord. storage) | Identidad + metadata + put |
| `createFromResource` | A | Persistencia **explícita**; fail sin bytes |
| `get` | A | Solo metadata SQLite |
| `readBytes` | B/C | Proxy tras resolve Artifact |
| `openReadStream` | C | Delivery HTTP |
| `delete` | A | Metadata + storage coordinados |

**Valor real de Artifact hoy:** identidad opaca para clientes (`/artifacts/:id`), provenance, nombre/mime para Content-Disposition, desacoplar cliente del provider/key. **No** es un wrapper vacío: sin Artifact, Android/Desktop tendrían que conocer `ObjectReference` + auth a storage.

## 7. ObjectReference

```ts
{ provider: string; key: string }
```

Es **storage-level reference**. No incluye `artifactId` ni `resourceId`.  
La mezcla id/key es política de `createFromBytes`, no del tipo.

## 8. HTTP Artifact API

- `artifactId` = **identidad de dominio** (PK SQLite), no path FS ni URL S3.
- Flujo: auth → `artifacts.get(id)` → `openReadStream(id)` → ObjectStorage.
- Si solo fuera alias de object key, el endpoint aún necesitaría metadata de download (filename, auth product); Artifact aporta eso.

## 9. Resource

- `extractResources`: **no** persiste, **no** descarga, **no** crea Artifact.
- Tests PHASE 57: `resource_link` no → Artifact automático.
- Puede vivir solo en el turno MCP.

## 10. ObjectStorage

- Solo bytes; providers pluggables (PHASE 60).
- Contract tests operan **sin** Artifact → ObjectStorage **puede existir sin Artifact**.
- Credenciales cloud vía CredentialManager, no vía Artifact.

## 11. Conclusión (preliminar → DESIGN)

**OPCIÓN B — Mantener Artifact, reducir/clarificar responsabilidades.**

Artifact aporta semántica real (identidad cliente, provenance, metadata de entrega).  
No justificar Option C. Option A “tres capas” es correcta en forma, pero el diseño debe **prohibir** crecer ArtifactManager como segundo ObjectStorage y **documentar** que `key === id` es convención actual, no invariante eterno.
