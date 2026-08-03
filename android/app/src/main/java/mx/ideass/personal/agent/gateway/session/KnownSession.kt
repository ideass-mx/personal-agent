package mx.ideass.personal.agent.gateway.session

import kotlinx.serialization.Serializable

/**
 * Sesión conocida por este cliente (catálogo local).
 * La key canónica viene del gateway (`sessionDefaults` o `sessions.create`).
 */
@Serializable
data class KnownSession(
    val sessionKey: String,
    val displayName: String,
    val agentId: String? = null,
    val isMain: Boolean = false,
    val createdAtMs: Long,
    val lastActivityAtMs: Long? = null,
)

/** Nombre de UI para la sesión principal del server. */
const val MAIN_SESSION_DISPLAY_NAME: String = "Principal"

/**
 * Extrae agentId de una key canónica `agent:{agentId}:{rest}`.
 * No inventa formato: solo parsea el patrón confirmado en el tag.
 */
fun agentIdFromSessionKey(sessionKey: String): String? {
    val parts = sessionKey.trim().split(":")
    if (parts.size < 3) return null
    if (!parts[0].equals("agent", ignoreCase = true)) return null
    return parts[1].trim().takeIf { it.isNotEmpty() }
}

/** True si la key sigue el patrón dashboard mintado por `sessions.create` sin key. */
fun isDashboardSessionKey(sessionKey: String): Boolean {
    val parts = sessionKey.trim().lowercase().split(":")
    return parts.size >= 4 &&
        parts[0] == "agent" &&
        parts[1].isNotEmpty() &&
        parts[2] == "dashboard" &&
        parts[3].isNotEmpty()
}
