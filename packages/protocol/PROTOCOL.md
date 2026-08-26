# Protocolo personal-agent · v1

Contrato de mensajes del WebSocket clientes ↔ Hub (`hub/`). **Fuente de verdad.**
Los espejos (`messages.ts`, `Messages.kt`) se adaptan a este documento, nunca al revés.

- Transporte: WebSocket en `ws://<hub>:<puerto>/ws`
- Formato: JSON, un mensaje por frame, discriminado por el campo `type`
- Primera obligación del cliente: enviar `auth` antes que cualquier otra cosa.
  Cualquier mensaje previo a una autenticación exitosa cierra la conexión.
- Todo mensaje lleva el origen implícito en la sesión (`deviceId` se declara en `auth`).

## Cliente → Servidor

### `auth`
```json
{ "type": "auth", "token": "<HUB_TOKEN>", "deviceId": "xiaomi-15t", "deviceName": "Xiaomi 15T" }
```
`deviceId`: estable por dispositivo (lo inventa el cliente y lo persiste).
`deviceName`: opcional, legible para humanos.
`token`: el valor de la variable de entorno `HUB_TOKEN` del Hub (nombre histórico).

### `user_message`
```json
{ "type": "user_message", "text": "hola, preséntate", "conversationId": "c_abc123" }
```
`conversationId` es opcional: si se omite, el Hub crea una conversación nueva
y devuelve su id en `assistant_done`. El cliente debe reutilizarlo en los
mensajes siguientes para mantener el hilo.

### `confirm_response`
```json
{ "type": "confirm_response", "confirmationId": "cf_abc", "approved": true }
```
Respuesta del usuario a un `confirm_request` pendiente en **esta** sesión WS.

- `confirmationId`: el id recibido en `confirm_request` (obligatorio).
- `approved`: `true` ejecuta la tool; `false` la rechaza sin ejecutarla.
- **El cliente NO envía** `toolName`, `input`, `toolCallId` ni `conversationId` para aprobar:
  esos datos quedan congelados en el pending del servidor al emitir `confirm_request`.
- Solo es válida mientras el Hub espera esa confirmación **en la misma conexión WS**
  y el mismo `deviceId` que la originó. Id desconocido, ya resuelto, binding
  incorrecto, u otra sesión → `error` `bad_message` (fail-closed; **no** altera
  un pending ajeno ni ejecuta).
- Puede enviarse aunque la sesión esté `busy` respondiendo (el turno está
  suspendido esperando esta respuesta). `user_message` sigue devolviendo `busy`.

### `ping`
```json
{ "type": "ping" }
```
Latido opcional del cliente. El Hub responde `pong`.

## Servidor → Cliente

### `auth_ok`
```json
{ "type": "auth_ok", "deviceId": "xiaomi-15t" }
```

### `assistant_chunk`
```json
{ "type": "assistant_chunk", "text": "Hola, aquí S", "conversationId": "c_abc123" }
```
Pedazos de la respuesta en streaming, en orden. Concatenar hasta `assistant_done`.

- `conversationId`: conversación del turno en curso (obligatorio en servidores actuales;
  clientes antiguos pueden omitirlo al parsear). Permite enrutar chunks al hilo correcto
  cuando el cliente multiplexa varias conversaciones en una misma sesión WS.

### `assistant_done`
```json
{ "type": "assistant_done", "messageId": "m_xyz", "conversationId": "c_abc123" }
```
Fin de la respuesta. Entrega el `conversationId` definitivo (nuevo o el mismo).

### `confirm_request`
```json
{
  "type": "confirm_request",
  "confirmationId": "cf_abc",
  "toolCallId": "call_1",
  "toolName": "test.confirm",
  "input": { "path": "/tmp/x" },
  "conversationId": "c_abc123"
}
```
El AgentRuntime necesita confirmación humana antes de ejecutar una tool con
`executionMode: "confirm"`.

- `confirmationId`: id efímero (solo en memoria del proceso); usarlo en `confirm_response`.
- `toolCallId`: id del `tool_call` del proveedor LLM (asocia request ↔ tool).
- `toolName` / `input`: qué se pediría ejecutar (sin secretos del servidor).
- `conversationId`: conversación del turno en curso.
- El turno queda suspendido hasta `confirm_response`, timeout o desconexión.
- Timeout / rechazo / cancelación → la tool **no** se ejecuta; el Hub envía un
  `tool_result` de error al LLM y el loop continúa. Fail-closed: nunca auto-aprueba.
- Tras resolver (approve/reject/timeout/cancel) el `confirmationId` queda inválido
  (one-shot). Un approve posterior no ejecuta.
- La ejecución usa exclusivamente el `toolName` + `input` congelados en el servidor;
  el cliente no puede redefinir la operación.

### `pong`
```json
{ "type": "pong" }
```

### `error`
```json
{ "type": "error", "code": "auth_failed", "message": "Token inválido" }
```
Errores de un turno en curso pueden incluir `conversationId` opcional para enrutar
al hilo correcto en el cliente:

```json
{ "type": "error", "code": "internal", "message": "…", "conversationId": "c_abc123" }
```

Códigos actuales: `auth_failed`, `auth_required`, `bad_message`, `busy`, `internal`.
`busy`: ya hay una respuesta en curso en esta sesión; reintentar al terminar.
(`confirm_response` es la excepción: se acepta durante el turno para desbloquear
una confirmación pendiente.)

## Reglas de evolución

1. Cambios **aditivos** (campos opcionales, tipos nuevos de mensaje) no rompen v1.
2. Renombrar o eliminar campos = versión nueva del protocolo. No se hace a la ligera.
3. Los clientes ignoran silenciosamente tipos de mensaje que no conocen
   (permite que el Hub evolucione antes que los clientes).

## Reservado para fases futuras (no implementar aún)

- `voice_*`: sesión de voz (Fase 2)
- `tool_progress`: progreso de tareas en el Agent (Fase 4)
- `agent_hello`: registro del Agent ante el Hub — transporte Hub↔Agent distinto
  del WS clientes↔Hub; posible MCP u otro IPC JSON-safe (Fase 4)

Este protocolo WS (**clientes ↔ Hub**) no transporta filesystem/shell. Las
garras OS viven en **Agent** (`agent/`); ver `docs/architecture.md`.
