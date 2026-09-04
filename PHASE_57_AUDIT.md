# PHASE 57 — AUDIT

**Fecha:** 2026-09-04  
**Alcance:** solo inspección (sin cambios funcionales en esta etapa del proceso).  
**Objetivo:** Resource / Artifact / ObjectStorage local-first, compatible con MCP estándar.

---

## 1. Arquitectura actual (relevante)

```text
Clientes (Android / Desktop Console)
        │  WS text-only (packages/protocol)
        ▼
Gateway (`gateway/`)
  · AgentRuntime · ToolRegistry · Confirmation
  · SQLite (conversations, workspaces, pairing)
  · HTTP: /health, workspaces, pairing, console static
  · MCP Client (stdio) → RemoteAgentTool
        │
        ▼
Node (`node/`)
  · MCP Server (envelope JSON en content[0].text)
  · Native Tools (filesystem.*, process, office.excel, …)
        │
        ▼
Workspace FS (AGENT_FILESYSTEM_ROOT = Desktop workspaceRoot)
```

**No existe** hoy: Artifact, Resource de plataforma, ObjectStorage, blob HTTP, transferencia de archivos Gateway↔Android.

---

## 2. MCP CallToolResult — estado real

### Contrato productivo (propietario sobre MCP text)

| Capa | Forma |
|------|--------|
| Node `mcp/server.ts` | `content: [{ type: "text", text: JSON.stringify({ requestId, result: ToolResult }) }]` |
| Gateway `mcp/executor.ts` | Lee solo `content[0].text` + `isError`; parsea envelope |
| `ToolResult` (gateway/node) | `{ ok: true, content: unknown } \| { ok: false, error: { code, message } }` |

### Lo que MCP estándar ofrece y hoy **se ignora**

- `structuredContent`
- `resource_link` / EmbeddedResource
- `image` / `audio` / multi-part `content[]`
- MCP Resources API (`listResources` / `readResource`)

**Conclusión:** hay un *envelope* JSON-safe estable, **no** una capa de fidelidad MCP completa. PHASE 57 debe añadir `NormalizedMcpResult` **sin** romper el envelope productivo ni exigir Artifact a MCPs externos.

---

## 3. Tipos existentes (reutilizar vs no tocar)

| Tipo / módulo | Rol | Acción PHASE 57 |
|---------------|-----|-----------------|
| `gateway/src/tools/types.ts` `ToolResult` | Resultado AgentTool | **Intact** (contrato Runtime) |
| `gateway/src/tools/remote.ts` | Envelope RemoteAgentTool | **Intact** |
| `gateway/src/tools/mcp/executor.ts` | CallTool → ToolResult | **Intact** (opcional bridge aparte) |
| `gateway/src/agents/runtime.ts` `toolResultForLlm` | stringifica ToolResult | **Intact** |
| `node/src/mcp/server.ts` | wrap ToolResult | **Intact** |
| `packages/protocol` | WS clientes | **Intact** (sin mensajes blob) |
| Workspace / pairing / skills | otros dominios | **Intact** |

---

## 4. Flujos actuales de “archivos”

| Flujo | Qué es | ≠ ObjectStorage |
|-------|--------|-----------------|
| `filesystem.read/write/list` | Tools Node sobre **workspace** | Sí distinto |
| `office.excel.*` | COM → JSON celdas | Sí distinto |
| SQLite `messages.content` | texto conversación | No blobs |
| AppData `data/personal-agent.db` | metadata producto | Referencias sí; bytes no |
| Console `serveStatic` | SPA | No blobs de usuario |
| Android voice models | cache local app | No Gateway |

---

## 5. Persistencia / datos producto

```text
PERSONAL_AGENT_DATA_DIR | LOCALAPPDATA/.../Ideass/PersonalAgent
  config/   product.json, secrets.json, onboarding.json
  data/     personal-agent.db   ← PERSONAL_AGENT_DB
  logs/
  runtime/
  ❌ objects/ / artifacts/   (aún no)
```

Migraciones: `001`…`004`. Siguiente: **`005_artifacts.sql`**.

Secrets: `secrets.json` + env Gateway. **No** mezclar con Artifact metadata.

---

## 6. Duplicaciones / riesgos

1. Confundir `AGENT_FILESYSTEM_ROOT` (workspace) con ObjectStorage (producto).
2. Meter blobs en `messages.content` (rompe historial/LLM).
3. Inventar `artifact://` como “MCP estándar”.
4. Auto-download de todo `resource_link`.
5. Acoplar ArtifactManager a `LocalObjectStorage` concreto o a Node FS tools.
6. Exponer AWS/MinIO credentials a Android.

---

## 7. Puntos de integración (sin romper Runtime)

```text
MCP externo / futuro parser
        ↓
NormalizedMcpResult (fidelidad MCP)
        ↓
Resource (referencia; puede ser externa)
        ↓
[explícito] ArtifactManager.persist(...)
        ↓
ObjectStorage (interface)
        ↓
LocalObjectStorage (default)
```

Composición en Gateway (`index.ts` / módulo dedicado). **AgentRuntime no debe importar S3 ni paths de objects.**

---

## 8. Archivos a modificar / añadir

### Añadir
- `PHASE_57_AUDIT.md`, `PHASE_57_DESIGN.md`
- `gateway/src/mcp-result/*`
- `gateway/src/resources/*`
- `gateway/src/artifacts/*`
- `gateway/src/storage/*`
- `db/migrations/005_artifacts.sql`
- tests `gateway/tests/artifacts/*`, `gateway/tests/mcp-result/*`, `gateway/tests/storage/*`
- Desktop `objectsDir` en `config.cjs` + env opcional

### Modificar mínimamente
- `gateway/src/config.ts` — `objectsDir`
- `desktop/lib/config.cjs` — `objectsDir` / `ensureDirs`
- `desktop/main.js` — pasar `PERSONAL_AGENT_OBJECTS_DIR` si aplica

### Permanecer intactos
- AgentRuntime API, AgentDefinition, Skills, ToolPolicy, pairing, Tailscale
- Node MCP envelope, RemoteAgentTool, discover/policy
- `packages/protocol` (sin blobs WS en esta fase)
- filesystem.* / office.excel.*

---

## 9. S3 / cloud en el repo

**No hay** infraestructura S3/MinIO/Wasabi. Solo diseñar `StorageProvider` + interface; implementar `local`.

---

## 10. Veredicto de auditoría

| Pregunta | Respuesta |
|----------|-----------|
| ¿Existe Resource/Artifact/ObjectStorage? | **No** |
| ¿Se puede añadir sin romper MCP envelope? | **Sí** (capa paralela) |
| ¿Local-first posible en AppData? | **Sí** (`…/objects`) |
| ¿Auto-persist resource_link? | **Prohibido** |
| ¿AgentRuntime acoplado a storage? | **No debe** |

```text
AUDIT STATUS: COMPLETE — listo para DESIGN + implementación mínima
```
