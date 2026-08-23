package mx.ideass.personal.agent.voice

import kotlinx.serialization.Serializable

@Serializable
data class VoiceCatalogFile(
    val voices: List<VoiceCatalogEntry> = emptyList(),
)

/**
 * Entrada del catálogo curado (marca blanca). Un tar.bz2 de sherpa-onnx
 * por voz; Piper = un ONNX; Kokoro = modelo + voices.bin + lexicons;
 * Supertonic = 7 ficheros (4 ONNX + tts.json + unicode_indexer + voice.bin).
 *
 * Varias entradas pueden compartir [packageId] (misma descarga/carpeta) y
 * diferir solo en [speakerId] / idioma (Kokoro: 53 sids; Supertonic: F1–M5 × lang).
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
     * Id de paquete en disco (`neural_voices/<packageId>/`). Si es null,
     * coincide con [id]. Voces multi-speaker (Kokoro / Supertonic) comparten
     * el mismo.
     */
    val packageId: String? = null,
    /**
     * Ficheros relativos al root de la voz que deben existir tras extraer.
     * Vacío = defaults por [engine] ([VoiceInstallValidator]).
     */
    val requiredFiles: List<String> = emptyList(),
) {
    /** Carpeta / clave de descarga compartida. */
    fun installId(): String = packageId?.takeIf { it.isNotBlank() } ?: id

    fun engineType(): NeuralVoiceEngine = when (engine.lowercase()) {
        "kokoro" -> NeuralVoiceEngine.Kokoro
        "supertonic" -> NeuralVoiceEngine.Supertonic
        else -> NeuralVoiceEngine.Piper
    }
}
