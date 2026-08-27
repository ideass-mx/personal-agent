# Agent Console — Security Boundary

Hermano de [`phase49-agent-console-product-definition.md`](./phase49-agent-console-product-definition.md).

## Authority chain (inmutable)

```text
Agent Console (browser)
        ↓  requests only
     Gateway
        ↓
   Tool Policy / ConfirmationWaiter
        ↓
   Agent Runtime
        ↓
   MCP Client
        ↓
   Local Node / Tools
```

## Forbidden paths

```text
✗ Agent Console → filesystem directo
✗ Agent Console → MCP directo
✗ Agent Console → process.execute directo
✗ Agent Console → SQLite directo
✗ Agent Console → bypass ConfirmationWaiter
✗ Agent Console → redefinir toolName/input en confirm_response
```

## Allowed paths

```text
✓ WS auth + user_message + confirm_response
✓ HTTP Bearer workspaces / conversations / messages
✓ GET /health (público; sin secretos)
✓ Solicitar cambios de host vía APIs Gateway (REQUIRED futuros)
```

## Secrets

| Secreto | UI | Storage cliente | Logs |
|---------|-----|-----------------|------|
| HUB_TOKEN | Masked + copy once | Memoria / sessionStorage MVP; no query string | Nunca |
| ANTHROPIC_API_KEY | Write-only / never display | Solo Host AppData | Nunca |
| Authorization headers | N/A | N/A | Nunca |

## HITL

- Gateway congela `toolName`+`input`.
- Cliente solo `confirmationId` + `approved`.
- Timeout 60s fail-closed.
- Disconnect cancela pending (existente).

## Capabilities

Ver una capability ≠ permiso de ejecución.  
Policy sigue en Gateway.

## LAN

MVP: acceso LAN con token de instalación.  
Amenaza: quien tenga token = instalación (PHASE 33).  
Mitigar: token largo, no en URL, regeneración FUTURE.

## Internet

Fuera de alcance. Requiere TLS + identity — G-49-01. Sin User/ACL improvisado.

## PHASE 33 frontiers preserved

- HUB_TOKEN = instalación  
- Sin User/ACL multi-tenant  
- Filesystem root en Node  
- Deny-by-default tools  
- Timing-safe token compare  
- Session/device binding en confirm  

## Console vs Host local

Operaciones de proceso (start/stop binario) permanecen en **tray/host local** salvo API Host explícita.  
El browser no spawnea Node.
