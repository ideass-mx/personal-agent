package mx.ideass.personal.agent.gateway.client

/**
 * Detección de socket muerto por silencio de ticks (contrato v4).
 * Silencio > [tickIntervalMs]×2 → cerrar con [CLOSE_CODE] y reconectar.
 */
object GatewayTickWatchdog {
    /** Código WebSocket de referencia Gateway legacy: tick timeout. */
    const val CLOSE_CODE: Int = 4000
    const val CLOSE_REASON: String = "tick timeout"
    const val DEFAULT_TICK_INTERVAL_MS: Long = 30_000L

    fun effectiveIntervalMs(tickIntervalMs: Long): Long =
        tickIntervalMs.coerceAtLeast(1_000L)

    fun silenceLimitMs(tickIntervalMs: Long): Long =
        effectiveIntervalMs(tickIntervalMs) * 2

    /**
     * @param nowElapsedMs [android.os.SystemClock.elapsedRealtime]
     * @param lastTickElapsedMs última actividad de tick (o hello) en la misma escala
     */
    fun shouldTimeout(
        nowElapsedMs: Long,
        lastTickElapsedMs: Long,
        tickIntervalMs: Long,
    ): Boolean = nowElapsedMs - lastTickElapsedMs > silenceLimitMs(tickIntervalMs)
}
