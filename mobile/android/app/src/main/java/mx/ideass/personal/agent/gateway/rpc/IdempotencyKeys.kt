package mx.ideass.personal.agent.gateway.rpc

import java.util.UUID

/** Genera claves de idempotencia para métodos con efectos secundarios (`chat.send`, etc.). */
object IdempotencyKeys {
    fun newKey(): String = UUID.randomUUID().toString()
}
