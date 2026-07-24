# MX Ideass · Personal Agent

Agente personal soberano. Habla con él desde tus dispositivos; él orquesta
tu PC, tu casa y tus tareas. Este monorepo contiene todo el sistema.

El personaje del agente aún no tiene nombre propio: en UI y prompts se habla
de **el agente** / **Agente**.

## Estructura

```
hub/              El cerebro · Node + TypeScript (WebSocket + Claude + SQLite)
android/          El cliente · Kotlin + Compose
agent-windows/    Las garras · C#/.NET (Fase 4)
packages/protocol El contrato de mensajes — fuente de verdad
db/               Esquema y migraciones (SQLite hoy, Postgres mañana)
docs/             Arquitectura, roadmap y doctrina
```

## Levantar el hub

```bash
cp .env.example .env    # completa ANTHROPIC_API_KEY y HUB_TOKEN
npm install
npm run dev             # http://localhost:8787  ·  ws://localhost:8787/ws
```

### Probar sin app (terminal)

```bash
npx wscat -c ws://localhost:8787/ws
> {"type":"auth","token":"TU_HUB_TOKEN","deviceId":"terminal"}
> {"type":"user_message","text":"hola, preséntate"}
```

Verás los `assistant_chunk` llegar en streaming. Reinicia el hub y repite
con el mismo `conversationId` del `assistant_done`: la memoria persiste.

## Doctrina (resumen — completa en docs/architecture.md)

1. Nada se conecta directo a nada: todo pasa por el hub.
2. Estructura plana por capacidad; la ceremonia se gana con crecimiento real.
3. El protocolo (`packages/protocol/PROTOCOL.md`) manda; el código obedece.
4. Identidad: **MX Ideass · Personal Agent** (marca); repo `personal-agent`;
   namespaces `mx.ideass.personal.agent.*` / `@mxideass/*`; clases del
   agente con prefijo `Agent`; UI neutra («Agente»).
