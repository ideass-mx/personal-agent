# OpenClaw Gateway — notas de versión (Checkpoint 0)

## Tag fijado

| Campo | Valor |
| --- | --- |
| Versión objetivo del server | OpenClaw `2026.7.1-2` (revisión de empaquetado) |
| Tag git usado | **`v2026.7.1`** |
| Commit | `2d2ddc43d0dcf71f31283d780f9fe9ff4cc04fe4` |
| Fallback | El tag git **`v2026.7.1-2` no existe**. Otros releases sí usan sufijos `-N` (p. ej. `v2026.1.11-2`); en `2026.7.1` solo aparecen `v2026.7.1` y betas. Se asume que `2026.7.1-2` es la misma línea de protocolo que `v2026.7.1`. |
| Árbol de referencia local | `.scratch/openclaw` (checkout detached en el tag; no commitear) |
| Fuente de verdad | Código del tag, **no** `docs.openclaw.ai` / `main` |

## Protocolo

| Constante | Valor en el tag |
| --- | --- |
| `PROTOCOL_VERSION` | **`4`** |
| `MIN_CLIENT_PROTOCOL_VERSION` | **`4`** |
| `MIN_NODE_PROTOCOL_VERSION` | `3` |
| `MIN_PROBE_PROTOCOL_VERSION` | `3` |

En `connect`: `minProtocol` / `maxProtocol` = **4**.

Puerto por defecto del cliente de referencia: **18789** (`ws://127.0.0.1:18789`). Configurable en el server; en producción preferir `wss://`.

Archivos fuente en el tag:

- `packages/gateway-protocol/src/version.ts`
- `packages/gateway-protocol/src/schema/` (frames, chat, sessions, devices, snapshot, …)
- `packages/gateway-protocol/src/client-info.ts` (ids/modos cerrados)
- `packages/gateway-protocol/src/connect-error-details.ts`
- `packages/gateway-client/src/device-auth.ts` (`buildDeviceAuthPayloadV3`)
- `packages/gateway-client/src/client.ts` (handshake, auth, reconexión)
- `packages/gateway-client/src/timeouts.ts`
- `src/infra/device-identity.ts` (Ed25519, `deviceId`, firma)
- `src/gateway/methods/core-descriptors.ts` (nombres RPC + scopes)

Referencia útil (no copiar branding): `apps/android/.../gateway/` en el mismo tag.

## Frames (confirmados)

- Request: `{ type: "req", id, method, params? }`
- Response: `{ type: "res", id, ok, payload? \| error? }`
- Event: `{ type: "event", event, payload?, seq?, stateVersion? }`

Discriminador: `type`.

## Handshake (confirmado en el tag)

1. Server → event `connect.challenge` con `payload: { nonce, ts }` (`ts` = `Date.now()`; el cliente de referencia solo exige `nonce`).
2. Client → `req` `method: "connect"` con `ConnectParams` (`minProtocol`/`maxProtocol`, `client`, `role`, `scopes`, `auth?`, `device?`, …).
3. Server → payload `hello-ok` (`type: "hello-ok"`, `protocol`, `server`, `features`, `snapshot`, `auth`, `policy`, …).

Persistir `hello-ok.auth.deviceToken` (y scopes/role). Honrar `policy.tickIntervalMs`, `maxPayload`, `maxBufferedBytes`.

Timeouts de referencia: preauth / challenge watchdog por defecto **15_000 ms**.

## Identidad y firma (confirmado)

- Keypair: **Ed25519**.
- `device.id` = **SHA-256 hex** de la clave pública raw (32 bytes), no del PEM.
- `device.publicKey` = public key raw en **base64url**.
- `device.signature` = firma Ed25519 del payload UTF-8, en **base64url**.
- Payload canónico: **`buildDeviceAuthPayloadV3`** — campos unidos con `|`:

  ```
  v3|deviceId|clientId|clientMode|role|scopesCsv|signedAtMs|token|nonce|platform|deviceFamily
  ```

  - `scopes` unidos con `,` (sin espacios).
  - `token` vacío si no hay.
  - `platform` / `deviceFamily`: trim + lowercasing **solo ASCII A–Z** (byte + 32), no locale.

`buildDeviceAuthPayload` (v2) existe pero el cliente de referencia firma con **v3**.

## Auth en `connect.params.auth`

Campos del schema: `token`, `bootstrapToken`, `deviceToken`, `password`, `approvalRuntimeToken`, `agentRuntimeIdentityToken`.

Para la app:

- Arranque con setup-code → `bootstrapToken` (el código se obtiene en el server vía RPC `device.pair.setupCode`; la app **no** genera pairing en frío).
- Reconexión → `deviceToken` persistido (cifrado).
- Credencial de gateway → `token` o `password` según `gateway.auth.mode`.

Errores a manejar (detalle en `connect-error-details.ts`):

| Código | Comportamiento esperado |
| --- | --- |
| `PAIRING_REQUIRED` | Estado Pairing; reintentable; no tumbar el cliente. Pausar reconnect salvo `pauseReconnect: false` / `wait_then_retry`. |
| `AUTH_TOKEN_MISMATCH` | Un reintento acotado con device token cacheado, **solo** en endpoints de confianza. |
| `AUTH_DEVICE_TOKEN_MISMATCH` | Limpiar token de dispositivo stale. |
| `AUTH_SCOPE_MISMATCH` | Pedir re-pairing (no reintentar en bucle). |

## Client id / mode / role (corrección importante vs. prompt)

El schema cierra `client.id` y `client.mode` a enums (`GATEWAY_CLIENT_IDS` / `GATEWAY_CLIENT_MODES`).

