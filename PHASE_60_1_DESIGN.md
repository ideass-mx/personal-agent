# PHASE 60.1 — DESIGN (Resource / Artifact / ObjectStorage)

## Decisión final: **OPCIÓN B**

Mantener los tres conceptos; **reducir** Artifact a dominio + referencia de storage; toda operación física permanece en ObjectStorage.

```text
MCP / Agent
     │
     ▼
  Resource          (efímero; puede no persistir)
     │
     │ decisión explícita de conservar
     ▼
  Artifact          (identidad + metadata + provenance + storage ref)
     │
     │ storageReference = ObjectReference
     ▼
  ObjectStorage     (bytes: local | s3 | minio | wasabi)
```

---

## 1. Definiciones oficiales

### Resource

Contenido o referencia descubierta/consumida (p. ej. desde MCP), **sin** ownership ni persistencia obligatoria.

- Puede desaparecer al terminar la operación.
- `id` derivado (`res_…`) no es ID de producto entregable.

### Artifact

Objeto que Personal Agent **administra** como unidad estable:

- identidad opaca (`artifactId`) para clientes HTTP/IPC
- metadata semántica (`name`, `mimeType`, `size`, timestamps)
- provenance (`sourceType`, server/tool/uri)
- `storage: ObjectReference` — **única** vía a bytes
- lifecycle coordinado create/get/delete (metadata + object)

### ObjectStorage

Infraestructura de bytes: put / get / stream / metadata / delete / range.  
No conoce MCP, Runtime, conversaciones, Android ni significado de Artifact.

### ObjectReference

Referencia **solo** de storage: `{ provider, key }`.  
No es Artifact ni Resource.

---

## 2. Límites (qué NO pertenece)

| Capa | NO debe |
|------|---------|
| Resource | Persistir, ACL, HTTP download product, conocer S3 |
| Artifact | `fs.readFile`, SDK AWS, implementar put/get físicos, secretos |
| ArtifactManager | Crecer como API genérica de storage; auto-download MCP |
| ObjectStorage | Provenance, conversationId, pairing, mime “de negocio” obligatorio |

---

## 3. Relaciones y lifecycle

```text
¿Resource → Artifact?
  Solo con persistencia EXPLÍCITA (createFromResource / createFromBytes).
  MCP resource_link / resource NUNCA implican Artifact automático.

¿Artifact → ObjectStorage?
  Siempre que haya bytes gestionados: Artifact.storage → ObjectStorage.

¿ObjectStorage sin Artifact?
  SÍ (cache interno, tests, futuros objetos técnicos). Hoy Artifact es el
  único product surface; storage contract tests ya usan ObjectStorage solo.

¿Resource sin Artifact?
  SÍ (caso normal: consumir y descartar).

¿Artifact sin ObjectStorage object?
  INVÁLIDO en estado sano (metadata huérfana = error de delivery 404/object missing).
  Create debe ser atómico (rollback storage si falla metadata).
```

---

## 4. Ejemplos

**A — Solo consumir MCP**

```text
tool result → NormalizedMcpResult → extractResources → usar URI/texto → fin
(sin Artifact, sin ObjectStorage)
```

**B — Conservar reporte**

```text
bytes / Resource embebido → ArtifactManager.create* → SQLite + ObjectStorage.put
cliente → GET /artifacts/:artifactId → stream
```

**C — ObjectStorage interno (futuro/test)**

```text
ObjectStorage.put({ key: "thumb_…" })  // sin fila artifacts
```

---

## 5. ArtifactManager (forma reducida permitida)

**Mantener:**

- `createFromBytes` / `createFromResource` (explícito)
- `get` (metadata)
- `openReadStream` / `readBytes` (delivery keyed by **artifactId**)
- `delete` (coordina metadata + object)

**No añadir** sin necesidad real:

- ArtifactService / Repository / LifecycleManager / DomainService
- `putBytes` genérico que ignore metadata
- sync local↔cloud, versioning, GC

**Convención actual:** `storage.key` suele igualar `artifact.id`.  
**Regla de diseño:** clientes y HTTP usan solo `artifactId`; el key de storage es detalle interno. Futuro: key distinto del id **sin** cambiar `/artifacts/:artifactId`.

---

## 6. HTTP / compatibilidad

- `GET|HEAD /artifacts/:artifactId` = identidad de **Artifact** (dominio).
- Android `ArtifactHttpClient` / Desktop IPC: intactos.
- ObjectStorage providers / CredentialManager / MCP / Runtime / pairing: intactos.
- Sin migración destructiva en 60.1.

---

## 7. Migración futura (documentada, no ejecutar ahora)

| Ítem | Acción |
|------|--------|
| Desacoplar `artifact.id` ≠ `storage.key` | Cuando un provider lo requiera; Artifact.storage ya lo permite |
| Asociación conversation/agent | Columnas opcionales futuras; no inventar ahora |
| Objects internos sin Artifact | Permitidos vía ObjectStorage directo; no exponer `/artifacts` |
| Simplificar `readBytes` | Opcional: callers de delivery solo `openReadStream` |

---

## 8. Respuestas de aceptación

| Pregunta | Respuesta |
|----------|-----------|
| ¿Qué es Resource? | Ref/contenido efímero; sin persistencia implícita |
| ¿Qué resuelve Artifact? | Identidad estable + metadata/provenance + delivery authz sin exponer storage |
| ¿ObjectStorage? | Solo bytes/provider; no semántica de producto |
| ¿Resource → Artifact? | Solo decisión explícita de conservar |
| ¿Artifact necesita ObjectStorage? | Sí, para bytes |
| ¿ObjectStorage sin Artifact? | Sí |
| ¿Resource sin Artifact? | Sí |
| ¿Artifact sin object? | Estado inválido / error de delivery |
