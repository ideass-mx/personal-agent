# PHASE 63 — Intelligence Connection & Provider Management UX

## Objetivo

Convertir Local / Personal Agent Cloud / BYOK en una experiencia humana:

> «Aquí elijo cómo quiero que funcione mi agente.»

Sin modo automático ni fallback.

## Intelligence Center

Settings → **Inteligencia**

- Inteligencia activa (dominante)
- Cambiar → Local / Cloud / Mi proveedor
- Detalle Local (instalación, warning hardware, probar)
- Detalle Cloud (conectar / desconectar / sesión)
- BYOK (tarjetas, API key, editar, desconectar, probar)

## Chat indicator

Indicador discreto en la conversación:

```text
☁️ Personal Agent Cloud · Personal Agent
```

Abre Settings → Inteligencia.

## API (reutiliza setup)

| Endpoint | Uso |
|----------|-----|
| `GET /v1/setup/intelligence` | Snapshot seguro (activo + conexiones) |
| `GET /v1/setup/providers` | Catálogo enriquecido (sin secretos) |
| `POST /v1/setup/intelligence/select` | Activar conexión |
| `POST /v1/setup/llm` | Conectar BYOK / Cloud onboarding |
| `POST /v1/setup/cloud/connect` | Handshake Cloud |
| `POST /v1/setup/cloud/disconnect` | Cerrar sesión Cloud (≠ revoke device) |
| `POST /v1/setup/providers/:id/disconnect` | Quitar BYOK key |
| `POST /v1/setup/providers/:id/test` | Verificar conexión |

## Fuente de verdad

`intelligence.json` + Credential Store / Cloud Session Store.

Nunca secretos en respuestas HTTP ni en el frontend.

## No implementado (a propósito)

- Automatic / fallback
- Marketplace de modelos
- Billing / orgs / RBAC

## Seguimiento PHASE 63.1

Credential Store es la fuente de verdad BYOK.
`PERSONAL_AGENT_DEV_PROVIDER_ENV=1` habilita overrides de entorno (tests/CI).
xAI / Grok (`grok-4.6`) está en Mi proveedor — ver
`docs/architecture/phase-63.1-provider-source-of-truth-xai.md`.

## Seguimiento PHASE 63.2

Discovery dinámico de modelos tras validar la conexión — ver
`docs/architecture/phase-63.2-dynamic-model-discovery.md`.
Conexión ≠ disponibilidad de modelo.