| Campo | Prompt original | Contrato del tag | Decisión |
| --- | --- | --- | --- |
| `client.id` | `persona-agent-android` | Enum cerrado; Android oficial = **`openclaw-android`** | Usar **`openclaw-android`**. `persona-agent-android` **falla validación**. |
| `client.mode` | `"operator"` / `"node"` | `webchat \| cli \| ui \| backend \| node \| probe \| test` | Operator/chat: **`ui`** (como la app oficial). Node (flag): **`node`**. |
| `role` | `"operator"` / `"node"` | String libre en schema; runtime usa estos valores | **`operator`** por defecto; **`node`** tras flag. |
| Scopes mínimos chat | `operator.read` + `operator.write` | Confirmado en descriptors (`chat.history` → read, `chat.send` → write) | Arrancar con esos dos. |

`displayName` / `instanceId` pueden llevar metadatos técnicos del cliente blanco; no son el id de protocolo.

## Chat y sesiones (params distintos)

### `chat.send` (scope `operator.write`)

Requiere `sessionKey`, `message`, **`idempotencyKey`**. Opcionales: `agentId`, `sessionId`, `thinking`, `fastMode`, attachments, `timeoutMs`, `expectedSessionRoutingContract`, etc.

### `chat.history` (scope `operator.read`)

Requiere `sessionKey`. Opcionales: `agentId`, `limit`, `offset`, `maxChars`. **No** pide `idempotencyKey` ni `message`.

### Eventos de stream de chat

Estados: `delta` | `final` | `aborted` | `error` (campos comunes: `runId`, `sessionKey`, `agentId?`, `seq`).

No hay estado de evento llamado `snapshot` en el stream de chat. El **snapshot** del gateway viene en `hello-ok.snapshot` (incluye `sessionDefaults.mainSessionKey` / `defaultAgentId` / `mainKey`). La UI debe tratar `final` como cierre del run; los deltas pueden traer `replace: true`.

### Enrutamiento de sesión (diseño)

- `SessionProvider` posee la sesión activa persistida (`sessionKey` + `agentId` efectivo).
- Defaults inyectables vía `GatewayConfig`; si faltan, se puede **sugerir** (no forzar) valores de `hello-ok.snapshot.sessionDefaults`, pero **no** recrear sesión en cada reconexión.
- No hardcodear nombres reservados de sesión/agente en código.

RPC setup-code (server-side, `operator.admin`, no advertise): **`device.pair.setupCode`**.

## Capacidades incompatibles / fuera de alcance ahora

Marcar en código con comentario `// INCOMPATIBLE: requiere Gateway > 2026.7.1-2` si se tocan más adelante:

- Cualquier cambio de protocolo en `main` / releases posteriores a `v2026.7.1` (p. ej. `2026.7.2-beta.*` ya existen como tags; no usarlos).
- Rol **node** completo (capabilities del dispositivo): tras flag `enableNodeRole`; no en el camino crítico del chat operator.
- RPC admin no necesarios para chat (`crestodian.*`, `chat.inject`, etc.).
- Auth `trusted-proxy` y tokens `approvalRuntimeToken` / `agentRuntimeIdentityToken` (existen en schema; no implementar salvo necesidad).
- Cap server `chat-send-routing-contract` / campo `expectedSessionRoutingContract`: soportar solo si el `hello-ok.features` lo anuncia; no asumir.

## Doc en vivo vs. código del tag

| Tema | Doc / prompt genérico | Tag `v2026.7.1` | Implementaremos |
| --- | --- | --- | --- |
| `PROTOCOL_VERSION` | A veces se asume 4 o “verificar” | **4** | **4** |
| `client.id` libre / `persona-agent-android` | Prompt | Enum cerrado | `openclaw-android` |
| `client.mode: "operator"` | Prompt | Mode ≠ role | `mode: "ui"`, `role: "operator"` |
| Chat “snapshot” | Prompt (deltas + snapshot) | Stream: delta/final/…; snapshot en hello | Deltas + `final`; snapshot solo en hello |
| Setup-code RPC | “verificar nombre” | `device.pair.setupCode` | Ese nombre |
| Puerto | 18789 | Confirmado como default | Configurable; default documentado 18789 |

## Identidad en Android (Checkpoint 3)

- Firma: payload **v3** byte-a-byte con el tag; Ed25519 vía BouncyCastle (API ligera).
- `device.id` = SHA-256 hex de la pubkey raw (32 bytes).
- **Keystore:** Ed25519 no es fiable en Android Keystore con minSdk 29. Se usa
  `MasterKey` AES-256-GCM en el Keystore + `EncryptedSharedPreferences` para
  cifrar en reposo la identidad PKCS8 y los `deviceToken`.
- Nunca loguear tokens, setup-codes, nonces ni payloads de firma.

## Adaptación a la estructura del repo

`AGENTS.md` exige **un solo módulo Gradle `app`** y paquetes planos por capacidad. Por tanto `gateway-client` **no** será un módulo Gradle nuevo: será el paquete raíz

`mx.ideass.personal.agent.gateway.*`

dentro de `android/app`, sustituyendo el uso de `network/HubClient` detrás de una interfaz estable para la UI/servicio.

Esto choca con la doctrina histórica “todo pasa por el hub”; el cambio a Gateway OpenClaw es intencional y se limita a la capa de conexión del cliente Android.

## Checkpoint 5 — sesiones y UI

- `SessionProvider` persiste `sessionKey`/`agentId`; la reconexión **reutiliza** la activa.
- Config puede fijar `defaultSessionKey`/`defaultAgentId` (pantalla Conexión → Gateway).
- UI/servicio consumen `ChatConnection` (`RoutingChatConnection`: Hub | Gateway).
- Eventos Gateway (`delta`/`final`) → `ChatInbound` (con `replace`) → `ChatStore`.
- Estado `Emparejando` ante `PAIRING_REQUIRED`.
