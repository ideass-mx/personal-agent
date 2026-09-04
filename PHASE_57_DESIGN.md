# PHASE 57 — DESIGN

**Estado:** diseño canónico para implementación mínima  
**Precedencia:** `PHASE_57_AUDIT.md`

---

## 1. Principio

```text
MCP Result  ≠  Resource  ≠  Artifact  ≠  ObjectStorage  ≠  Credentials
```

Un MCP externo **no** conoce Artifact. Personal Agent puede, **explícitamente**, persistir un Resource como Artifact.

```text
MCP
 ↓
MCP Result (NormalizedMcpResult)
 ↓
Resource (opcional extracción; externo o embebido)
 ↓
optional explicit persistence
 ↓
Artifact (metadata SQLite)
 ↓
ObjectStorage
 ├── LocalObjectStorage   ← default PHASE 57
 ├── S3                    ← future
 ├── MinIO                 ← future
 └── Wasabi               ← future
```

---

## 2. MCP Result Layer

**Nuevo módulo:** `gateway/src/mcp-result/`

No reemplaza `tools/types.ts` `ToolResult` (AgentTool).

```ts
type McpContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }
  | { type: "audio"; data: string; mimeType: string }
  | { type: "resource_link"; uri: string; name?: string; mimeType?: string; description?: string }
  | { type: "resource"; resource: { uri: string; mimeType?: string; text?: string; blob?: string } };

interface NormalizedMcpResult {
  content: McpContentBlock[];
  structuredContent?: unknown;
  isError?: boolean;
  metadata?: Record<string, unknown>;
}
```

Funciones:
- `normalizeMcpResult(raw: unknown): NormalizedMcpResult` — fail-closed, sin Artifact
- `agentToolResultToMcp(result: ToolResult): NormalizedMcpResult` — puente legacy (texto JSON)
- **No** crea Artifact
- **No** descarga URIs

---

## 3. Resource Layer

**Nuevo:** `gateway/src/resources/`

```ts
type ResourceKind = "external" | "embedded" | "local_ref";

interface Resource {
  id: string;           // estable derivado (hash uri+kind) o uuid para embedded
  kind: ResourceKind;
  uri?: string;         // http(s), file, etc. — referencia, no secreto
  mimeType?: string;
  name?: string;
  /** bytes solo si embedded y ya en memoria — no implica persistencia */
  inlineBytes?: Uint8Array;
  inlineText?: string;
}
```

`extractResources(result: NormalizedMcpResult): Resource[]`  
- `resource_link` → `kind: "external"`  
- embedded `resource` con text/blob → `kind: "embedded"`  
- **sin** put a ObjectStorage

---

## 4. Artifact

**Nuevo:** `gateway/src/artifacts/`

```ts
interface Artifact {
  id: string;
  name?: string;
  mimeType?: string;
  size: number;
  storage: ObjectReference;
  provenance?: ArtifactProvenance;
  createdAt: string;
  updatedAt?: string;
}

interface ArtifactProvenance {
  sourceType: "mcp" | "native" | "generated" | "imported";
  serverId?: string;
  toolName?: string;
  uri?: string;
}
```

`ArtifactManager` (depende de `ObjectStorage` **interface** + store SQLite):
- `createFromBytes({ bytes, mimeType?, name?, provenance? })`
- `createFromResource(resource, opts)` — solo si caller lo pide; external URI **no** se descarga automáticamente (requiere `bytes` o política futura)
- `get(id)` / `readBytes(id)` / `delete(id)`

---

## 5. ObjectStorage

**Nuevo:** `gateway/src/storage/`

```ts
interface ObjectReference {
  provider: string;  // "local" | "s3" | …
  key: string;
}

interface ObjectStorage {
  put(input: { key?: string; bytes: Uint8Array; mimeType?: string }): Promise<ObjectReference>;
  get(ref: ObjectReference): Promise<{ bytes: Uint8Array; mimeType?: string }>;
  delete(ref: ObjectReference): Promise<void>;
  exists(ref: ObjectReference): Promise<boolean>;
  metadata(ref: ObjectReference): Promise<{ size: number; mimeType?: string }>;
}
```

`LocalObjectStorage`:
- Root: `PERSONAL_AGENT_OBJECTS_DIR` || sibling de `data/` → `{productRoot}/objects`
- Layout: `objects/by-id/<key>/object` (+ opcional `meta.json` sin secretos)
- Path traversal reject; keys = `[a-zA-Z0-9._-]{1,128}` o uuid
- Max size configurable (default 25 MiB)

`storage.provider = local` por defecto. Sin AWS deps.

---

## 6. Database

`db/migrations/005_artifacts.sql`:

```sql
CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  name TEXT,
  mime_type TEXT,
  size INTEGER NOT NULL,
  storage_provider TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  source_type TEXT,
  source_server TEXT,
  source_tool TEXT,
  source_uri TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);
```

Bytes **fuera** de SQLite.

---

## 7. Credenciales

Boundary explícito (sin Credential Vault completo):

```text
secrets.json / env / pairing hashes
        ≠
artifacts table / ObjectReference / ToolResult / Resource
```

Logs: artifactId, provider, mimeType, size, sourceType — **nunca** secrets ni URLs firmadas completas.

---

## 8. Integración Runtime / Node / Android

| Componente | PHASE 57 |
|------------|----------|
| AgentRuntime | sin cambios API |
| Node MCP | sin cambios envelope |
| Android | sin protocol blob; diseño futuro Gateway→ArtifactManager |
| Desktop | crea `objects/` bajo product root; env opcional |

---

## 9. Tests (aceptación)

1. MCP text-only → no Artifact  
2. `structuredContent` preservado  
3. `resource_link` → Resource external; no Artifact  
4. image block preservado  
5. `isError` preservado  
6. persist bytes → Artifact → LocalObjectStorage → read equal  
7. ArtifactManager mockea `ObjectStorage` (no importa Local concreto)  
8. Local funciona sin red / sin AWS env  

---

## 10. Explicitly out of scope

S3 real, MinIO, marketplace, GC, versionado, vector DB, OAuth vault, `artifact://` como MCP, auto-download resource_link, protocolo WS de descarga.
