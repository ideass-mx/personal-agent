# PHASE 60 — AUDIT (Pluggable Object Storage)

Fecha: 2026-09-04. Solo inspección previa a implementación.

## Resumen

`ObjectStorage` ya es la abstracción correcta (PHASE 57–58). `StorageProviderId` ya declara `"local" | "s3" | "minio" | "wasabi"`, pero **solo existe `LocalObjectStorage`**. No hay SDK AWS/MinIO/Wasabi en `package.json`. CredentialManager (PHASE 59) está listo para `credentialRef`. Artifact HTTP stream/HEAD/Range ya dependen de la interfaz, no de Local.

## 1. Interfaz actual (`gateway/src/storage/types.ts`)

```ts
put(input: PutObjectInput) → ObjectReference
get(ref) → { bytes, mimeType? }
openReadStream(ref, { start?, end? }) → ObjectReadStream
delete(ref)  // idempotente si no existe
exists(ref)
metadata(ref) → { size, mimeType? }
```

**Decisión:** conservar esta interfaz; no crear una segunda. Extender `ObjectMetadata` opcionalmente con `etag` / `lastModified` si HeadObject lo aporta.

## 2. LocalObjectStorage

- Root: `PERSONAL_AGENT_OBJECTS_DIR` / `config.objectsDir` → `{product}/objects`
- Layout: `by-id/<key>/object` + `meta.json`
- DEFAULT y único backend en boot (`index.ts`)
- Offline, sin red ni credenciales

## 3. ArtifactManager

- Depende solo de `ObjectStorage`
- No importa Local ni SDKs
- HTTP (`artifact-http.ts`) → `openReadStream` / metadata Artifact

## 4. Credentials (PHASE 59)

- `CredentialManager.getSecret(id, context)` + SecretStore
- Sin secretos en SQLite metadata
- Integración cloud: `credentialRef` → secreto JSON en memoria para el cliente S3

## 5. Dependencias

- `gateway/package.json`: **sin** `@aws-sdk/client-s3` ni MinIO SDK
- Preferir `@aws-sdk/client-s3` + adapter S3-compatible (endpoint / forcePathStyle)

## 6. Gaps

1. Factory / registry de providers
2. Implementaciones S3 / MinIO / Wasabi
3. Config env `PERSONAL_AGENT_STORAGE_PROVIDER` (default `local`)
4. Lazy-load SDK (local no debe inicializar AWS)
5. Contract tests multi-provider
6. Architecture tests: ArtifactManager ↛ AWS SDK

## 7. Intactos

PHASE 57–59, Artifact HTTP, pairing, MCP protocol, Android ArtifactHttpClient, AgentRuntime, Node ownership, sin sync local→cloud, sin UI storage.
