package mx.ideass.personal.agent.voice

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import mx.ideass.personal.agent.R
import mx.ideass.personal.agent.app.AppPreferences
import mx.ideass.personal.agent.chat.ChatStore
import mx.ideass.personal.agent.chat.VoiceStyleWire
import mx.ideass.personal.agent.network.ChatConnection
import mx.ideass.personal.agent.network.ChatInbound
import mx.ideass.personal.agent.voice.audio.BluetoothScoController
import mx.ideass.personal.agent.voice.audio.VoiceEarcons
import mx.ideass.personal.agent.voice.audio.VoicePlaybackRoutePolicy
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.math.max

data class VoiceSessionUi(
    val state: VoiceState = VoiceState.Idle,
    val userTranscript: String = "",
    val agentText: String = "",
    val rmsDb: Float = -45f,
    val errorMessage: String? = null,
)

/**
 * Ciclo continuo manos libres: Listening → Thinking → Speaking → Listening.
 * Half-duplex estricto: el STT está apagado mientras habla el TTS.
 *
 * Origen [VoiceOrigin.AssistantInvocation]: abre [VoiceStreak] (sesión nueva).
 * Origen [VoiceOrigin.InConversation]: continúa esa sessionKey sin crear ni titular.
 *
 * TODO(Fase 2): comandos de sesión, enrutado a la activa, anuncio auditivo.
 */
