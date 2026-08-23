package mx.ideass.personal.agent.gateway.rpc

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.withTimeout
import mx.ideass.personal.agent.gateway.protocol.ErrorShape
import mx.ideass.personal.agent.gateway.protocol.GatewayFrame
import java.util.concurrent.ConcurrentHashMap

class GatewayRpcException(
    val error: ErrorShape,
) : Exception(error.message)

/**
 * Correlación req↔res por `id`.
 * Respuestas pueden llegar antes de que el caller entre en [await] (envio síncrono);
 * por eso [await] usa el [CompletableDeferred] devuelto por [register], no un lookup tardío.
 */
class PendingRpc {
    private val pending = ConcurrentHashMap<String, CompletableDeferred<GatewayFrame.Response>>()

    fun register(id: String): CompletableDeferred<GatewayFrame.Response> {
        val deferred = CompletableDeferred<GatewayFrame.Response>()
        val previous = pending.put(id, deferred)
        previous?.completeExceptionally(IllegalStateException("rpc_id_replaced"))
        return deferred
    }

    fun complete(response: GatewayFrame.Response): Boolean {
        val deferred = pending.remove(response.id) ?: return false
        return deferred.complete(response)
    }

    fun failAll(cause: Throwable) {
        val ids = pending.keys.toList()
        for (id in ids) {
            pending.remove(id)?.completeExceptionally(cause)
        }
    }

    fun pendingCount(): Int = pending.size

    suspend fun await(
        id: String,
        deferred: CompletableDeferred<GatewayFrame.Response>,
        timeoutMs: Long,
        method: String? = null,
    ): GatewayFrame.Response {
        return try {
            withTimeout(timeoutMs) { deferred.await() }
        } catch (e: TimeoutCancellationException) {
            pending.remove(id, deferred)
            if (!deferred.isCompleted) {
                deferred.cancel()
            }
            throw RpcTimeoutException(
                requestId = id,
                method = method,
                timeoutMs = timeoutMs,
                cause = e,
            )
        }
    }

    /** Compat: registra y espera en un solo paso (tests / connect). */
    suspend fun await(
        id: String,
        timeoutMs: Long,
        method: String? = null,
    ): GatewayFrame.Response {
        val deferred = pending[id]
            ?: error("rpc_not_registered:$id")
        return await(id = id, deferred = deferred, timeoutMs = timeoutMs, method = method)
    }
}
