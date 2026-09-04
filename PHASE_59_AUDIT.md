# PHASE 59 — AUDIT (Credential & Secret Management)

Fecha: 2026-09-04. Solo inspección; sin corrección de hallazgos no críticos.

## Resumen

**No existe** `CredentialManager` / `SecretStore` / Windows Credential Manager / keytar en el producto.
Los secretos de producto viven en **plaintext** (`secrets.json` + env de spawn).
Pairing/device usan **hash en SQLite** (correcto). MCP stdio **filtra** secretos del Gateway hacia el Node.
Falta una capa transversal para credenciales de **integraciones** (API keys de terceros, futuros OAuth).

## 1. Inventario de secretos

| Secreto | Dónde | Forma | Notas |
|---------|-------|-------|-------|
| `ANTHROPIC_API_KEY` | `gateway/src/config.ts` required env; Desktop `secrets.json` | plaintext | LLM; spawn vía `gatewayEnv()` |
| `HUB_TOKEN` | env + `secrets.json.hubToken` | plaintext | Install credential; HTTP/WS |
| Pairing secret | QR / create HTTP once; SQLite `secret_hash` | hash at rest | PHASE 52 |
| Device credential | WS `pairing_result` once; SQLite `credential_hash` | hash at rest | Android guarda Bearer en DataStore plaintext |
| MCP overlay | `gateway/src/tools/mcp/stdio.ts` | filtrado | No copia `ANTHROPIC_*` / `*_TOKEN` / `API_KEY` |
| AgentDefinition / ToolPolicy | `gateway/src/agents/definition.ts` | N/A | Sin campos de secreto |
| Artifacts / ObjectStorage | PHASE 57–58 | N/A | Sin secretos |
| Protocol WS / QR | `packages/protocol` | pairingSecret one-shot | QR **no** lleva `HUB_TOKEN` |

## 2. Desktop

- `desktop/lib/config.cjs`: `secrets.json` (chmod 600 best-effort) = `hubToken`, `anthropicApiKey`, `agentId`.
- `product.json` no guarda API key (solo `anthropicApiKeySet`).
- **Sin** keytar / Electron `safeStorage` / Windows Credential Manager.
- Redaction: `onboarding-log.cjs`, `diagnostics.cjs`, `maskToken()`.
- `gateway.log` (stderr crudo) **sin** redaction sistemática.

## 3. Gateway

- Auth: install Bearer (`HUB_TOKEN`) o device + `X-Device-Id` (`bearer-auth.ts`, WS).
- Provider Anthropic: `config.anthropicApiKey` en proceso (no CredentialManager).
- Logs WS: `deviceId` + `authKind`, no tokens.
- Tool stdout → LLM: riesgo documentado (printenv); Node no hereda keys del Gateway.

## 4. Node

- Sin almacén de secretos. Env de hijo = OS runtime + overlays permitidos (`AGENT_FILESYSTEM_ROOT`).
- Tests: `mcp-stdio-env.test.ts` garantiza aislamiento.

## 5. Android

- Bearer install/device: DataStore plaintext (`AppPreferences`).
- Ed25519 / `deviceToken`: EncryptedSharedPreferences (Keystore).
- **No** recibe `ANTHROPIC_API_KEY` ni secretos de backend de integraciones.
- QR parser rechaza `hub_token` / `token` en query.

## 6. Dependencias

`gateway/package.json`, `desktop/package.json`, `node/package.json`: **ninguna** lib de OS credential store.

## 7. Decisiones para DESIGN (sin improvisar)

1. **Env legacy** (`ANTHROPIC_API_KEY`, `HUB_TOKEN`): documentar como development/install; **no** migrar automáticamente a CredentialManager en PHASE 59.
2. **Pairing/device hashes**: intactos; CredentialManager es capa distinta (integraciones), no reemplaza TrustedDevice.
3. **MCP protocol**: sin cambios; binding por `CredentialRef` / `serverId` interno.
4. **Android**: sin API de secretos; sin cambios a pairing URI.
5. **HTTP público de secretos**: no; metadata-only si hace falta en el futuro.
6. **Windows Credential Manager**: backend principal en `win32`; **EncryptedFileCredentialStore** como fallback / Linux / tests (master key en archivo dedicado bajo `credentials/`, nunca en `.env` / SQLite / `product.json` / logs).
7. **Redaction**: nueva utilidad Gateway reutilizable; no duplicar Desktop sin necesidad.

## 8. Contradicciones

Ninguna que bloquee la abstracción. El producto ya separa pairing hashes de install env; PHASE 59 añade un tercer dominio: **integration credentials**.

## 9. Intactos (no tocar en PHASE 59)

Pairing, Tailscale, MCP wire protocol, AgentRuntime API, Skills, Artifacts/HTTP/ObjectStorage, Desktop supervisor spawn contract (env legacy sigue), Android connection/pairing.
