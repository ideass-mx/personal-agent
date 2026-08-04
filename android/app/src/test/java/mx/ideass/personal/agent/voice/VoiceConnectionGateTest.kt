package mx.ideass.personal.agent.voice

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import mx.ideass.personal.agent.network.ConnectionState
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class VoiceConnectionGateTest {

    @Test
    fun awaitConnected_alreadyOnline() = runTest {
        val state = MutableStateFlow<ConnectionState>(ConnectionState.Conectado)
        assertTrue(
            VoiceConnectionGate.awaitConnected(
                state = state,
                isConnected = { true },
                timeoutMs = 4_000L,
            ),
        )
    }

    @Test
    fun awaitConnected_reachesConectadoWithinMargin() = runTest {
        val state = MutableStateFlow<ConnectionState>(ConnectionState.Reconectando(3))
        var online = false
        val job = launch {
            val ok = VoiceConnectionGate.awaitConnected(
                state = state,
                isConnected = { online },
                timeoutMs = 4_000L,
            )
            assertTrue(ok)
        }
        runCurrent()
        advanceTimeBy(500)
        online = true
        state.value = ConnectionState.Conectado
        runCurrent()
        job.join()
    }

    @Test
    fun awaitConnected_errorBeforeTimeout_fails() = runTest {
        val state = MutableStateFlow<ConnectionState>(ConnectionState.Reconectando(2))
        val job = launch {
            val ok = VoiceConnectionGate.awaitConnected(
                state = state,
                isConnected = { false },
                timeoutMs = 4_000L,
            )
            assertFalse(ok)
        }
        runCurrent()
        state.value = ConnectionState.Error("auth", "AUTH_SCOPE_MISMATCH")
        runCurrent()
        job.join()
    }

    @Test
    fun awaitConnected_timeoutWithoutConnect_fails() = runTest {
        val state = MutableStateFlow<ConnectionState>(ConnectionState.Reconectando(5))
        val job = launch {
            val ok = VoiceConnectionGate.awaitConnected(
                state = state,
                isConnected = { false },
                timeoutMs = 4_000L,
            )
            assertFalse(ok)
        }
        runCurrent()
        advanceTimeBy(4_001)
        runCurrent()
        job.join()
    }
}
