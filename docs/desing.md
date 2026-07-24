# Guía de diseño — cliente móvil

## Tesis
1. Voice-first: el micrófono es el botón dominante; el chat es respaldo.
2. Oscura por defecto (única por ahora).
3. El streaming es protagonista: la respuesta se escribe en vivo con cursor visible.
4. La conexión es ciudadana de primera: estado siempre visible en el header.
5. El estado degradado es honesto: banner claro, mensajes en cola (nunca perdidos),
   micrófono deshabilitado sin conexión.

## Tokens (Theme.kt — nombres exactos)
- background   #101214
- surface      #1A1D21   (burbujas del agente, inputs, botones secundarios)
- border       #2A2E34
- textPrimary  #ECEDEE
- textMuted    #8A8F98
- accent       #5DCAA5   (estado en línea, micrófono, cursor streaming, CTA)
- onAccent     #04342C
- accentTint   #24332E   (fondo burbujas del usuario)
- userText     #D9EFE6
- warn         #FAC775   (solo reconexión/degradación)
- warnTint     #2E2417

Radios: pantalla 28dp no aplica (es del mock), tarjetas/inputs 10dp,
burbujas 16dp con esquina de origen 4dp, botón CTA 12dp, mic circular.
Tipografía del sistema. Wordmark provisional: "Agente" y avatar "A"
(el personaje aún no tiene nombre; deben ser strings/recursos triviales de cambiar).

## Pantallas Fase 1
- Chat: header (avatar, "Agente", subtítulo de estado: "en línea" en accent /
  "reconectando · reintento en Ns" en warn), lista de burbujas (usuario derecha
  accentTint, agente izquierda surface), la respuesta en curso muestra cursor
  (bloque accent parpadeante), input redondeado + botón mic circular accent
  (en Fase 1 el mic es placeholder deshabilitado con toast "la voz llega pronto").
- Banner degradado: bajo el header, warnTint, icono + "Sin conexión con tu hub.
  Tus mensajes se enviarán al reconectar." Mensajes enviados sin conexión:
  opacidad 55% + etiqueta "en cola"; se despachan al reconectar en orden.
- Conexión (primera vez y desde ajustes): título "Conecta tu hub", subtítulo
  "Tu agente vive en tu servidor, no en la nube de nadie.", campos: dirección
  ws:// (mono), token (oculto con toggle), nombre del dispositivo (default del
  modelo del teléfono); CTA "Probar y conectar" que valida con auth real y
  muestra resultado ("Hub encontrado · latencia N ms" / error legible).

  ## Pantalla de sesión de voz — cuatro estados

El círculo concéntrico central cambia de color y animación según el estado.
El color indica de quién es el turno, sin necesidad de leer la etiqueta.

- Listening → accent #5DCAA5. Icono micrófono. Anillos laten según amplitud
  del micrófono. Etiqueta "Escuchando…". Debajo: transcripción viva de lo
  que dice el usuario, palabra por palabra.
- Thinking → warn #FAC775. Icono spinner girando. Etiqueta "Pensando…".
  El centro se apaga (surface), solo el spinner en ámbar.
- Speaking → azul #378ADD (fondo) / #5FA8E8 (texto). Icono volumen. Onda
  animada. Etiqueta "Hablando…". Debajo: la respuesta del agente como texto.
- Idle/Paused → gris. Micrófono tachado. Etiqueta "En pausa".

Interacción:
- Botón grande "Terminar" siempre visible → cierra la sesión, vuelve al chat.
- Tocar el círculo: en Speaking interrumpe y salta a Listening; en Thinking
  cancela la petición y vuelve a Listening.
- Entrada desde el chat (botón mic) y salida con transición suave (fade/slide),
  nunca corte seco.
- La zona de texto bajo el círculo es una sola: muestra la transcripción del
  usuario en Listening y la respuesta del agente en Speaking.