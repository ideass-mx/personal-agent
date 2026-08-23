package mx.ideass.personal.agent.gateway.protocol

/**
 * Versión del protocolo Gateway alineada con OpenClaw `v2026.7.1`
 * (`packages/gateway-protocol/src/version.ts`).
 */
object GatewayProtocolVersion {
    /** PROTOCOL_VERSION / MIN_CLIENT_PROTOCOL_VERSION en el tag. */
    const val CURRENT: Int = 4

    /** MIN_NODE_PROTOCOL_VERSION en el tag (nodo autenticado). */
    const val MIN_NODE: Int = 3

    /** MIN_PROBE_PROTOCOL_VERSION en el tag. */
    const val MIN_PROBE: Int = 3
}
