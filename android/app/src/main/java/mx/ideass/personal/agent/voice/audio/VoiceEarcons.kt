package mx.ideass.personal.agent.voice.audio

import android.content.Context
import android.media.AudioTrack
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
import kotlin.math.PI
import kotlin.math.min
import kotlin.math.sin

/**
 * Lenguaje de earcons del asistente. Ondas sinusoidales por [AudioTrack] con
 * envolvente suave (attack ~10 ms, release ~80 ms) y notas de la escala
 * pentatónica de Do mayor.
 *
 * Mismo path que el TTS: [VoiceAudioPath] (16 kHz, USAGE_VOICE_COMMUNICATION)
 * para no forzar createOrUpdatePatch al alternar earcon ↔ voz.
 */
@Singleton
class VoiceEarcons @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private val mainHandler = Handler(Looper.getMainLooper())
    private var track: AudioTrack? = null
    private var generation = 0

    /** Dos notas ascendentes Mi→Sol: listo para escuchar. */
    fun playListening(): Long {
        Log.i(TAG, "Earcon: listening")
        val duration = playNotes(
            Note(MI, NOTE_LISTENING_MS),
            Note(SOL, NOTE_LISTENING_MS),
            gapMs = GAP_FAST_MS,
        )
        vibrateBrief()
        return duration
    }

    /** Nota Sol sola, suave: te escuché, procesando. */
    fun playThinking(): Long {
        Log.i(TAG, "Earcon: thinking")
        return playNotes(Note(SOL, NOTE_THINKING_MS))
    }

    /**
     * Espejo de listening, pero con caída marcada: Sol→Do.
     * La segunda nota es más grave, un poco más larga y con release largo
     * para apagarse suave.
     */
    fun playTimeout(): Long {
        Log.i(TAG, "Earcon: timeout")
        return playNotes(
            Note(SOL, NOTE_LISTENING_MS, ampScale = 1f),
            Note(
                DO,
                NOTE_TIMEOUT_SECOND_MS,
                ampScale = TIMEOUT_FADE_AMP,
                releaseMs = TIMEOUT_TAIL_RELEASE_MS,
            ),
            gapMs = GAP_FAST_MS,
        )
    }

    /** Una nota Do seca: cierre manual / toggle. */
    fun playCloseManual(): Long {
        Log.i(TAG, "Earcon: close")
        return playNotes(Note(DO, NOTE_CLOSE_MS))
    }

    /** Acorde arpegiado Do-Mi-Sol ascendente rápido: respuesta lista. */
    fun playSuccess(): Long {
        Log.i(TAG, "Earcon: success")
        return playNotes(
            Note(DO, NOTE_SUCCESS_MS),
            Note(MI, NOTE_SUCCESS_MS),
            Note(SOL, NOTE_SUCCESS_MS),
            gapMs = GAP_SUCCESS_MS,
        )
    }

    /** Dos notas La→Fa# levemente disonantes, suaves: error. */
    fun playError(): Long {
        Log.i(TAG, "Earcon: error")
        return playNotes(
            Note(LA, NOTE_ERROR_MS),
            Note(FA_SHARP, NOTE_ERROR_MS),
            gapMs = GAP_ERROR_MS,
        )
    }

    fun release() {
        generation += 1
        mainHandler.removeCallbacksAndMessages(null)
        stopTrack()
    }

    private fun playNotes(vararg notes: Note, gapMs: Int = 0): Long {
        generation += 1
        val gen = generation
        mainHandler.removeCallbacksAndMessages(null)
        stopTrack()

        val pcm = buildPcm(notes.toList(), gapMs)
        val durationMs = pcmDurationMs(pcm.size)
        val created = runCatching { createTrack(pcm.size) }.getOrElse {
            Log.w(TAG, "AudioTrack no disponible: ${it.message}")
            return 0L
        }
        track = created
        Log.i(TAG, "Earcon: sample rate = ${VoiceAudioPath.SAMPLE_RATE_HZ}")
        val written = created.write(pcm, 0, pcm.size)
        if (written < 0) {
            Log.w(TAG, "AudioTrack write falló: $written")
            stopTrack()
            return 0L
        }
        runCatching { created.play() }
            .onFailure {
                Log.w(TAG, "AudioTrack play falló: ${it.message}")
                stopTrack()
                return 0L
            }
        mainHandler.postDelayed({
            if (gen != generation) return@postDelayed
            stopTrack()
        }, durationMs + RELEASE_SLACK_MS)
        return durationMs
    }

    private fun createTrack(pcmShorts: Int): AudioTrack {
        val bytes = pcmShorts * 2
        return AudioTrack.Builder()
            .setAudioAttributes(VoiceAudioPath.attributes())
            .setAudioFormat(VoiceAudioPath.pcmMonoFormat())
            .setBufferSizeInBytes(bytes.coerceAtLeast(VoiceAudioPath.minBufferBytes()))
            .setTransferMode(AudioTrack.MODE_STATIC)
            .build()
            .also { it.setVolume(VOLUME) }
    }

    private fun buildPcm(notes: List<Note>, gapMs: Int): ShortArray {
        val chunks = ArrayList<ShortArray>(notes.size * 2)
        notes.forEachIndexed { index, note ->
            chunks.add(sine(note.hz, note.ms, note.ampScale, note.releaseMs))
            if (index < notes.lastIndex && gapMs > 0) {
                chunks.add(silence(gapMs))
            }
        }
        val total = chunks.sumOf { it.size }
        val out = ShortArray(total)
        var offset = 0
        for (chunk in chunks) {
            chunk.copyInto(out, offset)
            offset += chunk.size
        }
        return out
    }

    /** Seno con ADSR simple: attack ~10 ms, release ~80 ms (o [releaseMs] si se pide). */
    private fun sine(
        hz: Float,
        durationMs: Int,
        ampScale: Float = 1f,
        releaseMs: Int? = null,
    ): ShortArray {
        val n = (SAMPLE_RATE * durationMs / 1000).coerceAtLeast(1)
        val out = ShortArray(n)
        val amp = AMPLITUDE * ampScale.coerceIn(0.05f, 1f)
        val attack = min(ATTACK_SAMPLES, n / 4).coerceAtLeast(1)
        val release = if (releaseMs != null) {
            // Release largo dentro de la misma duración de nota (sin alargar el earcon).
            (SAMPLE_RATE * releaseMs / 1000).coerceIn(1, (n - attack).coerceAtLeast(1))
        } else {
            min(RELEASE_SAMPLES, n / 2).coerceAtLeast(1)
        }
        for (i in 0 until n) {
            val env = when {
                i < attack -> i.toFloat() / attack
                i >= n - release -> (n - 1 - i).toFloat() / release
                else -> 1f
            }
            val sample = (sin(2.0 * PI * hz * i / SAMPLE_RATE) * amp * env).toInt()
            out[i] = sample.coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt()).toShort()
        }
        return out
    }

    private fun silence(durationMs: Int): ShortArray {
        val n = SAMPLE_RATE * durationMs / 1000
        return ShortArray(n.coerceAtLeast(0))
    }

    private fun pcmDurationMs(shorts: Int): Long =
        (shorts * 1000L / SAMPLE_RATE).coerceAtLeast(1L)

    private fun stopTrack() {
        val t = track ?: return
        track = null
        runCatching {
            if (t.playState == AudioTrack.PLAYSTATE_PLAYING) t.stop()
        }
        runCatching { t.release() }
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

    private data class Note(
        val hz: Float,
        val ms: Int,
        val ampScale: Float = 1f,
        val releaseMs: Int? = null,
    )

    companion object {
        private const val TAG = "VoiceEarcons"
        private const val SAMPLE_RATE = VoiceAudioPath.SAMPLE_RATE_HZ
        private const val AMPLITUDE = 10_000.0
        private const val VOLUME = 1f
        /** Segunda nota del timeout (~70 %) para sensación de apagarse. */
        private const val TIMEOUT_FADE_AMP = 0.70f
        /** Release de la última nota del timeout (~140 ms dentro de su duración). */
        private const val TIMEOUT_TAIL_RELEASE_MS = 140

        // Escala pentatónica de Do mayor (Hz).
        private const val DO = 523f
        private const val MI = 659f
        private const val SOL = 784f
        private const val LA = 880f
        /** Fa♯₅ ≈ 740 Hz — leve disonancia con La. */
        private const val FA_SHARP = 740f

        private const val ATTACK_SAMPLES = SAMPLE_RATE * 10 / 1000 // ~10 ms
        private const val RELEASE_SAMPLES = SAMPLE_RATE * 80 / 1000 // ~80 ms

        private const val NOTE_LISTENING_MS = 130
        /** Segunda nota del timeout: un poco más larga para asentar la caída. */
        private const val NOTE_TIMEOUT_SECOND_MS = 240
        private const val NOTE_THINKING_MS = 150
        private const val NOTE_CLOSE_MS = 150
        private const val NOTE_SUCCESS_MS = 90
        private const val NOTE_ERROR_MS = 140
        private const val GAP_FAST_MS = 35
        private const val GAP_SUCCESS_MS = 25
        private const val GAP_ERROR_MS = 45

        /** listening: 130 + 35 + 130 */
        const val LISTENING_MS = 295L
        /** timeout: 130 + 35 + 240 */
        const val TIMEOUT_MS = 405L
        const val CLOSE_MANUAL_MS = 150L
        /** success: 90 + 25 + 90 + 25 + 90 */
        const val SUCCESS_MS = 320L
        /** error: 140 + 45 + 140 */
        const val ERROR_MS = 325L
        /** Margen mínimo tras earcon de cierre antes de soltar SCO. */
        const val SCO_HOLD_AFTER_CLOSE_MS = 450L

        private const val VIBRATE_MS = 70L
        private const val RELEASE_SLACK_MS = 40L
    }
}
