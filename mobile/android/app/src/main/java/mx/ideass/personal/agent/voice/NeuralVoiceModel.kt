package mx.ideass.personal.agent.voice

import java.io.File

/**
 * Layout en disco de un modelo neuronal ya instalado (Piper, Kokoro o Supertonic).
 *
 * Piper/Kokoro: [modelFile], [tokensFile] y [dataDir] vía [VoiceContentRoot].
 * Supertonic: 7 ficheros (sin tokens/espeak); rutas en campos dedicados.
 */
data class NeuralVoiceModel(
    val id: String,
    val engine: NeuralVoiceEngine,
    val rootDir: File,
    val modelFile: File,
    val tokensFile: File,
    val dataDir: File,
    /** Sample rate nativo (Piper es_MX = 22_050; Kokoro = 24_000; Supertonic = 44_100). */
    val sampleRateHz: Int,
    /** Speaker id por defecto (Piper = 0; Kokoro/Supertonic usan ids de voz). */
    val defaultSpeakerId: Int = 0,
    /**
     * Código de idioma:
     * - Supertonic → `GenerationConfig.extra["lang"]`
     * - Kokoro → `OfflineTtsKokoroModelConfig.lang` (espeak; [KokoroVoices.espeakLang])
     * - Piper → metadata de catálogo
     */
    val language: String = "",
    /** Kokoro: voices.bin; Supertonic: voice.bin (voiceStyle). */
    val voicesFile: File? = null,
    /** Kokoro: rutas absolutas separadas por coma. */
    val lexiconPaths: String = "",
    /** Supertonic: duration_predictor.*.onnx */
    val durationPredictorFile: File? = null,
    /** Supertonic: text_encoder.*.onnx */
    val textEncoderFile: File? = null,
    /** Supertonic: vector_estimator.*.onnx */
    val vectorEstimatorFile: File? = null,
    /** Supertonic: vocoder.*.onnx */
    val vocoderFile: File? = null,
    /** Supertonic: tts.json */
    val ttsJsonFile: File? = null,
    /** Supertonic: unicode_indexer.bin */
    val unicodeIndexerFile: File? = null,
) {
    fun isComplete(): Boolean {
        return when (engine) {
            NeuralVoiceEngine.Piper ->
                modelFile.isFile && modelFile.length() > 0L &&
                    tokensFile.isFile && tokensFile.length() > 0L &&
                    VoiceInstallValidator.isPiperLayoutComplete(
                        rootDir = rootDir,
                        onnxFile = modelFile,
                        tokensFile = tokensFile,
                        dataDir = dataDir,
                    )
            NeuralVoiceEngine.Kokoro ->
                modelFile.isFile && modelFile.length() > 0L &&
                    tokensFile.isFile && tokensFile.length() > 0L &&
                    VoiceInstallValidator.isKokoroLayoutComplete(
                        rootDir = rootDir,
                        onnxFile = modelFile,
                        tokensFile = tokensFile,
                        dataDir = dataDir,
                        voicesFile = voicesFile,
                    )
            NeuralVoiceEngine.Supertonic ->
                VoiceInstallValidator.isSupertonicLayoutComplete(
                    durationPredictor = durationPredictorFile,
                    textEncoder = textEncoderFile,
                    vectorEstimator = vectorEstimatorFile,
                    vocoder = vocoderFile,
                    ttsJson = ttsJsonFile,
                    unicodeIndexer = unicodeIndexerFile,
                    voiceStyle = voicesFile,
                )
        }
    }

    companion object {
        const val DEFAULT_PIPER_SAMPLE_RATE_HZ = 22_050
        const val DEFAULT_KOKORO_SAMPLE_RATE_HZ = 24_000
        const val DEFAULT_SUPERTONIC_SAMPLE_RATE_HZ = 44_100
        const val TOKENS_FILE_NAME = "tokens.txt"
        const val ESPEAK_DATA_DIR_NAME = "espeak-ng-data"

        const val SUPERTONIC_DURATION_PREDICTOR = "duration_predictor.int8.onnx"
        const val SUPERTONIC_TEXT_ENCODER = "text_encoder.int8.onnx"
        const val SUPERTONIC_VECTOR_ESTIMATOR = "vector_estimator.int8.onnx"
        const val SUPERTONIC_VOCODER = "vocoder.int8.onnx"
        const val SUPERTONIC_TTS_JSON = "tts.json"
        const val SUPERTONIC_UNICODE_INDEXER = "unicode_indexer.bin"
        const val SUPERTONIC_VOICE_STYLE = "voice.bin"

        fun fromCatalogEntry(entry: VoiceCatalogEntry, installDir: File): NeuralVoiceModel? {
            if (!installDir.isDirectory) return null
            return when (entry.engineType()) {
                NeuralVoiceEngine.Piper -> resolvePiper(
                    id = entry.id,
                    rootDir = installDir,
                    preferredOnnxName = entry.onnxFile,
                    sampleRateHz = entry.sampleRate,
                    speakerId = entry.speakerId,
                    archiveRootHint = entry.archiveRoot,
                    language = entry.language,
                )
                NeuralVoiceEngine.Kokoro -> resolveKokoro(
                    id = entry.id,
                    rootDir = installDir,
                    onnxName = entry.onnxFile,
                    voicesName = entry.voicesFile ?: "voices.bin",
                    lexiconFiles = entry.lexiconFiles,
                    sampleRateHz = entry.sampleRate,
                    speakerId = entry.speakerId,
                    archiveRootHint = entry.archiveRoot,
                    language = entry.language,
                )
                NeuralVoiceEngine.Supertonic -> resolveSupertonic(
                    id = entry.id,
                    rootDir = installDir,
                    durationPredictorName = entry.onnxFile.ifBlank { SUPERTONIC_DURATION_PREDICTOR },
                    voiceStyleName = entry.voicesFile ?: SUPERTONIC_VOICE_STYLE,
                    sampleRateHz = entry.sampleRate,
                    speakerId = entry.speakerId,
                    language = entry.language,
                    archiveRootHint = entry.archiveRoot,
                )
            }?.takeIf {
                VoiceInstallValidator.isComplete(entry, it.rootDir)
            }
        }

        /**
         * Resuelve un modelo Piper bajo [rootDir] (carpeta de instalación),
         * descubriendo el content root real si el tar quedó anidado.
         */
        fun resolvePiper(
            id: String,
            rootDir: File,
            preferredOnnxName: String? = null,
            sampleRateHz: Int = DEFAULT_PIPER_SAMPLE_RATE_HZ,
            speakerId: Int = 0,
            archiveRootHint: String? = null,
            language: String = "",
        ): NeuralVoiceModel? {
            if (!rootDir.isDirectory) return null
            val modelFile = VoiceContentRoot.resolveOnnx(rootDir, preferredOnnxName)
                ?: return null
            val tokens = VoiceContentRoot.resolveTokens(rootDir) ?: return null
            val dataDir = VoiceContentRoot.resolveEspeakDataDir(rootDir) ?: return null
            if (!VoiceContentRoot.assertRuntimePaths(
                    modelFile,
                    tokens,
                    dataDir,
                    searchRoot = rootDir,
                )
            ) {
                return null
            }
            val contentRoot = VoiceContentRoot.discover(rootDir, archiveRootHint)
                ?: modelFile.parentFile?.canonicalFile
                ?: rootDir.canonicalFile
            val model = NeuralVoiceModel(
                id = id,
                engine = NeuralVoiceEngine.Piper,
                rootDir = contentRoot,
                modelFile = modelFile,
                tokensFile = tokens,
                dataDir = dataDir,
                sampleRateHz = sampleRateHz,
                defaultSpeakerId = speakerId,
                language = language,
            )
            return model.takeIf { it.isComplete() }
        }

        fun resolveKokoro(
            id: String,
            rootDir: File,
            onnxName: String,
            voicesName: String = "voices.bin",
            lexiconFiles: List<String> = emptyList(),
            sampleRateHz: Int = DEFAULT_KOKORO_SAMPLE_RATE_HZ,
            speakerId: Int = 0,
            archiveRootHint: String? = null,
            language: String = "",
        ): NeuralVoiceModel? {
            if (!rootDir.isDirectory) return null
            val modelFile = VoiceContentRoot.resolveOnnx(rootDir, onnxName) ?: return null
            val tokens = VoiceContentRoot.resolveTokens(rootDir) ?: return null
            val dataDir = VoiceContentRoot.resolveEspeakDataDir(rootDir) ?: return null
            val voices = VoiceContentRoot.resolveVoices(rootDir, voicesName) ?: return null
            if (!VoiceContentRoot.assertRuntimePaths(
                    modelFile,
                    tokens,
                    dataDir,
                    searchRoot = rootDir,
                )
            ) {
                return null
            }
            val contentRoot = VoiceContentRoot.discover(rootDir, archiveRootHint)
                ?: modelFile.parentFile?.canonicalFile
                ?: rootDir.canonicalFile
            val lexiconAbs = lexiconFiles
                .mapNotNull { name ->
                    VoiceContentRoot.findNamedFile(rootDir, name)?.canonicalFile
                }
                .filter { it.isFile }
                .joinToString(",") { it.absolutePath }
            val model = NeuralVoiceModel(
                id = id,
                engine = NeuralVoiceEngine.Kokoro,
                rootDir = contentRoot,
                modelFile = modelFile,
                tokensFile = tokens,
                dataDir = dataDir,
                sampleRateHz = sampleRateHz,
                defaultSpeakerId = speakerId,
                language = language,
                voicesFile = voices,
                lexiconPaths = lexiconAbs,
            )
            return model.takeIf { it.isComplete() }
        }

        /**
         * Layout Supertonic (sin tokens/espeak): 4 ONNX + tts.json +
         * unicode_indexer.bin + voice.bin.
         */
        fun resolveSupertonic(
            id: String,
            rootDir: File,
            durationPredictorName: String = SUPERTONIC_DURATION_PREDICTOR,
            textEncoderName: String = SUPERTONIC_TEXT_ENCODER,
            vectorEstimatorName: String = SUPERTONIC_VECTOR_ESTIMATOR,
            vocoderName: String = SUPERTONIC_VOCODER,
            ttsJsonName: String = SUPERTONIC_TTS_JSON,
            unicodeIndexerName: String = SUPERTONIC_UNICODE_INDEXER,
            voiceStyleName: String = SUPERTONIC_VOICE_STYLE,
            sampleRateHz: Int = DEFAULT_SUPERTONIC_SAMPLE_RATE_HZ,
            speakerId: Int = 0,
            language: String = "es",
            archiveRootHint: String? = null,
        ): NeuralVoiceModel? {
            if (!rootDir.isDirectory) return null
            val searchRoots = buildList {
                add(rootDir)
                val hint = archiveRootHint?.trim()?.trimEnd('/')
                if (!hint.isNullOrEmpty()) add(File(rootDir, hint))
                rootDir.listFiles { f -> f.isDirectory }?.singleOrNull()?.let { add(it) }
            }
            fun find(name: String): File? =
                searchRoots.firstNotNullOfOrNull { VoiceContentRoot.findNamedFile(it, name) }
                    ?.takeIf { it.isFile && it.length() > 0L }
                    ?.canonicalFile

            val duration = find(durationPredictorName) ?: return null
            val textEncoder = find(textEncoderName) ?: return null
            val vectorEstimator = find(vectorEstimatorName) ?: return null
            val vocoder = find(vocoderName) ?: return null
            val ttsJson = find(ttsJsonName) ?: return null
            val unicodeIndexer = find(unicodeIndexerName) ?: return null
            val voiceStyle = find(voiceStyleName) ?: return null
            val contentRoot = duration.parentFile?.canonicalFile ?: rootDir.canonicalFile
            val model = NeuralVoiceModel(
                id = id,
                engine = NeuralVoiceEngine.Supertonic,
                rootDir = contentRoot,
                // modelFile / tokensFile / dataDir: placeholders para APIs Piper;
                // la carga real usa los campos Supertonic.
                modelFile = duration,
                tokensFile = ttsJson,
                dataDir = contentRoot,
                sampleRateHz = sampleRateHz,
                defaultSpeakerId = speakerId,
                language = language.ifBlank { "es" },
                voicesFile = voiceStyle,
                durationPredictorFile = duration,
                textEncoderFile = textEncoder,
                vectorEstimatorFile = vectorEstimator,
                vocoderFile = vocoder,
                ttsJsonFile = ttsJson,
                unicodeIndexerFile = unicodeIndexer,
            )
            return model.takeIf { it.isComplete() }
        }
    }
}
