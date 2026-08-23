package mx.ideass.personal.agent.gateway.rpc

/** Timeout esperando `res` para un `req` concreto. */
class RpcTimeoutException(
    val requestId: String,
    val method: String?,
    val timeoutMs: Long,
    cause: Throwable? = null,
) : Exception(
    "rpc_timeout id=$requestId method=${method ?: "?"} timeoutMs=$timeoutMs",
    cause,
)
