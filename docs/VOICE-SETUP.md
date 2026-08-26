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

**Sin conexión al invocar el asistente:** un único coordinador
(`VoiceConnectionGate`, techo ~12 s en `voice_connection_gate_timeout_ms`)
espera `hello-ok` o fallo real (earcon de «pensando» si reconecta). Offline
solo cuando el gate se rinde — no por un chequeo paralelo de socket.

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
Las mismas exenciones de Fase 1 cubren la racha con pantalla apagada (FGS de
micrófono efímero); **no** hay un permiso HyperOS adicional para este flujo.

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

### Humo (pantalla apagada al invocar)

1. Conexión Gateway en verde; exención de batería concedida.
2. Pantalla apagada, buds puestos → gesto o **Hablar**.
3. Pregunta «¿qué día es hoy?» → oyes la respuesta en los buds.
4. Di «gracias» (o espera ~25 s en silencio) → earcon de cierre.
5. Abre la app: hay una sesión nueva con título-resumen (o provisional);
   la sesión activa de la UI no cambió.

Si no hay red al invocar, o el Gateway no responde a tiempo a mitad de turno,
el agente lo dice por voz (no falla en silencio).

### Racha con pantalla que se apaga a mitad (regresión crítica)

La ventana del asistente es solo UI: si el sistema la descarta al re-bloquearse
la pantalla, **la conversación debe seguir** (FGS de micrófono + SCO/TTS en
los buds).

Mientras la ventana está **visible** y la racha activa, la pantalla no debe
apagarse sola. Mecanismos (ambos con la misma condición
ventana-visible ∧ racha-activa):

1. `FLAG_KEEP_SCREEN_ON` / `View.keepScreenOn` — funciona con el teléfono
   **desbloqueado**.
2. **Wake lock de pantalla** (`SCREEN_BRIGHT_WAKE_LOCK` +
   `ACQUIRE_CAUSES_WAKEUP`, tag `Agente:voz-pantalla`) — workaround porque
   **HyperOS ignora el flag (1) cuando la ventana VIS está sobre el
   keyguard** (`FLAG_SHOW_WHEN_LOCKED`). Ciclo de vida de **racha** (no de
   turno ni del parcial `Agente:respuesta`): se adquiere una vez cuando
   ventana visible ∧ racha activa (`VoiceScreenWakeController`); se sostiene
   durante Listening→Thinking→Speaking; se libera solo en hangUp, onHide,
   onDestroy o error fatal. La deprecación del wake lock es aceptable; el
   plan B (`userActivity`) no está activo.

Si el usuario apaga con el botón de bloqueo, la ventana puede desaparecer y
el audio continúa; en esta iteración la UI no se re-muestra sola al despertar.

#### Prueba en dispositivo (Xiaomi / HyperOS — validación final)

Los tests unitarios no verifican que el sistema honre la pantalla; hay que
probar en el 15T (o equivalente):

1. Teléfono **bloqueado**, buds puestos → triple toque (o gesto de
   asistente). La ventana debe aparecer **sobre el lockscreen** sin pedir
   huella/PIN, a **pantalla completa opaca** (ocluye el keyguard).
2. Conversar **>1 minuto** sin tocar nada: la pantalla **no** debe apagarse
   por el timeout de 15 s del sistema.
3. **Durante la racha** (ventana aún visible), comprobar que el lock está
   activo — no solo en el log histórico de ACQ/REL:
   `adb shell dumpsys power | grep -i voz-pantalla`
   Debe aparecer en la sección de wake locks held (tag `Agente:voz-pantalla`).
   Si ves ACQ y REL a los ~ms del arranque, el ciclo de vida volvió a
   romperse (regresión).
4. (Opcional) Apaga con el botón de bloqueo **sin colgar** → audio sigue;
   el wake lock de pantalla se libera al hide (correcto); al colgar, sin
   residual (paso 6).
5. Di «gracias» **o toca Terminar** → earcon + ventana fuera de inmediato
   (<1 s; mismo hangUp — no debe quedar «En pausa»); el título puede llegar
   poco después. Al colgar se libera `Agente:voz-pantalla` y
   keep-screen-on / turnScreenOn; sin APIs privilegiadas de «apagar pantalla»
   el keyguard puede tardar el timeout normal (~15 s) en apagar, pero **no**
   debe quedar ningún wake lock residual. Al colgar desde lockscreen, la
   huella del keyguard debe reaparecer.
