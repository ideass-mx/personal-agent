package mx.ideass.personal.agent.gateway.client

import mx.ideass.personal.agent.gateway.protocol.ConnectErrorCodes

/** Mensaje de UI para códigos de connect-error (sin secretos). */
fun humanizeConnectError(code: String?, fallback: String?): String {
    val base = when (code) {
        ConnectErrorCodes.AUTH_TOKEN_MISMATCH,
        ConnectErrorCodes.AUTH_DEVICE_TOKEN_MISMATCH,
        -> "Token inválido"
        ConnectErrorCodes.AUTH_TOKEN_MISSING -> "Falta el token"
        ConnectErrorCodes.AUTH_BOOTSTRAP_TOKEN_INVALID -> "Setup-code inválido"
        ConnectErrorCodes.AUTH_SCOPE_MISMATCH -> "Scopes insuficientes"
        ConnectErrorCodes.AUTH_PASSWORD_MISMATCH,
        ConnectErrorCodes.AUTH_PASSWORD_MISSING,
        -> "Credenciales inválidas"
        ConnectErrorCodes.AUTH_RATE_LIMITED -> "Demasiados intentos"
        ConnectErrorCodes.PAIRING_REQUIRED -> "Emparejamiento pendiente"
        ConnectErrorCodes.DEVICE_IDENTITY_REQUIRED,
        ConnectErrorCodes.CONTROL_UI_DEVICE_IDENTITY_REQUIRED,
        -> "Se requiere identidad de dispositivo"
        ConnectErrorCodes.CLIENT_VERSION_MISMATCH -> "Versión de cliente incompatible"
        "TIMEOUT" -> "Sin respuesta del Gateway"
        else -> fallback?.takeIf { it.isNotBlank() } ?: "Error de conexión"
    }
    return if (code.isNullOrBlank() || code == "TIMEOUT") {
        base
    } else {
        "$base ($code)"
    }
}
