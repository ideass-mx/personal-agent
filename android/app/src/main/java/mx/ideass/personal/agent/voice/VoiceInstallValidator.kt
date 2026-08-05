package mx.ideass.personal.agent.voice

import java.io.File

/**
 * Validación post-extracción de un modelo neuronal.
 * Piper y Kokoro requieren sets distintos; ambos usan `espeak-ng-data/phontab`
 * cuando el motor fonemiza con espeak-ng.
 */
object VoiceInstallValidator {
    const val PHONTAB = "phontab"
    const val ESPEAK_PHONTAB = "${NeuralVoiceModel.ESPEAK_DATA_DIR_NAME}/$PHONTAB"

    /**
     * Rutas relativas al root de la voz que deben existir y no estar vacías.
     * Si el catálogo declara [VoiceCatalogEntry.requiredFiles], se usan esas;
     * si no, defaults por motor.
     */
    fun requiredRelativePaths(entry: VoiceCatalogEntry): List<String> {
        if (entry.requiredFiles.isNotEmpty()) return entry.requiredFiles
        return when (entry.engineType()) {
            NeuralVoiceEngine.Piper -> listOf(
                entry.onnxFile,
                NeuralVoiceModel.TOKENS_FILE_NAME,
                ESPEAK_PHONTAB,
            )
            NeuralVoiceEngine.Kokoro -> buildList {
                add(entry.onnxFile)
                add(NeuralVoiceModel.TOKENS_FILE_NAME)
                add(entry.voicesFile ?: "voices.bin")
                add(ESPEAK_PHONTAB)
                addAll(entry.lexiconFiles)
            }
        }
    }

    /**
     * Rutas requeridas ausentes bajo la carpeta de la voz (plana o anidada).
     * Primero prueba la ruta relativa al content root; si falla, busca el
     * basenombre en el árbol (p. ej. tar sin aplanar).
     */
    fun missingRelativePaths(entry: VoiceCatalogEntry, installOrContentDir: File): List<String> {
        val contentRoot = VoiceContentRoot.discover(installOrContentDir, entry.archiveRoot)
            ?: installOrContentDir
        return requiredRelativePaths(entry).filter { rel ->
            !filePresent(contentRoot, installOrContentDir, rel)
        }
    }

    private fun filePresent(contentRoot: File, installDir: File, relative: String): Boolean {
        val direct = File(contentRoot, relative)
        if (direct.isFile && direct.length() > 0L) return true
        val underInstall = File(installDir, relative)
        if (underInstall.isFile && underInstall.length() > 0L) return true
        val baseName = File(relative).name
        val found = VoiceContentRoot.findNamedFile(installDir, baseName)
            ?: VoiceContentRoot.findNamedFile(contentRoot, baseName)
        return found != null && found.isFile && found.length() > 0L
    }

    fun isComplete(entry: VoiceCatalogEntry, installOrContentDir: File): Boolean =
        installOrContentDir.isDirectory &&
            missingRelativePaths(entry, installOrContentDir).isEmpty()

    /** Piper sin catálogo: onnx + tokens + phontab. */
    fun isPiperLayoutComplete(
        rootDir: File,
        onnxFile: File,
        tokensFile: File,
        dataDir: File,
    ): Boolean =
        onnxFile.isFile && onnxFile.length() > 0L &&
            tokensFile.isFile && tokensFile.length() > 0L &&
            dataDir.isDirectory &&
            File(dataDir, PHONTAB).let { it.isFile && it.length() > 0L }

    /** Kokoro: onnx + tokens + voices.bin + phontab. */
    fun isKokoroLayoutComplete(
        rootDir: File,
        onnxFile: File,
        tokensFile: File,
        dataDir: File,
        voicesFile: File?,
    ): Boolean =
        onnxFile.isFile && onnxFile.length() > 0L &&
            tokensFile.isFile && tokensFile.length() > 0L &&
            voicesFile != null && voicesFile.isFile && voicesFile.length() > 0L &&
            dataDir.isDirectory &&
            File(dataDir, PHONTAB).let { it.isFile && it.length() > 0L }
}
