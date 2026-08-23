package mx.ideass.personal.agent.gateway.rpc

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.decodeFromJsonElement
import mx.ideass.personal.agent.gateway.protocol.GatewayFrame
import mx.ideass.personal.agent.gateway.protocol.GatewayJson
import java.util.UUID

/**
 * Cliente RPC sobre frames Gateway: correlación por id, timeouts e
 * reintentos acotados (misma carga / idempotency key, nuevo id de req).
 */
class GatewayRpc(
    private val sender: FrameSender,
    private val pending: PendingRpc,
    val defaultTimeoutMs: Long = DEFAULT_RPC_TIMEOUT_MS,
    private val idGenerator: () -> String = { UUID.randomUUID().toString() },
) {
    /**
     * @param retryOnTimeoutAttempts reintentos adicionales tras timeout
     *   (útil con métodos que llevan `idempotencyKey` en params).
     */
    suspend fun request(
        method: String,
        params: JsonElement? = null,
        timeoutMs: Long = defaultTimeoutMs,
        retryOnTimeoutAttempts: Int = 0,
    ): GatewayFrame.Response {
        require(retryOnTimeoutAttempts >= 0) { "retryOnTimeoutAttempts_negative" }
        val attempts = 1 + retryOnTimeoutAttempts
        var lastTimeout: RpcTimeoutException? = null

        repeat(attempts) { attemptIndex ->
            val id = idGenerator()
            val deferred = pending.register(id)
            val sent = sender.send(
                GatewayFrame.Request(
                    id = id,
                    method = method,
                    params = params,
                ),
            )
            if (!sent) {
                pending.failAll(IllegalStateException("socket_send_failed"))
                error("socket_send_failed")
            }
            try {
                val response = pending.await(
                    id = id,
                    deferred = deferred,
                    timeoutMs = timeoutMs,
                    method = method,
                )
                if (!response.ok) {
                    val error = response.error ?: error("rpc_error_missing")
                    throw GatewayRpcException(error)
                }
                return response
            } catch (e: RpcTimeoutException) {
                lastTimeout = e
                if (attemptIndex == attempts - 1) throw e
            }
        }
        throw lastTimeout ?: error("rpc_unreachable")
    }

    suspend inline fun <reified T> requestDecoded(
        method: String,
        params: JsonElement? = null,
        timeoutMs: Long = defaultTimeoutMs,
        retryOnTimeoutAttempts: Int = 0,
    ): T {
        val response = request(
            method = method,
            params = params,
            timeoutMs = timeoutMs,
            retryOnTimeoutAttempts = retryOnTimeoutAttempts,
        )
        val payload = response.payload ?: error("rpc_payload_missing:$method")
        return GatewayJson.decodeFromJsonElement(payload)
    }

    companion object {
        const val DEFAULT_RPC_TIMEOUT_MS: Long = 30_000
    }
}
