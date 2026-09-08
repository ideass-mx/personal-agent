# Runbook — Single Node (operador técnico)

Guía operacional honesta del MVP. No inventa capacidades que el código no tiene.

## Modelo mental

- **PC:** ejecuta el Gateway (`gateway/`) que spawnea el Node (`node/`) por MCP stdio.
- **Teléfono:** cliente Android (Gateway Client); conversa y autoriza acciones.
- **Identidad de instalación:** `HUB_TOKEN` = legacy installation credential (no hay User/ACL).

## Instalación (dev)

```bash
git clone <repo> && cd personal-agent
cp gateway/.env.example gateway/.env
# Edita ANTHROPIC_API_KEY, HUB_TOKEN, AGENT_FILESYSTEM_ROOT
npm run install:all
```

Requisito empaquetado: **Node 22+** (ver `dist/README.txt` tras `npm run package`).

## Configuración (`.env`)

| Variable | Obligatoria | Notas |
|----------|-------------|-------|
| `ANTHROPIC_API_KEY` | sí (arranque completo) | LLM |
| `HUB_TOKEN` | sí | Auth WS + HTTP Bearer (legacy name) |
| `HUB_PORT` | no (8787) | |
| `AGENT_FILESYSTEM_ROOT` | **recomendada** | Carpeta que el Node puede leer/escribir. Sin ella: legacy menos contenido. **No obligatoria en código** (haría falta cambiar fail-fast del Node). |

## Arranque

```bash
npm run dev
# o: npm run gateway   # alias legacy: npm run hub
```

Orden: spawn Node → MCP handshake → tools/list → migraciones SQLite → HTTP/WS **READY**.

Si el handshake falla → proceso sale con código 1 (fail-closed). Sin respawn.

Empaquetado:

```bash
npm run package
npm run smoke:package
# luego launchers en dist/
```

## Android

1. Arranca el Gateway en la PC.
2. Abre la app (first-run → Connection Hub).
3. Dirección (ej. `ws://IP:8787`) + `HUB_TOKEN`.
4. Probar y conectar → Chat.
5. Crea o selecciona una Conversation.
6. Prueba una acción de lectura; luego una escritura y **aprueba** en el diálogo HITL.

Gateway legacy solo en **Avanzado / Legacy** (no es el camino feliz).

## Verificación rápida

| Qué | Cómo |
|-----|------|
| Gateway up | stderr `[hub] READY`; `GET /health` → `ok` |
| Node al boot | READY implica handshake OK; `/health.agentReady` es **snapshot de boot**, no liveness |
| MCP | smoke:package o tools en un turno |
| Tools | mensaje que dispare filesystem/process |
| Android | header «Agente listo» cuando WS autenticado |

## Troubleshooting

| Síntoma | Qué hacer |
|---------|-----------|
| Gateway no arranca | Revisa `.env`, Node version, logs stderr |
| Node/MCP fail al boot | exit 1; revisa path al `agent`, `AGENT_FILESYSTEM_ROOT` |
| Android «Sin conexión» | IP/firewall/`HUB_TOKEN`; FGS/batería en el teléfono |
| Auth failed | Token distinto en app vs `.env` |
| Tool «agente de tu PC no disponible» | Reinicia Gateway (reattacha Node); health no actualiza Node mid-run |
| Confirm timeout | Responde en ≤60s; HITL es global (PHASE 38) |
| History error | Reintentar en UI; SQLite en `hub/data` (dev) |

## Logs

Hoy: **stderr** del Hub y del Node. No hay stack de métricas/tracing de producto.

## Limitaciones conocidas

- `/health.agentReady` = snapshot de arranque, no «Node vivo ahora».
- Observabilidad = stderr.
- Sin instalador nativo / OTA / Docker oficial.
- Sin User/ACL / multi-device ownership.
- Excel tools dependen de Windows + COM.

## Backup

Copia el fichero SQLite del Gateway (ruta relativa a `hub/data` en dev o junto a `hub.cjs` en package).
