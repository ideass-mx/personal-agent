# PHASE 60 — DESIGN (Pluggable Object Storage)

## Arquitectura

```text
ArtifactManager
       │
       ▼
 ObjectStorage          ← única abstracción
       │
       ├── LocalObjectStorage          (DEFAULT, offline)
       └── S3CompatibleObjectStorage
              ├── S3ObjectStorage      (providerId=s3)
              ├── MinioObjectStorage   (providerId=minio)
              └── WasabiObjectStorage  (providerId=wasabi)
```

```text
Cloud path:
Artifact → ObjectStorage → CredentialManager → SecretStore → S3 API
```

**Artifact** = metadata SQLite + `ObjectReference`  
**ObjectStorage** = operaciones físicas sobre bytes

## Factory

```text
PERSONAL_AGENT_STORAGE_PROVIDER=local|s3|minio|wasabi  (DEFAULT=local)
```

- `local` → `LocalObjectStorage` — **no** carga `@aws-sdk/*`, no red, no credenciales.
- cloud → lee bucket/region/endpoint/prefix/`credentialRef`; resuelve secreto vía CredentialManager.
- Provider desconocido → `Unsupported object storage provider: xyz`

Cambio `local → s3` **no** migra objetos existentes (documentado). Artifacts con `provider=local` requieren storage local.

## Config cloud (sin secretos)

```ts
{
  provider: "s3" | "minio" | "wasabi",
  bucket, region,
  endpoint?, prefix?,
  forcePathStyle?,  // MinIO suele true
  credentialRef     // obligatorio para cloud en producto
}
```

Secretos **no** en `.env` persistente del producto como `AWS_SECRET_*`.  
Formato secreto CredentialManager (JSON string):

```json
{ "accessKeyId": "...", "secretAccessKey": "...", "sessionToken?": "..." }
```

Solo en memoria al construir el cliente. Nunca logs / SQLite / Android / LLM.

Compatibilidad SDK: variables `AWS_*` del entorno pueden servir al SDK en desarrollo, pero la arquitectura Personal Agent **prefiere** CredentialManager + `credentialRef`.

## Streaming / Range / HEAD

- `openReadStream` → GetObject (+ `Range: bytes=start-end` en S3-compatible)
- `metadata` / exists → HeadObject
- Artifact HTTP sin cambios (sigue la interfaz)

## Errores

Normalizar mensajes; pasar por `CredentialRedactor`. Sin Authorization headers ni keys.

## Deferred

Sync local↔cloud, migration UI, GC, dedup, Resource Resolution, UI admin storage, multipart upload grande.
