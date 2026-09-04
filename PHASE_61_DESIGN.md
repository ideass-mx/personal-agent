# PHASE 61 — DESIGN (Resource Resolution)

## Lifecycle

```text
Resource
  ├── consume (embedded bytes/text)     → resolved, no Artifact
  ├── reference (resource_link)         → deferred, no fetch
  └── persist=true + policy allow       → Artifact → ObjectStorage
```

**Resource efímero por defecto. Artifact opt-in. ObjectStorage = bytes.**

## Policy (defaults conservadores)

```ts
{
  allowExternal: false,
  allowHttp: false,
  allowHttps: false,
  allowFile: false,
  maxBytes: 25 MiB,      // DEFAULT_MAX_OBJECT_BYTES
  timeoutMs: 15_000,
  maxRedirects: 3,
  persist: false,
  allowedMimeTypes?: string[],
  blockedMimeTypes?: string[],
  filesystemRoot?: string,  // requerido si allowFile
}
```

`allowExternal` es el interruptor maestro de red. Schemes HTTP/S solo si además `allowHttp`/`allowHttps`.

## Resolution statuses

| Status | Significado |
|--------|-------------|
| `resolved` | Contenido disponible (embedded o fetch OK); Artifact solo si `persist` |
| `deferred` | Referencia externa conservada; sin download |
| `unsupported` | Scheme/kind no soportado |
| `blocked` | Policy/SSRF/MIME/size |
| `failed` | Error de red/IO tras validación |

## Security (SSRF)

1. Parse URL; bloquear userinfo en fetch
2. `dns.lookup` → IPs efectivas
3. Rechazar loopback, RFC1918, link-local, ULA IPv6, metadata (`169.254.169.254`, etc.)
4. Redirects manuales; revalidar cada hop; `maxRedirects`
5. Si validación DNS/IP incompleta en runtime → **no fingir**; default `allowExternal=false`

## Streaming

```text
HTTP body stream → size limit transform → ObjectStorage.put({ stream })
```

No `download → unbounded Buffer → put`.  
`Content-Length` pre-check + conteo en stream.

## MIME

- `declaredMimeType` del Resource/headers (sanitizado)
- Sin detector binario complejo en PHASE 61
- allowlist/blocklist de policy

## Provenance

- `sourceType`, `uri` **sanitizada** (sin userinfo; query sin token/signature/password)
- Nunca headers Authorization/Cookie

## Boundaries

- Resolver → ArtifactManager / ObjectStorage interface
- Resolver ↛ `@aws-sdk`, Local paths de objects, MCP server Node
- ObjectStorage ↛ ResourceResolver
- MCP protocol sin cambios

## Schemes

| Scheme | Default | Condición |
|--------|---------|-----------|
| (embedded, sin URI fetch) | OK | siempre consume/persist local |
| `https` | off | allowExternal + allowHttps + SSRF |
| `http` | off | allowExternal + allowHttp + SSRF |
| `file` | off | allowFile + filesystemRoot containment |

## Deferred

Auto-download global, crawling, indexing, GC, versioning, Resource Browser UI, content sniffing avanzado.
