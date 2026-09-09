# PHASE 62.1 — Cloud Authentication + Provider Security

## Objetivo

Endurecer el modo `personal-agent-cloud` sin reconstruir PHASE 62.

La identidad permanente es la **Device Identity (Ed25519)** ya existente.
La sesión Cloud es **temporal** y no sustituye la identidad del dispositivo.

```text
User
 ↓
Device Identity (Ed25519)
 ↓
Cloud Auth (challenge → signature → verify)
 ↓
Cloud Session (short-lived access token)
 ↓
Personal Agent Cloud
 ↓
Model Router / Cloud-owned providers
```

## Tres modos (sin fallback)

```text
                 Personal Agent
                       │
          ┌────────────┼────────────┐
          │            │            │
        Local        Cloud        BYOK
          │            │            │
     LocalProvider  CloudAuth   Secure Store
          │            │            │
     llama-server   Cloud LLM   External LLM
```

## Cloud Auth Contract

El monorepo **no** incluye el backend Cloud de producción.
El cliente implementa el contrato HTTP documentado abajo.
Los tests usan un **mock transport** (`createMockCloudAuthTransport`) que verifica el contrato, no un servidor producto accidental.

### Endpoints

```http
POST /v1/auth/device/challenge
POST /v1/auth/device/verify
POST /v1/auth/session/refresh
POST /v1/auth/session/revoke
```

### Challenge

```json
{
  "challengeId": "ch_…",
  "challenge": "<hex>",
  "expiresAt": "ISO-8601"
}
```

- TTL corto
- **Single-use**
- Anti-replay: `challengeId` + nonce + expiry

### Canonical signature message (Ed25519)

```text
PersonalAgent
CloudAuth
1
personal-agent-cloud
{deviceId}
{challengeHex}
{timestampIso}
```

Helpers: `buildCloudAuthMessage` en `@mxideass` / `packages/device-crypto`.

La clave privada **nunca** abandona el `DeviceKeyStore`.

### Verify body

```json
{
  "deviceId": "…",
  "challengeId": "…",
  "signature": "<base64>",
  "timestamp": "ISO-8601",
  "algorithm": "Ed25519",
  "audience": "personal-agent-cloud",
  "publicKey": "<SPKI base64>"
}
```

### CloudSession

```text
sessionId, accessToken, refreshToken?, deviceId, userId,
issuedAt, expiresAt, scopes=["llm:invoke"], status
```

Persistencia local del secreto de sesión: **Credential Store / SecretStore**
(`cred_pa_cloud_session`). Nunca en `intelligence.json`, `localStorage` ni logs.

## Desarrollo vs producción

| Mecanismo | Uso |
|-----------|-----|
| Device challenge + Ed25519 | **Producción** |
| `PERSONAL_AGENT_CLOUD_BASE_URL` | Staging / override / dev |
| Default prod base | `https://cloud.personal-agent.app` (solo si `NODE_ENV=production`) |
| `PERSONAL_AGENT_CLOUD_SESSION_TOKEN` | **DEV/TEST ONLY** y solo con `PERSONAL_AGENT_CLOUD_DEV_AUTH=1` |
| `PERSONAL_AGENT_CLOUD_ALLOW_INSECURE=1` | Permite HTTP en no-producción |

Sin `PERSONAL_AGENT_CLOUD_DEV_AUTH=1`, el token estático **no** se usa.

## Request auth

```http
Authorization: Bearer <short-lived-access-token>
```

Headers `X-Personal-Agent-User-Id` / `X-Personal-Agent-Agent-Id` son metadata;
la autoridad es la sesión Cloud.

## Lifecycle

```text
NO_SESSION → AUTHENTICATING → AUTHENTICATED
                ↕ REFRESHING (near expiry / 401 once)
Errores: AUTHENTICATION_FAILED | SESSION_EXPIRED | SESSION_REVOKED
         | DEVICE_REVOKED | CLOUD_UNAVAILABLE
```

401 en inferencia: **refresh → retry una sola vez**. Sin loops.

## Disconnect vs revoke

- **Disconnect**: invalida sesión Cloud + borra secreto local → `NO_SESSION`.
  No revoca el dispositivo.
- **Revoke device**: infraestructura PHASE 57 existente → Cloud debe responder
  `CLOUD_AUTH_DEVICE_REVOKED`.

## Error codes

```text
CLOUD_AUTH_REQUIRED
CLOUD_AUTH_CHALLENGE_FAILED
CLOUD_AUTH_SIGNATURE_INVALID
CLOUD_AUTH_SESSION_EXPIRED
CLOUD_AUTH_SESSION_REVOKED
CLOUD_AUTH_DEVICE_REVOKED
CLOUD_AUTH_FORBIDDEN
CLOUD_AUTH_UNAVAILABLE
CLOUD_AUTH_UNKNOWN_ERROR
```

## BYOK isolation

```text
BYOK keys → Credential Store → External LLMProvider
Cloud     → Device Auth → Cloud Session → Cloud-owned credentials
```

Las API keys del usuario **nunca** viajan a Personal Agent Cloud.
Cloud **nunca** embebe master keys de OpenAI/Anthropic/etc. en el cliente.

## SSRF / TLS

Reutiliza `assertUrlSafeForFetch`. HTTPS en producción. Sin
`rejectUnauthorized=false`. Sin localhost / IPs privadas como endpoint prod.

## Secret redaction

Único mecanismo: `gateway/src/credentials/credential-redactor.ts`
(`Bearer [REDACTED]`, keys, tokens, URL secrets).

## Threat model (mínimo)

| Amenaza | Mitigación |
|---------|------------|
| Stolen access token | TTL corto + refresh + revoke |
| Replay challenge | Single-use + expiry + audience |
| Stolen device | User revoke device → DEVICE_REVOKED |
| Expired session | Refresh; 401 retry once |
| API key leakage | BYOK never sent to Cloud; redaction |
| MITM | HTTPS + URL SSRF guards |
| Malicious client | Session authority server-side |
| Private key extraction | Keystore / no export API |
| Log / URL leakage | Redactor + no secrets in URL |

## UX

Onboarding Cloud: «Conectando tu dispositivo…» sin mostrar challenge/firma/tokens.
Settings: estado humano + Desconectar.

## Código principal

- `gateway/src/providers/cloud-auth/`
- `packages/device-crypto` (`buildCloudAuthMessage`, audience)
- `gateway/src/providers/intelligence.ts` (router Cloud)
- `gateway/src/http/setup-http.ts` (`/v1/setup/cloud/status|disconnect`)
