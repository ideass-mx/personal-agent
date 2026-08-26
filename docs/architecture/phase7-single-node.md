# PHASE 7 — Single Node packaging

**Estado:** CLOSED (topología de despliegue documentada; mismos binarios y Runtime).  
**Fecha:** 2026-08-24.

Single Node **no** es una implementación alternativa. No hay `SingleNodeRuntime`. El Agent Runtime de PHASE 6 es el único.

## Auditoría de packaging (código real)

No hay Docker, CI en repo, ni installers de OS. Distribución = `scripts/build.mjs` + `scripts/package.mjs` → `dist/`.

| Comando | Qué hace |
|---------|----------|
| `npm run hub` / `npm start --prefix hub` | Gateway (`hub/src/index.ts` vía tsx). **Spawn** del Local Node + MCP stdio + HTTP/WS. |
| `npm run dev` | Igual, con `tsx watch`. |
| `npm run hub:handshake` | Mismo spawn; sin LLM ni HTTP (`HUB_HANDSHAKE_ONLY=1`). |
| `npm run agent` | Local Node **solo** (MCP stdio en stdin). No es el stack Single Node completo. |
| `npm run build` | `dist/hub/hub.cjs` + `dist/agent/agent.cjs`. |
| `npm run package` | Build + better-sqlite3 + launchers + migraciones. |
| `npm run smoke:package` | Package + handshake MCP + `tools/list` + `filesystem.read`. |

**Cómo se inicia de verdad:** un comando Gateway. `attachLocalAgent` → `connectAgentStdioClient` → `resolveAgentLaunch()`:

- Desarrollo: `node …/tsx …/agent/src/index.ts`
- Empaquetado: `node dist/agent/agent.cjs` (relativo a `hub.cjs`)

stdio es el único transporte MCP. No hay proceso auxiliar extra (Excel COM vive *dentro* del Node cuando una Tool lo usa).

**No se añadió** `start:single-node`: duplicaría `hub` / `dev`.

## 1. Qué es Single Node

Una **máquina**: Gateway + Agent Runtime + MCP Client + Local Node + MCP Server. Puede ser **dos procesos** (Gateway padre, Node hijo). “Single Node” ≠ un solo proceso. La unidad conceptual es Node = ejecución; la máquina compartida es la topología.

## 2–8. Procesos y MCP

```text
Machine (Single Node)
│
├── Gateway process          hub/  ·  dist/hub/hub.cjs
│   ├── HTTP / WS
│   ├── Sessions, confirmations
│   ├── AgentDefinition (memoria)
│   ├── Agent Runtime          mismo proceso; no es el Gateway
│   ├── TurnMemory → SQLite
│   └── MCP Client / adapter   mcp-stdio.ts + mcp-executor.ts
│          │ stdio
│          ▼
└── Local Node process       agent/  ·  dist/agent/agent.cjs
    └── MCP Server
        └── Tools
```

Parada: SIGINT/SIGTERM en el Gateway; `index.ts` cierra HTTP y `agent.shutdown()` (hijo MCP).

## 9. Persistencia

| Dato | Dónde | Concepto |
|------|--------|----------|
| Conversations / messages / devices | `hub/data/personal-agent.db` (cwd-independiente: junto al módulo Hub) | Conversation, no Workspace |
| Migraciones | `db/migrations/` o `dist/migrations/` | Gateway |
| `filesystem.root` | disco acotado por `AGENT_FILESYSTEM_ROOT` | Node, no Workspace |
| AgentDefinition | memoria al arrancar | no persistente |
| Logs | stderr (stdout del Node = MCP) | |

## 10–12. Arranque y configuración

Desarrollo (repo):

```bash
cp hub/.env.example hub/.env   # ANTHROPIC_API_KEY, HUB_TOKEN
npm run install:all
npm run dev                    # Single Node
```

Producción (`npm run package`):

```bash
# .env visible al proceso Hub (ANTHROPIC_API_KEY, HUB_TOKEN, HUB_PORT…)
node dist/hub/hub.cjs          # o ./dist/hub/hub
```

Requisito: Node.js 22+. Handshake sin LLM: `HUB_HANDSHAKE_ONLY=1`.

| Frontera | Config |
|----------|--------|
| **Gateway** | `HUB_TOKEN`, `HUB_PORT`, `ANTHROPIC_API_KEY`, `dbFile`, `maxTokens`, spawn MCP |
| **Agent** | `AgentDefinition`: prompt, model, toolPolicy (código, no env) |
| **Node** | `AGENT_FILESYSTEM_ROOT` (el Hub la reenvía al hijo) |

Deuda: `model` también aparece en `hub/src/config.ts` (espejo). dotenv del Hub carga env que el hijo hereda.

## 13. Archivos / directorios

`hub/`, `agent/`, `hub/.env`, `hub/data/`, `db/migrations/`, `dist/hub/`, `dist/agent/`, `packages/protocol/` (clientes, no este despliegue).

## 14. Fuera de PHASE 7

Distributed, A2A, Workspace, registries, `agentId`/`nodeId`, nuevos transports MCP, Docker/K8s, installers OS, Android/OpenClaw/protocolo WS.

## 15. Evolución a Distributed (no implementada)

```text
HOY                         FUTURO
Gateway                     Gateway
  └── MCP Client              ├── MCP Client ── Node A
        └── Local Node        ├── MCP Client ── Node B
                              └── MCP Client ── Node C
```

Mismo Agent Runtime, mismos contratos MCP. Cambia el número de clientes MCP / Nodes, no el motor. Sin discovery ni heartbeat en esta fase.

## Decisiones

- Reutilizar `npm run hub` / `dev` / `package`.
- stdio sin cambios.
- Un Runtime.
- Single Node = topología, no código paralelo.
