package mx.ideass.personal.agent.voice

import android.content.Context
import android.media.AudioTrack
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import mx.ideass.personal.agent.R
import mx.ideass.personal.agent.voice.audio.VoiceAudioPath
import mx.ideass.personal.agent.voice.audio.VoicePlaybackRoute
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
 * TTS → WAV → [AudioTrack] según ruta activa.
 *
 * - SCO: resample a 16 kHz + USAGE_VOICE_COMMUNICATION.
 * - Media (altavoz/A2DP): rate del WAV + USAGE_ASSISTANT|MEDIA.
 *
 * [TextToSpeech.speak] abre un AudioTrack interno a ~48 kHz y fuerza
 * createOrUpdatePatch contra el sink SCO (16 kHz), cortando ~1 s.
 * Aquí controlamos el sample rate de reproducción.
 *
 * Motor/voz: preferencias opcionales; si fallan, cae al default del sistema.
 * Fallback de [SherpaTtsEngine] cuando no hay modelo neuronal o falla el init.
 */
class TtsEngine(
    context: Context,
    private val listener: AgentTtsEngine.Listener,
    preferredEnginePackage: String? = null,
    preferredVoiceName: String? = null,
    private val routeProvider: () -> VoicePlaybackRoute = { VoicePlaybackRoute.Media },
) : AgentTtsEngine {

    private val appContext = context.applicationContext
    private val mainHandler = Handler(Looper.getMainLooper())
    private val playExecutor = Executors.newSingleThreadExecutor()
    private var tts: TextToSpeech? = null
    private var ready = false
    private val requestedEnginePackage = preferredEnginePackage?.trim()?.takeIf { it.isNotEmpty() }
    private val requestedVoiceName = preferredVoiceName?.trim()?.takeIf { it.isNotEmpty() }
    /** Package con el que pedimos el bind actual (null = constructor de 2 args). */
    private var boundEnginePackage: String? = null
    private var usingSystemFallback = false
    private var synthesizeFallbackTried = false
    @Volatile private var currentUtteranceId: String? = null
    @Volatile private var pendingSpeakText: String? = null
    private var playbackTrack: AudioTrack? = null
    private val playGeneration = AtomicInteger(0)
    private val cacheFile = File(appContext.cacheDir, "tts_sco_utterance.wav")
    private val mediaUsage: Int = VoiceAudioPath.mediaUsageFromConfig(
        appContext.getString(R.string.voice_playback_media_usage),
    )

    init {
        bindEngine(requestedEnginePackage, isFallback = false)
    }

    override val isReady: Boolean get() = ready

    override fun speak(text: String) {
        mainHandler.post {
            val engine = tts
            if (engine == null || !ready) {
                listener.onError("La síntesis de voz no está disponible en este dispositivo.")
                return@post
            }
            stopPlayback()
            val id = UUID.randomUUID().toString()
            currentUtteranceId = id
            pendingSpeakText = text
            runCatching { cacheFile.delete() }
            val result = engine.synthesizeToFile(text, Bundle(), cacheFile, id)
            if (result != TextToSpeech.SUCCESS) {
                Log.w(TAG, "TTS: synthesizeToFile rechazado result=$result")
                maybeFallbackAndRetrySpeak(text)
            }
        }
    }

    override fun stop() {
        mainHandler.post {
            currentUtteranceId = null
            pendingSpeakText = null
            runCatching { tts?.stop() }
            stopPlayback()
        }
    }

    override fun destroy() {
        mainHandler.post {
            currentUtteranceId = null
            pendingSpeakText = null
            ready = false
            stopPlayback()
            shutdownEngine()
            playExecutor.shutdownNow()
            runCatching { cacheFile.delete() }
        }
    }

    private fun bindEngine(enginePackage: String?, isFallback: Boolean) {
        shutdownEngine()
        ready = false
        usingSystemFallback = isFallback || enginePackage.isNullOrBlank()
        boundEnginePackage = enginePackage?.takeIf { it.isNotEmpty() }
        val callback = TextToSpeech.OnInitListener { status ->
            mainHandler.post { onEngineInit(status) }
        }
        tts = if (!enginePackage.isNullOrBlank()) {
            Log.i(TAG, "TTS: bind engine=$enginePackage fallback=$isFallback")
            TextToSpeech(appContext, callback, enginePackage)
        } else {
            Log.i(TAG, "TTS: bind motor del sistema fallback=$isFallback")
            TextToSpeech(appContext, callback)
        }
    }

    private fun onEngineInit(status: Int) {
        val engine = tts
        if (engine == null) {
            listener.onReady(false)
            return
        }
        if (status != TextToSpeech.SUCCESS) {
            Log.w(
                TAG,
                "TTS: onInit status=$status requested=${requestedEnginePackage ?: "(sistema)"} " +
                    "bound=${boundEnginePackage ?: "(sistema)"}",
            )
            if (!usingSystemFallback && !requestedEnginePackage.isNullOrBlank()) {
                Log.w(TAG, "TTS: fallback → motor del sistema (init falló)")
                bindEngine(null, isFallback = true)
                return
            }
            ready = false
            listener.onReady(false)
            return
        }

        val voiceApplied = applyPreferredVoice(engine)
        if (!voiceApplied) {
            val locale = preferredLocale(engine)
            val result = engine.setLanguage(locale)
            if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                Log.w(TAG, "Idioma $locale no soportado por TTS")
                if (!usingSystemFallback && !requestedEnginePackage.isNullOrBlank()) {
                    Log.w(TAG, "TTS: fallback → motor del sistema (idioma no soportado)")
                    bindEngine(null, isFallback = true)
                    return
                }
                ready = false
                listener.onReady(false)
                return
            }
        }

        // Atributos del sintetizador interno: se reevalúan al reproducir el WAV.
        engine.setAudioAttributes(
            VoiceAudioPath.attributes(routeProvider(), mediaUsage),
        )
        engine.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) = Unit

            override fun onDone(utteranceId: String?) {
                if (utteranceId == null || utteranceId != currentUtteranceId) return
                playExecutor.execute { playSynthesizedFile(utteranceId) }
            }

            @Deprecated("Deprecated in Java")
            override fun onError(utteranceId: String?) {
                mainHandler.post { onSynthesizeError() }
            }

            override fun onError(utteranceId: String?, errorCode: Int) {
                Log.w(TAG, "TTS: onError utterance errorCode=$errorCode")
                mainHandler.post { onSynthesizeError() }
            }
        })

        ready = true
        logBoundEngine(engine)
        val pending = pendingSpeakText
        if (pending != null && synthesizeFallbackTried) {
            // Reintento tras fallback de síntesis.
            speak(pending)
        } else {
            listener.onReady(true)
        }
    }

    private fun applyPreferredVoice(engine: TextToSpeech): Boolean {
        val voices = runCatching { engine.voices }.getOrNull().orEmpty()
        if (voices.isEmpty()) {
            Log.i(TAG, "TTS: getVoices() vacío; usando setLanguage")
            return false
        }
        val byName = voices.associateBy { it.name }
        val localeTags = voices.associate { it.name to it.locale.toLanguageTag() }
        val resolve = TtsVoicePolicy.resolveVoiceName(
            availableNames = byName.keys,
            preferredName = requestedVoiceName,
            localeTagsByName = localeTags,
        )
        if (resolve.fellBack) {
            Log.w(
                TAG,
                "TTS: voz preferida ausente name=$requestedVoiceName → " +
                    (resolve.voiceName ?: "setLanguage"),
            )
        }
        val name = resolve.voiceName ?: return false
        val voice = byName[name] ?: return false
        val ok = engine.setVoice(voice) == TextToSpeech.SUCCESS
        if (!ok) {
            Log.w(TAG, "TTS: setVoice falló name=$name")
        }
        return ok
    }

    private fun logBoundEngine(engine: TextToSpeech) {
        val systemDefault = runCatching { engine.defaultEngine }.getOrNull()
        val voice = runCatching { engine.voice }.getOrNull()
        Log.i(
            TAG,
            "TTS bind OK: requested=${requestedEnginePackage ?: "(sistema)"} " +
                "bound=${boundEnginePackage ?: "(sistema)"} " +
                "systemDefault=$systemDefault " +
                "fallback=$usingSystemFallback " +
                "voice=${voice?.name} locale=${voice?.locale?.toLanguageTag()} " +
                "routeProvider=dynamic",
        )
    }

    private fun onSynthesizeError() {
        val text = pendingSpeakText
        if (text != null && maybeFallbackAndRetrySpeak(text)) return
        listener.onError("Error al hablar la respuesta.")
    }

    /** @return true si se inició un rebind/reintento. */
    private fun maybeFallbackAndRetrySpeak(text: String): Boolean {
        if (synthesizeFallbackTried || usingSystemFallback) {
            pendingSpeakText = null
            listener.onError("No se pudo iniciar la síntesis de voz.")
            return false
        }
        synthesizeFallbackTried = true
        pendingSpeakText = text
        ready = false
        Log.w(TAG, "TTS: fallback → motor del sistema (síntesis falló)")
        bindEngine(null, isFallback = true)
        return true
    }

    private fun shutdownEngine() {
        val engine = tts
        tts = null
        if (engine != null) {
            runCatching { engine.stop() }
            runCatching { engine.shutdown() }
        }
    }

    private fun playSynthesizedFile(utteranceId: String) {
        if (utteranceId != currentUtteranceId) return
        val retryText = pendingSpeakText
        val wav = runCatching { readWavPcm(cacheFile) }.getOrElse {
            Log.w(TAG, "No se pudo leer WAV TTS: ${it.message}")
            mainHandler.post {
                pendingSpeakText = retryText
                onSynthesizeError()
            }
            return
        }
        pendingSpeakText = null
        val route = routeProvider()
        Log.i(TAG, "TTS: engine sample rate = ${wav.sampleRateHz} route=$route")
        val mono = toMono(wav.pcm, wav.channels)
        val playRate = VoiceAudioPath.playSampleRateHz(route, wav.sampleRateHz)
        val pcm = if (VoiceAudioPath.needsResample(route, wav.sampleRateHz)) {
            resampleToScoMono(mono, wav.sampleRateHz, channels = 1)
        } else {
            mono
        }
        Log.i(TAG, "TTS: playback sample rate = $playRate")
        if (utteranceId != currentUtteranceId) return

        val gen = playGeneration.incrementAndGet()
        val track = runCatching { createPlaybackTrack(pcm.size, playRate, route) }.getOrElse {
            Log.w(TAG, "AudioTrack no disponible: ${it.message}")
            mainHandler.post { listener.onError("Error al hablar la respuesta.") }
            return
        }
        synchronized(this) {
            releaseTrack(playbackTrack)
            playbackTrack = track
        }

        val written = track.write(pcm, 0, pcm.size)
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

        val durationMs = pcm.size * 1000L / playRate.coerceAtLeast(1)
        mainHandler.postDelayed({
            if (utteranceId != currentUtteranceId) return@postDelayed
            if (gen != playGeneration.get()) return@postDelayed
            stopPlayback()
            listener.onDone()
        }, durationMs + PLAYBACK_SLACK_MS)
    }

    private fun createPlaybackTrack(
        pcmShorts: Int,
        sampleRateHz: Int,
        route: VoicePlaybackRoute,
    ): AudioTrack {
        val bytes = pcmShorts * 2
        return AudioTrack.Builder()
            .setAudioAttributes(VoiceAudioPath.attributes(route, mediaUsage))
            .setAudioFormat(VoiceAudioPath.pcmMonoFormat(sampleRateHz))
            .setBufferSizeInBytes(
                bytes.coerceAtLeast(VoiceAudioPath.minBufferBytes(sampleRateHz)),
            )
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
        for (locale in TtsVoicePolicy.preferredLocales()) {
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
    private fun toMono(pcm: ShortArray, channels: Int): ShortArray {
        if (channels <= 1) return pcm
        val frames = pcm.size / channels
        return ShortArray(frames) { i ->
            var sum = 0
            for (c in 0 until channels) {
                sum += pcm[i * channels + c].toInt()
            }
            (sum / channels).toShort()
        }
    }

    private fun resampleToScoMono(pcm: ShortArray, srcRate: Int, channels: Int): ShortArray {
        val mono = toMono(pcm, channels)
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
