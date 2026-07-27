package mx.ideass.personal.agent.voice

/**
 * Limpia texto para síntesis de voz. Solo para TTS: el chat/UI conserva el original.
 */
fun sanitizeForTts(text: String): String {
    if (text.isBlank()) return text.trim()

    var s = text

    // URLs: no deletrear; marcar como "enlace".
    s = URL_REGEX.replace(s, " enlace ")

    // Flechas / direccionales → espacio (pausa), no lectura del símbolo.
    s = replaceArrowsWithSpace(s)

    // Emojis / pictogramas / ZWJ / variation selectors / tonos / banderas.
    s = stripEmojisAndModifiers(s)

    // Bloques de código Markdown: quitar markers, conservar contenido.
    s = CODE_FENCE_REGEX.replace(s) { match ->
        " ${match.groupValues.getOrNull(1).orEmpty()} "
    }
    s = s.replace("`", "")

    // Énfasis Markdown: **x** / *x* / __x__ / _x_ → x
    s = BOLD_REGEX.replace(s) { it.groupValues[1] }
    s = ITALIC_STAR_REGEX.replace(s) { it.groupValues[1] }
    s = BOLD_UNDERSCORE_REGEX.replace(s) { it.groupValues[1] }
    s = ITALIC_UNDERSCORE_REGEX.replace(s) { it.groupValues[1] }

    // Encabezados y viñetas al inicio de línea.
    s = HEADING_REGEX.replace(s, "")
    s = LIST_MARKER_REGEX.replace(s, "")

    // Marcadores / símbolos de formato que el TTS pronuncia literalmente.
    // Conserva puntuación natural: . , ¿? ¡! : ;
    s = FORMAT_NOISE_REGEX.replace(s, " ")

    // Espacios: colapsar runs (incl. saltos) y recortar.
    return WHITESPACE_REGEX.replace(s, " ").trim()
}

private fun stripEmojisAndModifiers(text: String): String {
    if (text.isEmpty()) return text
    val out = StringBuilder(text.length)
    var i = 0
    while (i < text.length) {
        val cp = text.codePointAt(i)
        if (!isEmojiOrModifier(cp)) {
            out.appendCodePoint(cp)
        }
        i += Character.charCount(cp)
    }
    return out.toString()
}

/** Flechas y caracteres direccionales → espacio (luego se colapsan). */
private fun replaceArrowsWithSpace(text: String): String {
    if (text.isEmpty()) return text
    val out = StringBuilder(text.length)
    var i = 0
    while (i < text.length) {
        val cp = text.codePointAt(i)
        if (isArrowOrDirectional(cp)) {
            out.append(' ')
        } else {
            out.appendCodePoint(cp)
        }
        i += Character.charCount(cp)
    }
    return out.toString()
}

private fun isArrowOrDirectional(cp: Int): Boolean = when (cp) {
    in 0x2190..0x21FF -> true // Arrows ← ↑ → ↓ ↔ …
    in 0x27F0..0x27FF -> true // Supplemental Arrows-A
    in 0x2900..0x297F -> true // Supplemental Arrows-B
    in 0x2794..0x27BE -> true // Dingbat arrows ➔ ➜ ➤ …
    0x00AB, 0x00BB -> true // « »
    0x2039, 0x203A -> true // ‹ ›
    0x25B6, 0x25C0, 0x25BA, 0x25C4 -> true // ▶ ◀ ► ◄
    else -> false
}

/** Rangos pedidos + banderas / skin tones / keycap. */
private fun isEmojiOrModifier(cp: Int): Boolean = when (cp) {
    0x200D -> true // ZWJ
    in 0xFE00..0xFE0F -> true // variation selectors
    0x20E3 -> true // combining enclosing keycap
    in 0x2600..0x27BF -> true // misc symbols + dingbats
    in 0x1F300..0x1FAFF -> true // emoji pictographs (+ suplementos)
    in 0x1F1E0..0x1F1FF -> true // regional indicators (banderas)
    in 0x1F3FB..0x1F3FF -> true // skin tone modifiers
    else -> false
}

private val URL_REGEX = Regex(
    """https?://[^\s<>\[\](){}]+|www\.[^\s<>\[\](){}]+""",
    RegexOption.IGNORE_CASE,
)

private val CODE_FENCE_REGEX = Regex(
    """```(?:[\w+-]*)?\s*([\s\S]*?)```""",
)

private val BOLD_REGEX = Regex("""\*\*(.+?)\*\*""")
private val ITALIC_STAR_REGEX = Regex("""\*(.+?)\*""")
private val BOLD_UNDERSCORE_REGEX = Regex("""__(.+?)__""")
private val ITALIC_UNDERSCORE_REGEX = Regex("""_(.+?)_""")

private val HEADING_REGEX = Regex("""(?m)^\s{0,3}#{1,6}\s+""")
private val LIST_MARKER_REGEX = Regex("""(?m)^\s*([-*•]|\d+\.)\s+""")

/** Asteriscos/guiones bajos sueltos, pipes, corchetes, llaves, ~ ^ < > # residuales. */
private val FORMAT_NOISE_REGEX = Regex("""[*_#|\[\]{}~^<>]+""")

private val WHITESPACE_REGEX = Regex("""\s+""")
