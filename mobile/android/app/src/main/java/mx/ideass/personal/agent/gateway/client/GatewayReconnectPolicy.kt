package mx.ideass.personal.agent.gateway.client

import mx.ideass.personal.agent.gateway.protocol.ConnectErrorCodes

/**
 * Política de reintento del bucle de sesión Gateway.
 * Solo errores de auth definitivos detienen el bucle; el resto reintenta.
 */
object GatewayReconnectPolicy {

    /**
     * Códigos de connect que no se recuperan solos (hay que reconfigurar /
     * re-emparejar). El bucle de sesión debe parar con estado [Error] claro.
     */
    fun isTerminalAuth(code: String?): Boolean = when (code) {
        ConnectErrorCodes.AUTH_SCOPE_MISMATCH,
        ConnectErrorCodes.AUTH_TOKEN_MISSING,
        ConnectErrorCodes.AUTH_PASSWORD_MISSING,
        ConnectErrorCodes.AUTH_PASSWORD_MISMATCH,
        ConnectErrorCodes.AUTH_BOOTSTRAP_TOKEN_INVALID,
        ConnectErrorCodes.DEVICE_IDENTITY_REQUIRED,
        ConnectErrorCodes.CONTROL_UI_DEVICE_IDENTITY_REQUIRED,
        ConnectErrorCodes.CLIENT_VERSION_MISMATCH,
        -> true
        else -> false
    }
}
