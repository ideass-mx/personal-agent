package mx.ideass.personal.agent.voice

import android.content.Context
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import kotlinx.coroutines.suspendCancellableCoroutine
import java.util.UUID
import kotlin.coroutines.resume

/**
 * Catálogo y muestras de TTS para ajustes (fuera del path SCO de rachas).
 */
object TtsCatalog {
    data class EngineInfo(
        val packageName: String,
        val label: String,
    )

    private const val TAG = "TtsCatalog"

    suspend fun listEngines(context: Context): List<EngineInfo> =
        withBoundTts(context, enginePackage = null) { tts ->
            val systemDefault = runCatching { tts.defaultEngine }.getOrNull()
            Log.i(TAG, "Motores TTS; systemDefault=$systemDefault")
            tts.engines
                .map { EngineInfo(packageName = it.name, label = it.label?.toString() ?: it.name) }
                .sortedBy { it.label.lowercase() }
        }.orEmpty()

    suspend fun listVoices(
        context: Context,
        enginePackage: String?,
    ): List<TtsVoicePolicy.VoiceInfo> =
        withBoundTts(context, enginePackage) { tts ->
            val voices = runCatching { tts.voices }.getOrNull().orEmpty()
            Log.i(
                TAG,
                "Voces engine=${enginePackage ?: "(sistema)"} count=${voices.size} " +
                    "defaultEngine=${runCatching { tts.defaultEngine }.getOrNull()}",
            )
            TtsVoicePolicy.sortVoices(
                voices.map { v ->
                    TtsVoicePolicy.voiceInfo(
                        name = v.name,
                        locale = v.locale,
                        qualityLabel = when {
                            v.isNetworkConnectionRequired -> "red"
                            else -> "local"
                        },
                    )
                },
            )
        }.orEmpty()

    /**
     * Reproduce una muestra con [speak] (ruta media del sistema, no SCO).
     * @return false si no se pudo iniciar.
     */
    suspend fun playSample(
        context: Context,
        enginePackage: String?,
        voiceName: String?,
        sampleText: String,
    ): Boolean = suspendCancellableCoroutine { cont ->
        val app = context.applicationContext
        val main = Handler(Looper.getMainLooper())
        var ttsRef: TextToSpeech? = null
        var finished = false

        fun finish(ok: Boolean) {
            if (finished) return
            finished = true
            val engine = ttsRef
            ttsRef = null
            if (engine != null) {
                runCatching { engine.stop() }
                runCatching { engine.shutdown() }
            }
            if (cont.isActive) cont.resume(ok)
        }

        cont.invokeOnCancellation {
            main.post { finish(false) }
        }

        val callback = TextToSpeech.OnInitListener { status ->
            main.post {
                val engine = ttsRef
                if (engine == null || status != TextToSpeech.SUCCESS) {
                    Log.w(TAG, "Muestra: onInit falló status=$status")
                    finish(false)
                    return@post
                }
                val voices = runCatching { engine.voices }.getOrNull().orEmpty()
                if (!voiceName.isNullOrBlank()) {
                    val voice = voices.firstOrNull { it.name == voiceName }
                    if (voice != null) {
                        engine.setVoice(voice)
                    } else {
                        Log.w(TAG, "Muestra: voz ausente name=$voiceName")
                    }
                } else {
                    for (locale in TtsVoicePolicy.preferredLocales()) {
                        if (engine.isLanguageAvailable(locale) >= TextToSpeech.LANG_AVAILABLE) {
                            engine.setLanguage(locale)
                            break
                        }
                    }
                }
                val utteranceId = UUID.randomUUID().toString()
                engine.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                    override fun onStart(utteranceId: String?) = Unit
                    override fun onDone(utteranceId: String?) {
                        main.post { finish(true) }
                    }
                    @Deprecated("Deprecated in Java")
                    override fun onError(utteranceId: String?) {
                        main.post { finish(false) }
                    }
                    override fun onError(utteranceId: String?, errorCode: Int) {
                        main.post { finish(false) }
                    }
                })
                val result = engine.speak(sampleText, TextToSpeech.QUEUE_FLUSH, Bundle(), utteranceId)
                if (result != TextToSpeech.SUCCESS) {
                    Log.w(TAG, "Muestra: speak rechazado")
                    finish(false)
                }
            }
        }

        ttsRef = if (!enginePackage.isNullOrBlank()) {
            TextToSpeech(app, callback, enginePackage)
        } else {
            TextToSpeech(app, callback)
        }
    }

    private suspend fun <T> withBoundTts(
        context: Context,
        enginePackage: String?,
        block: (TextToSpeech) -> T,
    ): T? = suspendCancellableCoroutine { cont ->
        val app = context.applicationContext
        val main = Handler(Looper.getMainLooper())
        var ttsRef: TextToSpeech? = null
        var finished = false

        fun finish(value: T?) {
            if (finished) return
            finished = true
            val engine = ttsRef
            ttsRef = null
            if (engine != null) {
                runCatching { engine.shutdown() }
            }
            if (cont.isActive) cont.resume(value)
        }

        cont.invokeOnCancellation {
            main.post { finish(null) }
        }

        val callback = TextToSpeech.OnInitListener { status ->
            main.post {
                val engine = ttsRef
                if (engine == null || status != TextToSpeech.SUCCESS) {
                    Log.w(TAG, "Catálogo: onInit falló package=$enginePackage status=$status")
                    finish(null)
                    return@post
                }
                val value = runCatching { block(engine) }.getOrElse {
                    Log.w(TAG, "Catálogo: error ${it.message}")
                    null
                }
                finish(value)
            }
        }

        ttsRef = if (!enginePackage.isNullOrBlank()) {
            TextToSpeech(app, callback, enginePackage)
        } else {
            TextToSpeech(app, callback)
        }
    }
}
