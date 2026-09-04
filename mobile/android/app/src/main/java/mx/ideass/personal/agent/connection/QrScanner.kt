package mx.ideass.personal.agent.connection

/**
 * Abstracción de escaneo QR. Solo emite [rawValue]; no conoce pairing ni Hub.
 */
interface QrScanner {
    fun start(onDetected: (rawValue: String) -> Unit)
    fun stop()
    fun dispose()
}
