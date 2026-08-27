# MX Ideass · Personal Agent

Agente personal soberano: vive en **tu PC** y lo controlas desde el **teléfono**.

En UI se habla de **el agente** / **Agente** (sin nombre de personaje todavía).

## Quick Start

### Producto Windows (PHASE 48 — designed/implemented; field not executed here)

```bash
npm run install:all
npm run package:windows
```

Salida: `dist/windows/PersonalAgent/` + script Inno `installer/windows/personal-agent.iss`.

En una **PC Windows**:

1. Coloca `runtime/node/node.exe` (Node 22 portable) o usa `FETCH_NODE_WIN=1` al empaquetar.
2. Compila `PersonalAgentSetup.exe` con Inno Setup.
3. Instala → First Run → elige carpeta de trabajo → AGENT READY.
4. En Android: `ws://IP:8787` + token (Copiar token en el Control Center).

**WINDOWS FIELD VALIDATION = NOT EXECUTED** en el entorno de desarrollo Linux.  
Detalle: [`docs/architecture/phase48-windows-installer-and-product-shell-implementation.md`](docs/architecture/phase48-windows-installer-and-product-shell-implementation.md).

### Desarrollo (dev)

#### 1. Configura la PC

```bash
cp hub/.env.example hub/.env
```

Edita al menos:

- `ANTHROPIC_API_KEY`
- `HUB_TOKEN` (elige un secreto largo)
- `AGENT_FILESYSTEM_ROOT` (recomendado: carpeta que el agente podrá leer/escribir)

```bash
npm run install:all
npm run dev
```

Deberías ver `[hub] READY` en la terminal (`http://localhost:8787`, `ws://localhost:8787/ws`).  
Con `AGENT_FILESYSTEM_ROOT` definido, el boot lo reenvía al Local Node (`AGENT_FILESYSTEM_ROOT=configured` en stderr).

#### 2. Conecta Android

1. Abre la app (first-run → **Conecta tu agente**).
2. Dirección del Hub + el mismo `HUB_TOKEN`.
3. **Probar y conectar** → Chat.

#### 3. Primera conversación

1. **Nueva conversación** (o escribe en el hilo activo).
2. Pregunta algo simple.
3. Pide una acción que modifique la PC (p. ej. escribir un archivo).
4. **Aprueba** o **rechaza** en el diálogo de autorización.

#### 4. Empaquetado (opcional)

```bash
npm run package
npm run smoke:package
npm run package:windows   # layout instalable Windows + Desktop Shell
```

Ver también [`docs/runbook.md`](docs/runbook.md).

## Estructura

```
hub/              Gateway · Runtime + HTTP/WebSocket + SQLite + MCP client
agent/            Local Node · MCP Server + Tools
desktop/          Control Center Windows (tray; sin Chat)
installer/windows Inno Setup (.iss)
mobile/android/   Cliente Hub-first
packages/protocol Contrato WS
db/               Migraciones SQLite
docs/             Arquitectura y runbook
```

`hub/src/agent/` es el Agent Runtime del Gateway; no es el programa `agent/`.
`desktop/` no es un Runtime: solo observa/controla el Gateway.

## Doctrina (resumen)

1. Todo pasa por el Gateway (`hub/`).
2. Hub = cerebro; Local Node = garras en la PC.
3. El protocolo (`packages/protocol/PROTOCOL.md`) manda.
4. Identidad de instalación: `HUB_TOKEN` (sin User/ACL en el MVP).
