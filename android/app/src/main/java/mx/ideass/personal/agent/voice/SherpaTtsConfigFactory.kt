package mx.ideass.personal.agent.voice

import com.k2fsa.sherpa.onnx.OfflineTtsConfig
import com.k2fsa.sherpa.onnx.OfflineTtsKokoroModelConfig
import com.k2fsa.sherpa.onnx.OfflineTtsModelConfig
import com.k2fsa.sherpa.onnx.OfflineTtsVitsModelConfig

/**
 * Arma [OfflineTtsConfig] según el motor del modelo, sin filtrar al resto del código.
 */
object SherpaTtsConfigFactory {

    fun fromModel(
        model: NeuralVoiceModel,
        numThreads: Int = 2,
        silenceScale: Float = 0.2f,
        debug: Boolean = false,
    ): OfflineTtsConfig {
        require(model.isComplete()) {
            "Modelo incompleto: ${model.rootDir.absolutePath}"
        }
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
        return when (model.engine) {
            NeuralVoiceEngine.Piper -> piperConfig(model, numThreads, silenceScale, debug)
            NeuralVoiceEngine.Kokoro -> kokoroConfig(model, numThreads, silenceScale, debug)
        }
    }

    private fun piperConfig(
        model: NeuralVoiceModel,
        numThreads: Int,
        silenceScale: Float,
        debug: Boolean,
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
                provider = "cpu",
            ),
            silenceScale = silenceScale,
        )

    private fun kokoroConfig(
        model: NeuralVoiceModel,
        numThreads: Int,
        silenceScale: Float,
        debug: Boolean,
    ): OfflineTtsConfig {
        val voices = model.voicesFile?.absolutePath.orEmpty()
        require(voices.isNotEmpty()) { "Kokoro sin voices.bin" }
        return OfflineTtsConfig(
            model = OfflineTtsModelConfig(
                kokoro = OfflineTtsKokoroModelConfig(
                    model = model.modelFile.absolutePath,
                    voices = voices,
                    tokens = model.tokensFile.absolutePath,
                    dataDir = model.dataDir.absolutePath,
                    lexicon = model.lexiconPaths,
                ),
                numThreads = numThreads.coerceAtLeast(1),
                debug = debug,
                provider = "cpu",
            ),
            silenceScale = silenceScale,
        )
    }
}