6. Tras colgar: el mismo `grep -i voz-pantalla` **sin** lock activo held, y
   `adb shell dumpsys power | grep -i wake` sin `Agente:voz-pantalla` held.
7. Caso desbloqueado: invocar con el teléfono abierto → keep-screen-on como
   antes (el wake lock también se adquiere; no cambia el comportamiento).
8. Abre la app: la sesión titulada incluye **todos** los turnos (también los
   posteriores al apagado manual).
9. En Ajustes → Apps → Agente → servicios en primer plano (o batería /
   notificaciones): **no** debe quedar un FGS de micrófono residual tras
   colgar. Durante la racha sí puede verse la notificación «escuchando».

Si la racha muere al apagarse la pantalla, revisa primero las exenciones de
la §2 (mismas que Fase 1; no hay permiso HyperOS nuevo para este fix).

### UDFPS sobre lockscreen: resuelto (patrón Activity / Gemini)

**Veredicto (validado en Xiaomi 25069PTEBG / HyperOS V816, Android 15):
alcanzable.** La UI de la racha debe ser una **Activity `showWhenLocked`
resumida** (`VoiceLockscreenActivity`), no la ventana del
`VoiceInteractionSession`. Con eso HyperOS retira `gxzw_touch` /
`gxzw_anim` (mismo efecto que Gemini `FloatyActivity`).

Evidencia en dispositivo (Hablar → `VoiceLockscreenActivity` sobre keyguard):

| | Antes (lockscreen idle) | Después (Activity resumida) |
|---|---|---|
| `topResumedActivity` | Launcher / — | `…voice.VoiceLockscreenActivity` |
| `Occluded` / `mKeyguardOccluded` | `false` | `true` |
| `gxzw_*` | Window #0/#1 visibles | **ausentes** (solo `miui_keyguard_shortcut`) |

Al `force-stop` / colgar: `Occluded=false` y `gxzw_*` vuelven.

**Por qué falló la iteración previa:** se logró `mKeyguardOccluded=true` con
una Activity oclusora vía `startAssistantActivity`, pero la UI real seguía
en el VIS (`TYPE_VOICE_INTERACTION`). Con dos superficies, HyperOS seguía
dibujando `gxzw_*`. Gemini pone la UI **en** la Activity (`FloatyActivity`:
`showWhenLocked` + `turnScreenOn` + `singleTask` + `excludeFromRecents`) y
esa queda como `topResumedActivity`.

**Implementación actual:**

- `VoiceLockscreenActivity` — superficie de racha (Compose / Terminar /
  keep-screen-on / bit de wake `Agente:voz-pantalla`).
- `AgentVoiceInteractionSession` — solo invocador: `start` / reinvocación +
  `startAssistantActivity(VoiceLockscreenActivity)` y `hide()` del VIS.
- `InConversation` (mic en chat) sigue en `MainActivity` / `VoiceScreen`;
  no usa esta Activity.

Flags aplicados (alineados a FloatyActivity + oclusión opaca):
`setShowWhenLocked(true)`, `setTurnScreenOn(true)`, manifiesto
`showWhenLocked`/`turnScreenOn`, sin `FLAG_DISMISS_KEYGUARD`, tema
`Theme.Agente.VoiceSession` opaco fullscreen, `layoutInDisplayCutoutMode`
short edges, `PixelFormat.OPAQUE`.

## 7. Notas

- El FGS de conexión es `specialUse` (24/7). Durante la voz se añade un FGS
  efímero de tipo `microphone` y se libera **al colgar** (comando, UI,
  silencio, reinvocación) — no al ocultarse la superficie de la racha.
- Pantalla sobre keyguard: vía activa = `Agente:voz-pantalla` (racha ∧
  superficie vía `VoiceScreenWakeController` en `VoiceLockscreenActivity`).
  Distinto de `Agente:respuesta` (PARTIAL por streaming en `AgentService`).
  Permiso `WAKE_LOCK` ya en el manifest.
- Exenciones HyperOS: las de la §2 bastan; este desacople VIS/racha no exige
  otra regla de batería.
- No hace falta wake word ni comandos de sesión («cambia a X») en esta fase.
- El rename del título es local; sync Gateway (`sessions.patch`) queda como TODO.
- Borrar sesiones (lista): limpia catálogo local, mensajes y prefs asociadas.
  Remoto best-effort vía archive→delete (`sessions.patch` archived +
  `sessions.delete` con `archivedOnly`/`deleteTranscript`); si el RPC falla,
  el borrado local sigue. La principal no se puede borrar. Sin undo.
