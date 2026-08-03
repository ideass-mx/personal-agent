package mx.ideass.personal.agent.gateway.protocol

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/** Envelope de error estructurado (`ErrorShapeSchema`). */
@Serializable
data class ErrorShape(
    val code: String,
    val message: String,
    val details: JsonElement? = null,
    val retryable: Boolean? = null,
    val retryAfterMs: Long? = null,
)

/** Contadores de versión de estado (`StateVersionSchema`). */
@Serializable
data class StateVersion(
    val presence: Long,
    val health: Long,
)

/**
 * Frame de nivel superior del Gateway (`GatewayFrameSchema`).
 * Discriminador: `type`.
 */
@Serializable
sealed interface GatewayFrame {
    @Serializable
    @SerialName("req")
    data class Request(
        val id: String,
        val method: String,
        val params: JsonElement? = null,
    ) : GatewayFrame

    @Serializable
    @SerialName("res")
    data class Response(
        val id: String,
        val ok: Boolean,
        val payload: JsonElement? = null,
        val error: ErrorShape? = null,
    ) : GatewayFrame

    @Serializable
    @SerialName("event")
    data class Event(
        val event: String,
        val payload: JsonElement? = null,
        val seq: Long? = null,
        val stateVersion: StateVersion? = null,
    ) : GatewayFrame
}

/** Payload de `connect.challenge` (server → client). */
@Serializable
data class ConnectChallengePayload(
    val nonce: String,
    val ts: Long? = null,
)

/** Payload del evento `tick`. */
@Serializable
data class TickEventPayload(
    val ts: Long,
)

/** Payload del evento `shutdown`. */
@Serializable
data class ShutdownEventPayload(
    val reason: String,
    val restartExpectedMs: Long? = null,
)
