package mx.ideass.personal.agent.gateway.auth

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Preferencias cifradas con MasterKey AES-256-GCM en Android Keystore.
 *
 * `security-crypto` 1.1 marca estas APIs como deprecated; se mantienen porque
 * siguen siendo el puente estable Keystore↔prefs en minSdk 29.
 */
@Suppress("DEPRECATION")
class KeystoreEncryptedStringStore(
    context: Context,
    prefsName: String,
) : SecureStringStore {
    private val prefs: SharedPreferences

    init {
        val masterKey = MasterKey.Builder(context.applicationContext)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        prefs = EncryptedSharedPreferences.create(
            context.applicationContext,
            prefsName,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    override fun getString(key: String): String? = prefs.getString(key, null)

    override fun putString(key: String, value: String) {
        prefs.edit().putString(key, value).apply()
    }

    override fun remove(key: String) {
        prefs.edit().remove(key).apply()
    }
}
