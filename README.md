# MX Ideass · Personal Agent

Agente personal soberano. Habla con él desde tus dispositivos; él orquesta
tu PC, tu casa y tus tareas. Este monorepo contiene todo el sistema.

El personaje del agente aún no tiene nombre propio: en UI y prompts se habla
de **el agente** / **Agente**.

## Estructura

```
hub/              Cerebro · AgentRuntime + HTTP/WebSocket (Node.js + TypeScript)
agent/            Garras · proceso local multiplataforma (placeholder Fase 4)
mobile/android/   Cliente · Kotlin + Compose
packages/protocol Contrato WS clientes ↔ Hub — fuente de verdad
db/               Esquema y migraciones (SQLite hoy, Postgres mañana)
docs/             Arquitectura, roadmap y doctrina
```

`hub/src/agent/` es el AgentRuntime del Hub; no es el programa `agent/`.

## Levantar Single Node (Gateway + Local Node)

El Hub **spawnea** el proceso `agent/` por MCP stdio. No hace falta `npm run agent` para el stack completo.

```bash
cp hub/.env.example hub/.env    # completa ANTHROPIC_API_KEY y HUB_TOKEN
npm run install:all             # deps en packages/protocol, hub y agent
npm run dev                     # http://localhost:8787  ·  ws://localhost:8787/ws
```

O por carpeta:

```bash
npm install --prefix packages/protocol
npm install --prefix hub
npm run dev --prefix hub
```

### Probar sin app (terminal)

```bash
npx wscat -c ws://localhost:8787/ws
> {"type":"auth","token":"TU_HUB_TOKEN","deviceId":"terminal"}
> {"type":"user_message","text":"hola, preséntate"}
```

Verás los `assistant_chunk` llegar en streaming. Reinicia el Hub y repite
con el mismo `conversationId` del `assistant_done`: la memoria persiste.

## Doctrina (resumen — completa en docs/architecture.md)

1. Nada se conecta directo a nada: todo pasa por el Hub (`hub/`).
2. **Hub = cerebro; Agent = garras.** Un Agent, varias
   plataformas (Windows / Linux / macOS) vía adapters y empaquetado.
3. Estructura plana por capacidad; la ceremonia se gana con crecimiento real.
4. El protocolo (`packages/protocol/PROTOCOL.md`) manda; el código obedece.
5. Identidad: **MX Ideass · Personal Agent** (marca); repo `personal-agent`;
   namespaces `mx.ideass.personal.agent.*` / `@mxideass/*`; clases del
   agente con prefijo `Agent`; UI neutra («Agente»).
