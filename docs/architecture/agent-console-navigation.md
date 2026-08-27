# Agent Console — Navigation

Hermano de [`phase49-agent-console-product-definition.md`](./phase49-agent-console-product-definition.md).

## Structure

```text
Agent Console
├── Overview
├── Chat
├── Conversations
├── Capabilities
├── Workspace
├── Connections
├── Configuration
└── Diagnostics
```

Optional secondary (no top-level if clutter): **Logs** as tab inside Diagnostics.

## Initial route

| Condición | Ruta | Justificación |
|-----------|------|---------------|
| First-run incompleto / NOT CONFIGURED | `/overview` o `/setup` | Responde “¿está listo?” y guía a workspace |
| READY + configurado | `/chat` | Trabajo diario |
| OFFLINE / ERROR | `/overview` | Estado y recovery visibles |

## Screen specs

### Overview

**Pregunta:** ¿Mi agente está funcionando?

Contenido mínimo:

- Título: nombre del agente (default «Agente personal»)
- Badge estado: AGENT READY | DEGRADED | OFFLINE | ERROR | NOT CONFIGURED
- Filas: Gateway, Agent Node, MCP, Tools, Workspace, Database — ●/⚠/✕ con copy humano
- Meta: OS, versión, workspace path (truncado), última actividad (si disponible), clientes conectados (hint desde `/health.devices`)
- CTAs: Abrir Chat | Conectar Android | Reiniciar (si tray/API lo permite) | Diagnóstico

**Evidencia hoy:** `/health` (`ok`, `agentReady`, `agentTools`, `devices`) + config local.  
**Límite:** `agentReady`/`agentTools` = boot snapshot — UI: «Arranque OK», no «vivo ahora».

### Chat

- Header: título Conversation + estado conexión
- Timeline: user / assistant / tool activity rows / errors humanizados
- Composer
- HITL overlay/modal (global en app shell)
- Empty: «Habla con tu agente» + hint autorización

### Conversations

- Lista (title, updatedAt)
- Nueva / seleccionar / rename (si API lo permite; si no, title vacío + FUTURE rename)
- Isolation: chunks por `conversationId` (protocolo existente)

### Capabilities

Categorías Archivos / PC / Excel — 6 MVP.  
Estados informativos: Disponible / Requiere autorización / Solo Windows.  
Sin toggles.

### Workspace

- Path actual
- Estado: Configurado / Inaccesible / No configurado
- Acción: Cambiar carpeta → Host valida (REQUIRED API o first-run tray)
- Nunca file picker browser como autoridad de seguridad

### Connections

- Lista clientes: Android / Browser / Other (desde `devices` + sesión actual)
- Pairing: URL `ws://IP:port`, token masked, Copiar
- LAN only MVP

### Configuration

**Agent:** nombre display, idioma UI, preferencias Chat (locales al cliente OK).  
**Host:** puerto, workspace (vía Host), API key (write-only), token (reveal-once/regenerate FUTURE).  
Peligrosas: confirmación explícita.

### Diagnostics

- Matriz System/Gateway/Node/MCP/Tools/Workspace/Database/Network
- Copiar reporte sanitizado
- Abrir logs (link a tray o FUTURE log API)
- Restart controlado (vía Host/tray; Web puede pedir `POST` REQUIRED mínimo)

## Responsive nav

| Viewport | Nav |
|----------|-----|
| Desktop | Sidebar fija |
| Tablet | Icon rail |
| Mobile web | Bottom bar: Chat, Conversations, More… |

## Windows tray mapping

```text
Open Agent Console  →  http://127.0.0.1:<port>/  (or /chat)
Restart Agent       →  local process control
Open Logs           →  AppData logs
Quit                →  stop host + exit tray
```
