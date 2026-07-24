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
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "settings")

data class HubConfig(
    val address: String,
    val token: String,
    val deviceName: String,
)

@Singleton
class AppPreferences @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private object Keys {
        val HubAddress = stringPreferencesKey("hub_address")
        val HubToken = stringPreferencesKey("hub_token")
        val DeviceName = stringPreferencesKey("device_name")
        val DeviceId = stringPreferencesKey("device_id")
        val ConversationId = stringPreferencesKey("conversation_id")
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

    val conversationId: Flow<String?> = context.dataStore.data.map { prefs ->
        prefs[Keys.ConversationId]
    }

    suspend fun isConfigured(): Boolean = hubConfig.first() != null

    suspend fun getHubConfig(): HubConfig? = hubConfig.first()

    suspend fun getConversationId(): String? = conversationId.first()

    suspend fun saveHubConfig(address: String, token: String, deviceName: String) {
        context.dataStore.edit { prefs ->
            prefs[Keys.HubAddress] = address.trim()
            prefs[Keys.HubToken] = token.trim()
            prefs[Keys.DeviceName] = deviceName.trim()
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
}
