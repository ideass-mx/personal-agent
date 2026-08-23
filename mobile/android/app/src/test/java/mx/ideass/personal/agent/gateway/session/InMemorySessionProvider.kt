package mx.ideass.personal.agent.gateway.session

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import mx.ideass.personal.agent.gateway.config.GatewayConfig
import mx.ideass.personal.agent.gateway.protocol.HelloOk

/** SessionProvider en memoria con la misma política de resolución que producción. */
class InMemorySessionProvider : SessionProvider {
    private val _active = MutableStateFlow<ActiveSession?>(null)
    override val activeSession: StateFlow<ActiveSession?> = _active.asStateFlow()

    private val _known = MutableStateFlow<List<KnownSession>>(emptyList())
    override val knownSessions: StateFlow<List<KnownSession>> = _known.asStateFlow()

    override suspend fun resolveForConnection(config: GatewayConfig, hello: HelloOk): ActiveSession {
        val defaults = hello.snapshot.sessionDefaults
        val mainKey = defaults?.mainSessionKey?.trim()?.takeIf { it.isNotEmpty() }
        val mainAgent = defaults?.defaultAgentId?.trim()?.takeIf { it.isNotEmpty() }
            ?: config.defaultAgentId?.trim()?.takeIf { it.isNotEmpty() }

        if (mainKey != null) {
            _known.value = upsertMain(_known.value, mainKey, mainAgent)
        }

        val existing = _active.value
        if (existing != null) {
            ensureKnown(
                sessionKey = existing.sessionKey,
                displayName = existing.sessionKey,
                agentId = existing.agentId,
                isMain = false,
            )
            return existing
        }

        val fromConfigKey = config.defaultSessionKey?.trim()?.takeIf { it.isNotEmpty() }
        val fromConfigAgent = config.defaultAgentId?.trim()?.takeIf { it.isNotEmpty() }
        if (fromConfigKey != null) {
            val session = ActiveSession(fromConfigKey, fromConfigAgent)
            ensureKnown(
                sessionKey = fromConfigKey,
                displayName = fromConfigKey,
                agentId = fromConfigAgent,
                isMain = false,
            )
            _active.value = session
            return session
        }

        require(mainKey != null) { "session_unavailable" }
        val session = ActiveSession(mainKey, mainAgent)
        _active.value = session
        return session
    }

    override suspend fun setActive(sessionKey: String, agentId: String?) {
        val key = sessionKey.trim()
        require(key.isNotEmpty()) { "session_key_blank" }
        val agent = agentId?.trim()?.takeIf { it.isNotEmpty() } ?: agentIdFromSessionKey(key)
        ensureKnown(
            sessionKey = key,
            displayName = key,
            agentId = agent,
            isMain = false,
        )
        _active.value = ActiveSession(sessionKey = key, agentId = agent)
        touch(key)
    }

    override suspend fun registerAndActivate(
        sessionKey: String,
        displayName: String,
        agentId: String?,
    ): KnownSession {
        val key = sessionKey.trim()
        require(key.isNotEmpty()) { "session_key_blank" }
        val name = displayName.trim()
        require(name.isNotEmpty()) { "display_name_blank" }
        val agent = agentId?.trim()?.takeIf { it.isNotEmpty() } ?: agentIdFromSessionKey(key)
        val known = ensureKnown(
            sessionKey = key,
            displayName = name,
            agentId = agent,
            isMain = false,
            forceDisplayName = true,
        )
        _active.value = ActiveSession(sessionKey = key, agentId = agent)
        touch(key)
        return known
    }

    override suspend fun registerWithoutActivating(
        sessionKey: String,
        displayName: String,
        agentId: String?,
    ): KnownSession {
        val key = sessionKey.trim()
        require(key.isNotEmpty()) { "session_key_blank" }
        val name = displayName.trim()
        require(name.isNotEmpty()) { "display_name_blank" }
        val agent = agentId?.trim()?.takeIf { it.isNotEmpty() } ?: agentIdFromSessionKey(key)
        val known = ensureKnown(
            sessionKey = key,
            displayName = name,
            agentId = agent,
            isMain = false,
            forceDisplayName = true,
        )
        touch(key)
        return known
    }

    override suspend fun updateDisplayName(
        sessionKey: String,
        displayName: String,
    ): KnownSession? {
        val key = sessionKey.trim()
        val name = displayName.trim()
        if (key.isEmpty() || name.isEmpty()) return null
        val existing = _known.value.find { it.sessionKey == key } ?: return null
        val updated = existing.copy(displayName = name)
        _known.value = sortKnown(
            _known.value.map { if (it.sessionKey == key) updated else it },
        )
        return updated
    }

