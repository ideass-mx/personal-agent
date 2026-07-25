package mx.ideass.personal.agent.voice

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Log
import java.util.Locale

/**
 * Envoltorio del [SpeechRecognizer] del sistema (STT en español).
 * Debe crearse y usarse en el hilo principal. Half-duplex: destruir
 * mientras el agente habla para evitar eco.
 */
class SpeechRecognizerEngine(
    private val context: Context,
    private val listener: Listener,
) {
    interface Listener {
        fun onPartial(text: String)
        fun onFinal(text: String)
        fun onRmsChanged(rmsdB: Float)
        fun onNoMatch()
        fun onError(message: String, fatal: Boolean)
    }

    private val mainHandler = Handler(Looper.getMainLooper())
    private var recognizer: SpeechRecognizer? = null
    private var listening = false

    val isAvailable: Boolean
        get() = isRecognitionAvailable(context)

    fun start() {
        mainHandler.post {
            if (!isAvailable) {
                listener.onError(
                    "El reconocimiento de voz no está disponible en este dispositivo.",
                    fatal = true,
                )
                return@post
            }
            ensureRecognizer()
            if (listening) return@post
            listening = true
            val locale = preferredLanguageTag()
            Log.i(TAG, "STT locale seleccionado: $locale")
            recognizer?.startListening(recognitionIntent(locale))
        }
    }

    fun stop() {
        mainHandler.post {
            listening = false
            runCatching { recognizer?.stopListening() }
        }
    }

    /** Apaga el reconocedor por completo (p. ej. al pasar a Speaking). */
    fun destroy() {
        mainHandler.post {
            listening = false
            val r = recognizer
            recognizer = null
            if (r != null) {
                runCatching { r.cancel() }
                runCatching { r.destroy() }
            }
        }
    }

    private fun ensureRecognizer() {
        if (recognizer != null) return
        val r = SpeechRecognizer.createSpeechRecognizer(context)
        r.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) = Unit
            override fun onBeginningOfSpeech() = Unit
            override fun onRmsChanged(rmsdB: Float) = listener.onRmsChanged(rmsdB)
            override fun onBufferReceived(buffer: ByteArray?) = Unit
            override fun onEndOfSpeech() {
                listening = false
            }

            override fun onError(error: Int) {
                listening = false
                when (error) {
                    SpeechRecognizer.ERROR_NO_MATCH,
                    SpeechRecognizer.ERROR_SPEECH_TIMEOUT,
                    -> listener.onNoMatch()
                    SpeechRecognizer.ERROR_RECOGNIZER_BUSY,
                    SpeechRecognizer.ERROR_CLIENT,
                    -> {
                        Log.w(TAG, "STT error recuperable=$error")
                        listener.onNoMatch()
                    }
                    SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> {
                        listener.onError("Sin permiso de micrófono no puedo escucharte.", fatal = true)
                    }
                    else -> {
                        Log.w(TAG, "STT error=$error")
                        listener.onNoMatch()
                    }
                }
            }

            override fun onResults(results: Bundle?) {
                listening = false
                val text = results
                    ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    ?.firstOrNull()
                    ?.trim()
                    .orEmpty()
                if (text.isEmpty()) {
                    listener.onNoMatch()
                } else {
                    listener.onFinal(text)
                }
            }

            override fun onPartialResults(partialResults: Bundle?) {
                val text = partialResults
                    ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    ?.firstOrNull()
                    ?.trim()
                    .orEmpty()
                if (text.isNotEmpty()) listener.onPartial(text)
            }

            override fun onEvent(eventType: Int, params: Bundle?) = Unit
        })
        recognizer = r
    }

    private fun recognitionIntent(locale: String): Intent {
        return Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, locale)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, locale)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, context.packageName)
        }
    }

    private fun preferredLanguageTag(): String {
        val systemLanguageTag = Locale.getDefault().toLanguageTag()
        return if (systemLanguageTag.startsWith("es", ignoreCase = true)) systemLanguageTag else "es"
    }

    companion object {
        private const val TAG = "SpeechRecognizerEngine"

        fun isRecognitionAvailable(context: Context): Boolean =
            SpeechRecognizer.isRecognitionAvailable(context)
    }
}
