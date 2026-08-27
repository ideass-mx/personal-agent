package mx.ideass.personal.agent.chat

/**
 * Copy operacional MVP (PHASE 39). Sin APIs nuevas: traduce estados/códigos ya existentes.
 */
object OperationalCopy {

    const val AGENT_DISCONNECTED_CODE = "agent_disconnected"

    /** Etiqueta corta para el header del chat. */
    fun connectionHeaderLabel(connected: Boolean, reconnecting: Boolean, unconfigured: Boolean): String =
        when {
            unconfigured -> "Sin configurar"
            reconnecting -> "Sin conexión"
            connected -> "Agente listo"
            else -> "Sin conexión"
        }

    /**
     * Mensaje de error en el hilo. No deja solo el código interno al usuario.
     */
    fun humanizeInboundError(code: String?, message: String?): String {
        val normalized = code?.trim()?.lowercase().orEmpty()
        if (normalized == AGENT_DISCONNECTED_CODE ||
            message?.contains("agent_disconnected", ignoreCase = true) == true ||
            message?.contains("AGENT_DISCONNECTED", ignoreCase = true) == true
        ) {
            return "No puedo ejecutar esa acción porque el agente de tu PC no está disponible. " +
                "Verifica que esté ejecutándose en la computadora y vuelve a intentarlo."
        }
        val body = message?.trim().orEmpty()
        return when {
            body.isNotEmpty() -> body
            normalized.isNotEmpty() -> "Algo salió mal ($normalized)."
            else -> "Algo salió mal. Inténtalo de nuevo."
        }
    }

    fun degradedBannerText(): String =
        "Sin conexión con el agente en tu PC. Tus mensajes se enviarán al reconectar."

    fun chatEmptyTitle(): String = "Habla con tu agente"

    fun chatEmptyBody(): String =
        "Pregunta, pide información o solicita una acción en tu PC. " +
            "Cuando una acción pueda modificar algo, el agente te pedirá autorización."

    fun historyLoading(): String = "Cargando conversación…"

    fun historyEmpty(): String = "Todavía no hay mensajes en esta conversación."

    fun historyError(): String =
        "No se pudo recuperar el historial. Puedes reintentar o seguir con lo que hay en el teléfono."
}
