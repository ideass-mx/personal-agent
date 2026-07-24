package mx.ideass.personal.agent.voice

import android.content.Context
import android.media.AudioAttributes
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import java.util.Locale
import java.util.UUID

/**
 * Envoltorio de [TextToSpeech] del sistema, en español.
 */
class TtsEngine(
    context: Context,
    private val listener: Listener,
) {
    interface Listener {
        fun onReady(available: Boolean)
        fun onDone()
        fun onError(message: String)
    }

    private val mainHandler = Handler(Looper.getMainLooper())
    private var tts: TextToSpeech? = null
    private var ready = false
    private var currentUtteranceId: String? = null

    init {
        tts = TextToSpeech(context.applicationContext) { status ->
            mainHandler.post {
                if (status != TextToSpeech.SUCCESS) {
                    ready = false
                    listener.onReady(false)
                    return@post
                }
                val engine = tts ?: run {
                    listener.onReady(false)
                    return@post
                }
                val locale = preferredLocale(engine)
                val result = engine.setLanguage(locale)
                if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                    Log.w(TAG, "Idioma $locale no soportado por TTS")
                    ready = false
                    listener.onReady(false)
                    return@post
                }
                engine.setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build(),
                )
                engine.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                    override fun onStart(utteranceId: String?) = Unit
                    override fun onDone(utteranceId: String?) {
                        if (utteranceId != null && utteranceId == currentUtteranceId) {
                            mainHandler.post { listener.onDone() }
                        }
                    }

                    @Deprecated("Deprecated in Java")
                    override fun onError(utteranceId: String?) {
                        mainHandler.post {
                            listener.onError("Error al hablar la respuesta.")
                        }
                    }

                    override fun onError(utteranceId: String?, errorCode: Int) {
                        mainHandler.post {
                            listener.onError("Error al hablar la respuesta.")
                        }
                    }
                })
                ready = true
                listener.onReady(true)
            }
        }
    }

    val isReady: Boolean get() = ready

    fun speak(text: String) {
        mainHandler.post {
            val engine = tts
            if (engine == null || !ready) {
                listener.onError("La síntesis de voz no está disponible en este dispositivo.")
                return@post
            }
            val id = UUID.randomUUID().toString()
            currentUtteranceId = id
            val params = Bundle()
            val result = engine.speak(text, TextToSpeech.QUEUE_FLUSH, params, id)
            if (result != TextToSpeech.SUCCESS) {
                listener.onError("No se pudo iniciar la síntesis de voz.")
            }
        }
    }

    fun stop() {
        mainHandler.post {
            currentUtteranceId = null
            runCatching { tts?.stop() }
        }
    }

    fun destroy() {
        mainHandler.post {
            currentUtteranceId = null
            val engine = tts
            tts = null
            ready = false
            if (engine != null) {
                runCatching { engine.stop() }
                runCatching { engine.shutdown() }
            }
        }
    }

    private fun preferredLocale(engine: TextToSpeech): Locale {
        val candidates = listOf(
            Locale.forLanguageTag("es-MX"),
            Locale.forLanguageTag("es-ES"),
            Locale("es"),
        )
        for (locale in candidates) {
            val avail = engine.isLanguageAvailable(locale)
            if (avail >= TextToSpeech.LANG_AVAILABLE) return locale
        }
        return Locale.forLanguageTag("es-MX")
    }

    companion object {
        private const val TAG = "TtsEngine"
    }
}
