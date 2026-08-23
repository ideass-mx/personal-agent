package mx.ideass.personal.agent.gateway.events

import mx.ideass.personal.agent.gateway.protocol.ChatEvent
import mx.ideass.personal.agent.gateway.protocol.DevicePairRequestedEvent
import mx.ideass.personal.agent.gateway.protocol.DevicePairResolvedEvent
import mx.ideass.personal.agent.gateway.protocol.GatewayFrame
import mx.ideass.personal.agent.gateway.protocol.ShutdownEventPayload
import mx.ideass.personal.agent.gateway.protocol.TickEventPayload

/** Eventos de alto nivel emitidos por el bus tras el handshake. */
sealed interface GatewayBusEvent {
    val raw: GatewayFrame.Event

    data class Challenge(
        override val raw: GatewayFrame.Event,
        val nonce: String,
        val ts: Long?,
    ) : GatewayBusEvent

    data class Tick(
        override val raw: GatewayFrame.Event,
        val payload: TickEventPayload,
    ) : GatewayBusEvent

    data class Shutdown(
        override val raw: GatewayFrame.Event,
        val payload: ShutdownEventPayload,
    ) : GatewayBusEvent

    data class Chat(
        override val raw: GatewayFrame.Event,
        val payload: ChatEvent,
    ) : GatewayBusEvent

    data class DevicePairRequested(
        override val raw: GatewayFrame.Event,
        val payload: DevicePairRequestedEvent,
    ) : GatewayBusEvent

    data class DevicePairResolved(
        override val raw: GatewayFrame.Event,
        val payload: DevicePairResolvedEvent,
    ) : GatewayBusEvent

    data class Unknown(
        override val raw: GatewayFrame.Event,
    ) : GatewayBusEvent
}
