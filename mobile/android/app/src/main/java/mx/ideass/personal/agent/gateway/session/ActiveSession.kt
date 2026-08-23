package mx.ideass.personal.agent.gateway.session

/** Sesión de chat activa en el cliente (no se recrea al reconectar). */
data class ActiveSession(
    val sessionKey: String,
    val agentId: String?,
)
