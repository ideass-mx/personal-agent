package mx.ideass.personal.agent.gateway.rpc

import mx.ideass.personal.agent.gateway.protocol.GatewayFrame

/** Abstracción de envío para poder testear RPC sin OkHttp. */
fun interface FrameSender {
    fun send(frame: GatewayFrame): Boolean
}
