package mx.ideass.personal.agent.connection

/**
 * Estado local del scanner QR (no mezcla con estados globales del Agent).
 */
enum class PairingQrScanPhase {
    IDLE,
    REQUESTING_PERMISSION,
    PERMISSION_DENIED,
    PERMISSION_PERMANENTLY_DENIED,
    SCANNING,
    PROCESSING,
    INVALID_QR,
    PAIRING,
}

sealed class QrDetectOutcome {
    data object Ignored : QrDetectOutcome()
    data class Invalid(val message: String) : QrDetectOutcome()
    /** Raw URI listo para el mismo flujo que pegar manualmente. */
    data class Valid(val uri: String) : QrDetectOutcome()
}

/**
 * Controlador de escaneo: duplicados, parse vía [PairingQrParser], sin logs del raw.
 */
class PairingQrScanController(
    private val parse: (String) -> Result<PairingQrPayload> = PairingQrParser::parse,
) {
    @Volatile
    var phase: PairingQrScanPhase = PairingQrScanPhase.IDLE
        private set

    /** Mensaje seguro (sin secretos) tras INVALID_QR. */
    var lastError: String? = null
        private set

    fun onOpenScanner() {
        phase = PairingQrScanPhase.REQUESTING_PERMISSION
        lastError = null
    }

    fun onPermissionGranted() {
        phase = PairingQrScanPhase.SCANNING
        lastError = null
    }

    fun onPermissionDenied(permanentlyDenied: Boolean) {
        phase = if (permanentlyDenied) {
            PairingQrScanPhase.PERMISSION_PERMANENTLY_DENIED
        } else {
            PairingQrScanPhase.PERMISSION_DENIED
        }
    }

    /** Tras QR inválido: volver a escanear (conserva [lastError]). */
    fun resumeScanning() {
        if (phase == PairingQrScanPhase.INVALID_QR ||
            phase == PairingQrScanPhase.PROCESSING
        ) {
            phase = PairingQrScanPhase.SCANNING
        }
    }

    /**
     * Procesa un raw detectado. Nunca registra el valor en logs.
     */
    fun onRawDetected(rawValue: String): QrDetectOutcome {
        if (phase != PairingQrScanPhase.SCANNING) {
            return QrDetectOutcome.Ignored
        }
        phase = PairingQrScanPhase.PROCESSING
        val result = parse(rawValue)
        return if (result.isSuccess) {
            phase = PairingQrScanPhase.PAIRING
            lastError = null
            QrDetectOutcome.Valid(rawValue)
        } else {
            phase = PairingQrScanPhase.INVALID_QR
            val message = safeParseError(result.exceptionOrNull())
            lastError = message
            QrDetectOutcome.Invalid(message)
        }
    }

    fun isAcceptingDetections(): Boolean =
        phase == PairingQrScanPhase.SCANNING

    fun shouldRunCamera(): Boolean =
        phase == PairingQrScanPhase.SCANNING ||
            phase == PairingQrScanPhase.PROCESSING ||
            phase == PairingQrScanPhase.INVALID_QR

    fun onLeave() {
        phase = PairingQrScanPhase.IDLE
        lastError = null
    }

    private fun safeParseError(error: Throwable?): String {
        val code = error?.message?.takeIf { it.isNotBlank() } ?: "invalid_qr"
        return when (code) {
            "empty" -> "Código vacío"
            "unsupported_scheme" -> "No es un QR de Personal Agent"
            "unsupported_version" -> "Versión de QR no soportada"
            "missing_v", "missing_fields" -> "QR incompleto"
            "invalid_endpoint" -> "Endpoint inválido en el QR"
            "forbidden_token_field" -> "QR no permitido (contiene campos de token)"
            else -> "QR inválido"
        }
    }
}
