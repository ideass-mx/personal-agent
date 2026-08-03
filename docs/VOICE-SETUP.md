# Configuración de voz (HyperOS + auriculares)

Guía corta para que el asistente de voz funcione con la pantalla apagada
en Xiaomi/HyperOS (p. ej. 15T) y OnePlus Buds.

## Comportamiento: rachas y conversación abierta

**Invocación del asistente** (VIS / buds, notificación **Hablar**, tile): abre una
**racha** (sesión nueva en el Gateway), sin cambiar la sesión activa de la UI:

1. Nombre provisional: «Conversación de voz — HH:mm».
2. Ciclo manos libres: Listening → Thinking → Speaking → Listening.
3. Al **colgar**, se pide un título-resumen al agente (async) y se renombra
   la sesión en local. Si no hay red o no responde, se usa la primera frase
   del usuario (~40 caracteres) o se deja el provisional.

**Micrófono dentro del chat** (conversación abierta): **no** crea racha ni
renombra; la voz continúa la `sessionKey` activa y el historial se pinta ahí.

**Cómo colgar** (ambos modos)

| Vía | Ejemplo |
|---|---|
| Comando de voz (exacto) | «listo», «adiós», «termina», «gracias» |
| UI | botón Terminar / cerrar overlay |
| Silencio | ~25 s sin habla útil en Listening |
| Reinvocación | segundo gesto / toggle (asistente) |

«¿Está listo el reporte?» **no** cuelga (solo coincidencia exacta del comando).

**Sin red al invocar el asistente:** aviso audible y no se crea sesión.

La sesión legado **Rápidas** ya no recibe tráfico de voz; si existía, queda
como una sesión más en la lista.

## 1. Permisos de la app

1. Instala e inicia **Agente**.
2. Concede **micrófono** cuando lo pida (necesario para STT).
3. Concede **notificaciones** (Android 13+): verás la notificación de conexión
   y la acción **Hablar**.
4. Si HyperOS pide permiso de **ventana flotante** / mostrar sobre otras apps
   para el asistente, actívalo.

## 2. Exenciones de batería (imprescindible)

HyperOS puede congelar o matar el proceso tras minutos con pantalla apagada.

En la pantalla **Conexión** de la app:

1. **Ignorar optimización de batería** → concede la exención.
2. **Abrir autostart (Xiaomi / HyperOS)** → activa el inicio automático para Agente.

También conviene (rutas típicas HyperOS; los nombres varían):

- Ajustes → Apps → Agente → Ahorro de batería → **Sin restricciones**.
- Ajustes → Apps → Agente → Autostart → **activado**.
- Bloquear Agente en recientes (candado) para que el “limpiar RAM” no lo mate.
- Desactivar “congelar app” / “app hibernation” si aparece.

Sin esto, la conexión Gateway y el disparo de voz fallan tras ~10 min bloqueado.

## 3. Asistente digital del sistema (buds)

Para que el gesto de los buds invoque al agente:

1. Ajustes → Apps predeterminadas → **Asistente digital** / interacción de voz
   → elige **Agente**.
2. Si HyperOS vuelve a Gemini o “Super XiaoAI” tras un reinicio o boost de RAM,
   vuelve a seleccionar Agente.

La app también registra `VOICE_COMMAND` (trampoline) por si el sistema
dispara ese intent desde los auriculares.

## 4. OnePlus Buds

1. Empareja los buds por Bluetooth.
2. En la app **OnePlus Buds** (o Ajustes → Bluetooth → buds → gestos):
   configura toque largo / triple toque como **Asistente** / Voice assistant
   (no play/pause ni control de música).
3. Pon los buds; confirma que el audio de llamada/media sale por ellos.

El agente abre un canal SCO de comunicación: captura y TTS deberían ir a los
buds cuando están conectados.

## 5. Disparadores de respaldo (si el gesto falla)

Siempre disponibles:

- Notificación persistente del agente → acción **Hablar**.
- Tile de ajustes rápidos **Hablar** (añádelo editando el panel QS).
- Botón de micrófono dentro de la app.

## 6. Comprobar que funciona

1. Conexión Gateway en verde; exención de batería concedida.
2. Pantalla apagada, buds puestos → gesto o **Hablar**.
3. Pregunta «¿qué día es hoy?» → oyes la respuesta en los buds.
4. Di «gracias» (o espera ~25 s en silencio) → earcon de cierre.
5. Abre la app: hay una sesión nueva con título-resumen (o provisional);
   la sesión activa de la UI no cambió.

Si no hay red al invocar, o el Gateway no responde a tiempo a mitad de turno,
el agente lo dice por voz (no falla en silencio).

## 7. Notas

- El FGS de conexión es `specialUse` (24/7). Durante la voz se añade un FGS
  efímero de tipo `microphone` y se libera al terminar.
- No hace falta wake word ni comandos de sesión («cambia a X») en esta fase.
- El rename del título es local; sync Gateway (`sessions.patch`) queda como TODO.
