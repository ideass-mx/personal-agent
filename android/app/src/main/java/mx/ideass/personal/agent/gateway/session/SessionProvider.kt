package mx.ideass.personal.agent.gateway.session

import kotlinx.coroutines.flow.StateFlow
import mx.ideass.personal.agent.gateway.config.GatewayConfig
import mx.ideass.personal.agent.gateway.protocol.HelloOk

/**
 * Posee el catálogo de sesiones y la activa.
 * La capa de red solo consulta la activa; no inventa keys al reconectar.
 */
interface SessionProvider {
    val activeSession: StateFlow<ActiveSession?>

    /** Sesiones conocidas (principal siempre presente tras [resolveForConnection]). */
    val knownSessions: StateFlow<List<KnownSession>>

    /**
     * Devuelve la sesión a usar tras un hello-ok.
     * Activa: persistida → config (`defaultSessionKey`) → `sessionDefaults.mainSessionKey`.
     * Siempre integra/actualiza la principal de `sessionDefaults` en el catálogo.
     * No crea keys nuevas ni cambia la activa si ya hay una.
     */
    suspend fun resolveForConnection(config: GatewayConfig, hello: HelloOk): ActiveSession

    /**
     * Cambia explícitamente la sesión activa.
     * Si la key no está en el catálogo, la registra (p. ej. override de Conexión).
     */
    suspend fun setActive(sessionKey: String, agentId: String?)

    /**
     * Registra una sesión creada en el gateway (`sessions.create`) y la activa.
     */
    suspend fun registerAndActivate(
        sessionKey: String,
        displayName: String,
        agentId: String?,
    ): KnownSession

    /**
     * Registra una sesión en el catálogo sin cambiar la activa.
     * Usado al crear rachas de voz y (legado) la sesión «Rápidas».
     */
    suspend fun registerWithoutActivating(
        sessionKey: String,
        displayName: String,
        agentId: String?,
    ): KnownSession

    /**
     * Actualiza solo el [KnownSession.displayName] local.
     * No cambia [sessionKey], no altera la sesión activa, no llama al Gateway.
     * Key inexistente o nombre en blanco → no-op (devuelve null).
     *
     * TODO: sync opcional futura vía `sessions.patch` { label } si se valida en el tag.
     */
    suspend fun updateDisplayName(sessionKey: String, displayName: String): KnownSession?

    /** Limpia catálogo y activa (tests / reset). No se llama en reconexión. */
    suspend fun clear()
}
