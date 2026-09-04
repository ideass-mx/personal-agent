package mx.ideass.personal.agent.connection

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Regresión del contrato del QR (mismo formato que PROTOCOL / Desktop).
 * Parser JVM-puro: debe decodificar query igual que el URI personalagent://pair.
 */
class PairingQrParserTest {

    private val referenceUri =
        "personalagent://pair?v=1&agent=ABC&endpoint=wss%3A%2F%2F100.64.0.1%3A8787&session=ps_123&secret=ABC123"

    @Test
    fun parsesReferenceUriExactly() {
        val r = PairingQrParser.parse(referenceUri)
        assertTrue(r.isSuccess)
        val p = r.getOrThrow()
        assertEquals(1, p.version)
        assertEquals("ABC", p.agentId)
        assertEquals("wss://100.64.0.1:8787", p.endpoint)
        assertEquals("ps_123", p.pairingSessionId)
        assertEquals("ABC123", p.pairingSecret)
    }

    @Test
    fun parsesWsEndpointWithPathAndEncoding() {
        val uri =
            "personalagent://pair?v=1&agent=abc&endpoint=ws%3A%2F%2F100.64.0.1%3A8787%2Fws&session=ps_1&secret=deadbeef"
        val p = PairingQrParser.parse(uri).getOrThrow()
        assertEquals("ws://100.64.0.1:8787/ws", p.endpoint)
        assertEquals("abc", p.agentId)
        assertEquals("ps_1", p.pairingSessionId)
        assertEquals("deadbeef", p.pairingSecret)
    }

    @Test
    fun urlDecodesSpecialCharactersInAgent() {
        val uri =
            "personalagent://pair?v=1&agent=ENRIQUE%20PC&endpoint=wss%3A%2F%2Fhost%2Fws&session=ps_x&secret=sec"
        val p = PairingQrParser.parse(uri).getOrThrow()
        assertEquals("ENRIQUE PC", p.agentId)
        assertEquals("wss://host/ws", p.endpoint)
    }

    @Test
    fun doesNotRequireHubToken() {
        val p = PairingQrParser.parse(referenceUri).getOrThrow()
        // Solo campos de protocolo; sin hub_token en el payload.
        assertEquals("ABC", p.agentId)
        assertEquals("wss://100.64.0.1:8787", p.endpoint)
        assertEquals("ps_123", p.pairingSessionId)
        assertEquals("ABC123", p.pairingSecret)
        assertTrue(!referenceUri.lowercase().contains("hub_token"))
    }

    @Test
    fun rejectsHubTokenField() {
        val uri =
            "personalagent://pair?v=1&agent=a&endpoint=ws://x/ws&session=s&secret=t&hub_token=nope"
        assertTrue(PairingQrParser.parse(uri).isFailure)
        assertEquals(
            "forbidden_token_field",
            PairingQrParser.parse(uri).exceptionOrNull()?.message,
        )
    }

    @Test
    fun rejectsGenericTokenField() {
        val uri =
            "personalagent://pair?v=1&agent=a&endpoint=ws://x/ws&session=s&secret=t&token=nope"
        assertTrue(PairingQrParser.parse(uri).isFailure)
    }

    @Test
    fun rejectsBadScheme() {
        assertTrue(PairingQrParser.parse("https://example.com").isFailure)
        assertEquals(
            "unsupported_scheme",
            PairingQrParser.parse("https://example.com/pair?v=1").exceptionOrNull()?.message,
        )
    }

    @Test
    fun rejectsWrongHostPath() {
        val uri =
            "personalagent://pairing?v=1&agent=a&endpoint=ws://x/ws&session=s&secret=t"
        assertTrue(PairingQrParser.parse(uri).isFailure)
        assertEquals(
            "unsupported_scheme",
            PairingQrParser.parse(uri).exceptionOrNull()?.message,
        )
    }

    @Test
    fun rejectsUnsupportedVersion() {
        val uri =
            "personalagent://pair?v=99&agent=a&endpoint=ws://x/ws&session=s&secret=t"
        assertTrue(PairingQrParser.parse(uri).isFailure)
        assertEquals(
            "unsupported_version",
            PairingQrParser.parse(uri).exceptionOrNull()?.message,
        )
    }

    @Test
    fun rejectsMissingAgent() {
        val uri = "personalagent://pair?v=1&endpoint=ws://x/ws&session=s&secret=t"
        assertFailureCode(uri, "missing_fields")
    }

    @Test
    fun rejectsMissingEndpoint() {
        val uri = "personalagent://pair?v=1&agent=a&session=s&secret=t"
        assertFailureCode(uri, "missing_fields")
    }

    @Test
    fun rejectsMissingSession() {
        val uri = "personalagent://pair?v=1&agent=a&endpoint=ws://x/ws&secret=t"
        assertFailureCode(uri, "missing_fields")
    }

    @Test
    fun rejectsMissingSecret() {
        val uri = "personalagent://pair?v=1&agent=a&endpoint=ws://x/ws&session=s"
        assertFailureCode(uri, "missing_fields")
    }

    @Test
    fun rejectsEmptyAgent() {
        val uri = "personalagent://pair?v=1&agent=&endpoint=ws://x/ws&session=s&secret=t"
        assertFailureCode(uri, "missing_fields")
    }

    @Test
    fun rejectsEmptySession() {
        val uri = "personalagent://pair?v=1&agent=a&endpoint=ws://x/ws&session=&secret=t"
        assertFailureCode(uri, "missing_fields")
    }

    @Test
    fun rejectsEmptySecret() {
        val uri = "personalagent://pair?v=1&agent=a&endpoint=ws://x/ws&session=s&secret="
        assertFailureCode(uri, "missing_fields")
    }

    @Test
    fun rejectsInvalidEndpointHttp() {
        val uri =
            "personalagent://pair?v=1&agent=a&endpoint=http%3A%2F%2Fx&session=s&secret=t"
        assertFailureCode(uri, "invalid_endpoint")
    }

    @Test
    fun rejectsInvalidEndpointBareHost() {
        val uri =
            "personalagent://pair?v=1&agent=a&endpoint=100.64.0.1%3A8787&session=s&secret=t"
        assertFailureCode(uri, "invalid_endpoint")
    }

    @Test
    fun duplicateQueryParamsLastWins() {
        val uri =
            "personalagent://pair?v=1&agent=first&agent=second&endpoint=ws://x/ws&session=s&secret=t"
        val p = PairingQrParser.parse(uri).getOrThrow()
        assertEquals("second", p.agentId)
    }

    @Test
    fun trimsSurroundingWhitespace() {
        val uri = "  $referenceUri  \n"
        assertTrue(PairingQrParser.parse(uri).isSuccess)
    }

    @Test
    fun rejectsEmptyInput() {
        assertFailureCode("", "empty")
        assertFailureCode("   ", "empty")
    }

    private fun assertFailureCode(uri: String, code: String) {
        val r = PairingQrParser.parse(uri)
        assertTrue("expected failure for: $uri", r.isFailure)
        assertEquals(code, r.exceptionOrNull()?.message)
    }
}
