# PHASE 54 — Canonical Runtime + Field Validation

**Estado:** IMPLEMENTED (runtime canónico) · **FIELD TEST: NOT EXECUTED**  
**Fecha:** 2026-08-29

## Cadena canónica

```text
Desktop
  → gateway/gateway.cjs
  → node/node.cjs
  → MCP stdio
  → Native Tools
```

## Spawn interno (Gateway → Node)

| Prioridad | Path | Rol |
|-----------|------|-----|
| 1 | `../node/node.cjs` | **CANONICAL** — único entrypoint interno preferido |
| 2 | `../agent/agent.cjs` | **LEGACY FALLBACK** — solo instalaciones pre-PHASE 53 |

**Eliminado de la cadena interna:** `../node/agent.cjs` (shim; no debe usarse como spawn).

## Entrypoints

| Canónico | Shim legacy |
|----------|-------------|
| `gateway/gateway.cjs` | `hub.cjs` → `require("./gateway.cjs")` |
| `node/node.cjs` | `agent.cjs` → `require("./node.cjs")` |

Desktop arranca `gateway/gateway.cjs` primero; `hub.cjs` solo si falta el canónico.

## Logs

| Canónico | Legacy |
|----------|--------|
| `[gateway] READY` | `[hub] READY` ya no se emite; Desktop aún lo acepta como fallback |
| `[node] READY` | `[agent] …` ya no se emite en Node |

## Renames

| Antes | Ahora |
|-------|-------|
| `attach-agent.ts` | `attach-node.ts` (+ re-export deprecated) |
| `attachLocalAgent` | `attachLocalNode` (alias deprecated) |
| `HubAgentError` | `NodeProcessError` (alias `HubAgentError`) |

## Field test

**NOT EXECUTED** en este entorno (sin Windows físico / Android / Tailscale de campo).

Validación local: `npm test`, `npm run build`, `smoke:package`, Desktop unit tests, Android unit/compile.