    override suspend fun removeSessions(
        sessionKeys: Collection<String>,
    ): SessionRemovalResult {
        val requested = sessionKeys.map { it.trim() }.filter { it.isNotEmpty() }.toSet()
        if (requested.isEmpty()) {
            return SessionRemovalResult(removedKeys = emptyList(), switchedToMain = false)
        }
        val removable = _known.value.filter { !it.isMain && it.sessionKey in requested }
        if (removable.isEmpty()) {
            return SessionRemovalResult(removedKeys = emptyList(), switchedToMain = false)
        }
        val removeKeys = removable.map { it.sessionKey }.toSet()
        val activeKey = _active.value?.sessionKey
        val switchedToMain = activeKey != null && activeKey in removeKeys
        if (switchedToMain) {
            val main = _known.value.firstOrNull { it.isMain }
                ?: error("session_main_missing: no se puede borrar la activa sin principal")
            _active.value = ActiveSession(sessionKey = main.sessionKey, agentId = main.agentId)
            touch(main.sessionKey)
        }
        _known.value = sortKnown(_known.value.filterNot { it.sessionKey in removeKeys })
        return SessionRemovalResult(
            removedKeys = removable.map { it.sessionKey },
            switchedToMain = switchedToMain,
        )
    }

    override suspend fun clear() {
        _active.value = null
        _known.value = emptyList()
    }

    /** Simula reinicio: limpia memoria en RAM y rehidrata desde un snapshot. */
    fun restoreSnapshot(known: List<KnownSession>, activeKey: String?) {
        _known.value = sortKnown(known)
        _active.value = if (activeKey != null) {
            val fromKnown = known.find { it.sessionKey == activeKey }
            ActiveSession(
                sessionKey = activeKey,
                agentId = fromKnown?.agentId ?: agentIdFromSessionKey(activeKey),
            )
        } else {
            null
        }
    }

    private fun upsertMain(
        list: List<KnownSession>,
        mainKey: String,
        agentId: String?,
    ): List<KnownSession> {
        val now = System.currentTimeMillis()
        val withoutMainFlag = list.map { if (it.isMain) it.copy(isMain = false) else it }
        val existing = withoutMainFlag.find { it.sessionKey == mainKey }
        val next = if (existing != null) {
            withoutMainFlag.map {
                if (it.sessionKey != mainKey) {
                    it
                } else {
                    it.copy(
                        isMain = true,
                        agentId = agentId ?: it.agentId,
                        displayName = if (it.displayName.isBlank() || it.displayName == it.sessionKey) {
                            MAIN_SESSION_DISPLAY_NAME
                        } else {
                            it.displayName
                        },
                    )
                }
            }
        } else {
            withoutMainFlag + KnownSession(
                sessionKey = mainKey,
                displayName = MAIN_SESSION_DISPLAY_NAME,
                agentId = agentId,
                isMain = true,
                createdAtMs = now,
            )
        }
        return sortKnown(next)
    }

    private fun ensureKnown(
        sessionKey: String,
        displayName: String,
        agentId: String?,
        isMain: Boolean,
        forceDisplayName: Boolean = false,
    ): KnownSession {
        val now = System.currentTimeMillis()
        val existing = _known.value.find { it.sessionKey == sessionKey }
        if (existing != null) {
            val updated = existing.copy(
                displayName = when {
                    forceDisplayName -> displayName
                    existing.displayName.isNotBlank() -> existing.displayName
                    else -> displayName
                },
                agentId = agentId ?: existing.agentId,
                isMain = existing.isMain || isMain,
            )
            _known.value = sortKnown(
                _known.value.map { if (it.sessionKey == sessionKey) updated else it },
            )
            return updated
        }
        val created = KnownSession(
            sessionKey = sessionKey,
            displayName = displayName,
            agentId = agentId,
            isMain = isMain,
            createdAtMs = now,
            lastActivityAtMs = now,
        )
        _known.value = sortKnown(_known.value + created)
        return created
    }

    private fun touch(sessionKey: String) {
        val now = System.currentTimeMillis()
        _known.value = sortKnown(
            _known.value.map {
                if (it.sessionKey == sessionKey) it.copy(lastActivityAtMs = now) else it
            },
        )
    }

    private fun sortKnown(list: List<KnownSession>): List<KnownSession> =
        list.sortedWith(
            compareByDescending<KnownSession> { it.isMain }
                .thenByDescending { it.lastActivityAtMs ?: it.createdAtMs },
        )
}