@Singleton
class VoiceSession @Inject constructor(
    @ApplicationContext private val context: Context,
    private val chatConnection: ChatConnection,
    private val chatStore: ChatStore,
    private val voiceStreak: VoiceStreak,
    private val voiceStreakTitle: VoiceStreakTitle,
    private val bluetoothSco: BluetoothScoController,
    private val earcons: VoiceEarcons,
    private val screenWake: VoiceScreenWakeController,
    private val preferences: AppPreferences,
    private val installedVoices: InstalledVoices,
) {
    private val mainHandler = Handler(Looper.getMainLooper())
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val micGate = VoiceMicSessionGate()
    private val hangCommands: Set<String> =
        context.resources.getStringArray(R.array.voice_hang_commands).toSet()
    private val errorCopy = VoiceErrorCopy(
        noNetworkSpoken = context.getString(R.string.voice_error_no_network_spoken),
        noNetworkUi = context.getString(R.string.voice_error_no_network_ui),
        noReplySpoken = context.getString(R.string.voice_error_no_reply_spoken),
        noReplyUi = context.getString(R.string.voice_error_no_reply_ui),
        streakUnavailableSpoken = context.getString(R.string.voice_error_streak_spoken),
        streakUnavailableUi = context.getString(R.string.voice_error_streak_ui),
        sttUnavailableSpoken = context.getString(R.string.voice_error_stt_spoken),
        sttUnavailableUi = context.getString(R.string.voice_error_stt),
        ttsUnavailableSpoken = context.getString(R.string.voice_error_tts_spoken),
        ttsUnavailableUi = context.getString(R.string.voice_error_tts),
    )

    private val _ui = MutableStateFlow(VoiceSessionUi())
    val ui: StateFlow<VoiceSessionUi> = _ui.asStateFlow()

    private val _state = MutableStateFlow<VoiceState>(VoiceState.Idle)
    val state: StateFlow<VoiceState> = _state.asStateFlow()

    /**
     * Emite cuando la sesión se cierra (timeout/comando/UI/toggle/error); la
     * [VoiceLockscreenActivity] debe finish().
     * Buffer 1 + DROP_OLDEST: [tryEmit] desde el hilo main no debe perder el
     * evento (con capacity 0 fallaba y la UI quedaba en Idle «En pausa»).
     * La Activity también observa [sessionActiveFlow] como cinturón.
     */
    private val _sessionEnded = MutableSharedFlow<Unit>(
        extraBufferCapacity = 1,
        onBufferOverflow = BufferOverflow.DROP_OLDEST,
    )
    val sessionEnded: SharedFlow<Unit> = _sessionEnded.asSharedFlow()

    private var stt: SpeechRecognizerEngine? = null
    private var tts: AgentTtsEngine? = null
    private var ttsReady = false
    private var sttAvailable = false
    private var sessionActive = false
    private val _sessionActiveFlow = MutableStateFlow(false)
    /**
     * Racha/ciclo de voz vivo. [VoiceLockscreenActivity] observa el paso a
     * false para finish() (comandos de cierre = mismo camino que Terminar).
     */
    val sessionActiveFlow: StateFlow<Boolean> = _sessionActiveFlow.asStateFlow()
    /** sessionKey destino de esta invocación de voz (racha o conversación abierta). */
    private var streakSessionKey: String? = null
    /** Nombre provisional solo en rachas (null = no titular al colgar). */
    private var streakProvisionalName: String? = null
    /** true solo si el origen fue AssistantInvocation y se abrió racha. */
    private var titlesOnHang = false
    /** Contexto de racha capturado en hangUp para titulado async. */
    private var pendingTitleSessionKey: String? = null
    private var pendingTitleProvisionalName: String? = null
    /** Primera utterance enviada al chat en esta invocación (fallback A de rachas). */
    private var firstUserUtterance: String? = null
    /** Tras anunciar un error por TTS, limpiar en onDone (no volver a Listening). */
    private var closingAfterAnnounce = false
    private var hubJob: Job? = null
    private var restartToken = 0
    private var silenceTimeoutRunnable: Runnable? = null
    private var pendingCloseRunnable: Runnable? = null
    /**
     * Inicio del silencio continuo sin habla útil (elapsedRealtime).
     * 0 = no aplica (ya hubo habla real en este Listening).
     */
    private var silenceStartedAtElapsed = 0L

    val isSessionActive: Boolean get() = sessionActive

    /** Key destino actual (tests). */
    fun currentStreakSessionKey(): String? = streakSessionKey

    fun start(origin: VoiceOrigin = VoiceOrigin.AssistantInvocation) {
        mainHandler.post {
            if (sessionActive) return@post
            cancelPendingClose()
            closingAfterAnnounce = false
            streakSessionKey = null
            streakProvisionalName = null
            titlesOnHang = false
            pendingTitleSessionKey = null
            pendingTitleProvisionalName = null
            firstUserUtterance = null
            setSessionActive(true)
            // Pantalla: bit de racha (la Activity ya marcó superficie visible).
            // Una sola adquisición; Listening/Thinking/Speaking no lo tocan.
            screenWake.setStreakActive(true)
            restartToken += 1
            hubJob?.cancel()
            hubJob = null
            _ui.value = VoiceSessionUi()
            setState(VoiceState.Idle)
            sttAvailable = SpeechRecognizerEngine.isRecognitionAvailable(context)
            acquireMicForeground()
            val bindPlan = VoiceOriginPolicy.bindPlan(origin)
            // SCO una vez al inicio; esperar CONNECTED antes del primer earcon/STT/TTS.
            bluetoothSco.start { connected ->
                if (!sessionActive) return@start
                Log.i(TAG, "SCO listo connected=$connected; iniciando TTS/ciclo origin=$origin")
                prepareTts(bindPlan)
            }
        }
    }

    /**
     * Cierre forzado sin earcon (p. ej. ViewModel clear al salir de [VoiceScreen]).
     * El descarte de la ventana VIS **no** debe llamar aquí: la racha vive en este
     * singleton + [VoiceMicForegroundService] hasta [hangUp] (comando, UI, timeout,
     * reinvocación). Si había racha (titulado activo), dispara título async como hangUp.
     * Para colgar con earcon usar [hangUp].
     */
    fun stop() {
        mainHandler.post {
            if (sessionActive && titlesOnHang) {
                scheduleStreakTitle(
                    sessionKey = streakSessionKey,
                    provisionalName = streakProvisionalName,
                    firstUtterance = firstUserUtterance,
                )
            }
            performStop(closeEarcon = CloseEarcon.None, notifyEnded = false)
        }
    }

    /** Cierre por segundo power/triple-toque (toggle). */
    fun closeByReinvocation() {
        mainHandler.post {
            Log.i(TAG, "VoiceSession: toggle close por reinvocacion")
            hangUpLocked(HangReason.Reinvocation)
        }
    }

    /** Colgar la voz (UI / comando / silencio / reinvocación). Unifica earcon + cleanup. */
    fun hangUp(reason: HangReason) {
        mainHandler.post { hangUpLocked(reason) }
    }

    private fun hangUpLocked(reason: HangReason) {
        if (!sessionActive && streakSessionKey == null) {
            // Sesión ya muerta: aún así notificar a la VIS para hide() (Terminar / cascarón).
            performStop(closeEarcon = CloseEarcon.None, notifyEnded = true)
            return
        }
        Log.i(TAG, "hangUp reason=$reason titlesOnHang=$titlesOnHang")
        if (titlesOnHang) {
            scheduleStreakTitle(
                sessionKey = streakSessionKey,
                provisionalName = streakProvisionalName,
                firstUtterance = firstUserUtterance,
            )
        }
        val earcon = when (reason) {
            HangReason.SilenceTimeout -> CloseEarcon.Timeout
            HangReason.Ui,
            HangReason.Command,
            HangReason.Reinvocation,
            -> CloseEarcon.Manual
        }
        performStop(closeEarcon = earcon, notifyEnded = true)
    }

    /**
     * Titulado fuera del camino crítico: captura valores y lanza en
     * [Dispatchers.Default] (nunca bloquea hide/UI; el await de idle/respuesta
     * puede tardar hasta [VoiceTurnPolicy.REPLY_TIMEOUT_MS]).
     * Si la app muere antes de completar, queda el provisional (aceptable).
     */
    private fun scheduleStreakTitle(
        sessionKey: String?,
        provisionalName: String?,
        firstUtterance: String?,
    ) {
        val key = sessionKey?.trim()?.takeIf { it.isNotEmpty() } ?: return
        val provisional = provisionalName?.trim()?.takeIf { it.isNotEmpty() } ?: return
        pendingTitleSessionKey = key
        pendingTitleProvisionalName = provisional
        val prompt = context.getString(R.string.voice_streak_title_prompt)
        val first = firstUtterance
        // Default: fuera del Main; el await de idle/respuesta no contiende con hide.
        scope.launch(Dispatchers.Default) {
            try {
                voiceStreakTitle.applyAfterHang(
                    sessionKey = key,
                    provisionalName = provisional,
                    firstUserUtterance = first,
                    titlePrompt = prompt,
                )
            } finally {
                if (pendingTitleSessionKey == key) {
                    pendingTitleSessionKey = null
                    pendingTitleProvisionalName = null
                }
            }
        }
    }

    private fun closeBySilenceTimeout() {
        Log.i(TAG, "Timeout ${VoiceTurnPolicy.STREAK_SILENCE_TIMEOUT_MS}ms de silencio, colgando racha")
        hangUpLocked(HangReason.SilenceTimeout)
    }

    /**
     * Cierre: UI libre de inmediato; earcon con SCO vivo; cleanup de audio diferido.
     *
     * Orden ([VoiceHangClosePolicy]): wake → stop escucha → Idle → sessionEnded
     * (hide) → earcon → (hold) → SCO/mic. El titulado ya se disparó async en
     * [scheduleStreakTitle] y no forma parte de este camino.
     */
    private fun performStop(closeEarcon: CloseEarcon, notifyEnded: Boolean) {
        cancelSilenceTimeout()
        silenceStartedAtElapsed = 0L
        closingAfterAnnounce = false

        // Cierre con earcon en curso: stop() inmediato corta y limpia; otro close se ignora.
        if (pendingCloseRunnable != null) {
            if (closeEarcon == CloseEarcon.None) {
                cancelPendingClose()
                finishCleanup(notifyEnded = notifyEnded)
            }
            return
        }

        val hadWork = sessionActive || stt != null || tts != null
        if (!hadWork) {
            screenWake.setStreakActive(false)
            earcons.release()
            bluetoothSco.stop()
            releaseMicForeground()
            streakSessionKey = null
            streakProvisionalName = null
            titlesOnHang = false
            if (_state.value !is VoiceState.Idle) {
                setState(VoiceState.Idle)
                _ui.value = VoiceSessionUi(state = VoiceState.Idle)
            }
            if (notifyEnded) {
                emitSessionEnded()
            }
            return
        }

        setSessionActive(false)
        // Liberar pantalla al colgar (no esperar al earcon ni a hide de la VIS).
        screenWake.setStreakActive(false)
        restartToken += 1
        hubJob?.cancel()
        hubJob = null
        // STT/TTS fuera antes del earcon; SCO sigue activo para que se oiga en buds.
        destroyStt()
        tts?.stop()
        // Idle ya: Terminar no debe verse congelado mientras suena el earcon.
        setState(VoiceState.Idle)
        _ui.value = VoiceSessionUi(state = VoiceState.Idle)

        when (closeEarcon) {
            CloseEarcon.None -> finishCleanup(notifyEnded = notifyEnded)
            CloseEarcon.Timeout, CloseEarcon.Manual -> {
                // hide inmediato: no encadenar sessionEnded al hold SCO / titulado.
                if (notifyEnded && VoiceHangClosePolicy.notifyUiBeforeAudioCleanup()) {
                    emitSessionEnded()
                }
                val playedMs = when (closeEarcon) {
                    CloseEarcon.Timeout -> earcons.playTimeout()
                    CloseEarcon.Manual -> earcons.playCloseManual()
                    CloseEarcon.None -> 0L
                }
                val holdMs = max(
                    playedMs + CLOSE_CLEANUP_SLACK_MS,
                    VoiceEarcons.SCO_HOLD_AFTER_CLOSE_MS,
                )
                val runnable = Runnable {
                    pendingCloseRunnable = null
                    // Ya notificamos arriba si apply; no re-emitir (buffer 0).
                    finishCleanup(notifyEnded = false)
                }
                pendingCloseRunnable = runnable
                mainHandler.postDelayed(runnable, holdMs)
            }
        }
    }

    private fun finishCleanup(notifyEnded: Boolean) {
        tts?.destroy()
        tts = null
        ttsReady = false
        streakSessionKey = null
        streakProvisionalName = null
        titlesOnHang = false
        // pendingTitle* se conserva para titulado async; se limpia al start.
        earcons.release()
        bluetoothSco.stop()
        releaseMicForeground()
        setState(VoiceState.Idle)
        _ui.value = VoiceSessionUi(state = VoiceState.Idle)
        Log.i(TAG, "VoiceSession: sesion cerrada limpia")
        if (notifyEnded) {
            emitSessionEnded()
        }
    }

    private fun cancelPendingClose() {
        pendingCloseRunnable?.let { mainHandler.removeCallbacks(it) }
        pendingCloseRunnable = null
    }

    /**
     * Espera al evento de conexión (no a un reloj fijo). Earcon de «pensando»
     * solo si hace falta reconectar, para que la espera no se sienta muerta.
     */
    private suspend fun ensureHubConnected(): Boolean {
        val timeoutMs = context.resources
            .getInteger(R.integer.voice_connection_gate_timeout_ms)
            .toLong()
        return VoiceConnectionGate.ensureConnected(
            connection = chatConnection,
            timeoutMs = timeoutMs,
            onWaiting = { earcons.playThinking() },
        )
    }

    private fun prepareTts(bindPlan: VoiceBindPlan) {
        tts?.destroy()
        ttsReady = false
        closingAfterAnnounce = false
        scope.launch {
            if (!sessionActive) return@launch
            val activeId = preferences.getActiveNeuralVoiceId()
            val neuralModel = installedVoices.resolveForPlayback(activeId)
                ?: NeuralVoicesStore.resolveActiveOrAnyInstalled(context)
            if (!sessionActive) return@launch

            val sessionListener = createTtsListener(bindPlan)

            if (neuralModel != null) {
                Log.i(
                    TAG,
                    "TTS: intentando Sherpa voice=${neuralModel.id} " +
                        "active=${activeId ?: "(auto)"}",
                )
                tts = SherpaTtsEngine(
                    context = context,
                    model = neuralModel,
                    routeProvider = {
                        VoicePlaybackRoutePolicy.resolve(bluetoothSco.isScoConnected)
                    },
                    listener = object : AgentTtsEngine.Listener {
                        override fun onReady(available: Boolean) {
                            if (!sessionActive) return
                            when (SherpaTtsInitPolicy.onInitResult(available)) {
                                SherpaInitOutcome.Ready -> {
                                    sessionListener.onReady(true)
                                    return
                                }
                                SherpaInitOutcome.FallbackAndroid -> {
                                    Log.w(
                                        TAG,
                                        "TTS: Sherpa no disponible (runtime/modelo) → fallback Android",
                                    )
                                    bindAndroidTts(listener = sessionListener)
                                }
                            }
                        }

                        override fun onDone() = sessionListener.onDone()

                        override fun onError(message: String) = sessionListener.onError(message)
                    },
                )
            } else {
                Log.i(TAG, "TTS: sin modelo neuronal → Android TTS (fallback invisible)")
                bindAndroidTts(listener = sessionListener)
            }
        }
    }

    /** TTS del sistema: solo fallback automático; sin preferencias de UI. */
    private fun bindAndroidTts(listener: AgentTtsEngine.Listener) {
        if (!sessionActive) return
        tts?.destroy()
        ttsReady = false
        Log.i(TAG, "TTS: bind Android fallback (motor/voz del sistema)")
        tts = TtsEngine(
            context = context,
            preferredEnginePackage = null,
            preferredVoiceName = null,
            routeProvider = {
                VoicePlaybackRoutePolicy.resolve(bluetoothSco.isScoConnected)
            },
            listener = listener,
        )
    }

    private fun createTtsListener(bindPlan: VoiceBindPlan): AgentTtsEngine.Listener =
        object : AgentTtsEngine.Listener {
            override fun onReady(available: Boolean) {
                if (!sessionActive) return
                ttsReady = available
                if (!available) {
                    failFatalEarcon(errorCopy.ui(VoiceErrorKind.TtsUnavailable))
                    return
                }
                // Un solo coordinador de red: el gate. Nada de isConnected() → offline.
                hubJob?.cancel()
                hubJob = scope.launch {
                    if (!sessionActive) return@launch
                    Log.i(TAG, "conexión: esperando gate…")
                    val gateOk = ensureHubConnected()
                    if (!sessionActive) return@launch
                    if (!gateOk) {
                        Log.w(TAG, "conexión: gate falló → anuncio offline")
                        announceErrorAndClose(VoiceErrorKind.NoNetwork)
                        return@launch
                    }
                    Log.i(TAG, "conexión: gate ok")
                    val startDecision = VoiceTurnPolicy.afterSessionStart(
                        sttAvailable = sttAvailable,
                    )
                    if (startDecision is VoiceTurnDecision.AudibleError) {
                        announceErrorAndClose(startDecision.kind)
                        return@launch
                    }
                    bindTargetThenListen(bindPlan)
                }
            }

            override fun onDone() {
                if (closingAfterAnnounce) {
                    closingAfterAnnounce = false
                    finishCleanupAfterAnnounce()
                    return
                }
                if (!sessionActive) return
                if (_state.value !is VoiceState.Speaking) return
                enterListening()
            }

            override fun onError(message: String) {
                if (closingAfterAnnounce) {
                    closingAfterAnnounce = false
                    finishCleanupAfterAnnounce()
                    return
                }
                if (!sessionActive) return
                Log.w(TAG, message)
                if (_state.value is VoiceState.Speaking) {
                    enterListening()
                }
            }
        }

    private suspend fun bindTargetThenListen(bindPlan: VoiceBindPlan) {
        if (!sessionActive) return
        when (bindPlan) {
            is VoiceBindPlan.Invalid -> {
                announceErrorAndClose(VoiceErrorKind.StreakUnavailable)
            }
            is VoiceBindPlan.UseExisting -> {
                streakSessionKey = bindPlan.sessionKey
                streakProvisionalName = null
                titlesOnHang = false
                enterListening()
            }
            is VoiceBindPlan.CreateStreak -> {
                // Gate ya resolvió arriba; open() no decide offline por su cuenta.
                val opened = voiceStreak.open()
                if (!sessionActive) return
                val error = VoiceConnectionStartPolicy.errorAfterGate(
                    gateOk = true,
                    streakOpened = opened != null,
                    createStreak = true,
                )
                if (error != null || opened == null) {
                    announceErrorAndClose(error ?: VoiceErrorKind.StreakUnavailable)
                    return
                }
                streakSessionKey = opened.session.sessionKey
                streakProvisionalName = opened.provisionalName
                titlesOnHang = VoiceOriginPolicy.titlesOnHang(bindPlan)
                enterListening()
            }
        }
    }

    private fun enterListening() {
        if (!sessionActive) return
        val prev = _state.value
        // scheduleSttRestart no pasa por aquí: solo entradas genuinas (inicio o post-Speaking).
        val playReadyEarcon = prev !is VoiceState.Listening

        if (prev is VoiceState.Speaking || prev is VoiceState.Thinking) {
            bluetoothSco.markCycleTransition(prev.javaClass.simpleName, "Listening")
        }

        hubJob?.cancel()
        hubJob = null
        // Tras Speaking el TTS ya terminó (onDone). Llamar stop() aquí postea un
        // tts.stop() asíncrono que corta el AudioTrack del earcon en SCO.
        // No tocar SCO ni AudioManager aquí: mismo canal de toda la sesión.
        if (prev !is VoiceState.Speaking) {
            tts?.stop()
        }
        destroyStt()
        beginSilenceWindow()
        setState(VoiceState.Listening)
        _ui.update {
            it.copy(
                state = VoiceState.Listening,
                userTranscript = "",
                agentText = "",
                rmsDb = SILENCE_RMS,
                errorMessage = it.errorMessage,
            )
        }
        if (playReadyEarcon) {
            // Después del TTS, antes del STT: «ahora habla tú».
            earcons.playListening()
        }
        armSilenceTimeout()
        val token = restartToken
        val sttDelay = if (playReadyEarcon) {
            max(STT_RESTART_DELAY_MS, VoiceEarcons.LISTENING_MS + EARCON_STT_SLACK_MS)
        } else {
            STT_RESTART_DELAY_MS
        }
        mainHandler.postDelayed({
            if (!sessionActive || token != restartToken) return@postDelayed
            if (_state.value !is VoiceState.Listening) return@postDelayed
            startStt()
        }, sttDelay)
    }

    private fun startStt() {
        destroyStt()
        val engine = SpeechRecognizerEngine(
            context = context,
            listener = object : SpeechRecognizerEngine.Listener {
                override fun onPartial(text: String) {
                    if (_state.value !is VoiceState.Listening) return
                    val trimmed = text.trim()
                    if (trimmed.isNotEmpty()) {
                        onUsefulSpeechDetected()
                        _ui.update { it.copy(userTranscript = trimmed) }
                    }
                }

                override fun onFinal(text: String) {
                    if (!sessionActive) return
                    if (_state.value !is VoiceState.Listening) return
                    onUtteranceRecognized(text)
                }

                override fun onRmsChanged(rmsdB: Float) {
                    if (_state.value !is VoiceState.Listening) return
                    _ui.update { it.copy(rmsDb = rmsdB) }
                }

                override fun onNoMatch() {
                    if (!sessionActive) return
                    if (_state.value !is VoiceState.Listening) return
                    Log.i(TAG, "No match / empty final, reprogramando STT")
                    scheduleSttRestart()
                }

                override fun onError(message: String, fatal: Boolean) {
                    if (!sessionActive) return
                    if (fatal) {
                        announceErrorAndClose(VoiceErrorKind.SttUnavailable)
                    } else {
                        scheduleSttRestart()
                    }
                }
            },
        )
        stt = engine
        engine.start()
    }

    /**
     * Reinicia STT solo si el silencio acumulado aún no llega al timeout de racha.
     * Si ya lo superó, cuelga (el timeout gana al auto-restart).
     */
    private fun scheduleSttRestart() {
        destroyStt()
        val silentMs = accumulatedSilenceMs()
        if (silentMs >= 0L) {
            Log.i(TAG, "Silencio acumulado: ${silentMs}ms")
        }
        if (silentMs >= VoiceTurnPolicy.STREAK_SILENCE_TIMEOUT_MS) {
            closeBySilenceTimeout()
            return
        }
        val token = restartToken
        Log.i(TAG, "scheduleSttRestart: programando reinicio STT en ${STT_RESTART_DELAY_MS}ms")
        mainHandler.postDelayed({
            if (!sessionActive || token != restartToken) return@postDelayed
            if (_state.value !is VoiceState.Listening) return@postDelayed
            // Re-chequeo por si el tiempo ganó mientras esperábamos el delay.
            val again = accumulatedSilenceMs()
            if (again >= VoiceTurnPolicy.STREAK_SILENCE_TIMEOUT_MS) {
                Log.i(TAG, "Silencio acumulado: ${again}ms")
                closeBySilenceTimeout()
                return@postDelayed
            }
            _ui.update { it.copy(userTranscript = "", rmsDb = SILENCE_RMS) }
            startStt()
        }, STT_RESTART_DELAY_MS)
    }

    private fun onUtteranceRecognized(text: String) {
        val trimmed = text.trim()
        if (trimmed.isEmpty()) {
            Log.i(TAG, "onFinal text=''")
            Log.i(TAG, "No match / empty final, reprogramando STT")
            scheduleSttRestart()
            return
        }
        onUsefulSpeechDetected()
        // Half-duplex: apaga STT antes de decidir (Hang / Thinking).
        destroyStt()
        val targetKey = streakSessionKey
        when (
            val decision = VoiceTurnPolicy.afterUtterance(
                text = trimmed,
                streakReady = !targetKey.isNullOrBlank(),
                hangCommands = hangCommands,
            )
        ) {
            is VoiceTurnDecision.ContinueListening -> {
                enterListening()
                return
            }
            is VoiceTurnDecision.Hang -> {
                Log.i(TAG, "Comando de colgar: «$trimmed»")
                _ui.update { it.copy(userTranscript = trimmed, rmsDb = SILENCE_RMS) }
                hangUpLocked(HangReason.Command)
                return
            }
            is VoiceTurnDecision.AudibleError -> {
                announceErrorAndClose(decision.kind)
                return
            }
            is VoiceTurnDecision.Send -> Unit
        }
        setState(VoiceState.Thinking)
        _ui.update {
            it.copy(
                state = VoiceState.Thinking,
                userTranscript = trimmed,
                agentText = "",
                rmsDb = SILENCE_RMS,
                errorMessage = null,
            )
        }
        val replyBuffer = StringBuilder()
        hubJob?.cancel()
        hubJob = scope.launch {
            val key = targetKey!!
            val finished = CompletableDeferred<String?>()
            val collector = launch {
                chatConnection.inbound.collect { msg ->
                    if (finished.isCompleted) return@collect
                    if (msg.sessionKey != null && msg.sessionKey != key) {
                        return@collect
                    }
                    when (msg) {
                        is ChatInbound.AssistantDelta -> {
                            if (msg.replace) {
                                replyBuffer.clear()
                            }
                            replyBuffer.append(msg.text)
                            _ui.update { it.copy(agentText = replyBuffer.toString()) }
                        }
                        is ChatInbound.AssistantDone -> {
                            finished.complete(replyBuffer.toString().trim().ifEmpty { null })
                        }
                        is ChatInbound.Error -> {
                            Log.w(TAG, "Chat error: ${msg.message}")
                            _ui.update { it.copy(errorMessage = msg.message) }
                            finished.complete(null)
                        }
                        is ChatInbound.ConfirmRequest -> Unit
                    }
                }
            }
            try {
                val online = chatConnection.isConnected()
                if (!online) {
                    chatConnection.reconnectNow()
                }
                val isFirst = firstUserUtterance == null
                if (isFirst) {
                    firstUserUtterance = trimmed
                }
                // Prepend de estilo solo en racha (titlesOnHang) y solo el 1.er utterance.
                // InConversation no aplica. El hilo guarda el wire; la UI hace strip.
                val wireText = VoiceStyleWire.build(
                    utterance = trimmed,
                    applyStyle = VoiceStyleWire.shouldApply(
                        titlesOnHang = titlesOnHang,
                        isFirstUserUtterance = isFirst,
                    ),
                    styleInstruction = context.getString(R.string.voice_style_instruction),
                    separator = context.getString(R.string.voice_style_separator),
                )
                chatStore.appendUserMessage(
                    text = wireText,
                    queued = !online,
                    sessionKey = key,
                )
                chatConnection.sendUserMessage(wireText, key)
                val reply = kotlinx.coroutines.withTimeoutOrNull(
                    VoiceTurnPolicy.REPLY_TIMEOUT_MS,
                ) {
                    finished.await()
                }
                if (!sessionActive) return@launch
                when (
                    val wait = VoiceTurnPolicy.afterReplyWait(
                        timedOut = reply == null && !finished.isCompleted,
                        reply = reply,
                    )
                ) {
                    is VoiceWaitResult.Speak -> enterSpeaking(wait.text)
                    is VoiceWaitResult.ContinueListening -> enterListening()
                    is VoiceWaitResult.AudibleError -> announceErrorAndClose(wait.kind)
                }
            } finally {
                collector.cancel()
            }
        }
    }

    private fun enterSpeaking(text: String) {
        if (!sessionActive) return
        bluetoothSco.markCycleTransition(_state.value.javaClass.simpleName, "Speaking")
        cancelSilenceTimeout()
        silenceStartedAtElapsed = 0L
        // Half-duplex: solo apaga STT. SCO/modo/focus quedan intactos.
        destroyStt()
        setState(VoiceState.Speaking)
        _ui.update {
            it.copy(
                state = VoiceState.Speaking,
                agentText = text,
                rmsDb = SILENCE_RMS,
            )
        }
        val engine = tts
        if (engine == null || !ttsReady) {
            failFatalEarcon(errorCopy.ui(VoiceErrorKind.TtsUnavailable))
            return
        }
        // UI/chat conservan [text]; al TTS solo la versión hablable.
        val spoken = sanitizeForTts(text)
        engine.speak(spoken)
    }

    /** Anuncia el error por TTS (si hay motor) y cierra la sesión de voz. */
    private fun announceErrorAndClose(kind: VoiceErrorKind) {
        val spoken = errorCopy.spoken(kind)
        val uiMessage = errorCopy.ui(kind)
        cancelSilenceTimeout()
        silenceStartedAtElapsed = 0L
        cancelPendingClose()
        hubJob?.cancel()
        hubJob = null
        destroyStt()
        tts?.stop()

        val engine = tts
        if (engine == null || !ttsReady) {
            failFatalEarcon(uiMessage)
            return
        }
        closingAfterAnnounce = true
        setState(VoiceState.Speaking)
        _ui.update {
            it.copy(
                state = VoiceState.Speaking,
                agentText = "",
                rmsDb = SILENCE_RMS,
                errorMessage = uiMessage,
            )
        }
        engine.speak(spoken)
    }

    private fun finishCleanupAfterAnnounce() {
        setSessionActive(false)
        screenWake.setStreakActive(false)
        restartToken += 1
        hubJob?.cancel()
        hubJob = null
        destroyStt()
        tts?.destroy()
        tts = null
        ttsReady = false
        streakSessionKey = null
        streakProvisionalName = null
        titlesOnHang = false
        earcons.release()
        bluetoothSco.stop()
        releaseMicForeground()
        setState(VoiceState.Idle)
        _ui.update {
            it.copy(state = VoiceState.Idle)
        }
        Log.i(TAG, "VoiceSession: sesion cerrada tras anuncio")
        emitSessionEnded()
    }

    private fun failFatalEarcon(message: String) {
        cancelSilenceTimeout()
        silenceStartedAtElapsed = 0L
        cancelPendingClose()
        closingAfterAnnounce = false
        setSessionActive(false)
        screenWake.setStreakActive(false)
        restartToken += 1
        hubJob?.cancel()
        hubJob = null
        destroyStt()
        tts?.stop()
        // Earcon de error con SCO aún activo; cleanup después.
        val playedMs = earcons.playError()
        val holdMs = max(playedMs + CLOSE_CLEANUP_SLACK_MS, VoiceEarcons.SCO_HOLD_AFTER_CLOSE_MS)
        val runnable = Runnable {
            pendingCloseRunnable = null
            tts?.destroy()
            tts = null
            ttsReady = false
            streakSessionKey = null
            streakProvisionalName = null
            titlesOnHang = false
            earcons.release()
            bluetoothSco.stop()
            releaseMicForeground()
            setState(VoiceState.Idle)
            _ui.update {
                VoiceSessionUi(
                    state = VoiceState.Idle,
                    errorMessage = message,
                )
            }
            Log.i(TAG, "VoiceSession: sesion cerrada limpia")
            emitSessionEnded()
        }
        pendingCloseRunnable = runnable
        mainHandler.postDelayed(runnable, holdMs)
    }

    private fun acquireMicForeground() {
        if (micGate.onSessionStart()) {
            VoiceMicForegroundService.start(context)
        }
    }

    private fun releaseMicForeground() {
        if (micGate.onSessionEnd()) {
            VoiceMicForegroundService.stop(context)
        }
    }

    private fun destroyStt() {
        stt?.destroy()
        stt = null
    }

    /** Marca el inicio de la ventana de silencio (sin habla útil todavía). */
    private fun beginSilenceWindow() {
        silenceStartedAtElapsed = SystemClock.elapsedRealtime()
        Log.i(TAG, "Silencio acumulado: 0ms")
    }

    /**
     * Habla real (partial/final no vacío): el timeout de 6 s deja de aplicar
     * y el endpointing del RecognizerIntent toma el control.
     */
    private fun onUsefulSpeechDetected() {
        if (silenceStartedAtElapsed == 0L) return
        Log.i(TAG, "Habla detectada, reseteando timer de silencio")
        silenceStartedAtElapsed = 0L
        cancelSilenceTimeout()
    }

    /** ms de silencio continuo sin habla útil, o -1 si ya hubo habla en este turno. */
    private fun accumulatedSilenceMs(): Long {
        val started = silenceStartedAtElapsed
        if (started == 0L) return -1L
        return SystemClock.elapsedRealtime() - started
    }

    private fun armSilenceTimeout() {
        cancelSilenceTimeout()
        if (!sessionActive) return
        if (silenceStartedAtElapsed == 0L) return
        val token = restartToken
        val startedAt = silenceStartedAtElapsed
        val runnable = Runnable {
            silenceTimeoutRunnable = null
            if (!sessionActive || token != restartToken) return@Runnable
            if (_state.value !is VoiceState.Listening) return@Runnable
            // Solo si seguimos midiendo el mismo tramo de silencio (sin habla útil).
            if (silenceStartedAtElapsed != startedAt || silenceStartedAtElapsed == 0L) return@Runnable
            val silentMs = accumulatedSilenceMs()
            Log.i(TAG, "Silencio acumulado: ${silentMs}ms")
            closeBySilenceTimeout()
        }
        silenceTimeoutRunnable = runnable
        mainHandler.postDelayed(runnable, VoiceTurnPolicy.STREAK_SILENCE_TIMEOUT_MS)
    }

    private fun cancelSilenceTimeout() {
        silenceTimeoutRunnable?.let { mainHandler.removeCallbacks(it) }
        silenceTimeoutRunnable = null
    }

    private fun setState(next: VoiceState) {
        val prev = _state.value
        _state.value = next
        when {
            next is VoiceState.Thinking && prev is VoiceState.Listening -> {
                earcons.playThinking()
            }
        }
        if (next !is VoiceState.Listening) {
            cancelSilenceTimeout()
        }
    }

    private fun setSessionActive(active: Boolean) {
        sessionActive = active
        _sessionActiveFlow.value = active
    }

    /** Notifica cierre de superficie; buffer 1 evita perder el evento en Main. */
    private fun emitSessionEnded() {
        _sessionEnded.tryEmit(Unit)
    }

    private enum class CloseEarcon {
        None,
        Timeout,
        Manual,
    }

    companion object {
        private const val TAG = "VoiceSession"
        /** Debe superar VoiceEarcons.LISTENING_MS para no pisar el earcon con el STT. */
        private const val STT_RESTART_DELAY_MS = 350L
        /** Margen extra tras el earcon de listening antes de abrir el micrófono. */
        private const val EARCON_STT_SLACK_MS = 60L
        private const val CLOSE_CLEANUP_SLACK_MS = 50L
        const val SILENCE_RMS = -45f
    }
}
