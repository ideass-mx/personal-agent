# Reglas para agentes de código (Cursor / Claude Code)

Contexto obligatorio antes de tocar código: `docs/architecture.md`,
`docs/roadmap.md` y `packages/protocol/PROTOCOL.md`.

## Reglas duras

1. **El protocolo manda.** Nunca inventes ni renombres mensajes del WebSocket.
   Cualquier cambio al protocolo se hace PRIMERO en `packages/protocol/`
   (PROTOCOL.md + ambos espejos) y luego en el código que lo consume.
2. **Estructura plana por capacidad.** No introduzcas capas, módulos Gradle,
   carpetas core/features ni patrones "enterprise" no pedidos. Paquetes por
   capacidad (chat, voice, network), jamás por tipo técnico (utils, models, ui).
3. **No construyas para el futuro.** Nada de código "por si acaso" para fases
   que no están en curso. No dejes stubs vacíos sin uso real.
4. **Naming:** namespaces `mx.ideass.personal.agent.*` / `@mxideass/*`;
   las clases del agente usan prefijo `Agent` (AgentApp, AgentService); el resto
   se nombra por lo que hace. En UI y copy: «el agente» / «Agente» (sin nombre
   de personaje todavía).
5. **Android:** un solo módulo `app` bajo `mobile/android/`. minSdk 29,
   Kotlin + Jetpack Compose, OkHttp para WebSocket, kotlinx.serialization con
   `ignoreUnknownKeys = true` y `classDiscriminator = "type"`. El foreground
   service es innegociable.
6. **Gateway (`gateway/`):** TypeScript estricto, sin frameworks nuevos.
   Persistencia conversacional vía `gateway/src/memory/`; SQLite en `gateway/src/db/`.
   Los prompts viven en `gateway/src/agents/prompts.ts`
   (Agent Runtime dentro del Gateway; no confundir con el programa `node/`).
   Paquete npm: `@mxideass/gateway` (legacy: `@mxideass/hub`).
   Node (`node/`): MCP Server + Native Tools (`@mxideass/node`, legacy `@mxideass/agent`).
   Spawn canónico: `gateway/gateway.cjs` → `node/node.cjs` (PHASE 54).
   Agent lógico: `AgentDefinition` / Registry / Manager / Runtime (PHASE 55);
   `agentId` = instalación ≠ `AgentDefinition.id`.
   Vocabulario: `docs/architecture/terminology.md`, PHASE 53–55.
7. **Idioma:** código y nombres en inglés; comentarios, strings de UI y
   documentación en español.

## Legacy (compatibilidad)

- `hub/` / `HUB_TOKEN` / `hub.cjs` / logs `[hub]`: nombres legacy del Gateway (shims; runtime interno usa `[gateway]`).
- `agent/` / `agent.cjs` / logs `[agent]`: nombres legacy del Node (shims; runtime interno usa `[node]`).
- No usar `HUB_TOKEN` como agentId, secreto QR ni deviceCredential.
