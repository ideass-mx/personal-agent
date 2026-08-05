package mx.ideass.personal.agent.voice

import kotlinx.serialization.Serializable

@Serializable
data class VoiceCatalogFile(
    val voices: List<VoiceCatalogEntry> = emptyList(),
)

/**
 * Entrada del catálogo curado (marca blanca). Un tar.bz2 de sherpa-onnx
 * por voz; Piper = un ONNX; Kokoro = modelo + voices.bin + lexicons.
 */
@Serializable
data class VoiceCatalogEntry(
    val id: String,
    val displayName: String,
    val engine: String,
    val language: String,
    val gender: String? = null,
    val sampleRate: Int,
    val sizeBytes: Long,
    val sizeMB: Int = ((sizeBytes + 512_000) / 1_000_000).toInt(),
    val recommended: Boolean = false,
    val downloadUrl: String,
    val sha256: String,
    val archiveRoot: String,
    val onnxFile: String,
    val voicesFile: String? = null,
    val lexiconFiles: List<String> = emptyList(),
    val speakerId: Int = 0,
    /**
     * Ficheros relativos al root de la voz que deben existir tras extraer.
     * Vacío = defaults por [engine] ([VoiceInstallValidator]).
     */
    val requiredFiles: List<String> = emptyList(),
) {
    fun engineType(): NeuralVoiceEngine = when (engine.lowercase()) {
        "kokoro" -> NeuralVoiceEngine.Kokoro
        else -> NeuralVoiceEngine.Piper
    }
}
