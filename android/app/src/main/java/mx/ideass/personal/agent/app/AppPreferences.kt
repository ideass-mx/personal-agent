package mx.ideass.personal.agent.app

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import mx.ideass.personal.agent.gateway.client.GatewayConfigSource
import mx.ideass.personal.agent.gateway.config.ClientAuthMode
import mx.ideass.personal.agent.gateway.config.GatewayConfig
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "settings")

data class HubConfig(
    val address: String,
    val token: String,
    val deviceName: String,
)

enum class ConnectionBackend {
    HUB,
    GATEWAY,
}

@Singleton
class AppPreferences @Inject constructor(
    @ApplicationContext private val context: Context,
) : GatewayConfigSource {
    private object Keys {
        val HubAddress = stringPreferencesKey("hub_address")
        val HubToken = stringPreferencesKey("hub_token")
        val DeviceName = stringPreferencesKey("device_name")
        val DeviceId = stringPreferencesKey("device_id")
        val ConversationId = stringPreferencesKey("conversation_id")
        val Backend = stringPreferencesKey("connection_backend")
        val GatewayUrl = stringPreferencesKey("gateway_url")
        val GatewayToken = stringPreferencesKey("gateway_token")
        val GatewayBootstrap = stringPreferencesKey("gateway_bootstrap")
        val GatewayAgentId = stringPreferencesKey("gateway_agent_id")
        val GatewaySessionKey = stringPreferencesKey("gateway_session_key")
        /** LEGADO: sessionKey de la sesión «Rápidas» (ya no usada por voz). */
        val QuickSessionKey = stringPreferencesKey("quick_session_key")
        /** Id del catálogo neuronal activo (`voice_catalog.json`). */
        val ActiveNeuralVoiceId = stringPreferencesKey("active_voice_id")
    }

    val hubConfig: Flow<HubConfig?> = context.dataStore.data.map { prefs ->
        val address = prefs[Keys.HubAddress].orEmpty()
        val token = prefs[Keys.HubToken].orEmpty()
        if (address.isBlank() || token.isBlank()) {
            null
        } else {
            HubConfig(
                address = address,
                token = token,
                deviceName = prefs[Keys.DeviceName].orEmpty(),
            )
        }
    }

    val connectionBackend: Flow<ConnectionBackend> = context.dataStore.data.map { prefs ->
        when (prefs[Keys.Backend]) {
            "hub" -> ConnectionBackend.HUB
            "gateway" -> ConnectionBackend.GATEWAY
            // Por defecto Gateway; Hub solo si se eligió explícitamente (debug / rollback).
            else -> ConnectionBackend.GATEWAY
        }
    }

    override val config: Flow<GatewayConfig?> = context.dataStore.data.map { prefs ->
        if (prefs[Keys.Backend] != "gateway") return@map null
        val url = prefs[Keys.GatewayUrl].orEmpty().trim()
        if (url.isBlank()) return@map null
        val token = prefs[Keys.GatewayToken]?.trim()?.takeIf { it.isNotEmpty() }
        val bootstrap = prefs[Keys.GatewayBootstrap]?.trim()?.takeIf { it.isNotEmpty() }
        GatewayConfig(
            url = url,
            gatewayStableId = url,
            authMode = when {
                token != null -> ClientAuthMode.TOKEN
                else -> ClientAuthMode.NONE
            },
            sharedToken = token,
            bootstrapToken = bootstrap,
            defaultAgentId = prefs[Keys.GatewayAgentId]?.trim()?.takeIf { it.isNotEmpty() },
            defaultSessionKey = prefs[Keys.GatewaySessionKey]?.trim()?.takeIf { it.isNotEmpty() },
            clientDisplayName = prefs[Keys.DeviceName]?.trim()?.takeIf { it.isNotEmpty() },
        )
    }

    val conversationId: Flow<String?> = context.dataStore.data.map { prefs ->
        prefs[Keys.ConversationId]
    }

    suspend fun isConfigured(): Boolean {
        return when (connectionBackend.first()) {
            ConnectionBackend.GATEWAY -> config.first() != null
            ConnectionBackend.HUB -> hubConfig.first() != null
        }
    }

    suspend fun getHubConfig(): HubConfig? = hubConfig.first()

    suspend fun getConversationId(): String? = conversationId.first()

    suspend fun getConnectionBackend(): ConnectionBackend = connectionBackend.first()

    suspend fun saveHubConfig(address: String, token: String, deviceName: String) {
        context.dataStore.edit { prefs ->
            prefs[Keys.Backend] = "hub"
            prefs[Keys.HubAddress] = address.trim()
            prefs[Keys.HubToken] = token.trim()
            prefs[Keys.DeviceName] = deviceName.trim()
        }
    }

    suspend fun saveGatewayConfig(
        url: String,
        token: String,
        deviceName: String,
        bootstrapToken: String = "",
        agentId: String = "",
        sessionKey: String = "",
    ) {
        context.dataStore.edit { prefs ->
            prefs[Keys.Backend] = "gateway"
            prefs[Keys.GatewayUrl] = url.trim()
            prefs[Keys.GatewayToken] = token.trim()
            prefs[Keys.DeviceName] = deviceName.trim()
            if (bootstrapToken.isBlank()) {
                prefs.remove(Keys.GatewayBootstrap)
            } else {
                prefs[Keys.GatewayBootstrap] = bootstrapToken.trim()
            }
            if (agentId.isBlank()) {
                prefs.remove(Keys.GatewayAgentId)
            } else {
                prefs[Keys.GatewayAgentId] = agentId.trim()
            }
            if (sessionKey.isBlank()) {
                prefs.remove(Keys.GatewaySessionKey)
            } else {
                prefs[Keys.GatewaySessionKey] = sessionKey.trim()
            }
        }
    }

    suspend fun getGatewayUrl(): String? =
        context.dataStore.data.first()[Keys.GatewayUrl]?.trim()?.takeIf { it.isNotEmpty() }

    suspend fun getGatewayToken(): String? =
        context.dataStore.data.first()[Keys.GatewayToken]?.trim()?.takeIf { it.isNotEmpty() }

    suspend fun getGatewayAgentId(): String? =
        context.dataStore.data.first()[Keys.GatewayAgentId]?.trim()?.takeIf { it.isNotEmpty() }

    suspend fun getGatewaySessionKey(): String? =
        context.dataStore.data.first()[Keys.GatewaySessionKey]?.trim()?.takeIf { it.isNotEmpty() }

    suspend fun getQuickSessionKey(): String? =
        context.dataStore.data.first()[Keys.QuickSessionKey]?.trim()?.takeIf { it.isNotEmpty() }

    suspend fun saveQuickSessionKey(sessionKey: String) {
        val key = sessionKey.trim()
        if (key.isEmpty()) return
        context.dataStore.edit { prefs ->
            prefs[Keys.QuickSessionKey] = key
        }
    }

    /** Si la pref apunta a alguna de [sessionKeys], la limpia (evitar huérfanos al borrar). */
    suspend fun clearQuickSessionKeyIfMatching(sessionKeys: Collection<String>) {
        val targets = sessionKeys.map { it.trim() }.filter { it.isNotEmpty() }.toSet()
        if (targets.isEmpty()) return
        val current = getQuickSessionKey() ?: return
        if (current !in targets) return
        context.dataStore.edit { prefs ->
            prefs.remove(Keys.QuickSessionKey)
        }
    }

    suspend fun saveConversationId(id: String) {
        context.dataStore.edit { prefs ->
            prefs[Keys.ConversationId] = id
        }
    }

    suspend fun getOrCreateDeviceId(): String {
        val existing = context.dataStore.data.first()[Keys.DeviceId]
        if (!existing.isNullOrBlank()) return existing
        val created = "android-" + UUID.randomUUID().toString()
        context.dataStore.edit { prefs ->
            prefs[Keys.DeviceId] = created
        }
        return created
    }

    val activeNeuralVoiceId: Flow<String?> = context.dataStore.data.map { prefs ->
        prefs[Keys.ActiveNeuralVoiceId]?.trim()?.takeIf { it.isNotEmpty() }
    }

    suspend fun getActiveNeuralVoiceId(): String? = activeNeuralVoiceId.first()

    suspend fun saveActiveNeuralVoiceId(voiceId: String?) {
        context.dataStore.edit { prefs ->
            val value = voiceId?.trim().orEmpty()
            if (value.isEmpty()) {
                prefs.remove(Keys.ActiveNeuralVoiceId)
            } else {
                prefs[Keys.ActiveNeuralVoiceId] = value
            }
        }
    }
}
