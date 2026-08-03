package mx.ideass.personal.agent.gateway.session

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.builtins.ListSerializer
import mx.ideass.personal.agent.gateway.config.GatewayConfig
import mx.ideass.personal.agent.gateway.protocol.GatewayJson
import mx.ideass.personal.agent.gateway.protocol.HelloOk
import javax.inject.Inject
import javax.inject.Singleton

private val Context.gatewaySessionStore: DataStore<Preferences> by preferencesDataStore(
    name = "gateway_session",
)

@Singleton
class PersistedSessionProvider @Inject constructor(
    @ApplicationContext private val context: Context,
) : SessionProvider {
    private val mutex = Mutex()
    private val _active = MutableStateFlow<ActiveSession?>(null)
    override val activeSession: StateFlow<ActiveSession?> = _active.asStateFlow()

    private val _known = MutableStateFlow<List<KnownSession>>(emptyList())
    override val knownSessions: StateFlow<List<KnownSession>> = _known.asStateFlow()

    private var loaded = false

    private object Keys {
        val SessionsJson = stringPreferencesKey("sessions_json")
        val ActiveSessionKey = stringPreferencesKey("active_session_key")
        /** Legacy mono-sesión (migración). */
        val SessionKey = stringPreferencesKey("session_key")
        val AgentId = stringPreferencesKey("agent_id")
    }

    override suspend fun resolveForConnection(config: GatewayConfig, hello: HelloOk): ActiveSession =
        mutex.withLock {
            ensureLoadedLocked()
            val defaults = hello.snapshot.sessionDefaults
            val mainKey = defaults?.mainSessionKey?.trim()?.takeIf { it.isNotEmpty() }
            val mainAgent = defaults?.defaultAgentId?.trim()?.takeIf { it.isNotEmpty() }
                ?: config.defaultAgentId?.trim()?.takeIf { it.isNotEmpty() }

            if (mainKey != null) {
                _known.value = upsertMainLocked(_known.value, mainKey, mainAgent)
            }

            val existing = _active.value
            if (existing != null) {
                // Reconexión: no cambia la activa; solo asegura catálogo + principal.
                ensureKnownLocked(
                    sessionKey = existing.sessionKey,
                    displayName = existing.sessionKey,
                    agentId = existing.agentId,
                    isMain = false,
                )
                persistLocked()
                return existing
            }

            val fromConfigKey = config.defaultSessionKey?.trim()?.takeIf { it.isNotEmpty() }
            val fromConfigAgent = config.defaultAgentId?.trim()?.takeIf { it.isNotEmpty() }
            if (fromConfigKey != null) {
                val session = ActiveSession(sessionKey = fromConfigKey, agentId = fromConfigAgent)
                ensureKnownLocked(
                    sessionKey = fromConfigKey,
                    displayName = fromConfigKey,
                    agentId = fromConfigAgent,
                    isMain = false,
                )
                _active.value = session
                persistLocked()
                return session
            }

            require(mainKey != null) {
                "session_unavailable: configure defaultSessionKey or use a gateway with sessionDefaults"
            }
            val session = ActiveSession(sessionKey = mainKey, agentId = mainAgent)
            _active.value = session
            persistLocked()
            session
        }

    override suspend fun setActive(sessionKey: String, agentId: String?) = mutex.withLock {
        ensureLoadedLocked()
        val key = sessionKey.trim()
        require(key.isNotEmpty()) { "session_key_blank" }
        val agent = agentId?.trim()?.takeIf { it.isNotEmpty() } ?: agentIdFromSessionKey(key)
        ensureKnownLocked(
            sessionKey = key,
            displayName = key,
            agentId = agent,
            isMain = false,
        )
        _active.value = ActiveSession(sessionKey = key, agentId = agent)
        touchActivityLocked(key)
        persistLocked()
    }

    override suspend fun registerAndActivate(
        sessionKey: String,
        displayName: String,
        agentId: String?,
    ): KnownSession = mutex.withLock {
        ensureLoadedLocked()
        val key = sessionKey.trim()
        require(key.isNotEmpty()) { "session_key_blank" }
        val name = displayName.trim()
        require(name.isNotEmpty()) { "display_name_blank" }
        val agent = agentId?.trim()?.takeIf { it.isNotEmpty() } ?: agentIdFromSessionKey(key)
        val known = ensureKnownLocked(
            sessionKey = key,
            displayName = name,
            agentId = agent,
            isMain = false,
            forceDisplayName = true,
        )
        _active.value = ActiveSession(sessionKey = key, agentId = agent)
        touchActivityLocked(key)
        persistLocked()
        known
    }

    override suspend fun registerWithoutActivating(
        sessionKey: String,
        displayName: String,
        agentId: String?,
    ): KnownSession = mutex.withLock {
        ensureLoadedLocked()
        val key = sessionKey.trim()
        require(key.isNotEmpty()) { "session_key_blank" }
        val name = displayName.trim()
        require(name.isNotEmpty()) { "display_name_blank" }
        val agent = agentId?.trim()?.takeIf { it.isNotEmpty() } ?: agentIdFromSessionKey(key)
        val known = ensureKnownLocked(
            sessionKey = key,
            displayName = name,
            agentId = agent,
            isMain = false,
            forceDisplayName = true,
        )
        touchActivityLocked(key)
        persistLocked()
        known
    }

    override suspend fun updateDisplayName(
        sessionKey: String,
        displayName: String,
    ): KnownSession? = mutex.withLock {
        ensureLoadedLocked()
        val key = sessionKey.trim()
        val name = displayName.trim()
        if (key.isEmpty() || name.isEmpty()) return null
        val existing = _known.value.find { it.sessionKey == key } ?: return null
        val updated = existing.copy(displayName = name)
        _known.value = sortKnown(
            _known.value.map { if (it.sessionKey == key) updated else it },
        )
        // No tocar _active ni sessionKey.
        persistLocked()
        updated
    }

    override suspend fun clear() = mutex.withLock {
        context.gatewaySessionStore.edit { it.clear() }
        _active.value = null
        _known.value = emptyList()
        loaded = true
    }

    private suspend fun ensureLoadedLocked() {
        if (loaded) return
        val prefs = context.gatewaySessionStore.data.first()
        val rawSessions = prefs[Keys.SessionsJson]
        val known = if (!rawSessions.isNullOrBlank()) {
            runCatching {
                GatewayJson.decodeFromString(
                    ListSerializer(KnownSession.serializer()),
                    rawSessions,
                )
            }.getOrDefault(emptyList())
        } else {
            emptyList()
        }
        _known.value = sortKnown(known)

        val activeKey = prefs[Keys.ActiveSessionKey]?.trim()?.takeIf { it.isNotEmpty() }
            ?: prefs[Keys.SessionKey]?.trim()?.takeIf { it.isNotEmpty() }
        _active.value = if (activeKey != null) {
            val fromKnown = known.find { it.sessionKey == activeKey }
            val agent = fromKnown?.agentId
                ?: prefs[Keys.AgentId]?.trim()?.takeIf { it.isNotEmpty() }
                ?: agentIdFromSessionKey(activeKey)
            ActiveSession(sessionKey = activeKey, agentId = agent)
        } else {
            null
        }
        loaded = true
    }

    private fun upsertMainLocked(
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

    private fun ensureKnownLocked(
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

    private fun touchActivityLocked(sessionKey: String) {
        val now = System.currentTimeMillis()
        _known.value = sortKnown(
            _known.value.map {
                if (it.sessionKey == sessionKey) it.copy(lastActivityAtMs = now) else it
            },
        )
    }

    private suspend fun persistLocked() {
        val sessions = _known.value
        val json = GatewayJson.encodeToString(
            ListSerializer(KnownSession.serializer()),
            sessions,
        )
        context.gatewaySessionStore.edit { prefs ->
            prefs[Keys.SessionsJson] = json
            val active = _active.value
            if (active != null) {
                prefs[Keys.ActiveSessionKey] = active.sessionKey
                // Limpia legacy mono-sesión para no rehidratar estado viejo.
                prefs.remove(Keys.SessionKey)
                val agent = active.agentId
                if (agent.isNullOrBlank()) {
                    prefs.remove(Keys.AgentId)
                } else {
                    prefs[Keys.AgentId] = agent
                }
            } else {
                prefs.remove(Keys.ActiveSessionKey)
                prefs.remove(Keys.SessionKey)
                prefs.remove(Keys.AgentId)
            }
        }
    }

    private fun sortKnown(list: List<KnownSession>): List<KnownSession> =
        list.sortedWith(
            compareByDescending<KnownSession> { it.isMain }
                .thenByDescending { it.lastActivityAtMs ?: it.createdAtMs },
        )
}
