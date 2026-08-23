package mx.ideass.personal.agent.gateway.auth

/** Almacén de strings sensibles (producción: EncryptedSharedPreferences + Keystore). */
interface SecureStringStore {
    fun getString(key: String): String?

    fun putString(key: String, value: String)

    fun remove(key: String)
}
