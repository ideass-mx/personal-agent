package mx.ideass.personal.agent.voice

import java.util.Locale

/**
 * Decisiones puras de catálogo/selección de voz TTS (testeable sin motor real).
 */
object TtsVoicePolicy {

    data class VoiceInfo(
        val name: String,
        val localeTag: String,
        val displayLabel: String,
        val isSpanish: Boolean,
        val isEsMx: Boolean,
    )

    /**
     * Orden: es-MX primero, luego otros es-*, resto por etiqueta.
     * [preferredName] si existe se marca implícitamente al elegir, no al ordenar.
     */
    fun sortVoices(voices: List<VoiceInfo>): List<VoiceInfo> =
        voices.sortedWith(
            compareByDescending<VoiceInfo> { it.isEsMx }
                .thenByDescending { it.isSpanish }
                .thenBy { it.localeTag.lowercase(Locale.ROOT) }
                .thenBy { it.displayLabel.lowercase(Locale.ROOT) },
        )

    fun voiceInfo(
        name: String,
        locale: Locale,
        qualityLabel: String? = null,
    ): VoiceInfo {
        val tag = locale.toLanguageTag()
        val lang = locale.language.lowercase(Locale.ROOT)
        val country = locale.country.uppercase(Locale.ROOT)
        val isSpanish = lang == "es"
        val isEsMx = isSpanish && country == "MX"
        val base = buildString {
            append(tag)
            if (!qualityLabel.isNullOrBlank()) {
                append(" · ")
                append(qualityLabel)
            }
            append(" (")
            append(name)
            append(')')
        }
        return VoiceInfo(
            name = name,
            localeTag = tag,
            displayLabel = base,
            isSpanish = isSpanish,
            isEsMx = isEsMx,
        )
    }

    /**
     * Elige voz: preferida si existe; si no, primera es-MX; si no, primera es;
     * si no, null (caller usa setLanguage).
     */
    fun resolveVoiceName(
        availableNames: Collection<String>,
        preferredName: String?,
        localeTagsByName: Map<String, String>,
    ): ResolveResult {
        if (!preferredName.isNullOrBlank() && preferredName in availableNames) {
            return ResolveResult(preferredName, matchedPreferred = true, fellBack = false)
        }
        val fellBack = !preferredName.isNullOrBlank()
        val esMx = availableNames.firstOrNull { name ->
            localeTagsByName[name]?.startsWith("es-MX", ignoreCase = true) == true ||
                localeTagsByName[name]?.equals("es_MX", ignoreCase = true) == true
        }
        if (esMx != null) {
            return ResolveResult(esMx, matchedPreferred = false, fellBack = fellBack)
        }
        val es = availableNames.firstOrNull { name ->
            val tag = localeTagsByName[name].orEmpty()
            tag.startsWith("es", ignoreCase = true)
        }
        if (es != null) {
            return ResolveResult(es, matchedPreferred = false, fellBack = fellBack)
        }
        return ResolveResult(null, matchedPreferred = false, fellBack = fellBack)
    }

    data class ResolveResult(
        val voiceName: String?,
        val matchedPreferred: Boolean,
        /** Preferida pedida pero ausente (o motor sin esa voz). */
        val fellBack: Boolean,
    )

    fun preferredLocales(): List<Locale> = listOf(
        Locale.forLanguageTag("es-MX"),
        Locale.forLanguageTag("es-ES"),
        Locale("es"),
    )
}
