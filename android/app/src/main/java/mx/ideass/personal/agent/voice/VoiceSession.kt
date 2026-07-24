package mx.ideass.personal.agent.voice

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import mx.ideass.personal.agent.chat.ChatStore
import mx.ideass.personal.agent.network.HubClient
import mx.ideass.personal.agent.protocol.ServerMessage
import mx.ideass.personal.agent.voice.audio.BluetoothScoController
import javax.inject.Inject
import javax.inject.Singleton

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
) {
    private val mainHandler = Handler(Looper.getMainLooper())
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    private val _ui = MutableStateFlow(VoiceSessionUi())
    val ui: StateFlow<VoiceSessionUi> = _ui.asStateFlow()

    private val _state = MutableStateFlow<VoiceState>(VoiceState.Idle)
    val state: StateFlow<VoiceState> = _state.asStateFlow()

    private var stt: SpeechRecognizerEngine? = null
    private var tts: TtsEngine? = null
    private var ttsReady = false
    private var sttAvailable = false
    private var sessionActive = false
    private var hubJob: Job? = null
    private var restartToken = 0

    fun start() {
        mainHandler.post {
            if (sessionActive) return@post
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
            sessionActive = false
            restartToken += 1
            hubJob?.cancel()
            hubJob = null
            destroyStt()
            tts?.stop()
            tts?.destroy()
            tts = null
            ttsReady = false
            bluetoothSco.stop()
            setState(VoiceState.Idle)
            _ui.value = VoiceSessionUi(state = VoiceState.Idle)
        }
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
                    _ui.update { it.copy(userTranscript = text) }
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

    private fun scheduleSttRestart() {
        destroyStt()
        val token = restartToken
        mainHandler.postDelayed({
            if (!sessionActive || token != restartToken) return@postDelayed
            if (_state.value !is VoiceState.Listening) return@postDelayed
            _ui.update { it.copy(userTranscript = "", rmsDb = SILENCE_RMS) }
            startStt()
        }, STT_RESTART_DELAY_MS)
    }

    private fun onUtteranceRecognized(text: String) {
        val trimmed = text.trim()
        if (trimmed.isEmpty()) {
            scheduleSttRestart()
            return
        }
        // Half-duplex: apaga STT antes de Thinking.
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
        sessionActive = false
        restartToken += 1
        hubJob?.cancel()
        hubJob = null
        destroyStt()
        tts?.stop()
        bluetoothSco.stop()
        setState(VoiceState.Idle)
        _ui.update {
            VoiceSessionUi(
                state = VoiceState.Idle,
                errorMessage = message,
            )
        }
    }

    private fun destroyStt() {
        stt?.destroy()
        stt = null
    }

    private fun setState(next: VoiceState) {
        _state.value = next
    }

    companion object {
        private const val TAG = "VoiceSession"
        private const val STT_RESTART_DELAY_MS = 280L
        const val SILENCE_RMS = -45f
    }
}
