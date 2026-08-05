package mx.ideass.personal.agent.voice

import android.content.Context
import android.util.Log
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import mx.ideass.personal.agent.voice.audio.VoicePlaybackRoute

/**
 * Reproduce una frase de muestra con [SherpaTtsEngine] (sin SCO; rate nativo).
 * Bloqueante en el caller suspend; no usar en el hilo principal.
 */
object NeuralVoicePreview {
    private const val TAG = "NeuralVoicePreview"
    private const val TIMEOUT_MS = 90_000L

    suspend fun play(
        context: Context,
        model: NeuralVoiceModel,
        sampleText: String,
    ): Boolean = withContext(Dispatchers.IO) {
        val ready = CompletableDeferred<Boolean>()
        val finished = CompletableDeferred<Boolean>()
        val engine = SherpaTtsEngine(
            context = context.applicationContext,
            model = model,
            routeProvider = { VoicePlaybackRoute.Media },
            listener = object : AgentTtsEngine.Listener {
                override fun onReady(available: Boolean) {
                    ready.complete(available)
                }

                override fun onDone() {
                    finished.complete(true)
                }

                override fun onError(message: String) {
                    Log.w(TAG, message)
                    if (!ready.isCompleted) ready.complete(false)
                    finished.complete(false)
                }
            },
        )
        try {
            val available = withTimeoutOrNull(TIMEOUT_MS) { ready.await() } ?: false
            if (!available) return@withContext false
            engine.speak(sampleText)
            withTimeoutOrNull(TIMEOUT_MS) { finished.await() } ?: false
        } finally {
            engine.destroy()
        }
    }
}