- **Turnos ocultos (solo esta app):** en rachas, el primer mensaje lleva un
  prepend de estilo de voz en el wire, y al colgar se envía un par
  prompt/respuesta de titulado. Esta app los filtra al pintar (y tras
  `chat.history`). Otros clientes del Gateway (app oficial, WebChat) verán
  esos turnos crudos — trade-off aceptado. Si cambias el texto de
  `voice_style_instruction` o `voice_streak_title_prompt`, añade el valor
  anterior a su `*_history` en recursos o las sesiones viejas volverán a
  mostrarlos.

## 8. Motor y voz TTS (VoxSherpa / HyperOS)

En Ajustes de la app (pantalla de conexión) → **Voz del agente**:

1. Elige el motor **explícitamente** (p. ej. VoxSherpa). En HyperOS el
   «TTS por defecto» de Ajustes del sistema **no siempre** es el que recibe
   la app al bind sin package.
2. Elige una voz (prioriza es-MX) y usa **Probar** antes de guardar.
3. En una racha, el logcat (`TtsEngine`) debe mostrar
   `TTS bind OK: … bound=<paquete VoxSherpa> voice=…`.

Preferencias: `tts_engine_package`, `tts_voice_name`. Si el motor/voz falla,
cae al default del sistema (log `TTS: fallback → motor del sistema`).

### Calidad SCO vs A2DP (límite actual — sin cambio de perfil)

La racha abre **un solo canal SCO** (`BluetoothScoController`) en
`MODE_IN_COMMUNICATION` y reproduce TTS/earcons a **16 kHz mono**
(`VoiceAudioPath` / `USAGE_VOICE_COMMUNICATION`) porque:

- SCO es el perfil de **comunicación**: micrófono + auricular a la vez.
- A2DP es el perfil de **media** (alta calidad); en la práctica **no**
  permite captura de micrófono simultánea en buds clásicos.
- Alternar A2DP (playback) ↔ SCO (escucha) en cada turno implica
  reconectar el perfil Bluetooth: latencia típica de cientos de ms a
  varios segundos, cortes audibles y riesgo de pelear con el
  `AudioDeviceBroker` — incompatible con half-duplex fluido.

**Conclusión:** con buds en racha, el techo de calidad es **telefónico
(SCO)**. Una voz neuronal mejora el timbre, pero el remuestreo a 16 kHz +
SCO sigue limitando. No se reestructura el enrutamiento A2DP sin un
prototipo medido en dispositivo. Mejora menor posible (sin cambiar
perfil): evitar remuestreo a 16 kHz cuando la salida **no** sea SCO
(altavoz del teléfono); queda pendiente de visto bueno.

## 9. Voces neuronales (sherpa-onnx) — CP1

Runtime **sherpa-onnx 1.13.4** embebido en el APK (solo `arm64-v8a`).
El AAR aporta `libonnxruntime.so` + `libsherpa-onnx-jni.so` (y c/cxx-api).
Empaquetado reforzado: `extractSherpaJniLibs` copia esas `.so` arm64 a
`jniLibs` del build (doble vía AAR + jniLibs) + `keepDebugSymbols` +
`useLegacyPackaging` + carga `onnxruntime` → `sherpa-onnx-jni` en
`SherpaNativeLibs`. AGP no debe strippear `libonnxruntime.so`; si lo altera,
aparece `UnsatisfiedLinkError: couldn't find "libonnxruntime.so"`. Tras
`assembleDebug`, `verifySherpaNativeLibsInApk` exige ambos `.so` en el APK
con el mismo hash que el AAR.

**No** usar `com.microsoft.onnxruntime:onnxruntime-android` junto al AAR:
Maven 1.27.0 trae otro `libonnxruntime.so` (≠ el custom del AAR sherpa;
~28 MB vs ~21 MB). Un `pickFirst` podría sustituir el runtime y romper el JNI.

### Estado packaging / criterio de corte (2026-08-04)

- `unzip -l` del APK debug debe listar
  `lib/arm64-v8a/libonnxruntime.so` **y**
  `lib/arm64-v8a/libsherpa-onnx-jni.so`.
- Si tras reinstalar ese APK «Escuchar» sigue en `UnsatisfiedLinkError` (o el
  `.so` no aparece en el APK), **no más rondas de packaging**: abandonar
  sherpa-onnx on-device y usar **ElevenLabs** (canal Talk ya funcional).
  Fallback Android TTS sigue cubriendo el fallo para no crashear.

