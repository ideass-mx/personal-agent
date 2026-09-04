# PHASE 58 — DESIGN

## Flujo

```text
Client (Bearer install | device+X-Device-Id)
  → GET|HEAD /artifacts/:artifactId
  → authenticate (existing credentials)
  → authorize (install OR ACTIVE trusted device)
  → ArtifactManager.get / openReadStream
  → ObjectStorage.openReadStream(ref)
  → HTTP stream (+ headers)
```

**Nunca:** path de FS, `/storage/:key`, credenciales de ObjectStorage al cliente.

## ObjectStorage extension

```ts
openReadStream(ref, opts?: { start?: number; end?: number })
  → { stream: Readable; size: number; mimeType?: string; totalSize: number }
```

`get()` permanece para tests/compat.

## Auth

| Credencial | Cómo |
|------------|------|
| Install | `Authorization: Bearer <HUB_TOKEN>` |
| Device | `Authorization: Bearer <deviceCredential>` + `X-Device-Id: <deviceId>` |

401 anónimo. Envelope errores: `{ error: { code, message } }` (workspace).

## Authorization (PHASE 58)

```text
install → allow
device ACTIVE (verifyDeviceCredential) → allow
else → 401/403
```

`permissions` JSON no enforced aún (documentado).

## Headers

- `Content-Type`: mime Artifact sanitizado o `application/octet-stream`
- `Content-Length`: tamaño del body (o rango)
- `Content-Disposition: attachment; filename="…"` sanitizado
- `Accept-Ranges: bytes` si soporta Range
- Range inválido → 416

## Range

Soporte básico vía `openReadStream({ start, end })` en Local. Providers futuros deben implementar o ignorar (406/501 futuro).

## Android / Desktop

- Android: `ArtifactHttpClient` mínimo (HEAD + GET stream a archivo)
- Desktop: IPC/helper fetch binario con install bearer (opcional mínimo)

## Deferred

S3, MinIO, Wasabi, Credential Vault, presigned URLs, ACL completo, auto-persist MCP, WS blobs.
