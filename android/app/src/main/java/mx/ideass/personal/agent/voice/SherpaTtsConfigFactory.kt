package mx.ideass.personal.agent.voice

import com.k2fsa.sherpa.onnx.OfflineTtsConfig
import com.k2fsa.sherpa.onnx.OfflineTtsKokoroModelConfig
import com.k2fsa.sherpa.onnx.OfflineTtsModelConfig
import com.k2fsa.sherpa.onnx.OfflineTtsSupertonicModelConfig
import com.k2fsa.sherpa.onnx.OfflineTtsVitsModelConfig

/**
 * Arma [OfflineTtsConfig] según el motor del modelo, sin filtrar al resto del código.
 *
 * Provider: VoxSherpa prueba `xnnpack` y cae a `cpu`; la elección la hace
 * [SherpaOfflineSynthesizer.createOrNull] (fallback). Aquí solo se fija el valor.
 */
object SherpaTtsConfigFactory {

    /** Orden de intento al crear OfflineTts (paridad con VoxSherpa). */
    val PROVIDER_FALLBACK_ORDER: List<String> = listOf("xnnpack", "cpu")

    fun fromModel(
        model: NeuralVoiceModel,
        numThreads: Int = 2,
        silenceScale: Float = 0.2f,
        debug: Boolean = false,
        provider: String = "cpu",
    ): OfflineTtsConfig {
        require(model.isComplete()) {
            "Modelo incompleto: ${model.rootDir.absolutePath}"
        }
        return when (model.engine) {
            NeuralVoiceEngine.Piper -> {
                require(
                    VoiceContentRoot.assertRuntimePaths(
                        model.modelFile,
                        model.tokensFile,
                        model.dataDir,
                        searchRoot = model.rootDir,
                    ),
                ) {
                    "Rutas OfflineTts ausentes (dataDir=${model.dataDir.absolutePath})"
                }
                piperConfig(model, numThreads, silenceScale, debug, provider)
            }
            NeuralVoiceEngine.Kokoro -> {
                require(
                    VoiceContentRoot.assertRuntimePaths(
                        model.modelFile,
                        model.tokensFile,
                        model.dataDir,
                        searchRoot = model.rootDir,
                    ),
                ) {
                    "Rutas OfflineTts ausentes (dataDir=${model.dataDir.absolutePath})"
                }
                kokoroConfig(model, numThreads, silenceScale, debug, provider)
            }
            NeuralVoiceEngine.Supertonic ->
                supertonicConfig(model, numThreads, silenceScale, debug, provider)
        }
    }

    private fun piperConfig(
        model: NeuralVoiceModel,
        numThreads: Int,
        silenceScale: Float,
        debug: Boolean,
        provider: String,
    ): OfflineTtsConfig =
        OfflineTtsConfig(
            model = OfflineTtsModelConfig(
                vits = OfflineTtsVitsModelConfig(
                    model = model.modelFile.absolutePath,
                    tokens = model.tokensFile.absolutePath,
                    dataDir = model.dataDir.absolutePath,
                ),
                numThreads = numThreads.coerceAtLeast(1),
                debug = debug,
                provider = provider,
            ),
            maxNumSentences = 1,
            silenceScale = silenceScale,
        )

    private fun kokoroConfig(
        model: NeuralVoiceModel,
        numThreads: Int,
        silenceScale: Float,
        debug: Boolean,
        provider: String,
    ): OfflineTtsConfig {
        val voices = model.voicesFile?.absolutePath.orEmpty()
        require(voices.isNotEmpty()) { "Kokoro sin voices.bin" }
        // Obligatorio para Dora/Alex/etc.: sin lang, espeak usa en-us del modelo.
        val lang = KokoroVoices.espeakLang(model.language)
        return OfflineTtsConfig(
            model = OfflineTtsModelConfig(
                kokoro = OfflineTtsKokoroModelConfig(
                    model = model.modelFile.absolutePath,
                    voices = voices,
                    tokens = model.tokensFile.absolutePath,
                    dataDir = model.dataDir.absolutePath,
                    lexicon = model.lexiconPaths,
                    lang = lang,
                ),
                numThreads = numThreads.coerceAtLeast(1),
                debug = debug,
                provider = provider,
            ),
            maxNumSentences = 1,
            silenceScale = silenceScale,
        )
    }

    private fun supertonicConfig(
        model: NeuralVoiceModel,
        numThreads: Int,
        silenceScale: Float,
        debug: Boolean,
        provider: String,
    ): OfflineTtsConfig {
        val duration = requireNotNull(model.durationPredictorFile) { "Supertonic sin duration_predictor" }
        val textEncoder = requireNotNull(model.textEncoderFile) { "Supertonic sin text_encoder" }
        val vectorEstimator = requireNotNull(model.vectorEstimatorFile) {
            "Supertonic sin vector_estimator"
        }
        val vocoder = requireNotNull(model.vocoderFile) { "Supertonic sin vocoder" }
        val ttsJson = requireNotNull(model.ttsJsonFile) { "Supertonic sin tts.json" }
        val unicodeIndexer = requireNotNull(model.unicodeIndexerFile) {
            "Supertonic sin unicode_indexer"
        }
        val voiceStyle = requireNotNull(model.voicesFile) { "Supertonic sin voice.bin" }
        return OfflineTtsConfig(
            model = OfflineTtsModelConfig(
                supertonic = OfflineTtsSupertonicModelConfig(
                    durationPredictor = duration.absolutePath,
                    textEncoder = textEncoder.absolutePath,
                    vectorEstimator = vectorEstimator.absolutePath,
                    vocoder = vocoder.absolutePath,
                    ttsJson = ttsJson.absolutePath,
                    unicodeIndexer = unicodeIndexer.absolutePath,
                    voiceStyle = voiceStyle.absolutePath,
                ),
                numThreads = numThreads.coerceAtLeast(1),
                debug = debug,
                provider = provider,
            ),
            maxNumSentences = 1,
            silenceScale = silenceScale,
        )
    }
}
