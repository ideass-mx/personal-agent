package mx.ideass.personal.agent.voice

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.serialization.json.Json
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Catálogo curado de voces neuronales (`assets/voice_catalog.json`).
 */
@Singleton
class VoiceCatalog @Inject constructor(
    @ApplicationContext context: Context,
) {
    private val appContext = context.applicationContext

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
    }

    val entries: List<VoiceCatalogEntry> by lazy { load() }

    fun get(id: String): VoiceCatalogEntry? =
        entries.firstOrNull { it.id == id }

    /**
     * Resuelve una entrada aunque el id pedido sea un alias (p. ej. legado
     * `…-int8` → estándar) o coincida con [VoiceCatalogEntry.archiveRoot].
     */
    fun resolveEntry(id: String): VoiceCatalogEntry? = resolveEntry(entries, id)

    fun recommended(): VoiceCatalogEntry? =
        entries.firstOrNull { it.recommended } ?: entries.firstOrNull()

    private fun load(): List<VoiceCatalogEntry> {
        val text = appContext.assets.open(ASSET_NAME).bufferedReader().use { it.readText() }
        return json.decodeFromString(VoiceCatalogFile.serializer(), text).voices
    }

    companion object {
        const val ASSET_NAME = "voice_catalog.json"

        /** Para tests unitarios sin AssetManager. */
        fun parse(jsonText: String): List<VoiceCatalogEntry> {
            val json = Json { ignoreUnknownKeys = true; isLenient = true }
            return json.decodeFromString(VoiceCatalogFile.serializer(), jsonText).voices
        }

        fun resolveEntry(entries: List<VoiceCatalogEntry>, id: String): VoiceCatalogEntry? {
            if (id.isBlank()) return null
            entries.firstOrNull { it.id == id }?.let { return it }
            entries.firstOrNull { it.archiveRoot == id }?.let { return it }
            entries.firstOrNull { it.id.startsWith("$id-") || it.id.startsWith("${id}_") }
                ?.let { return it }
            entries.firstOrNull { id.startsWith("${it.id}-") || id.startsWith("${it.id}_") }
                ?.let { return it }
            return null
        }
    }
}
