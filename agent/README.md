# Agent

Proceso **local** multiplataforma. Frontera de ejecución en la máquina.
No confundir con `hub/src/agent/` (AgentRuntime del Hub).

```text
Clientes ──WS──► Hub ──MCP stdio──► Agent ── agent.echo
                                      │
                                      └── (futuro: filesystem / shell / OS)
```

El Hub piensa y coordina; el Agent ejecuta las capacidades locales;
MCP conecta ambos.

## Arranque

```bash
npm run agent          # desde la raíz
npm start --prefix agent
```

MCP por **stdio** (stdout = protocolo; logs en stderr). SIGINT/SIGTERM hacen
shutdown. No es un servicio Windows/systemd/launchd.

## Qué hace / qué no

**Sí:** lifecycle, MCP, `agent.echo`. En el futuro: tools de OS
(Windows / Linux / macOS) **dentro de este proceso**, con adapters de
plataforma.

**No:** LLM, AgentRuntime del Hub, memoria conversacional, confirmación,
Permission System. No hay un tercer proceso.

MCP es **solo transporte**. Confirmación = Hub, antes de `executor.execute()`.
`executionMode` vive en `AgentTool`. El Agent puede validar cada tool
cuando existan filesystem/shell.

## Estructura

```text
agent/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── lifecycle.ts
│   ├── mcp/server.ts
│   └── tools/
└── tests/
```
