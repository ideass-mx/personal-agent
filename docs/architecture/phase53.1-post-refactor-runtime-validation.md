# PHASE 53.1 — Post-Refactor Runtime Validation

**Estado:** VALIDATED (fixes de path activos) · **FIELD TEST: NOT EXECUTED**  
**Fecha:** 2026-08-29

## Pregunta

> Después de renombrar Hub → Gateway y Agent → Node, ¿el sistema real sigue funcionando como una cadena coherente desde Desktop hasta Node/MCP/Tools y clientes?

## Respuesta

**Sí.** Evidencia: `npm test` 734/737, `npm run build`, `smoke:package`, Desktop 21/21, Android compile + pairing/connection unit tests. Field test Windows/Android/Tailscale físico: **NOT EXECUTED**.

## Flujo validado

```text
Desktop → Gateway → Node → MCP stdio → ToolRegistry → Agent Runtime → HTTP/WS → Clients
```

| Tramo | Evidencia | Modo |
|-------|-----------|------|
| Desktop READY | `agent-process.cjs` acepta `[gateway] READY` y `[hub] READY` | STATICALLY VERIFIED |
| Gateway spawn Node | `resolve-agent.ts` prioriza `node/node.cjs` | EXECUTED (tests + smoke) |
| MCP handshake | smoke + filesystem MCP tests | EXECUTED |
| tools/list + safe tool | smoke `filesystem.read` | EXECUTED |
| Agent Runtime wiring | gateway runtime/architecture tests | EXECUTED (mock LLM) |
| Pairing / QR / Tailscale | sin cambios de protocolo; unit tests | STATICALLY VERIFIED |
| CI packaging | workflow corregido a `gateway/` + `node/` | STATICALLY VERIFIED |
| Field Desktop↔Android | — | NOT EXECUTED |

## Skipped tests (3)

Los 3 `# skipped` de `node` son Windows-only (`process.platform !== "win32"`). Clasificación **A**. No relacionados con PHASE 53.

## Fixes aplicados en esta fase

1. `.github/workflows/windows-installer.yml`: `hub`/`agent` → `gateway`/`node` (npm ci, cache, tests).
2. `scripts/build.mjs`: `hub.cjs` / `agent.cjs` como **thin shims** hacia `gateway.cjs` / `node.cjs`.
3. `scripts/smoke-package.mjs`: entrypoints canónicos + SDK bajo `gateway/node_modules` (antes `hub/…` roto).
4. `desktop/lib/install-scenario.cjs`: detecta `gateway/gateway.cjs`.
5. `attach-agent.ts`: marker dual `[gateway] Node READY` + legacy `[hub] Agent READY`.
6. Docs: este archivo + encabezado canónico en `docs/architecture.md`.

## Legacy deliberado

`HUB_TOKEN`, `HUB_PORT`, `HubClient`, markers `[hub] READY`, layouts `dist/hub` / `dist/agent`, product `agent/`.

## No hecho (fuera de alcance)

Rename `HUB_TOKEN`, rename completo `HubClient`, rename `attach-agent.ts` → `attach-node.ts`, field test físico.