Los modelos **no** van en el APK: se colocan a mano en
`files/neural_voices/<id>/` (el descargador llega en CP3).

Preparación en el host:

```bash
cd mobile/android
./scripts/fetch-sherpa-cp1.sh          # AAR + modelo Piper es-MX
./scripts/fetch-sherpa-cp1.sh --verify # + síntesis de humo con binario Linux
```

Modelo de prueba: `vits-piper-es_MX-claude-high` (22 050 Hz, **no cuantizado**).
Las variantes `-int8`/`-fp16` no se usan: el AAR integrado no las carga
de forma fiable. En dispositivo (run-as / root según ROM):

```bash
adb push mobile/android/.neural-voices/vits-piper-es_MX-claude-high \
  /data/data/mx.ideass.personal.agent/files/neural_voices/vits-piper-es_MX-claude-high

# Kokoro multi-lang v1_0 (~349 MB; 53 speakers, idioma embebido en el sid)
adb push mobile/android/.neural-voices/kokoro-multi-lang-v1_0 \
  /data/data/mx.ideass.personal.agent/files/neural_voices/kokoro-multi-lang-v1_0
```

Después, en ajustes: tarjeta **Kokoro** con selector de idioma y voz
(p. ej. «Kokoro — Dora · Español»; sid 28/29 = Dora/Alex ES). Preview usa el
`speakerId` de la voz elegida. CP1 expone `SherpaOfflineSynthesizer`
(`OfflineTts.generateWithCallback`).

### CP2 — rachas con Sherpa

`VoiceSession` usa `SherpaTtsEngine` si hay un modelo en
`files/neural_voices/` (prioriza `active_voice_id` / recomendada);
si no hay modelo o el init falla → **fallback** al TTS de Android
(`TtsEngine`), sin quedar mudo.

Playback: streaming `AudioTrack` MODE_STREAM a **16 kHz** (`VoiceAudioPath`)
para coexistir con SCO/earcons (techo buds). Logcat: `SherpaTtsEngine` /
`TTS: intentando Sherpa` / `fallback Android`.

### CP3 — catálogo, descarga e instalación

- Catálogo curado: `assets/voice_catalog.json` (Piper es-MX/es-ES + **Kokoro
  multi-lang v1_0** con 53 speakers sobre el paquete compartido
  `kokoro-multi-lang-v1_0` + **Supertonic V3 int8** F1–M5 · Español sobre
  `sherpa-onnx-supertonic-3-tts-int8-2026-05-11`; Piper/Kokoro solo no
  cuantizados; Supertonic solo existe como int8).
- `VoiceDownloader` + `packageId`: una descarga sirve a varias voces
  (Kokoro sid 0–52; Supertonic sid 0–9 × idioma).
- `InstalledVoices`: registro `installed.json`, borrar, reconciliar disco.
- Preferencia `active_voice_id` (DataStore) = id de voz (modelo + sid [+ lang]).

Tras extraer se exige integridad por motor (Piper: `.onnx` + `tokens.txt` +
`espeak-ng-data/phontab`; Kokoro: además `voices.bin` y lexicons; Supertonic: 7
ficheros sin espeak). Una carpeta a medias **no** se marca instalada; **Descargar**
otra vez la borra y reinstala el `.tar.bz2` completo.

### CP4 — UI de ajustes «Voz»

En la pantalla de conexión, sección **Voz**:

- Lista del catálogo (nombre, idioma, motor, tamaño, estado).
- Acciones: **Descargar** (barra de progreso), **Cancelar**, **Activar**,
  **Escuchar** (muestra con la voz/sid instalada), **Borrar** (paquete entero
  si es Kokoro/Supertonic compartido).
- **Kokoro**: una sola tarjeta con selectores de idioma (filtra) y voz
  (speaker con idioma embebido; sin `extra["lang"]`). Presentación
  «Kokoro — Dora · Español».
- **Supertonic**: una sola tarjeta con selectores de speaker (F1–M5) e idioma
  (Español; más idiomas se añaden al catálogo). Presentación
  «Supertonic — M1 · Español».
- La voz **Activa** se usa en la siguiente racha.
- El TTS de Android no aparece en la UI: solo actúa como fallback interno
  automático si no hay voz neuronal o si sherpa falla.

