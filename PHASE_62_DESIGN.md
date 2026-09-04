# PHASE 62 — DESIGN

## Distinciones

```text
Resource ≠ Artifact
Artifact ≠ ObjectStorage
ArtifactReference ≠ ObjectReference
MCP ≠ Artifact protocol
```

## Lifecycle

```text
AVAILABLE ──expire──► EXPIRED
    │
    └──delete──► DELETED  (object removed from ObjectStorage)
```

- Sin workers/GC: expiración lazy al `get` / delivery.
- `DELETED` y desconocido → HTTP **404**
- `EXPIRED` → HTTP **410** (`error.code = artifact_expired`)

## ArtifactReference (cliente)

```ts
{
  artifactId, url, mimeType, filename?, size?, expiresAt?
}
```

`url` = `/artifacts/{artifactId}` (relativa; cliente añade origin).  
Nunca: provider, key, path, bucket, credentials.

## Flujos

```text
ResourceResolver persist=true → Artifact → getReference → ArtifactReference
ToolResult.ok.artifacts? → ArtifactReference[] (opcional; content intacto)
HTTP GET|HEAD|DELETE /artifacts/:id → auth existente
```

## Deferred

Browser, versioning, GC workers, sync, ACL matrix, presigned URLs, WS blobs.
