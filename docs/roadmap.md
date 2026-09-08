# Roadmap

Principio: cada fase termina en algo usable a diario.

- **Fase 0 · Cimientos** — repo, Tailscale PC+móvil, API key. ✔ (repo semilla)
- **Fase 1 · El canal** — Hub `hub/` (✔ semilla; antes `api/`) + app Android chat texto.
  Éxito: mensaje desde la calle → Hub → Claude → respuesta; y la conexión
  sobrevive 1h con pantalla bloqueada (batalla anti-HyperOS).
- **Fase 2 · La voz** — SpeechRecognizer + TTS sistema, push-to-talk.
  Éxito: conversación hablada completa.
- **Fase 3 · El asistente** — VoiceInteractionService + ROLE_ASSISTANT.
  Éxito: pulsación larga en Buds Pro 3, teléfono en el bolsillo, hablas con el agente.
- **Fase 4 · Las garras** — **Agent**: MCP + `filesystem.read` (`automatic`) +
  `filesystem.list` (`automatic`) + `filesystem.write` (`confirm` en Hub).
  Las tres respetan `filesystem.root` local (Etapas 7D/7E/7F; no es
  Permission System). Auditoría fail-closed Hub↔MCP↔Agent (Etapa 7G).
  Contrato de `process.execute` implementado en Agent (Etapa 8B):
  argv/`spawn` `shell:false`, confirm en Hub, cwd vía `filesystem.root`.
  Auditoría de seguridad Hub↔Agent (Etapa 8C). Consolidación runtime
  Hub↔Agent (Etapa 8D): descubrimiento MCP, RemoteAgentTool, E2E FakeLLM;
  **no existe Guardian**. Lifecycle operable (Etapa 9A): el Hub
  inicia/detiene el Agent, MCP stdio, sin tercer proceso ni reintento
  automático. Empaquetado v1 (Etapa 9B): `npm run build` / `package`
  genera `dist/hub` + `dist/agent` (JS + Node runtime; no SEA).
  Agent Extension (Etapa 10A–11C): contrato in-process estático; `echo`,
  `filesystem`, `process`, `math`, `system` y `diagnostics` entran por
  `createDefaultExtensions()`. Namespace `<extension>.<tool>` (salvo
  `echo` → `agent.echo`). El core del Agent es infraestructura
  (lifecycle, registry, MCP, config).
  10C demuestra que se puede añadir una capacidad (`math`) sin tocar
  runtime del Agent, MCP, confirmation ni AgentRuntime.
  11A consolida validación fail-closed de namespace y duplicados.
  11B demuestra `system.info` como extensión real (MCP `tools/list`,
  `executionMode` solo en el Hub, sin proceso ni permisos extra).
  11C demuestra independencia: `diagnostics.ping` se descubre por MCP,
  el Hub no conoce su implementación, y ausente la extensión no aparece
  en `tools/list`.
  12A audita seguridad Hub↔MCP↔Agent (stdio local, confirmation,
  filesystem, process.execute, extensions) **sin** añadir capas.
  12B endurece `process.execute`: process group POSIX en timeout/shutdown;
  Windows sin Job Objects (limitación documentada).
  13A demuestra una Agent Extension de cliente (`customer.demo`) estática
  en el bundle: el Hub la descubre por MCP; sin la extensión no existe.
  13B extrae la Tool Policy del Hub: capabilities vía `tools/list`,
  autorización y `executionMode` en policy; deny por omisión; el Agent
  no decide confirmation.
  13D.1 añade `office.excel.read` como Agent Extension estática (Windows
  COM / Excel local; Hub solo policy + MCP).
  13D.2 endurece COM: winax anclado al bundle (no al cwd), ownsExcel,
  cola serializada, cleanup en shutdown/error, límites antes de Value2.
  13E añade `office.excel.write` (Agent Extension estática; Hub policy
  `confirm`; misma cola COM; no crea workbooks ni hojas).
  13F endurece el contrato Office (policy, namespace, A1, workbook,
  fórmulas, lock COM, timeout MCP > COM, fail-closed).
  Falta: instaladores nativos por OS; carga dinámica
  de extensiones (fuera de alcance; Agent extensions siguen estáticas);
  parsers PDF/DOCX dedicados. PHASE 59 (Local Computer Intelligence):
  `filesystem.search` + `filesystem.delete` con lectura amplia.
- **Fase 5 · Cerebro maduro** — memoria vectorial, proactividad,
  confirmaciones destructivas end-to-end.

**Backlog** (entra cuando el uso lo pida): Wear OS · WhatsApp bridge ·
Home Assistant · UI Automation ventanas · Whisper/ElevenLabs · Wake-on-LAN ·
cliente iOS · codegen del protocolo (JSON Schema → 4 espejos, al 3er lenguaje).
