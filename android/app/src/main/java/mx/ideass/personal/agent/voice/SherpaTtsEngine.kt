package mx.ideass.personal.agent.voice

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.os.Handler
import android.os.Looper
import android.util.Log
import mx.ideass.personal.agent.R
import mx.ideass.personal.agent.voice.audio.VoiceAudioPath
import mx.ideass.personal.agent.voice.audio.VoicePlaybackRoute
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

/**
 * TTS neuronal (sherpa-onnx) con streaming de síntesis:
 * [OfflineTts.generateWithCallback] → normalización de pico → PCM → [AudioTrack].
 *
 * La ruta de salida se reevalúa en cada [speak]:
 * - SCO conectado → 16 kHz + USAGE_VOICE_COMMUNICATION
 * - altavoz / A2DP → rate nativo + USAGE_ASSISTANT|MEDIA
 *
 * Init y síntesis fuera del hilo principal.
 */
class SherpaTtsEngine(
    context: Context,
    private val listener: AgentTtsEngine.Listener,
    private val model: NeuralVoiceModel,
    private val routeProvider: () -> VoicePlaybackRoute = { VoicePlaybackRoute.Media },
    speed: Float? = null,
    silenceScale: Float? = null,
    numThreads: Int? = null,
    peakTarget: Float? = null,
    maxGain: Float? = null,
) : AgentTtsEngine {

    private val appContext = context.applicationContext
    private val mainHandler = Handler(Looper.getMainLooper())
    private val synthExecutor = Executors.newSingleThreadExecutor { r ->
        Thread(r, "sherpa-tts-synth").also { it.isDaemon = true }
    }

    private val speed: Float = speed
        ?: appContext.resources.getFloat(R.dimen.sherpa_tts_default_speed)
    private val silenceScale: Float = silenceScale
        ?: appContext.resources.getFloat(R.dimen.sherpa_tts_silence_scale)
    private val numThreads: Int = numThreads
        ?: appContext.resources.getInteger(R.integer.sherpa_tts_num_threads)
    private val peakTarget: Float = peakTarget
        ?: appContext.resources.getFloat(R.dimen.sherpa_tts_peak_target)
    private val maxGain: Float = maxGain
        ?: appContext.resources.getFloat(R.dimen.sherpa_tts_max_gain)
    private val mediaUsage: Int = VoiceAudioPath.mediaUsageFromConfig(
        appContext.getString(R.string.voice_playback_media_usage),
    )

    @Volatile private var ready = false
    @Volatile private var synthesizer: SherpaOfflineSynthesizer? = null
    @Volatile private var playbackTrack: AudioTrack? = null
    private val playGeneration = AtomicInteger(0)
    private val stopRequested = AtomicBoolean(false)
    private val destroyed = AtomicBoolean(false)

    init {
        synthExecutor.execute { loadModel() }
    }

    override val isReady: Boolean get() = ready

    override fun speak(text: String) {
        synthExecutor.execute {
            if (destroyed.get()) return@execute
            val synth = synthesizer
            if (synth == null || !ready) {
                mainHandler.post {
                    listener.onError("La síntesis neuronal no está lista.")
                }
                return@execute
            }
            val spoken = text.trim()
            if (spoken.isEmpty()) {
                mainHandler.post { listener.onDone() }
                return@execute
            }

            stopRequested.set(false)
            val gen = playGeneration.incrementAndGet()
            releaseTrackLocked()

            val route = routeProvider()
            val nativeRate = synth.sampleRateHz
            val playRate = VoiceAudioPath.playSampleRateHz(route, nativeRate)
            val resampler = if (VoiceAudioPath.needsResample(route, nativeRate)) {
                StreamingPcmResampler(nativeRate, playRate)
            } else {
                null
            }

            val track = runCatching { createStreamTrack(playRate, route) }.getOrElse {
                Log.w(TAG, "AudioTrack no disponible: ${it.message}")
                mainHandler.post { listener.onError("Error al hablar la respuesta.") }
                return@execute
            }
            playbackTrack = track
            logAudioTrackConfig(track, route)
            runCatching { track.play() }.onFailure {
                Log.w(TAG, "AudioTrack play falló: ${it.message}")
                releaseTrackLocked()
                mainHandler.post { listener.onError("Error al hablar la respuesta.") }
                return@execute
            }

            Log.i(
                TAG,
                "Sherpa speak: voice=${model.id} route=$route " +
                    "nativeHz=$nativeRate playHz=$playRate " +
                    "speed=$speed peakTarget=$peakTarget maxGain=$maxGain",
            )

            var framesWritten = 0L
            try {
                val result = synth.synthesize(
                    text = spoken,
                    sid = model.defaultSpeakerId,
                    speed = speed,
                ) {
                    // Solo acumula (normalización de pico requiere la frase completa).
                    !stopRequested.get() && gen == playGeneration.get()
                }

                if (gen != playGeneration.get() || stopRequested.get()) return@execute

                if (!result.hasAudibleSignal() && result.samples.isEmpty()) {
                    Log.w(TAG, "Sherpa: síntesis vacía")
                    releaseTrackLocked()
                    mainHandler.post { listener.onError("Error al hablar la respuesta.") }
                    return@execute
                }

                val floatsRaw = result.samples
                val ampRaw = PcmAmplitude.measure(floatsRaw)
                Log.i(TAG, "PCM etapa 1 (sherpa float): ${ampRaw.summary()}")

                val floats = PcmNormalizer.normalizePeak(
                    samples = floatsRaw,
                    targetPeak = peakTarget,
                    maxGain = maxGain,
                )
                val ampNorm = PcmAmplitude.measure(floats)
                Log.i(TAG, "PCM etapa 1b (normalizado): ${ampNorm.summary()}")

                // float→int16 por chunks + resample + write
                val chunk = 4096
                var offset = 0
                var ampInt16Peak = 0f
                var ampResamplePeak = 0f
                while (offset < floats.size) {
                    if (stopRequested.get() || gen != playGeneration.get()) return@execute
                    val end = (offset + chunk).coerceAtMost(floats.size)
                    val slice = floats.copyOfRange(offset, end)
                    val pcm = PcmFloat.toPcm16(slice)
                    val int16Amp = PcmAmplitude.measure(pcm)
                    if (int16Amp.peak > ampInt16Peak) ampInt16Peak = int16Amp.peak
                    val out = resampler?.push(pcm) ?: pcm
                    if (out.isNotEmpty()) {
                        val rAmp = PcmAmplitude.measure(out)
                        if (rAmp.peak > ampResamplePeak) ampResamplePeak = rAmp.peak
                        framesWritten += writeFully(track, out, gen)
                    }
                    offset = end
                }
                resampler?.flush()?.takeIf { it.isNotEmpty() }?.let { tail ->
                    val rAmp = PcmAmplitude.measure(tail)
                    if (rAmp.peak > ampResamplePeak) ampResamplePeak = rAmp.peak
                    framesWritten += writeFully(track, tail, gen)
                }

                Log.i(
                    TAG,
                    "PCM etapa 2 (float→int16 peak≈%.4f / %.1f dBFS) etapa 3 " +
                        "(post-resample peak≈%.4f / %.1f dBFS)".format(
                            ampInt16Peak,
                            PcmAmplitude.toDbFs(ampInt16Peak),
                            ampResamplePeak,
                            PcmAmplitude.toDbFs(ampResamplePeak),
                        ),
                )

                if (gen != playGeneration.get() || stopRequested.get()) return@execute

                waitUntilDrained(track, framesWritten, gen)
                if (gen != playGeneration.get()) return@execute
                releaseTrackLocked()
                mainHandler.post {
                    if (gen == playGeneration.get() && !destroyed.get()) {
                        listener.onDone()
                    }
                }
            } catch (t: Throwable) {
                Log.w(
                    TAG,
                    "Sherpa synthesize falló (runtime nativo; voice=${model.id}): ${t.message}",
                    t,
                )
                releaseTrackLocked()
                if (!destroyed.get()) {
                    mainHandler.post { listener.onError("Error al hablar la respuesta.") }
                }
            }
        }
    }

    override fun stop() {
        stopRequested.set(true)
        playGeneration.incrementAndGet()
        synthExecutor.execute { releaseTrackLocked() }
    }

    override fun destroy() {
        if (!destroyed.compareAndSet(false, true)) return
        ready = false
        stopRequested.set(true)
        playGeneration.incrementAndGet()
        synthExecutor.execute {
            releaseTrackLocked()
            runCatching { synthesizer?.close() }
            synthesizer = null
        }
        synthExecutor.shutdown()
    }

    private fun loadModel() {
        if (destroyed.get()) return
        if (!model.isComplete()) {
            Log.w(
                TAG,
                "Sherpa modelo incompleto (${model.id}): " +
                    "dataDir=${model.dataDir.absolutePath}",
            )
            ready = false
            mainHandler.post {
                if (!destroyed.get()) listener.onReady(false)
            }
            return
        }
        val synth = SherpaOfflineSynthesizer.createOrNull(
            model = model,
            numThreads = numThreads,
            silenceScale = silenceScale,
            debug = false,
        )
        if (synth == null) {
            ready = false
            Log.w(
                TAG,
                "Sherpa init rechazado (${model.id}): rutas inválidas o OfflineTts falló; " +
                    "fallback Android TTS. model=${model.modelFile.absolutePath} " +
                    "tokens=${model.tokensFile.absolutePath} " +
                    "dataDir=${model.dataDir.absolutePath}",
            )
            mainHandler.post {
                if (!destroyed.get()) listener.onReady(false)
            }
            return
        }
        if (destroyed.get()) {
            synth.close()
            return
        }
        synthesizer = synth
        ready = true
        Log.i(
            TAG,
            "Sherpa listo: voice=${model.id} engine=${model.engine} " +
                "hz=${synth.sampleRateHz} speakers=${synth.numSpeakers} " +
                "dataDir=${model.dataDir.absolutePath}",
        )
        mainHandler.post {
            if (!destroyed.get()) listener.onReady(true)
        }
    }

    private fun createStreamTrack(sampleRateHz: Int, route: VoicePlaybackRoute): AudioTrack {
        val format = VoiceAudioPath.pcmMonoFormat(sampleRateHz)
        val minBytes = AudioTrack.getMinBufferSize(
            sampleRateHz,
            AudioFormat.CHANNEL_OUT_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
        ).coerceAtLeast(sampleRateHz / 10 * 2) // ~100 ms
        return AudioTrack.Builder()
            .setAudioAttributes(VoiceAudioPath.attributes(route, mediaUsage))
            .setAudioFormat(format)
            .setBufferSizeInBytes(minBytes * 2)
            .setTransferMode(AudioTrack.MODE_STREAM)
            .build()
            .also { it.setVolume(1f) }
    }

    private fun logAudioTrackConfig(track: AudioTrack, route: VoicePlaybackRoute) {
        val attrs = track.audioAttributes
        val am = appContext.getSystemService(AudioManager::class.java)
        val streamType = when (route) {
            VoicePlaybackRoute.Sco -> AudioManager.STREAM_VOICE_CALL
            VoicePlaybackRoute.Media -> AudioManager.STREAM_MUSIC
        }
        val streamVol = am?.getStreamVolume(streamType)
        val streamMax = am?.getStreamMaxVolume(streamType)
        val streamName = when (route) {
            VoicePlaybackRoute.Sco -> "STREAM_VOICE_CALL"
            VoicePlaybackRoute.Media -> "STREAM_MUSIC"
        }
        Log.i(
            TAG,
            "AudioTrack: route=$route usage=${usageName(attrs.usage)} " +
                "contentType=${contentTypeName(attrs.contentType)} " +
                "trackVolume=1.0 (setVolume) " +
                "$streamName=$streamVol/$streamMax " +
                "sampleRate=${track.sampleRate}",
        )
    }

    /** @return frames (samples mono) escritos. */
    private fun writeFully(track: AudioTrack, pcm: ShortArray, gen: Int): Long {
        var offset = 0
        var writtenTotal = 0
        while (offset < pcm.size) {
            if (stopRequested.get() || gen != playGeneration.get()) {
                return writtenTotal.toLong()
            }
            val written = track.write(pcm, offset, pcm.size - offset)
            if (written < 0) {
                Log.w(TAG, "AudioTrack write error=$written")
                return writtenTotal.toLong()
            }
            if (written == 0) {
                try {
                    Thread.sleep(5)
                } catch (_: InterruptedException) {
                    return writtenTotal.toLong()
                }
            } else {
                offset += written
                writtenTotal += written
            }
        }
        return writtenTotal.toLong()
    }

    private fun waitUntilDrained(track: AudioTrack, framesWritten: Long, gen: Int) {
        if (framesWritten <= 0L) return
        val rate = track.sampleRate.coerceAtLeast(1)
        val deadline = System.currentTimeMillis() +
            (framesWritten * 1000L / rate) + PLAYBACK_SLACK_MS
        while (System.currentTimeMillis() < deadline) {
            if (stopRequested.get() || gen != playGeneration.get()) return
            val head = track.playbackHeadPosition.toLong() and 0xffffffffL
            if (head >= framesWritten) return
            try {
                Thread.sleep(20)
            } catch (_: InterruptedException) {
                return
            }
        }
    }

    private fun releaseTrackLocked() {
        val track = playbackTrack
        playbackTrack = null
        if (track == null) return
        runCatching {
            if (track.playState == AudioTrack.PLAYSTATE_PLAYING) track.pause()
            track.flush()
            track.stop()
        }
        runCatching { track.release() }
    }

    companion object {
        private const val TAG = "SherpaTtsEngine"
        private const val PLAYBACK_SLACK_MS = 60L

        private fun usageName(usage: Int): String = when (usage) {
            AudioAttributes.USAGE_VOICE_COMMUNICATION -> "VOICE_COMMUNICATION"
            AudioAttributes.USAGE_ASSISTANT -> "ASSISTANT"
            AudioAttributes.USAGE_MEDIA -> "MEDIA"
            else -> "usage=$usage"
        }

        private fun contentTypeName(contentType: Int): String = when (contentType) {
            AudioAttributes.CONTENT_TYPE_SPEECH -> "SPEECH"
            AudioAttributes.CONTENT_TYPE_MUSIC -> "MUSIC"
            else -> "contentType=$contentType"
        }
    }
}
