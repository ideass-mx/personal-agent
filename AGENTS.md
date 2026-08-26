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
6. **Hub (`hub/`):** TypeScript estricto, sin frameworks nuevos.
   Persistencia conversacional vía `hub/src/memory/`; SQLite en `hub/src/db/`.
   Los prompts del agente viven solo en `hub/src/agent/prompts.ts`
   (Agent Runtime del Gateway, alojado hoy en el proceso Hub; no confundir
   con el programa `agent/`, precursor del Local Node).
   El paquete npm es `@mxideass/hub`.
   Vocabulario: `docs/architecture/terminology.md`.
7. **Idioma:** código y nombres en inglés; comentarios, strings de UI y
   documentación en español.
