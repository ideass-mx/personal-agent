package mx.ideass.personal.agent.gateway.protocol

import kotlinx.serialization.json.Json

/**
 * Json del wire Gateway. Discriminador de frames: `type`.
 * `ignoreUnknownKeys` para tolerar campos aditivos del server.
 */
val GatewayJson: Json = Json {
    ignoreUnknownKeys = true
    classDiscriminator = "type"
    encodeDefaults = false
    isLenient = false
}
