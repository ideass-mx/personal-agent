package mx.ideass.personal.agent.voice

/**
 * Speakers de Kokoro multi-lang v1_0 (53 sids, 0–52).
 *
 * El idioma va **dentro** del speaker (prefijo del nombre: `ef_`/`em_` =
 * español, …). En síntesis no hay `GenerationConfig.extra["lang"]` como en
 * Supertonic; sí hay que pasar [OfflineTtsKokoroModelConfig.lang] (= espeak)
 * según el speaker: si queda vacío, sherpa usa `meta_data.voice` (`en-us`).
 */
object KokoroVoices {

    data class Speaker(
        val sid: Int,
        /** Nombre oficial del modelo, p. ej. `ef_dora`. */
        val code: String,
        val language: String,
        val gender: String,
    ) {
        /** Nombre corto para UI: `ef_dora` → `Dora`. */
        val shortName: String
            get() = code.substringAfter('_')
                .replaceFirstChar { it.titlecase() }

        val genderMark: String
            get() = when (gender.lowercase()) {
                "female" -> "♀"
                "male" -> "♂"
                else -> ""
            }
    }

    data class Lang(val code: String, val labelEs: String)

    /**
     * Mapa oficial kokoro-multi-lang-v1_0 (sid → nombre).
     * Prefijos: af/am=en-US, bf/bm=en-GB, ef/em=es, ff=fr, hf/hm=hi,
     * if/im=it, jf/jm=ja, pf/pm=pt-BR, zf/zm=zh.
     */
    val SPEAKERS: List<Speaker> = listOf(
        // en-US ♀
        Speaker(0, "af_alloy", "en-us", "female"),
        Speaker(1, "af_aoede", "en-us", "female"),
        Speaker(2, "af_bella", "en-us", "female"),
        Speaker(3, "af_heart", "en-us", "female"),
        Speaker(4, "af_jessica", "en-us", "female"),
        Speaker(5, "af_kore", "en-us", "female"),
        Speaker(6, "af_nicole", "en-us", "female"),
        Speaker(7, "af_nova", "en-us", "female"),
        Speaker(8, "af_river", "en-us", "female"),
        Speaker(9, "af_sarah", "en-us", "female"),
        Speaker(10, "af_sky", "en-us", "female"),
        // en-US ♂
        Speaker(11, "am_adam", "en-us", "male"),
        Speaker(12, "am_echo", "en-us", "male"),
        Speaker(13, "am_eric", "en-us", "male"),
        Speaker(14, "am_fenrir", "en-us", "male"),
        Speaker(15, "am_liam", "en-us", "male"),
        Speaker(16, "am_michael", "en-us", "male"),
        Speaker(17, "am_onyx", "en-us", "male"),
        Speaker(18, "am_puck", "en-us", "male"),
        Speaker(19, "am_santa", "en-us", "male"),
        // en-GB ♀/♂
        Speaker(20, "bf_alice", "en-gb", "female"),
        Speaker(21, "bf_emma", "en-gb", "female"),
        Speaker(22, "bf_isabella", "en-gb", "female"),
        Speaker(23, "bf_lily", "en-gb", "female"),
        Speaker(24, "bm_daniel", "en-gb", "male"),
        Speaker(25, "bm_fable", "en-gb", "male"),
        Speaker(26, "bm_george", "en-gb", "male"),
        Speaker(27, "bm_lewis", "en-gb", "male"),
        // es
        Speaker(28, "ef_dora", "es", "female"),
        Speaker(29, "em_alex", "es", "male"),
        // fr
        Speaker(30, "ff_siwis", "fr", "female"),
        // hi
        Speaker(31, "hf_alpha", "hi", "female"),
        Speaker(32, "hf_beta", "hi", "female"),
        Speaker(33, "hm_omega", "hi", "male"),
        Speaker(34, "hm_psi", "hi", "male"),
        // it
        Speaker(35, "if_sara", "it", "female"),
        Speaker(36, "im_nicola", "it", "male"),
        // ja
        Speaker(37, "jf_alpha", "ja", "female"),
        Speaker(38, "jf_gongitsune", "ja", "female"),
        Speaker(39, "jf_nezumi", "ja", "female"),
        Speaker(40, "jf_tebukuro", "ja", "female"),
        Speaker(41, "jm_kumo", "ja", "male"),
        // pt-BR
        Speaker(42, "pf_dora", "pt-br", "female"),
        Speaker(43, "pm_alex", "pt-br", "male"),
        Speaker(44, "pm_santa", "pt-br", "male"),
        // zh
        Speaker(45, "zf_xiaobei", "zh", "female"),
        Speaker(46, "zf_xiaoni", "zh", "female"),
        Speaker(47, "zf_xiaoxiao", "zh", "female"),
        Speaker(48, "zf_xiaoyi", "zh", "female"),
        Speaker(49, "zm_yunjian", "zh", "male"),
        Speaker(50, "zm_yunxi", "zh", "male"),
        Speaker(51, "zm_yunxia", "zh", "male"),
        Speaker(52, "zm_yunyang", "zh", "male"),
    )

