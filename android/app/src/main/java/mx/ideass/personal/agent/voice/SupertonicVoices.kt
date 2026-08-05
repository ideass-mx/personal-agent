package mx.ideass.personal.agent.voice

/**
 * Speakers e idiomas de Supertonic V3 (sid 0–9 = F1–F5, M1–M5).
 * El idioma va aparte del sid (`GenerationConfig.extra["lang"]`).
 */
object SupertonicVoices {
    data class Speaker(val sid: Int, val code: String, val gender: String)

    /** Orden oficial: F1–F5 (0–4), M1–M5 (5–9). */
    val SPEAKERS: List<Speaker> = listOf(
        Speaker(0, "F1", "female"),
        Speaker(1, "F2", "female"),
        Speaker(2, "F3", "female"),
        Speaker(3, "F4", "female"),
        Speaker(4, "F5", "female"),
        Speaker(5, "M1", "male"),
        Speaker(6, "M2", "male"),
        Speaker(7, "M3", "male"),
        Speaker(8, "M4", "male"),
        Speaker(9, "M5", "male"),
    )

    /** Idiomas expuestos en UI (el modelo soporta más; se añaden aquí). */
    data class Lang(val code: String, val labelEs: String)

    val LANGUAGES: List<Lang> = listOf(
        Lang("es", "Español"),
    )

    const val PACKAGE_ID = "sherpa-onnx-supertonic-3-tts-int8-2026-05-11"
    const val ARCHIVE_ROOT = PACKAGE_ID
    const val DOWNLOAD_URL =
        "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/" +
            "sherpa-onnx-supertonic-3-tts-int8-2026-05-11.tar.bz2"
    const val SHA256 = "82fa96f91c4ef8abaae3a14a3f4153facf88bed821d1f7331cec2700f432c427"
    const val SIZE_BYTES = 128_774_318L
    const val SAMPLE_RATE = 44_100

    val REQUIRED_FILES = listOf(
        "duration_predictor.int8.onnx",
        "text_encoder.int8.onnx",
        "vector_estimator.int8.onnx",
        "vocoder.int8.onnx",
        "tts.json",
        "unicode_indexer.bin",
        "voice.bin",
    )

    fun speakerCode(sid: Int): String =
        SPEAKERS.firstOrNull { it.sid == sid }?.code ?: "S$sid"

    fun langLabel(code: String): String =
        LANGUAGES.firstOrNull { it.code.equals(code, ignoreCase = true) }?.labelEs
            ?: code

    /** Id de catálogo: `supertonic-v3-es-f1`. */
    fun catalogId(lang: String, speakerCode: String): String =
        "supertonic-v3-${lang.lowercase()}-${speakerCode.lowercase()}"

    fun displayName(speakerCode: String, langCode: String): String =
        "Supertonic — $speakerCode · ${langLabel(langCode)}"

    fun findEntry(
        entries: List<VoiceCatalogEntry>,
        lang: String,
        sid: Int,
    ): VoiceCatalogEntry? =
        entries.firstOrNull {
            it.engineType() == NeuralVoiceEngine.Supertonic &&
                it.language.equals(lang, ignoreCase = true) &&
                it.speakerId == sid
        }
}
