package mx.ideass.personal.agent.voice

import android.content.Context
import android.media.AudioTrack
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import mx.ideass.personal.agent.voice.audio.VoiceAudioPath
import java.io.File
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.Locale
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger
import kotlin.math.min

/**
 * TTS del sistema → WAV → resample a 16 kHz → [AudioTrack] por el path SCO.
 *
 * [TextToSpeech.speak] abre un AudioTrack interno a ~48 kHz y fuerza
 * createOrUpdatePatch contra el sink SCO (16 kHz), cortando ~1 s.
 * Aquí controlamos el sample rate de reproducción.
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

    private val appContext = context.applicationContext
    private val mainHandler = Handler(Looper.getMainLooper())
    private val playExecutor = Executors.newSingleThreadExecutor()
    private var tts: TextToSpeech? = null
    private var ready = false
    @Volatile private var currentUtteranceId: String? = null
    private var playbackTrack: AudioTrack? = null
    private val playGeneration = AtomicInteger(0)
    private val cacheFile = File(appContext.cacheDir, "tts_sco_utterance.wav")

    init {
        tts = TextToSpeech(appContext) { status ->
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
                engine.setAudioAttributes(VoiceAudioPath.attributes())
                engine.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                    override fun onStart(utteranceId: String?) = Unit

                    override fun onDone(utteranceId: String?) {
                        if (utteranceId == null || utteranceId != currentUtteranceId) return
                        playExecutor.execute { playSynthesizedFile(utteranceId) }
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
                Log.i(TAG, "TTS: sample rate = ${VoiceAudioPath.SAMPLE_RATE_HZ} (playback SCO)")
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
            stopPlayback()
            val id = UUID.randomUUID().toString()
            currentUtteranceId = id
            runCatching { cacheFile.delete() }
            val result = engine.synthesizeToFile(text, Bundle(), cacheFile, id)
            if (result != TextToSpeech.SUCCESS) {
                listener.onError("No se pudo iniciar la síntesis de voz.")
            }
        }
    }

    fun stop() {
        mainHandler.post {
            currentUtteranceId = null
            runCatching { tts?.stop() }
            stopPlayback()
        }
    }

    fun destroy() {
        mainHandler.post {
            currentUtteranceId = null
            val engine = tts
            tts = null
            ready = false
            stopPlayback()
            if (engine != null) {
                runCatching { engine.stop() }
                runCatching { engine.shutdown() }
            }
            playExecutor.shutdownNow()
            runCatching { cacheFile.delete() }
        }
    }

    private fun playSynthesizedFile(utteranceId: String) {
        if (utteranceId != currentUtteranceId) return
        val wav = runCatching { readWavPcm(cacheFile) }.getOrElse {
            Log.w(TAG, "No se pudo leer WAV TTS: ${it.message}")
            mainHandler.post { listener.onError("Error al hablar la respuesta.") }
            return
        }
        Log.i(TAG, "TTS: engine sample rate = ${wav.sampleRateHz}")
        val pcm16k = resampleToScoMono(wav.pcm, wav.sampleRateHz, wav.channels)
        Log.i(TAG, "TTS: sample rate = ${VoiceAudioPath.SAMPLE_RATE_HZ}")
        if (utteranceId != currentUtteranceId) return

        val gen = playGeneration.incrementAndGet()
        val track = runCatching { createScoTrack(pcm16k.size) }.getOrElse {
            Log.w(TAG, "AudioTrack no disponible: ${it.message}")
            mainHandler.post { listener.onError("Error al hablar la respuesta.") }
            return
        }
        synchronized(this) {
            releaseTrack(playbackTrack)
            playbackTrack = track
        }

        val written = track.write(pcm16k, 0, pcm16k.size)
        if (written < 0) {
            Log.w(TAG, "AudioTrack write falló: $written")
            synchronized(this) { releaseTrack(track); if (playbackTrack === track) playbackTrack = null }
            mainHandler.post { listener.onError("Error al hablar la respuesta.") }
            return
        }
        runCatching { track.play() }.onFailure {
            Log.w(TAG, "AudioTrack play falló: ${it.message}")
            synchronized(this) { releaseTrack(track); if (playbackTrack === track) playbackTrack = null }
            mainHandler.post { listener.onError("Error al hablar la respuesta.") }
            return
        }

        val durationMs = pcm16k.size * 1000L / VoiceAudioPath.SAMPLE_RATE_HZ
        mainHandler.postDelayed({
            if (utteranceId != currentUtteranceId) return@postDelayed
            if (gen != playGeneration.get()) return@postDelayed
            stopPlayback()
            listener.onDone()
        }, durationMs + PLAYBACK_SLACK_MS)
    }

    private fun createScoTrack(pcmShorts: Int): AudioTrack {
        val bytes = pcmShorts * 2
        return AudioTrack.Builder()
            .setAudioAttributes(VoiceAudioPath.attributes())
            .setAudioFormat(VoiceAudioPath.pcmMonoFormat())
            .setBufferSizeInBytes(bytes.coerceAtLeast(VoiceAudioPath.minBufferBytes()))
            .setTransferMode(AudioTrack.MODE_STATIC)
            .build()
            .also { it.setVolume(1f) }
    }

    private fun stopPlayback() {
        playGeneration.incrementAndGet()
        synchronized(this) {
            releaseTrack(playbackTrack)
            playbackTrack = null
        }
    }

    private fun releaseTrack(track: AudioTrack?) {
        if (track == null) return
        runCatching {
            if (track.playState == AudioTrack.PLAYSTATE_PLAYING) track.stop()
        }
        runCatching { track.release() }
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

    private data class WavPcm(
        val pcm: ShortArray,
        val sampleRateHz: Int,
        val channels: Int,
    )

    private fun readWavPcm(file: File): WavPcm {
        RandomAccessFile(file, "r").use { raf ->
            val header = ByteArray(12)
            raf.readFully(header)
            require(String(header, 0, 4) == "RIFF") { "No es RIFF" }
            require(String(header, 8, 4) == "WAVE") { "No es WAVE" }

            var sampleRate = VoiceAudioPath.SAMPLE_RATE_HZ
            var channels = 1
            var bitsPerSample = 16
            var data: ByteArray? = null

            while (raf.filePointer < raf.length()) {
                val chunkIdBytes = ByteArray(4)
                if (raf.read(chunkIdBytes) < 4) break
                val chunkSizeBuf = ByteArray(4)
                raf.readFully(chunkSizeBuf)
                val chunkSize = ByteBuffer.wrap(chunkSizeBuf).order(ByteOrder.LITTLE_ENDIAN).int.toLong() and 0xffffffffL
                val chunkId = String(chunkIdBytes)
                when (chunkId) {
                    "fmt " -> {
                        val fmt = ByteArray(chunkSize.toInt().coerceAtLeast(16))
                        raf.readFully(fmt, 0, min(fmt.size, chunkSize.toInt()))
                        if (chunkSize > fmt.size) raf.skipBytes((chunkSize - fmt.size).toInt())
                        val bb = ByteBuffer.wrap(fmt).order(ByteOrder.LITTLE_ENDIAN)
                        bb.short
                        channels = bb.short.toInt() and 0xffff
                        sampleRate = bb.int
                        bb.int
                        bb.short
                        bitsPerSample = bb.short.toInt() and 0xffff
                    }
                    "data" -> {
                        val bytes = ByteArray(chunkSize.toInt())
                        raf.readFully(bytes)
                        data = bytes
                    }
                    else -> raf.skipBytes(chunkSize.toInt())
                }
                if (chunkSize % 2L == 1L && raf.filePointer < raf.length()) {
                    raf.skipBytes(1)
                }
            }

            val raw = data ?: error("WAV sin chunk data")
            require(bitsPerSample == 16) { "Solo PCM 16-bit (bits=$bitsPerSample)" }
            val shorts = ShortArray(raw.size / 2)
            ByteBuffer.wrap(raw).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer().get(shorts)
            return WavPcm(shorts, sampleRate, channels.coerceAtLeast(1))
        }
    }

    /** Mono 16 kHz para el sink SCO. 48 kHz → decimación exacta ×3. */
    private fun resampleToScoMono(pcm: ShortArray, srcRate: Int, channels: Int): ShortArray {
        val mono = if (channels <= 1) {
            pcm
        } else {
            val frames = pcm.size / channels
            ShortArray(frames) { i ->
                var sum = 0
                for (c in 0 until channels) {
                    sum += pcm[i * channels + c].toInt()
                }
                (sum / channels).toShort()
            }
        }
        if (srcRate == VoiceAudioPath.SAMPLE_RATE_HZ || srcRate <= 0) return mono

        if (srcRate % VoiceAudioPath.SAMPLE_RATE_HZ == 0) {
            val factor = srcRate / VoiceAudioPath.SAMPLE_RATE_HZ
            val outLen = mono.size / factor
            return ShortArray(outLen) { i -> mono[i * factor] }
        }

        val outLen = (mono.size.toLong() * VoiceAudioPath.SAMPLE_RATE_HZ / srcRate)
            .toInt()
            .coerceAtLeast(1)
        return ShortArray(outLen) { i ->
            val srcIndex = i.toDouble() * srcRate / VoiceAudioPath.SAMPLE_RATE_HZ
            val i0 = srcIndex.toInt().coerceIn(0, mono.lastIndex)
            val i1 = (i0 + 1).coerceAtMost(mono.lastIndex)
            val frac = (srcIndex - i0).toFloat()
            ((mono[i0] * (1f - frac) + mono[i1] * frac).toInt()).toShort()
        }
    }

    companion object {
        private const val TAG = "TtsEngine"
        private const val PLAYBACK_SLACK_MS = 40L
    }
}
