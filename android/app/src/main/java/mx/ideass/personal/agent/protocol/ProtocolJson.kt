package mx.ideass.personal.agent.protocol

import kotlinx.serialization.json.Json

val ProtocolJson = Json {
    ignoreUnknownKeys = true
    classDiscriminator = "type"
    encodeDefaults = false
}
