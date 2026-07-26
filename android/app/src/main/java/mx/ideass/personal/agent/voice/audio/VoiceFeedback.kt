package mx.ideass.personal.agent.voice.audio

import android.content.Context
import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Earcons y háptica para transiciones de VoiceState con pantalla apagada.
 * Usa STREAM_VOICE_CALL para que el tono salga por SCO / buds, no por el altavoz.
 */
@Singleton
class VoiceFeedback @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private val mainHandler = Handler(Looper.getMainLooper())
    private var toneGenerator: ToneGenerator? = null
    private var generation = 0

    /** Ding breve al entrar en Listening (antes de capturar STT). */
    fun playListeningEarcon() {
        Log.i(TAG, "Feedback: listening earcon")
        cancelPending()
        val tg = ensureToneGenerator() ?: return
        runCatching { tg.startTone(ToneGenerator.TONE_PROP_ACK, LISTENING_MS) }
            .onFailure { Log.w(TAG, "No se pudo reproducir earcon: ${it.message}") }
        scheduleRelease(LISTENING_MS + RELEASE_SLACK_MS)
        vibrateBrief()
    }

    /** Tono distinto (doble, más grave) al salir de Listening / entrar en Thinking. */
    fun playThinkingEarcon() {
        Log.i(TAG, "Feedback: thinking earcon")
        cancelPending()
        val tg = ensureToneGenerator() ?: return
        val gen = generation
        runCatching { tg.startTone(ToneGenerator.TONE_PROP_NACK, THINKING_BEEP_MS) }
            .onFailure { Log.w(TAG, "No se pudo reproducir earcon: ${it.message}") }
        mainHandler.postDelayed({
            if (gen != generation) return@postDelayed
            runCatching { tg.startTone(ToneGenerator.TONE_PROP_NACK, THINKING_BEEP_MS) }
        }, THINKING_GAP_MS)
        scheduleRelease(THINKING_GAP_MS.toInt() + THINKING_BEEP_MS + RELEASE_SLACK_MS)
    }

    fun release() {
        cancelPending()
        runCatching { toneGenerator?.release() }
        toneGenerator = null
    }

    private fun ensureToneGenerator(): ToneGenerator? {
        toneGenerator?.let { return it }
        return runCatching {
            ToneGenerator(AudioManager.STREAM_VOICE_CALL, TONE_VOLUME).also { toneGenerator = it }
        }.getOrElse {
            Log.w(TAG, "ToneGenerator no disponible: ${it.message}")
            null
        }
    }

    private fun cancelPending() {
        generation += 1
        mainHandler.removeCallbacksAndMessages(null)
    }

    private fun scheduleRelease(afterMs: Int) {
        val gen = generation
        mainHandler.postDelayed({
            if (gen != generation) return@postDelayed
            runCatching { toneGenerator?.release() }
            toneGenerator = null
        }, afterMs.toLong())
    }

    private fun vibrateBrief() {
        val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            context.getSystemService(VibratorManager::class.java)?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Vibrator::class.java)
        } ?: return
        if (!vibrator.hasVibrator()) return
        runCatching {
            vibrator.vibrate(
                VibrationEffect.createOneShot(VIBRATE_MS, VibrationEffect.DEFAULT_AMPLITUDE),
            )
        }
    }

    companion object {
        private const val TAG = "VoiceFeedback"
        private const val TONE_VOLUME = 80
        /** Duración del ding de Listening (~150–300 ms). Debe caber en STT_RESTART_DELAY_MS. */
        const val LISTENING_MS = 200
        private const val THINKING_BEEP_MS = 90
        private const val THINKING_GAP_MS = 110L
        private const val VIBRATE_MS = 70L
        private const val RELEASE_SLACK_MS = 40
    }
}
