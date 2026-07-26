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
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import mx.ideass.personal.agent.chat.ChatStore
import mx.ideass.personal.agent.network.HubClient
import mx.ideass.personal.agent.protocol.ServerMessage
import mx.ideass.personal.agent.voice.audio.BluetoothScoController
import mx.ideass.personal.agent.voice.audio.VoiceEarcons
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
 */
@Singleton
class VoiceSession @Inject constructor(
    @ApplicationContext private val context: Context,
    private val hubClient: HubClient,
    private val chatStore: ChatStore,
    private val bluetoothSco: BluetoothScoController,
    private val earcons: VoiceEarcons,
) {
    private val mainHandler = Handler(Looper.getMainLooper())
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    private val _ui = MutableStateFlow(VoiceSessionUi())
    val ui: StateFlow<VoiceSessionUi> = _ui.asStateFlow()

    private val _state = MutableStateFlow<VoiceState>(VoiceState.Idle)
    val state: StateFlow<VoiceState> = _state.asStateFlow()

    /** Emite cuando la sesión se cierra sola (timeout/toggle/error); la VIS debe hide(). */
    private val _sessionEnded = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val sessionEnded: SharedFlow<Unit> = _sessionEnded.asSharedFlow()

    private var stt: SpeechRecognizerEngine? = null
    private var tts: TtsEngine? = null
    private var ttsReady = false
    private var sttAvailable = false
    private var sessionActive = false
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

    fun start() {
        mainHandler.post {
            if (sessionActive) return@post
            cancelPendingClose()
            sessionActive = true
            restartToken += 1
            hubJob?.cancel()
            hubJob = null
            _ui.value = VoiceSessionUi()
            setState(VoiceState.Idle)
            bluetoothSco.start()
            sttAvailable = SpeechRecognizerEngine.isRecognitionAvailable(context)
            if (!sttAvailable) {
                failFatal("El reconocimiento de voz no está disponible en este dispositivo.")
                return@post
            }
            prepareTts()
        }
    }

    fun stop() {
        mainHandler.post {
            performStop(closeEarcon = CloseEarcon.None, notifyEnded = false)
        }
    }

    /** Cierre por segundo power/triple-toque (toggle). */
    fun closeByReinvocation() {
        mainHandler.post {
            Log.i(TAG, "VoiceSession: toggle close por reinvocacion")
            performStop(closeEarcon = CloseEarcon.Manual, notifyEnded = true)
        }
    }

    private fun closeBySilenceTimeout() {
        Log.i(TAG, "Timeout 6s alcanzado, cerrando sesion")
        performStop(closeEarcon = CloseEarcon.Timeout, notifyEnded = true)
    }

    /**
     * Orden crítico para earcons de cierre: STT/TTS off → earcon (SCO vivo) →
     * delay → liberar SCO. Nunca al revés.
     */
    private fun performStop(closeEarcon: CloseEarcon, notifyEnded: Boolean) {
        cancelSilenceTimeout()
        silenceStartedAtElapsed = 0L

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
            earcons.release()
            bluetoothSco.stop()
            if (_state.value !is VoiceState.Idle) {
                setState(VoiceState.Idle)
                _ui.value = VoiceSessionUi(state = VoiceState.Idle)
            }
            if (notifyEnded) {
                _sessionEnded.tryEmit(Unit)
            }
            return
        }

        sessionActive = false
        restartToken += 1
        hubJob?.cancel()
        hubJob = null
        // STT/TTS fuera antes del earcon; SCO sigue activo para que se oiga en buds.
        destroyStt()
        tts?.stop()

        when (closeEarcon) {
            CloseEarcon.None -> finishCleanup(notifyEnded = notifyEnded)
            CloseEarcon.Timeout, CloseEarcon.Manual -> {
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
                    finishCleanup(notifyEnded = notifyEnded)
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
        earcons.release()
        bluetoothSco.stop()
        setState(VoiceState.Idle)
        _ui.value = VoiceSessionUi(state = VoiceState.Idle)
        Log.i(TAG, "VoiceSession: sesion cerrada limpia")
        if (notifyEnded) {
            _sessionEnded.tryEmit(Unit)
        }
    }

    private fun cancelPendingClose() {
        pendingCloseRunnable?.let { mainHandler.removeCallbacks(it) }
        pendingCloseRunnable = null
    }

    private fun prepareTts() {
        tts?.destroy()
        ttsReady = false
        tts = TtsEngine(
            context = context,
            listener = object : TtsEngine.Listener {
                override fun onReady(available: Boolean) {
                    if (!sessionActive) return
                    ttsReady = available
                    if (!available) {
                        failFatal("La síntesis de voz no está disponible en este dispositivo.")
                        return
                    }
                    enterListening()
                }

                override fun onDone() {
                    if (!sessionActive) return
                    if (_state.value !is VoiceState.Speaking) return
                    enterListening()
                }

                override fun onError(message: String) {
                    if (!sessionActive) return
                    Log.w(TAG, message)
                    if (_state.value is VoiceState.Speaking) {
                        enterListening()
                    }
                }
            },
        )
    }

    private fun enterListening() {
        if (!sessionActive) return
        hubJob?.cancel()
        hubJob = null
        tts?.stop()
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
        armSilenceTimeout()
        val token = restartToken
        mainHandler.postDelayed({
            if (!sessionActive || token != restartToken) return@postDelayed
            if (_state.value !is VoiceState.Listening) return@postDelayed
            startStt()
        }, STT_RESTART_DELAY_MS)
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
                    if (fatal) failFatal(message) else scheduleSttRestart()
                }
            },
        )
        stt = engine
        engine.start()
    }

    /**
     * Reinicia STT solo si el silencio acumulado aún no llega a 6 s.
     * Si ya los superó, cierra la sesión (el timeout gana al auto-restart).
     */
    private fun scheduleSttRestart() {
        destroyStt()
        val silentMs = accumulatedSilenceMs()
        if (silentMs >= 0L) {
            Log.i(TAG, "Silencio acumulado: ${silentMs}ms")
        }
        if (silentMs >= INITIAL_SILENCE_TIMEOUT_MS) {
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
            if (again >= INITIAL_SILENCE_TIMEOUT_MS) {
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
        // Half-duplex: apaga STT antes de Thinking (y del earcon thinking).
        destroyStt()
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
            val finished = CompletableDeferred<String?>()
            val collector = launch {
                hubClient.serverMessages.collect { msg ->
                    if (finished.isCompleted) return@collect
                    when (msg) {
                        is ServerMessage.AssistantChunk -> {
                            replyBuffer.append(msg.text)
                            _ui.update { it.copy(agentText = replyBuffer.toString()) }
                        }
                        is ServerMessage.AssistantDone -> {
                            finished.complete(replyBuffer.toString().trim().ifEmpty { null })
                        }
                        is ServerMessage.Error -> {
                            Log.w(TAG, "Hub error: ${msg.message}")
                            _ui.update { it.copy(errorMessage = msg.message) }
                            finished.complete(null)
                        }
                        else -> Unit
                    }
                }
            }
            try {
                chatStore.appendUserMessage(trimmed, queued = !hubClient.isConnected())
                hubClient.sendUserMessage(trimmed, chatStore.currentConversationId())
                val reply = finished.await()
                if (reply.isNullOrEmpty()) {
                    enterListening()
                } else {
                    enterSpeaking(reply)
                }
            } finally {
                collector.cancel()
            }
        }
    }

    private fun enterSpeaking(text: String) {
        if (!sessionActive) return
        cancelSilenceTimeout()
        silenceStartedAtElapsed = 0L
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
            failFatal("La síntesis de voz no está disponible en este dispositivo.")
            return
        }
        engine.speak(text)
    }

    private fun failFatal(message: String) {
        cancelSilenceTimeout()
        silenceStartedAtElapsed = 0L
        cancelPendingClose()
        sessionActive = false
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
            earcons.release()
            bluetoothSco.stop()
            setState(VoiceState.Idle)
            _ui.update {
                VoiceSessionUi(
                    state = VoiceState.Idle,
                    errorMessage = message,
                )
            }
            Log.i(TAG, "VoiceSession: sesion cerrada limpia")
            _sessionEnded.tryEmit(Unit)
        }
        pendingCloseRunnable = runnable
        mainHandler.postDelayed(runnable, holdMs)
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
        mainHandler.postDelayed(runnable, INITIAL_SILENCE_TIMEOUT_MS)
    }

    private fun cancelSilenceTimeout() {
        silenceTimeoutRunnable?.let { mainHandler.removeCallbacks(it) }
        silenceTimeoutRunnable = null
    }

    private fun setState(next: VoiceState) {
        val prev = _state.value
        _state.value = next
        when {
            next is VoiceState.Listening && prev !is VoiceState.Listening -> {
                // SCO ya activo. Earcon antes del STT (STT_RESTART_DELAY_MS > LISTENING_MS).
                earcons.playListening()
            }
            next is VoiceState.Thinking && prev is VoiceState.Listening -> {
                earcons.playThinking()
            }
        }
        if (next !is VoiceState.Listening) {
            cancelSilenceTimeout()
        }
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
        /** Silencio continuo sin habla útil antes de cerrar la sesión. */
        private const val INITIAL_SILENCE_TIMEOUT_MS = 6_000L
        private const val CLOSE_CLEANUP_SLACK_MS = 50L
        const val SILENCE_RMS = -45f
    }
}
