package mx.ideass.personal.agent.gateway.auth

/** Store en memoria para tests (sin Android Keystore). */
class InMemorySecureStringStore : SecureStringStore {
    private val map = linkedMapOf<String, String>()

    override fun getString(key: String): String? = map[key]

    override fun putString(key: String, value: String) {
        map[key] = value
    }

    override fun remove(key: String) {
        map.remove(key)
    }
}
