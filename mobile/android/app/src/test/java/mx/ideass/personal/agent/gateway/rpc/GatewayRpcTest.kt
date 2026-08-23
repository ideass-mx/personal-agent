package mx.ideass.personal.agent.gateway.rpc

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import mx.ideass.personal.agent.gateway.protocol.ErrorShape
import mx.ideass.personal.agent.gateway.protocol.GatewayErrorCodes
import mx.ideass.personal.agent.gateway.protocol.GatewayFrame
import mx.ideass.personal.agent.gateway.protocol.RpcMethods
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.concurrent.atomic.AtomicInteger

class GatewayRpcTest {
    @Test
    fun request_correlatesResponse() = runBlocking {
        val pending = PendingRpc()
        val rpc = GatewayRpc(
            sender = FrameSender { frame ->
                val req = frame as GatewayFrame.Request
                pending.complete(
                    GatewayFrame.Response(
                        id = req.id,
                        ok = true,
                        payload = buildJsonObject { put("ok", JsonPrimitive(true)) },
                    ),
                )
                true
            },
            pending = pending,
            defaultTimeoutMs = 1_000,
        )

        val res = rpc.request(method = "health", params = null)
        assertTrue(res.ok)
        assertEquals("true", res.payload!!.jsonObject.getValue("ok").jsonPrimitive.content)
    }

    @Test
    fun request_retriesOnTimeout_withNewIdSameParams() = runBlocking {
        val pending = PendingRpc()
        val attempts = AtomicInteger(0)
        val ids = mutableListOf<String>()
        val idem = IdempotencyKeys.newKey()
        val params = buildJsonObject {
            put("sessionKey", JsonPrimitive("agent:main:main"))
            put("message", JsonPrimitive("hola"))
            put("idempotencyKey", JsonPrimitive(idem))
        }

        val rpc = GatewayRpc(
            sender = FrameSender { frame ->
                val req = frame as GatewayFrame.Request
                ids += req.id
                val n = attempts.incrementAndGet()
                if (n >= 2) {
                    pending.complete(
                        GatewayFrame.Response(
                            id = req.id,
                            ok = true,
                            payload = buildJsonObject { put("runId", JsonPrimitive("run-1")) },
                        ),
                    )
                }
                // Intento 1: no responde → timeout
                true
            },
            pending = pending,
            defaultTimeoutMs = 60,
            idGenerator = { "id-${attempts.get() + 1}" },
        )

        val res = rpc.request(
            method = RpcMethods.CHAT_SEND,
            params = params,
            timeoutMs = 60,
            retryOnTimeoutAttempts = 1,
        )
        assertEquals(2, ids.size)
        assertEquals("id-1", ids[0])
        assertEquals("id-2", ids[1])
        assertEquals(
            "run-1",
            res.payload!!.jsonObject.getValue("runId").jsonPrimitive.content,
        )
        // Misma idempotency key en ambos intentos (params inmutables).
        assertEquals(idem, params.getValue("idempotencyKey").jsonPrimitive.content)
    }

    @Test
    fun request_propagatesGatewayError() = runBlocking {
        val pending = PendingRpc()
        val rpc = GatewayRpc(
            sender = FrameSender { frame ->
                val req = frame as GatewayFrame.Request
                pending.complete(
                    GatewayFrame.Response(
                        id = req.id,
                        ok = false,
                        error = ErrorShape(
                            code = GatewayErrorCodes.INVALID_REQUEST,
                            message = "bad params",
                        ),
                    ),
                )
                true
            },
            pending = pending,
        )

        try {
            rpc.request("chat.send", buildJsonObject {})
            throw AssertionError("expected GatewayRpcException")
        } catch (e: GatewayRpcException) {
            assertEquals(GatewayErrorCodes.INVALID_REQUEST, e.error.code)
        }
    }

    @Test
    fun request_throwsAfterExhaustingRetries() = runBlocking {
        val pending = PendingRpc()
        var sends = 0
        val rpc = GatewayRpc(
            sender = FrameSender {
                sends += 1
                true
            },
            pending = pending,
            idGenerator = { "t-$sends" },
        )
        try {
            rpc.request(
                method = "status",
                timeoutMs = 40,
                retryOnTimeoutAttempts = 1,
            )
            throw AssertionError("expected timeout")
        } catch (_: RpcTimeoutException) {
            assertEquals(2, sends)
        }
    }
}
