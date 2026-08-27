package mx.ideass.personal.agent.chat

/**
 * Utilidades UX HITL Hub (PHASE 38).
 * El timeout real sigue en Gateway (60s). Android solo muestra cuenta regresiva
 * y limpia UI local al llegar a cero (nunca aprueba automáticamente).
 */
object HubConfirmUx {
    const val TIMEOUT_MS: Long = 60_000L

    private val SENSITIVE_KEY_REGEX = Regex(
        """"(hub_token|token|password|authorization|api[_-]?key|secret|credential)"\s*:\s*"[^"]*"""",
        RegexOption.IGNORE_CASE,
    )

    fun remainingMs(receivedAtMs: Long, nowMs: Long = System.currentTimeMillis()): Long =
        (receivedAtMs + TIMEOUT_MS - nowMs).coerceAtLeast(0L)

    fun remainingSeconds(receivedAtMs: Long, nowMs: Long = System.currentTimeMillis()): Int =
        ((remainingMs(receivedAtMs, nowMs) + 999) / 1000).toInt().coerceAtLeast(0)

    fun isLocallyExpired(receivedAtMs: Long, nowMs: Long = System.currentTimeMillis()): Boolean =
        remainingMs(receivedAtMs, nowMs) <= 0L

    /**
     * Resumen seguro para UI: trunca y oculta valores de claves sensibles comunes.
     */
    fun sanitizeInputSummary(raw: String, maxLen: Int = 800): String {
        var text = raw.trim().ifEmpty { "{}" }
        text = SENSITIVE_KEY_REGEX.replace(text) { match ->
            val key = match.groupValues[1]
            """"$key":"***""""
        }
        return if (text.length > maxLen) text.take(maxLen) + "…" else text
    }
}
