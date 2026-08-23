package mx.ideass.personal.agent.gateway.events

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.mapNotNull
import kotlinx.serialization.json.decodeFromJsonElement
import mx.ideass.personal.agent.gateway.protocol.ChatEvent
import mx.ideass.personal.agent.gateway.protocol.ConnectChallengePayload
import mx.ideass.personal.agent.gateway.protocol.DevicePairRequestedEvent
import mx.ideass.personal.agent.gateway.protocol.DevicePairResolvedEvent
import mx.ideass.personal.agent.gateway.protocol.GatewayEvents
import mx.ideass.personal.agent.gateway.protocol.GatewayFrame
import mx.ideass.personal.agent.gateway.protocol.GatewayJson
import mx.ideass.personal.agent.gateway.protocol.ShutdownEventPayload
import mx.ideass.personal.agent.gateway.protocol.TickEventPayload

/**
 * Bus de eventos del Gateway. Parsea payloads conocidos; el resto queda en [GatewayBusEvent.Unknown].
 * No loguea cuerpos de chat ni secretos.
 */
class GatewayEventBus {
    private val _events = MutableSharedFlow<GatewayBusEvent>(extraBufferCapacity = 128)
    val events: SharedFlow<GatewayBusEvent> = _events.asSharedFlow()

    fun publish(frame: GatewayFrame.Event) {
        _events.tryEmit(parse(frame))
    }

    fun observeChat(): Flow<ChatEvent> =
        events.mapNotNull { (it as? GatewayBusEvent.Chat)?.payload }

    fun observeTicks(): Flow<TickEventPayload> =
        events.mapNotNull { (it as? GatewayBusEvent.Tick)?.payload }

    fun parse(frame: GatewayFrame.Event): GatewayBusEvent {
        val payload = frame.payload
        return when (frame.event) {
            GatewayEvents.CONNECT_CHALLENGE -> {
                val challenge = payload?.let {
                    runCatching {
                        GatewayJson.decodeFromJsonElement(ConnectChallengePayload.serializer(), it)
                    }.getOrNull()
                }
                if (challenge != null) {
                    GatewayBusEvent.Challenge(frame, challenge.nonce, challenge.ts)
                } else {
                    GatewayBusEvent.Unknown(frame)
                }
            }
            GatewayEvents.TICK -> {
                val tick = payload?.let {
                    runCatching {
                        GatewayJson.decodeFromJsonElement(TickEventPayload.serializer(), it)
                    }.getOrNull()
                }
                if (tick != null) GatewayBusEvent.Tick(frame, tick) else GatewayBusEvent.Unknown(frame)
            }
            GatewayEvents.SHUTDOWN -> {
                val shutdown = payload?.let {
                    runCatching {
                        GatewayJson.decodeFromJsonElement(ShutdownEventPayload.serializer(), it)
                    }.getOrNull()
                }
                if (shutdown != null) {
                    GatewayBusEvent.Shutdown(frame, shutdown)
                } else {
                    GatewayBusEvent.Unknown(frame)
                }
            }
            GatewayEvents.CHAT -> {
                val chat = payload?.let {
                    runCatching {
                        GatewayJson.decodeFromJsonElement(ChatEvent.serializer(), it)
                    }.getOrNull()
                }
                if (chat != null) GatewayBusEvent.Chat(frame, chat) else GatewayBusEvent.Unknown(frame)
            }
            GatewayEvents.DEVICE_PAIR_REQUESTED -> {
                val pair = payload?.let {
                    runCatching {
                        GatewayJson.decodeFromJsonElement(DevicePairRequestedEvent.serializer(), it)
                    }.getOrNull()
                }
                if (pair != null) {
                    GatewayBusEvent.DevicePairRequested(frame, pair)
                } else {
                    GatewayBusEvent.Unknown(frame)
                }
            }
            GatewayEvents.DEVICE_PAIR_RESOLVED -> {
                val pair = payload?.let {
                    runCatching {
                        GatewayJson.decodeFromJsonElement(DevicePairResolvedEvent.serializer(), it)
                    }.getOrNull()
                }
                if (pair != null) {
                    GatewayBusEvent.DevicePairResolved(frame, pair)
                } else {
                    GatewayBusEvent.Unknown(frame)
                }
            }
            else -> GatewayBusEvent.Unknown(frame)
        }
    }
}
