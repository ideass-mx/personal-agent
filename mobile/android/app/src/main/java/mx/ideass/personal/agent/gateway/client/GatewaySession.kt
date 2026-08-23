package mx.ideass.personal.agent.gateway.client

import mx.ideass.personal.agent.gateway.events.GatewayEventBus
import mx.ideass.personal.agent.gateway.protocol.HelloOk
import mx.ideass.personal.agent.gateway.rpc.GatewayRpc
import mx.ideass.personal.agent.gateway.rpc.PendingRpc
import mx.ideass.personal.agent.gateway.transport.GatewaySocket

/**
 * Sesión operator post-hello: socket + RPC + bus de eventos.
 * La sesión de chat (sessionKey) vive en Checkpoint 5 ([SessionProvider]).
 */
class GatewaySession(
    val socket: GatewaySocket,
    val pendingRpc: PendingRpc,
    val rpc: GatewayRpc,
    val events: GatewayEventBus,
    val hello: HelloOk,
) {
    val tickIntervalMs: Long get() = hello.policy.tickIntervalMs
    val maxPayload: Long get() = hello.policy.maxPayload
    val deviceToken: String? get() = hello.auth.deviceToken
}
