package mx.ideass.personal.agent.network

import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow

/**
 * Contrato de conexión de chat que consumen UI y AgentService.
 * Implementaciones: hub legacy y Gateway legacy.
 */
interface ChatConnection {
    val connectionState: StateFlow<ConnectionState>
    val inbound: SharedFlow<ChatInbound>

    fun start()
    fun reconnectNow()
    fun sendUserMessage(text: String, conversationId: String?)

    /** Hub: confirm_response. Gateway legacy: no-op. */
    fun sendConfirmResponse(confirmationId: String, approved: Boolean)

    fun isConnected(): Boolean

    suspend fun probe(
        address: String,
        token: String,
        deviceName: String,
    ): Result<Long>

    /** QR pairing (Hub). Gateway: failure. */
    suspend fun pairFromQr(
        endpoint: String,
        pairingSessionId: String,
        pairingSecret: String,
        deviceName: String,
    ): Result<String> = Result.failure(UnsupportedOperationException("pairing_qr_unsupported"))
}
