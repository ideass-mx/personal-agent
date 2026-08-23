package mx.ideass.personal.agent.chat

/**
 * Oculta en la UI de esta app turnos de sistema de voz (estilo + titulado).
 *
 * **Historial de prompts:** cambiar [voice_style_instruction] o
 * [voice_streak_title_prompt] exige añadir el texto anterior a su lista
 * histórica en recursos. Si no, los turnos ocultos de sesiones viejas
 * resucitan tras `chat.history`.
 *
 * **Visibilidad cruzada:** el ocultamiento vive solo en esta app; otros
 * clientes del Gateway (app oficial, WebChat) verán los turnos crudos
 * (prepend de estilo y par de titulado). Trade-off aceptado.
 */
object HiddenTranscript {
    /**
     * Prepara el hilo para pintar: quita pares de titulado (prompt + respuesta
     * adyacente) y hace strip del prepend de estilo en mensajes de usuario.
     */
    fun forDisplay(
        messages: List<ChatMessage>,
        styleInstructions: List<String>,
        styleSeparator: String,
        titlePrompts: List<String>,
    ): List<ChatMessage> {
        if (messages.isEmpty()) return messages
        val styles = normalizeList(styleInstructions)
        val titles = normalizeList(titlePrompts)
        val out = ArrayList<ChatMessage>(messages.size)
        var i = 0
        while (i < messages.size) {
            val msg = messages[i]
            if (msg.fromUser && isExactPrompt(msg.text, titles)) {
                // Prompt de titulado: ocultar; si el siguiente es assistant, también.
                i += 1
                if (i < messages.size && !messages[i].fromUser) {
                    i += 1
                }
                continue
            }
            val text = if (msg.fromUser) {
                stripStylePrefix(msg.text, styles, styleSeparator)
            } else {
                msg.text
            }
            out += if (text == msg.text) msg else msg.copy(text = text)
            i += 1
        }
        return out
    }

    fun stripStylePrefix(
        text: String,
        styleInstructions: List<String>,
        styleSeparator: String,
    ): String {
        val body = text
        for (style in normalizeList(styleInstructions)) {
            val prefix = style + styleSeparator
            if (body.startsWith(prefix)) {
                return body.removePrefix(prefix)
            }
        }
        return body
    }

    fun isExactPrompt(text: String, prompts: List<String>): Boolean {
        val trimmed = text.trim()
        if (trimmed.isEmpty()) return false
        return normalizeList(prompts).any { it == trimmed }
    }

    private fun normalizeList(values: List<String>): List<String> =
        values.map { it.trim() }.filter { it.isNotEmpty() }.distinct()
}

/** Construye el texto de wire con prepend de estilo (solo primer utterance de racha). */
object VoiceStyleWire {
    fun build(
        utterance: String,
        applyStyle: Boolean,
        styleInstruction: String,
        separator: String,
    ): String {
        if (!applyStyle) return utterance
        val style = styleInstruction.trim()
        if (style.isEmpty()) return utterance
        return style + separator + utterance
    }

    /** Solo rachas (AssistantInvocation / titlesOnHang) y solo el primer utterance. */
    fun shouldApply(titlesOnHang: Boolean, isFirstUserUtterance: Boolean): Boolean =
        titlesOnHang && isFirstUserUtterance
}
