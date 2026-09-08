# PHASE 59 — Local Computer Intelligence

**Estado:** PARTIAL (fix Windows drive-root + timeout MCP search; falta E2E Windows real)  
**Fecha:** 2026-09-07  

## Hotfix (2026-09-07)

Problema reportado: listar/buscar `C:` fallaba.

Causas:
1. `C:` en Windows no es la raíz (`C:\`); es el cwd del volumen.
2. Timeout MCP por defecto (15s) mataba `filesystem.search` antes de terminar.
3. `readdir` de raíces de unidad puede fallar en algunos Node/Windows.

Mitigación:
- Normalizar `C:` / `C:/` → `C:\`
- `readdir` con reintento `C:\.` + fallback a carpetas típicas (`Users`, …)
- Timeout MCP de search ≥ 50s (alineado al timeout interno)
- Prompt: preferir search por nombre; no listar toda la unidad como primer paso

> Nota de numeración: existe documentación previa de **Credential & Secret Management**
> también bajo PHASE 59 (`PHASE_59_DESIGN.md`). Esta fase de producto reutiliza el
> número solicitado para **inteligencia local de archivos**. No modifica Identity,
> AuthSession, Device Trust ni Credential Store.

## Objetivo

El usuario pide lo que necesita; el agente decide dónde buscar en la computadora.
Lectura amplia sin selector de carpetas ni diálogo de permisos.
Escritura / borrado / ejecución siguen con confirmación.

```text
User → Personal Agent → AgentRuntime → Tool Policy → MCP → Node → filesystem
```

## Tools

| Tool | Safety | Contención |
|------|--------|------------|
| `filesystem.search` | ALLOWED | Unidades accesibles; exclusiones técnicas de SO |
| `filesystem.list` | ALLOWED | Lectura amplia (`resolveReadablePath`) |
| `filesystem.read` | ALLOWED | Lectura amplia; binarios → `unsupported_format` |
| `filesystem.write` | CONFIRMATION_REQUIRED | `filesystem.root` (sin cambio) |
| `filesystem.delete` | CONFIRMATION_REQUIRED | Path amplio; HITL obligatorio |
| `process.execute` | CONFIRMATION_REQUIRED | Sin cambio |

## Implementación (Node)

- `node/src/tools/filesystem-search.ts` — búsqueda bajo demanda (sin indexador)
- `node/src/tools/fs-drives.ts` — detección de unidades (Windows A–Z; Unix = HOME)
- `node/src/tools/fs-exclusions.ts` — Windows / Program Files / caches, etc.
- `node/src/tools/fs-readable-path.ts` — resolución de lectura sin cerca de root
- `node/src/tools/fs-file-kinds.ts` — texto vs binario
- `node/src/tools/filesystem-delete.ts` — delete + confirm en Hub

Gateway: `DEFAULT_TOOL_POLICY` + `REQUIRED_AGENT_TOOLS` + prompt de producto.

## Límites

`maxResults`, `timeoutMs`, `maxDepth`, tamaño de muestra de contenido.
`ACCESS_DENIED` no aborta la búsqueda completa.
Sin elevación UAC / ownership.

## Logs

```json
{ "stage": "NODE", "event": "filesystem_search", "resultCount": 7, "durationMs": 120 }
```

Sin contenido de documentos ni secretos.

## Definition of Done

- [x] `filesystem.search` existe
- [x] Búsqueda multi-raíz (tests con raíces simuladas; Windows real pendiente)
- [x] Nombre / extensión / fecha / tamaño / contenido (texto)
- [x] `filesystem.list` / `filesystem.read` amplios
- [x] Sin UI de permisos de carpeta
- [x] Read/list/search ALLOWED; write/delete/execute confirm
- [x] Sin bypass Tool Safety
- [x] Sin indexador global
- [x] Límites + ACCESS_DENIED continuo
- [ ] Windows real validado (unidades, Unicode, junctions, NTFS)
- [x] Tests Node / Gateway de safety
- [ ] E2E producto en Desktop Windows

## Criterio principal

> "Está en mi computadora; encuéntralo."
