package mx.ideass.personal.agent.gateway.events

import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.encodeToJsonElement
import mx.ideass.personal.agent.gateway.protocol.ChatEvent
import mx.ideass.personal.agent.gateway.protocol.ChatEventErrorKind
import mx.ideass.personal.agent.gateway.protocol.GatewayEvents
import mx.ideass.personal.agent.gateway.protocol.GatewayFrame
import mx.ideass.personal.agent.gateway.protocol.GatewayJson
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class GatewayEventBusTest {
    @Test
    fun publish_parsesChatAndTick() = runBlocking {
        val bus = GatewayEventBus()
        // Suscriptor activo antes de publicar (SharedFlow sin replay).
        val chatJob = launch {
            val chat = withTimeout(2_000) { bus.observeChat().first() }
            assertTrue(chat is ChatEvent.Delta)
            assertEquals("hola", (chat as ChatEvent.Delta).deltaText)
        }
        // Ceder para que el collect arranque.
        kotlinx.coroutines.yield()

        bus.publish(
            GatewayFrame.Event(
                event = GatewayEvents.TICK,
                payload = buildJsonObject { put("ts", JsonPrimitive(7L)) },
            ),
        )
        bus.publish(
            GatewayFrame.Event(
                event = GatewayEvents.CHAT,
                payload = GatewayJson.encodeToJsonElement(
                    ChatEvent.serializer(),
                    ChatEvent.Delta(
                        runId = "r1",
                        sessionKey = "s1",
                        seq = 1,
                        deltaText = "hola",
                    ),
                ),
            ),
        )

        chatJob.join()

        val tick = bus.parse(
            GatewayFrame.Event(
                event = GatewayEvents.TICK,
                payload = buildJsonObject { put("ts", JsonPrimitive(1L)) },
            ),
        )
        assertTrue(tick is GatewayBusEvent.Tick)
        assertEquals(1L, (tick as GatewayBusEvent.Tick).payload.ts)
    }

    @Test
    fun parse_chatErrorAndUnknown() {
        val bus = GatewayEventBus()
        val error = bus.parse(
            GatewayFrame.Event(
                event = GatewayEvents.CHAT,
                payload = GatewayJson.encodeToJsonElement(
                    ChatEvent.serializer(),
                    ChatEvent.Error(
                        runId = "r",
                        sessionKey = "s",
                        seq = 2,
                        errorKind = ChatEventErrorKind.TIMEOUT,
                        errorMessage = "slow",
                    ),
                ),
            ),
        )
        assertTrue(error is GatewayBusEvent.Chat)
        assertTrue((error as GatewayBusEvent.Chat).payload is ChatEvent.Error)

        val unknown = bus.parse(
            GatewayFrame.Event(event = "presence", payload = buildJsonObject {}),
        )
        assertTrue(unknown is GatewayBusEvent.Unknown)
    }
}
