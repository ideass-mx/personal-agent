# Agent Console — First Run & Install Flow

Hermano de [`phase49-agent-console-product-definition.md`](./phase49-agent-console-product-definition.md).

## Target end state (user-facing)

```text
Personal Agent
✓ Installed
✓ Agent Ready
✓ Workspace configured
✓ Tools available
[ Open Agent Console ]
```

**Nunca** como happy path:

```text
npm install / cp .env / npm run install:all / node ...
```

## Full flow

```text
Install (Windows Setup)
   ↓
Launch Agent Host (tray starts)
   ↓
Open Agent Console (browser)
   ↓
Welcome
   ↓
Choose Workspace          ← OS picker vía tray/Host si Web no puede
   ↓
Configure API key         ← write-only al Host
   ↓
Validate
   ↓
Start Gateway → Node → MCP handshake → Tools
   ↓
AGENT READY
   ↓
Connect Android (optional)
   ↓
Start conversation (Chat)
```

## Ownership: local vs Console

| Paso | Quién | Por qué |
|------|-------|---------|
| Install binaries | Installer | OS |
| Start process | Tray / Host | Browser no spawnea |
| Choose folder | Tray dialog **o** Host API + native helper | Browser sandbox |
| Persist FS root | Host (env/config) + 48A attach | E-47-01 cerrado |
| API key | Host secrets store | Nunca en repo |
| Open Console | Tray «Open Agent Console» | URL local |
| Chat / HITL | Console + Android | Clientes |

**PHASE 50:** wizard Web puede orquestar; pasos OS-bound delegan al Host/tray.

## Failure messages (human)

| Fallo | Copy | Acción |
|-------|------|--------|
| Host no arranca | «No se pudo iniciar el agente en tu PC.» | Reintentar / Logs |
| Workspace inválido | «No se puede usar esa carpeta.» | Elegir otra |
| Puerto ocupado | «El puerto ya está en uso.» | Cambiar puerto / Diagnóstico |
| MCP/Tools fail boot | «No se pudieron preparar las herramientas.» | Reiniciar |
| API key ausente | «Falta la clave del modelo.» | Configurar |
| Android auth fail | «Token o dirección incorrectos.» | Revisar pairing |

## Post-READY

Overview muestra AGENT READY.  
CTA primario: **Abrir Chat**.  
Secundario: **Conectar Android** (URL + copiar token).

## Relation to PHASE 48 Desktop Shell

First-run ya esbozado en Electron.  
PHASE 49: **fuente de verdad UX = Agent Console + tray mínimo**.  
PHASE 51: unificar first-run (evitar dos wizards divergentes).
