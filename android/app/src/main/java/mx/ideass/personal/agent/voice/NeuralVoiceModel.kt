package mx.ideass.personal.agent.voice

import java.io.File

/**
 * Layout en disco de un modelo neuronal ya instalado (Piper o Kokoro).
 *
 * Las rutas [modelFile], [tokensFile] y [dataDir] se derivan de la misma
 * raíz de contenido descubierta en disco ([VoiceContentRoot]), en absoluto.
 */
data class NeuralVoiceModel(
    val id: String,
    val engine: NeuralVoiceEngine,
    val rootDir: File,
    val modelFile: File,
    val tokensFile: File,
    val dataDir: File,
    /** Sample rate nativo del modelo (Piper es_MX = 22_050; Kokoro = 24_000). */
    val sampleRateHz: Int,
    /** Speaker id por defecto (Piper = 0; Kokoro usa ids de voz). */
    val defaultSpeakerId: Int = 0,
    /** Kokoro: voices.bin */
    val voicesFile: File? = null,
    /** Kokoro: rutas absolutas separadas por coma. */
    val lexiconPaths: String = "",
) {
    fun isComplete(): Boolean {
        if (!modelFile.isFile || modelFile.length() <= 0L) return false
        if (!tokensFile.isFile || tokensFile.length() <= 0L) return false
        return when (engine) {
            NeuralVoiceEngine.Piper ->
                VoiceInstallValidator.isPiperLayoutComplete(
                    rootDir = rootDir,
                    onnxFile = modelFile,
                    tokensFile = tokensFile,
                    dataDir = dataDir,
                )
            NeuralVoiceEngine.Kokoro ->
                VoiceInstallValidator.isKokoroLayoutComplete(
                    rootDir = rootDir,
                    onnxFile = modelFile,
                    tokensFile = tokensFile,
                    dataDir = dataDir,
                    voicesFile = voicesFile,
                )
        }
    }

    companion object {
        const val DEFAULT_PIPER_SAMPLE_RATE_HZ = 22_050
        const val DEFAULT_KOKORO_SAMPLE_RATE_HZ = 24_000
        const val TOKENS_FILE_NAME = "tokens.txt"
        const val ESPEAK_DATA_DIR_NAME = "espeak-ng-data"

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
                )
            }?.takeIf {
                // Valida requiredFiles del catálogo sobre la raíz de contenido real.
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
        ): NeuralVoiceModel? {
            if (!rootDir.isDirectory) return null
            // Buscar bajo la carpeta de instalación (plana o con tar anidado).
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
                voicesFile = voices,
                lexiconPaths = lexiconAbs,
            )
            return model.takeIf { it.isComplete() }
        }
    }
}
