package mx.ideass.personal.agent.gateway.auth

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.filters.SmallTest
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * PHASE 57.11-A — sonda en dispositivo/emulador real.
 *
 * Ejecutar solo con device conectado:
 *   ./gradlew :app:connectedDebugAndroidTest \
 *     -Pandroid.testInstrumentationRunnerArguments.class=\
 *     mx.ideass.personal.agent.gateway.auth.AndroidKeystoreEd25519ProbeInstrumentedTest
 *
 * No falla el CI si Keystore Ed25519 no existe: documenta el resultado.
 */
@RunWith(AndroidJUnit4::class)
@SmallTest
class AndroidKeystoreEd25519ProbeInstrumentedTest {

    @Test
    fun probeAndroidKeystoreEd25519_recordsResult() {
        val report = AndroidKeystoreEd25519Probe.run()
        assertNotNull(report)
        assertTrue(report.sdkInt >= 29)
        assertTrue(report.minSdkProduct == 29)

        // Log-style assertions kept as strings for adb logcat / test output.
        println("PHASE_57_11A_VERDICT=${report.verdict}")
        println("PHASE_57_11A_SDK=${report.sdkInt}")
        println("PHASE_57_11A_GENERATION=${report.generation.status}:${report.generation.detail}")
        println("PHASE_57_11A_SPKI=${report.publicKeySpki.status}:${report.publicKeySpki.detail.take(80)}")
        println("PHASE_57_11A_SIGN=${report.sign.status}:${report.sign.detail.take(80)}")
        println("PHASE_57_11A_VERIFY=${report.verifyExistingEd25519.status}:${report.verifyExistingEd25519.detail}")
        report.notes.forEach { println("PHASE_57_11A_NOTE=$it") }

        // Product rule: never claim SUPPORTED for minSdk 29 floor.
        assertTrue(
            "Con minSdk 29 el veredicto de producto no puede ser SUPPORTED",
            report.verdict != AndroidKeystoreEd25519Validation.Verdict.SUPPORTED,
        )
    }
}
