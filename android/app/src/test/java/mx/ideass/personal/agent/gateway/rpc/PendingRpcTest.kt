package mx.ideass.personal.agent.gateway.rpc

import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import mx.ideass.personal.agent.gateway.protocol.GatewayFrame
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PendingRpcTest {
    @Test
    fun outOfOrderResponses_resolveCorrectDeferred() = runBlocking {
        val pending = PendingRpc()
        val deferredA = pending.register("a")
        val deferredB = pending.register("b")

        val first = async {
            pending.await("a", deferredA, timeoutMs = 2_000, method = "m")
        }
        val second = async {
            pending.await("b", deferredB, timeoutMs = 2_000, method = "m")
        }

        assertTrue(
            pending.complete(
                GatewayFrame.Response(
                    id = "b",
                    ok = true,
                    payload = buildJsonObject { put("n", JsonPrimitive(2)) },
                ),
            ),
        )
        assertTrue(
            pending.complete(
                GatewayFrame.Response(
                    id = "a",
                    ok = true,
                    payload = buildJsonObject { put("n", JsonPrimitive(1)) },
                ),
            ),
        )

        assertEquals(
            1,
            first.await().payload!!.jsonObject.getValue("n").jsonPrimitive.content.toInt(),
        )
        assertEquals(
            2,
            second.await().payload!!.jsonObject.getValue("n").jsonPrimitive.content.toInt(),
        )
        assertEquals(0, pending.pendingCount())
    }

    @Test
    fun completeBeforeAwait_stillResolves() = runBlocking {
        val pending = PendingRpc()
        val deferred = pending.register("early")
        assertTrue(
            pending.complete(
                GatewayFrame.Response(
                    id = "early",
                    ok = true,
                    payload = buildJsonObject { put("v", JsonPrimitive(9)) },
                ),
            ),
        )
        val response = pending.await("early", deferred, timeoutMs = 500, method = "health")
        assertEquals(9, response.payload!!.jsonObject.getValue("v").jsonPrimitive.content.toInt())
    }

    @Test
    fun timeout_removesPending_andIgnoresLateResponse() = runBlocking {
        val pending = PendingRpc()
        val deferred = pending.register("slow")
        try {
            pending.await("slow", deferred, timeoutMs = 40, method = "chat.send")
            throw AssertionError("expected timeout")
        } catch (e: RpcTimeoutException) {
            assertEquals("slow", e.requestId)
            assertEquals("chat.send", e.method)
        }
        assertEquals(0, pending.pendingCount())
        assertFalse(
            pending.complete(
                GatewayFrame.Response(id = "slow", ok = true, payload = buildJsonObject {}),
            ),
        )
    }

    @Test
    fun failAll_cancelsWaiters() = runBlocking {
        val pending = PendingRpc()
        val deferred = pending.register("x")
        val waiter = async {
            runCatching { pending.await("x", deferred, timeoutMs = 2_000) }
        }
        pending.failAll(IllegalStateException("gone"))
        assertTrue(waiter.await().isFailure)
    }
}
