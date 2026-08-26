package mx.ideass.personal.agent.workspace

/** Convierte la dirección WS/HTTP del Hub en origen HTTP (sin /ws). */
object HubHttpOrigin {
    fun fromAddress(address: String): String {
        var value = address.trim().trimEnd('/')
        if (value.endsWith("/ws")) {
            value = value.dropLast(3).trimEnd('/')
        }
        value = when {
            value.startsWith("ws://") -> "http://" + value.removePrefix("ws://")
            value.startsWith("wss://") -> "https://" + value.removePrefix("wss://")
            value.startsWith("http://") || value.startsWith("https://") -> value
            else -> "http://$value"
        }
        return value.trimEnd('/')
    }
}
