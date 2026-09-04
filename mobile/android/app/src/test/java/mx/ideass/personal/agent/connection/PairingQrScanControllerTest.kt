package mx.ideass.personal.agent.connection

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PairingQrScanControllerTest {
    private val validUri =
        "personalagent://pair?v=1&agent=abc&endpoint=ws%3A%2F%2F100.64.0.1%3A8787%2Fws&session=ps_1&secret=deadbeef"

    @Test
    fun startsRequestingPermissionThenScanning() {
        val c = PairingQrScanController()
        c.onOpenScanner()
        assertEquals(PairingQrScanPhase.REQUESTING_PERMISSION, c.phase)
        c.onPermissionGranted()
        assertEquals(PairingQrScanPhase.SCANNING, c.phase)
        assertTrue(c.isAcceptingDetections())
    }

    @Test
    fun stopsAcceptingAfterValidDetection() {
        val c = PairingQrScanController()
        c.onPermissionGranted()
        val first = c.onRawDetected(validUri)
        assertTrue(first is QrDetectOutcome.Valid)
        assertEquals(PairingQrScanPhase.PAIRING, c.phase)
        assertEquals(QrDetectOutcome.Ignored, c.onRawDetected(validUri))
    }

    @Test
    fun duplicateDetectionIgnoredWhileProcessing() {
        var calls = 0
        val c = PairingQrScanController { raw ->
            calls++
            PairingQrParser.parse(raw)
        }
        c.onPermissionGranted()
        c.onRawDetected(validUri)
        assertEquals(1, calls)
        c.onRawDetected(validUri)
        assertEquals(1, calls)
    }

    @Test
    fun invalidQrReturnsToScanning() {
        val c = PairingQrScanController()
        c.onPermissionGranted()
        val outcome = c.onRawDetected("https://example.com/not-a-pair")
        assertTrue(outcome is QrDetectOutcome.Invalid)
        assertEquals(PairingQrScanPhase.INVALID_QR, c.phase)
        c.resumeScanning()
        assertEquals(PairingQrScanPhase.SCANNING, c.phase)
        assertTrue(c.isAcceptingDetections())
    }

    @Test
    fun validQrStartsPairingPhase() {
        val c = PairingQrScanController()
        c.onPermissionGranted()
        val outcome = c.onRawDetected(validUri) as QrDetectOutcome.Valid
        assertEquals(validUri, outcome.uri)
        assertEquals(PairingQrScanPhase.PAIRING, c.phase)
        assertNull(c.lastError)
    }

    @Test
    fun disposedResetsToIdle() {
        val c = PairingQrScanController()
        c.onPermissionGranted()
        c.onRawDetected(validUri)
        c.onLeave()
        assertEquals(PairingQrScanPhase.IDLE, c.phase)
        assertNull(c.lastError)
        assertEquals(QrDetectOutcome.Ignored, c.onRawDetected(validUri))
    }

    @Test
    fun invalidMessageDoesNotContainSecret() {
        val secret = "super-secret-pairing-value-xyz"
        val bad =
            "personalagent://pair?v=1&agent=a&endpoint=not-ws&session=s&secret=$secret"
        val c = PairingQrScanController()
        c.onPermissionGranted()
        val outcome = c.onRawDetected(bad) as QrDetectOutcome.Invalid
        assertTrue(!outcome.message.contains(secret))
        assertTrue(c.lastError?.contains(secret) != true)
    }

    @Test
    fun invalidDetectionDoesNotReachPairingPhase() {
        val c = PairingQrScanController()
        c.onPermissionGranted()
        c.onRawDetected("not-a-qr")
        assertEquals(PairingQrScanPhase.INVALID_QR, c.phase)
        assertTrue(c.phase != PairingQrScanPhase.PAIRING)
    }

    @Test
    fun rapidBurstsOnlyOneValid() {
        val c = PairingQrScanController()
        c.onPermissionGranted()
        val outcomes = (1..20).map { c.onRawDetected(validUri) }
        assertEquals(1, outcomes.count { it is QrDetectOutcome.Valid })
        assertEquals(19, outcomes.count { it is QrDetectOutcome.Ignored })
        assertEquals(PairingQrScanPhase.PAIRING, c.phase)
    }
}
