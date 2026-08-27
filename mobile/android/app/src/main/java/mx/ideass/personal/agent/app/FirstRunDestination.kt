package mx.ideass.personal.agent.app

/**
 * Destino de arranque tras Boot (PHASE 37 Hub-first).
 * Sin conexión configurada → Connection; con config → Chat.
 */
enum class FirstRunDestination {
    Connection,
    Chat,
}

fun firstRunDestination(configured: Boolean): FirstRunDestination =
    if (configured) FirstRunDestination.Chat else FirstRunDestination.Connection