    /** Idiomas en orden de UI (español primero). */
    val LANGUAGES: List<Lang> = listOf(
        Lang("es", "Español"),
        Lang("en-us", "Inglés (US)"),
        Lang("en-gb", "Inglés (UK)"),
        Lang("pt-br", "Portugués (BR)"),
        Lang("fr", "Francés"),
        Lang("it", "Italiano"),
        Lang("ja", "Japonés"),
        Lang("zh", "Chino"),
        Lang("hi", "Hindi"),
    )

    const val PACKAGE_ID = "kokoro-multi-lang-v1_0"
    const val ARCHIVE_ROOT = PACKAGE_ID
    const val DOWNLOAD_URL =
        "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/" +
            "kokoro-multi-lang-v1_0.tar.bz2"
    const val SHA256 = "c133d26353d776da730870dac7da07dbfc9a5e3bc80cc5e8e83ab6e823be7046"
    const val SIZE_BYTES = 349_418_188L
    const val SAMPLE_RATE = 24_000
    const val DEFAULT_SID = 28 // ef_dora

    val REQUIRED_FILES = listOf(
        "model.onnx",
        "tokens.txt",
        "voices.bin",
        "espeak-ng-data/phontab",
        "lexicon-us-en.txt",
        "lexicon-zh.txt",
    )

    val LEXICON_FILES = listOf("lexicon-us-en.txt", "lexicon-zh.txt")

    fun speaker(sid: Int): Speaker? = SPEAKERS.firstOrNull { it.sid == sid }

    fun speakerLabel(sid: Int): String {
        val s = speaker(sid) ?: return "S$sid"
        return "${s.shortName} ${s.genderMark}".trim()
    }

    fun langLabel(code: String): String =
        LANGUAGES.firstOrNull { it.code.equals(code, ignoreCase = true) }?.labelEs
            ?: code

    /**
     * Código que espera sherpa-onnx / espeak (`--kokoro-lang`).
     * Si queda vacío, el runtime cae a `meta_data.voice` (= `en-us` en v1_0)
     * y el español suena como inglés leyendo español.
     */
    fun espeakLang(catalogLanguage: String): String = when (catalogLanguage.lowercase()) {
        "es" -> "es"
        "en-us", "en" -> "en-us"
        "en-gb" -> "en-gb"
        "fr" -> "fr"
        "hi" -> "hi"
        "it" -> "it"
        "pt-br", "pt" -> "pt-br"
        "ja" -> "ja"
        // Chino va por lexicon; segmentos latinos usan el default del modelo.
        "zh" -> ""
        else -> catalogLanguage.ifBlank { "es" }
    }

    /** Id de catálogo: `kokoro-es-dora`, `kokoro-en-us-alloy`. */
    fun catalogId(language: String, shortName: String): String =
        "kokoro-${language.lowercase()}-${shortName.lowercase()}"

    fun displayName(speaker: Speaker): String =
        "Kokoro — ${speaker.shortName} · ${langLabel(speaker.language)}"

    fun findEntry(
        entries: List<VoiceCatalogEntry>,
        lang: String,
        sid: Int,
    ): VoiceCatalogEntry? =
        entries.firstOrNull {
            it.engineType() == NeuralVoiceEngine.Kokoro &&
                it.language.equals(lang, ignoreCase = true) &&
                it.speakerId == sid
        }

    /** Primera voz del idioma (para cambio de filtro cuando el sid no aplica). */
    fun firstEntryForLang(
        entries: List<VoiceCatalogEntry>,
        lang: String,
    ): VoiceCatalogEntry? =
        entries
            .filter {
                it.engineType() == NeuralVoiceEngine.Kokoro &&
                    it.language.equals(lang, ignoreCase = true)
            }
            .minByOrNull { it.speakerId }

    fun toCatalogEntry(speaker: Speaker): VoiceCatalogEntry =
        VoiceCatalogEntry(
            id = catalogId(speaker.language, speaker.shortName),
            displayName = displayName(speaker),
            engine = "kokoro",
            language = speaker.language,
            gender = speaker.gender,
            sampleRate = SAMPLE_RATE,
            sizeBytes = SIZE_BYTES,
            recommended = false,
            downloadUrl = DOWNLOAD_URL,
            sha256 = SHA256,
            archiveRoot = ARCHIVE_ROOT,
            packageId = PACKAGE_ID,
            onnxFile = "model.onnx",
            voicesFile = "voices.bin",
            lexiconFiles = LEXICON_FILES,
            speakerId = speaker.sid,
            requiredFiles = REQUIRED_FILES,
        )

    /** Las 53 entradas de catálogo (misma descarga). */
    fun catalogEntries(): List<VoiceCatalogEntry> = SPEAKERS.map { toCatalogEntry(it) }
}
