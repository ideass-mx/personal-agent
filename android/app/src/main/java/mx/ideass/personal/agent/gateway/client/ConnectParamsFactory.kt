package mx.ideass.personal.agent.gateway.client

import mx.ideass.personal.agent.gateway.protocol.ConnectParams

/**
 * Construye `ConnectParams` a partir del nonce del challenge.
 * Checkpoint 3 inyectará firma/Keystore; aquí se mantiene desacoplado.
 */
fun interface ConnectParamsFactory {
    fun create(nonce: String): ConnectParams
}
