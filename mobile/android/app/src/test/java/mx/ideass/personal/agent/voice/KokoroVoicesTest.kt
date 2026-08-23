package mx.ideass.personal.agent.voice

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class KokoroVoicesTest {

    @Test
    fun speakers_coverAll53SidsWithExpectedPrefixes() {
        assertEquals(53, KokoroVoices.SPEAKERS.size)
        assertEquals((0..52).toList(), KokoroVoices.SPEAKERS.map { it.sid })
        val dora = KokoroVoices.speaker(28)!!
        assertEquals("ef_dora", dora.code)
        assertEquals("es", dora.language)
        assertEquals("female", dora.gender)
        assertEquals("Dora", dora.shortName)
        val alex = KokoroVoices.speaker(29)!!
        assertEquals("em_alex", alex.code)
        assertEquals("male", alex.gender)
        assertEquals("Kokoro — Dora · Español", KokoroVoices.displayName(dora))
        assertEquals("Dora ♀", KokoroVoices.speakerLabel(28))
        assertEquals("Alex ♂", KokoroVoices.speakerLabel(29))
        assertEquals("es", KokoroVoices.espeakLang("es"))
        assertEquals("en-us", KokoroVoices.espeakLang("en-us"))
        assertEquals("en-gb", KokoroVoices.espeakLang("en-gb"))
        assertEquals("pt-br", KokoroVoices.espeakLang("pt-br"))
        assertEquals("", KokoroVoices.espeakLang("zh"))
    }

    @Test
    fun catalogEntries_matchOfficialPackageAndLegacyIds() {
        val entries = KokoroVoices.catalogEntries()
        assertEquals(53, entries.size)
        assertTrue(entries.all { it.packageId == KokoroVoices.PACKAGE_ID })
        assertTrue(entries.all { it.engineType() == NeuralVoiceEngine.Kokoro })
        assertTrue(entries.none { it.downloadUrl.contains("int8") })
        val dora = entries.first { it.speakerId == 28 }
        assertEquals("kokoro-es-dora", dora.id)
        val alex = entries.first { it.speakerId == 29 }
        assertEquals("kokoro-es-alex", alex.id)
        val alloy = entries.first { it.speakerId == 0 }
        assertEquals("kokoro-en-us-alloy", alloy.id)
        assertEquals("en-us", alloy.language)
    }

    @Test
    fun findEntry_andFirstForLang() {
        val entries = KokoroVoices.catalogEntries()
        assertEquals(
            "kokoro-es-alex",
            KokoroVoices.findEntry(entries, "es", 29)!!.id,
        )
        assertNull(KokoroVoices.findEntry(entries, "es", 0))
        val firstEs = KokoroVoices.firstEntryForLang(entries, "es")
        assertNotNull(firstEs)
        assertEquals(28, firstEs!!.speakerId)
    }
}
