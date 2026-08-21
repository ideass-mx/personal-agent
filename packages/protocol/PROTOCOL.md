# Protocolo personal-agent · v1

Contrato de mensajes del WebSocket clientes ↔ Agent API (`api/`). **Fuente de verdad.**
Los espejos (`messages.ts`, `Messages.kt`) se adaptan a este documento, nunca al revés.

- Transporte: WebSocket en `ws://<api>:<puerto>/ws`
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
`token`: el valor de la variable de entorno `HUB_TOKEN` del Agent API (nombre histórico).

### `user_message`
```json
{ "type": "user_message", "text": "hola, preséntate", "conversationId": "c_abc123" }
```
`conversationId` es opcional: si se omite, el api crea una conversación nueva
y devuelve su id en `assistant_done`. El cliente debe reutilizarlo en los
mensajes siguientes para mantener el hilo.

### `ping`
```json
{ "type": "ping" }
```
Latido opcional del cliente. El api responde `pong`.

## Servidor → Cliente

### `auth_ok`
```json
{ "type": "auth_ok", "deviceId": "xiaomi-15t" }
```

### `assistant_chunk`
```json
{ "type": "assistant_chunk", "text": "Hola, aquí S" }
```
Pedazos de la respuesta en streaming, en orden. Concatenar hasta `assistant_done`.

### `assistant_done`
```json
{ "type": "assistant_done", "messageId": "m_xyz", "conversationId": "c_abc123" }
```
Fin de la respuesta. Entrega el `conversationId` definitivo (nuevo o el mismo).

### `pong`
```json
{ "type": "pong" }
```

### `error`
```json
{ "type": "error", "code": "auth_failed", "message": "Token inválido" }
```
Códigos actuales: `auth_failed`, `auth_required`, `bad_message`, `busy`, `internal`.
`busy`: ya hay una respuesta en curso en esta sesión; reintentar al terminar.

## Reglas de evolución

1. Cambios **aditivos** (campos opcionales, tipos nuevos de mensaje) no rompen v1.
2. Renombrar o eliminar campos = versión nueva del protocolo. No se hace a la ligera.
3. Los clientes ignoran silenciosamente tipos de mensaje que no conocen
   (permite que el api evolucione antes que los clientes).

## Reservado para fases futuras (no implementar aún)

- `voice_*`: sesión de voz (Fase 2)
- `confirm_request` / `confirm_response`: confirmaciones del Guardián (Fase 4)
- `tool_progress`: progreso de tareas en nodos ejecutores (Fase 4)
- `agent_hello`: registro de nodos ejecutores con manifiesto MCP (Fase 4)
