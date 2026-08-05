package mx.ideass.personal.agent.voice

import android.util.Log
import com.k2fsa.sherpa.onnx.GenerationConfig
import com.k2fsa.sherpa.onnx.OfflineTts
import com.k2fsa.sherpa.onnx.OfflineTtsConfig
import kotlin.jvm.functions.Function1

/**
 * Carga un [NeuralVoiceModel] en [OfflineTts] y sintetiza.
 *
 * Piper/Kokoro: [OfflineTts.generateWithCallback] (streaming por chunks).
 * Supertonic: [OfflineTts.generateWithConfigAndCallback] con `extra["lang"]`
 * (idioma aparte del sid).
 *
 * Debe usarse fuera del hilo principal. Fallos del runtime nativo
 * (JNI / Error) se atrapan y se reportan como null o excepción controlada
 * para que el caller haga fallback a Android TTS.
 */
class SherpaOfflineSynthesizer private constructor(
    private val model: NeuralVoiceModel,
    private val tts: OfflineTts?,
    private val testStub: Boolean = false,
) : AutoCloseable {

    val sampleRateHz: Int
        get() = if (testStub) {
            model.sampleRateHz
        } else {
            tts!!.sampleRate().takeIf { it > 0 } ?: model.sampleRateHz
        }

    val numSpeakers: Int get() = if (testStub) 1 else tts!!.numSpeakers()

    /**
     * Sintetiza [text]. [onChunk] recibe cada bloque float PCM; devolver false
     * cancela la generación restante.
     *
     * [language] solo aplica a Supertonic (`extra["lang"]`); si es null se usa
     * el del modelo con el que se creó el sintetizador. Permite reutilizar un
     * OfflineTts cacheado al cambiar de idioma/speaker del mismo paquete.
     *
     * @throws SherpaRuntimeException si el runtime nativo falla (no crash).
     */
    fun synthesize(
        text: String,
        sid: Int = model.defaultSpeakerId,
        speed: Float = 1.0f,
        language: String? = null,
        onChunk: ((FloatArray) -> Boolean)? = null,
    ): SherpaSynthResult {
        require(text.isNotBlank()) { "Texto vacío" }
        if (testStub) {
            error("createTestStub no sintetiza; solo para tests de cache")
        }
        return try {
            val accumulator = SherpaSynthChunkAccumulator()
            val callback = jniChunkCallback(onChunk, accumulator)
            val audio = when (model.engine) {
                NeuralVoiceEngine.Supertonic -> {
                    val lang = (language ?: model.language).ifBlank { "es" }
                    val gen = GenerationConfig(
                        sid = sid,
                        speed = speed,
                        extra = mapOf("lang" to lang),
                    )
                    tts!!.generateWithConfigAndCallback(
                        text = text,
                        config = gen,
                        callback = callback,
                    )
                }
                NeuralVoiceEngine.Piper, NeuralVoiceEngine.Kokoro ->
                    tts!!.generateWithCallback(
                        text = text,
                        sid = sid,
                        speed = speed,
                        callback = callback,
                    )
            }
            val rate = audio.sampleRate.takeIf { it > 0 } ?: sampleRateHz
            // Preferimos lo acumulado por callback para validar el path de streaming.
            val fromCallback = accumulator.build(rate)
            if (fromCallback.samples.isNotEmpty()) {
                fromCallback
            } else {
                SherpaSynthResult(
                    samples = audio.samples,
                    sampleRateHz = rate,
                    chunkCount = 0,
                )
            }
        } catch (t: Throwable) {
            runCatching {
                Log.e(
                    TAG,
                    "OfflineTts.generate falló (runtime nativo; model=${model.id})",
                    t,
                )
            }
            throw SherpaRuntimeException(
                "OfflineTts generate failed for ${model.id}",
                t,
            )
        }
    }

    override fun close() {
        if (testStub) return
        runCatching { tts?.release() }
            .onFailure { Log.w(TAG, "Error liberando OfflineTts", it) }
    }

    companion object {
        private const val TAG = "SherpaOfflineSynth"

        /**
         * Factoría inyectable (tests): simula fallo del runtime nativo sin
         * cargar el AAR. Producción usa [OfflineTts] real.
         */
        @Volatile
        internal var createOfflineTts: (OfflineTtsConfig) -> OfflineTts = { config ->
            OfflineTts(assetManager = null, config = config)
        }

        /** Stub JVM sin OfflineTts (solo tests de [SherpaOfflineTtsCache]). */
        internal fun createTestStub(model: NeuralVoiceModel): SherpaOfflineSynthesizer =
            SherpaOfflineSynthesizer(model = model, tts = null, testStub = true)

        /**
         * Callback JNI-compatible para [OfflineTts.generateWithCallback].
         *
         * `libsherpa-onnx-jni` hace `GetMethodID(..., "invoke", "([F)Ljava/lang/Integer;")`.
         * Un lambda Kotlin `(FloatArray) -> Int` compila a `invoke([F)I` (primitivo) →
         * `NoSuchMethodError` + SIGABRT al primer chunk. Hay que tipar el retorno
         * como [java.lang.Integer] boxed.
         */
        @Suppress("UNCHECKED_CAST", "DEPRECATION")
        internal fun jniChunkCallback(
            onChunk: ((FloatArray) -> Boolean)?,
            accumulator: SherpaSynthChunkAccumulator,
        ): (FloatArray) -> Int {
            val boxed =
                object : Function1<FloatArray, java.lang.Integer> {
                    override fun invoke(samples: FloatArray): java.lang.Integer {
                        val cont = onChunk?.invoke(samples) ?: true
                        val code = accumulator.onChunk(samples, continueGeneration = cont)
                        // Constructor (no valueOf): valueOf se mapea a Kotlin Int y
                        // vuelve a emitir firma primitiva en el bytecode.
                        return java.lang.Integer(code)
                    }
                }
            return boxed as (FloatArray) -> Int
        }

        /**
         * Crea el sintetizador solo si el layout es válido y OfflineTts carga
         * sin lanzar. Si falla (rutas, JNI, modelo incompatible), loguea y
         * devuelve null → fallback Android TTS.
         */
        fun createOrNull(
            model: NeuralVoiceModel,
            numThreads: Int = 2,
            silenceScale: Float = 0.2f,
            debug: Boolean = false,
        ): SherpaOfflineSynthesizer? {
            if (model.engine != NeuralVoiceEngine.Supertonic) {
                if (!VoiceContentRoot.assertRuntimePaths(
                        model.modelFile,
                        model.tokensFile,
                        model.dataDir,
                        searchRoot = model.rootDir,
                    )
                ) {
                    return null
                }
            } else if (!model.isComplete()) {
                runCatching {
                    Log.e(TAG, "Layout Supertonic incompleto: ${model.rootDir.absolutePath}")
                }
                return null
            }
            // Antes de tocar OfflineTts (su <clinit> carga el JNI): asegurar
            // libonnxruntime.so + libsherpa-onnx-jni.so, o fallback limpio.
            if (!SherpaNativeLibs.ensureLoaded()) {
                runCatching {
                    Log.e(
                        TAG,
                        "Nativas sherpa no disponibles → fallback Android TTS " +
                            "(¿APK sin libonnxruntime.so?). model=${model.id}",
                        SherpaNativeLibs.lastLoadError(),
                    )
                }
                return null
            }
            return try {
                val config = SherpaTtsConfigFactory.fromModel(
                    model = model,
                    numThreads = numThreads,
                    silenceScale = silenceScale,
                    debug = debug,
                )
                val tts = createOfflineTts(config)
                SherpaOfflineSynthesizer(model, tts, testStub = false)
            } catch (t: Throwable) {
                // Incluye Error/UnsatisfiedLinkError / ExceptionInInitializerError.
                runCatching {
                    Log.e(
                        TAG,
                        "OfflineTts falló → fallback Android TTS " +
                            "(model=${model.modelFile.absolutePath} " +
                            "tokens=${model.tokensFile.absolutePath} " +
                            "dataDir=${model.dataDir.absolutePath} " +
                            "engine=${model.engine})",
                        t,
                    )
                }
                null
            }
        }
    }
}

/** Fallo controlado del runtime sherpa-onnx (carga o generate). */
class SherpaRuntimeException(
    message: String,
    cause: Throwable? = null,
) : RuntimeException(message, cause)
