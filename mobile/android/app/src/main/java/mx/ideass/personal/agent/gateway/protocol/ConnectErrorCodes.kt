package mx.ideass.personal.agent.gateway.protocol

/**
 * Códigos de detalle de error de connect
 * (`ConnectErrorDetailCodes` en el tag).
 */
object ConnectErrorCodes {
    const val AUTH_TOKEN_MISSING: String = "AUTH_TOKEN_MISSING"
    const val AUTH_TOKEN_MISMATCH: String = "AUTH_TOKEN_MISMATCH"
    const val AUTH_BOOTSTRAP_TOKEN_INVALID: String = "AUTH_BOOTSTRAP_TOKEN_INVALID"
    const val AUTH_PASSWORD_MISSING: String = "AUTH_PASSWORD_MISSING"
    const val AUTH_PASSWORD_MISMATCH: String = "AUTH_PASSWORD_MISMATCH"
    const val AUTH_RATE_LIMITED: String = "AUTH_RATE_LIMITED"
    const val AUTH_DEVICE_TOKEN_MISMATCH: String = "AUTH_DEVICE_TOKEN_MISMATCH"
    const val AUTH_SCOPE_MISMATCH: String = "AUTH_SCOPE_MISMATCH"
    const val PAIRING_REQUIRED: String = "PAIRING_REQUIRED"
    const val CONTROL_UI_DEVICE_IDENTITY_REQUIRED: String = "CONTROL_UI_DEVICE_IDENTITY_REQUIRED"
    const val DEVICE_IDENTITY_REQUIRED: String = "DEVICE_IDENTITY_REQUIRED"
    const val CLIENT_VERSION_MISMATCH: String = "CLIENT_VERSION_MISMATCH"
}

/** Códigos RPC genéricos (`ErrorCodes` en el tag). */
object GatewayErrorCodes {
    const val NOT_LINKED: String = "NOT_LINKED"
    const val NOT_PAIRED: String = "NOT_PAIRED"
    const val AGENT_TIMEOUT: String = "AGENT_TIMEOUT"
    const val INVALID_REQUEST: String = "INVALID_REQUEST"
    const val APPROVAL_NOT_FOUND: String = "APPROVAL_NOT_FOUND"
    const val UNAVAILABLE: String = "UNAVAILABLE"
}
