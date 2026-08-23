package mx.ideass.personal.agent.gateway.protocol

/**
 * Nombres de métodos RPC usados por el cliente (core-descriptors del tag).
 */
object RpcMethods {
    const val CONNECT: String = "connect"

    const val CHAT_HISTORY: String = "chat.history"
    const val CHAT_STARTUP: String = "chat.startup"
    const val CHAT_METADATA: String = "chat.metadata"
    const val CHAT_MESSAGE_GET: String = "chat.message.get"
    const val CHAT_SEND: String = "chat.send"
    const val CHAT_ABORT: String = "chat.abort"

    const val SESSIONS_LIST: String = "sessions.list"
    const val SESSIONS_RESOLVE: String = "sessions.resolve"
    const val SESSIONS_CREATE: String = "sessions.create"
    const val SESSIONS_PATCH: String = "sessions.patch"
    const val SESSIONS_DELETE: String = "sessions.delete"
    const val SESSIONS_MESSAGES_SUBSCRIBE: String = "sessions.messages.subscribe"
    const val SESSIONS_MESSAGES_UNSUBSCRIBE: String = "sessions.messages.unsubscribe"

    const val DEVICE_PAIR_LIST: String = "device.pair.list"
    const val DEVICE_PAIR_APPROVE: String = "device.pair.approve"
    const val DEVICE_PAIR_REJECT: String = "device.pair.reject"
    const val DEVICE_PAIR_REMOVE: String = "device.pair.remove"
    const val DEVICE_PAIR_SETUP_CODE: String = "device.pair.setupCode"
}

/** Nombres de eventos de wire relevantes. */
object GatewayEvents {
    const val CONNECT_CHALLENGE: String = "connect.challenge"
    const val TICK: String = "tick"
    const val SHUTDOWN: String = "shutdown"
    const val CHAT: String = "chat"
    const val DEVICE_PAIR_REQUESTED: String = "device.pair.requested"
    const val DEVICE_PAIR_RESOLVED: String = "device.pair.resolved"
}
