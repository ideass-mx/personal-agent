# Arquitectura — MX Ideass · Personal Agent

## Principio rector
Nada se conecta directo a nada: **todo pasa por el hub**. Los dispositivos son
puntos de entrada/salida; los nodos ejecutores hacen; el hub piensa y enruta.

## Piezas

**Hub (Node/TS)** — el cerebro. Cuatro trabajos: la puerta (WebSocket de
clientes), el cerebro (llamadas a Claude con memoria/contexto), el enrutador
(qué nodo ejecuta qué — Fase 4) y la memoria (SQLite → Postgres).
Estructura plana por capacidad: `gateway/ brain/ memory/ router/`.

**Cliente Android (Kotlin/Compose)** — cascarón de entrada/salida. Un solo
módulo `app`, paquetes planos: `app/ protocol/ network/ service/ chat/`
(+ `voice/` en Fase 2, `assistant/` en Fase 3). Foreground service con
WebSocket persistente; arsenal anti-HyperOS (autostart, exención de batería).
Truco central Fase 3: `VoiceInteractionService` + ROLE_ASSISTANT → la
pulsación larga de los buds invoca al agente.

**Agente Windows (C#/.NET 8)** — las garras. Servicio residente que se conecta
SALIENTE al hub (nunca puertos abiertos). `Core/` (gateway, cola de tareas,
Guardián) + `Capabilities/` (plugins que exponen tools MCP: shell, files,
system, windows, dev). Guardián con 3 niveles: lectura (ejecuta), reversible
(ejecuta y notifica), destructivo (confirmación por voz vía hub). Audit log.

**Protocolos** — dos capas, no mezclar: clientes↔hub = WebSocket JSON propio
(packages/protocol); hub↔nodos ejecutores = MCP.

**Red** — Tailscale entre dispositivos durante desarrollo. El hub corre en la
PC hoy; portable a VPS sin tocar nada más (los agentes cambian una URL).

## Decisiones selladas (con fecha y razón)

- Hub en Node/TS (ecosistema MCP/agentes) tras evaluar Spring Boot.
- Monorepo plano en raíz (hub/, android/, agent-windows/) — sin carpeta apps/
  hasta que la raíz pase de ~10 entradas.
- Android en un módulo; extracción a módulos Gradle solo si: (a) wear sale del
  backlog, (b) builds duelen, o (c) fronteras se violan seguido.
- Wear OS: **backlog**, no camino crítico. Diseño listo: módulo `wear` hermano
  de `app`, transporte vía teléfono (Data Layer API, teléfono = cartero,
  `deviceId` preserva el origen). iOS: backlog; targets Xcode espejo del
  patrón Android; peaje Siri vía App Intents; push APNs para hub→usuario.
- Buds (OnePlus Pro 3): periférico sin código propio. Audio lo enruta el
  sistema; la invocación llega vía ROLE_ASSISTANT. Lo poco consciente de
  Bluetooth (SCO, audio focus) se acorrala en `voice/audio/`.
- Identidad: **MX Ideass · Personal Agent** (marca); repo `personal-agent`;
  personaje del agente aún sin nombre (UI: «Agente»). Namespaces:
  `mx.ideass.personal.agent.*` / `@mxideass/*`.

## Doctrina
La estructura se gana con crecimiento real, nunca por anticipado. Se comparte
lo que al divergir rompería el sistema en silencio (protocolo, canal); lo
demás, cada app tiene el suyo. Paquetes por capacidad, jamás por tipo técnico.
