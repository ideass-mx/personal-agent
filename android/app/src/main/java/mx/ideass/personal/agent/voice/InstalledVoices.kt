package mx.ideass.personal.agent.voice

import android.content.Context
import android.util.Log
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

@Serializable
data class InstalledVoiceRecord(
    val id: String,
    val installedAtEpochMs: Long,
    val bytesOnDisk: Long,
)

data class InstalledVoice(
    val id: String,
    val bytesOnDisk: Long,
    val installedAtEpochMs: Long,
    val model: NeuralVoiceModel,
)

/**
 * Voces neuronales instaladas en `{filesDir}/neural_voices/`.
 * Persistencia en `installed.json` + reconciliación con el disco.
 *
 * La descarga escribe en `neural_voices/<id>/` (id del catálogo). Al cargar,
 * [resolveVoiceBaseDir] encuentra la carpeta real si el nombre en disco
 * difiere del id pedido (archiveRoot, etc.). Las carpetas `-int8`/`-fp16`
 * abandonadas se eliminan en [reconcile] (runtime no fiable).
 */
@Singleton
class InstalledVoices @Inject constructor(
    @ApplicationContext context: Context,
    private val catalog: VoiceCatalog,
) {
    private val appContext = context.applicationContext
    private val json = Json { ignoreUnknownKeys = true; prettyPrint = true }
    private val _installed = MutableStateFlow<List<InstalledVoice>>(emptyList())
    val installed: StateFlow<List<InstalledVoice>> = _installed.asStateFlow()

    init {
        reconcile()
    }

    fun rootDir(): File = NeuralVoicesStore.rootDir(appContext)

    /** Destino canónico de instalación (= id de catálogo). */
    fun voiceDir(voiceId: String): File = NeuralVoicesStore.voiceDir(appContext, voiceId)

    fun partialDir(): File = File(rootDir(), PARTIAL_DIR_NAME)

    fun isInstalled(voiceId: String): Boolean = resolveModel(voiceId) != null

    fun listInstalled(): List<InstalledVoice> = _installed.value

    fun resolveModel(voiceId: String): NeuralVoiceModel? {
        val entry = catalog.resolveEntry(voiceId)
        if (entry != null) {
            val base = resolveVoiceBaseDir(entry) ?: run {
                logVoicesTreeMissing(voiceId, entry)
                return null
            }
            return NeuralVoiceModel.fromCatalogEntry(entry, base)
        }
        return resolveWithoutCatalog(voiceId)
    }

    /**
     * Carpeta base real para una entrada de catálogo (nunca asumir solo
     * `voiceDir(id)` si en disco hay sufijo u otro nombre usable).
     * Usa [VoiceCatalogEntry.installId] para paquetes multi-speaker.
     */
    fun resolveVoiceBaseDir(entry: VoiceCatalogEntry): File? {
        val installId = entry.installId()
        return NeuralVoicesStore.resolveVoiceBaseDir(
            voicesRoot = rootDir(),
            voiceId = installId,
            archiveRoot = entry.archiveRoot,
            onnxFile = entry.onnxFile,
        ) ?: NeuralVoicesStore.resolveVoiceBaseDir(
            voicesRoot = rootDir(),
            voiceId = entry.id,
            archiveRoot = entry.archiveRoot,
            onnxFile = entry.onnxFile,
        ) ?: NeuralVoicesStore.resolveVoiceBaseDir(
            voicesRoot = rootDir(),
            voiceId = entry.archiveRoot,
            archiveRoot = entry.archiveRoot,
            onnxFile = entry.onnxFile,
        )
    }

    /**
     * Voz para la racha: [activeVoiceId] si está instalada; si no, recomendada
     * instalada; si no, cualquiera instalada.
     */
    fun resolveForPlayback(activeVoiceId: String?): NeuralVoiceModel? {
        reconcile()
        if (!activeVoiceId.isNullOrBlank()) {
            resolveModel(activeVoiceId)?.let { return it }
        }
        catalog.recommended()?.let { rec ->
            resolveModel(rec.id)?.let { return it }
        }
        return listInstalled().firstOrNull()?.model
    }

    fun markInstalled(voiceId: String) {
        val entry = catalog.resolveEntry(voiceId)
        val installId = entry?.installId() ?: voiceId
        val model = resolveModel(entry?.id ?: voiceId) ?: return
        val bytes = directorySize(model.rootDir)
        val now = System.currentTimeMillis()
        val siblingIds = if (entry != null) {
            VoiceCatalog.siblings(catalog.entries, entry).map { it.id }.toSet() + installId
        } else {
            setOf(installId, voiceId)
        }
        val records = readRecords().filterNot { it.id in siblingIds || it.id == installId }
            .toMutableList()
        records.add(
            InstalledVoiceRecord(
                id = installId,
                installedAtEpochMs = now,
                bytesOnDisk = bytes,
            ),
        )
        writeRecords(records)
        reconcile()
    }

    /** Borra el paquete del disco y del registro (todas las voces hermanas). */
    fun delete(voiceId: String): Boolean {
        val entry = catalog.resolveEntry(voiceId)
        val installId = entry?.installId() ?: voiceId
        val siblingIds = if (entry != null) {
            VoiceCatalog.siblings(catalog.entries, entry).map { it.id }.toSet()
        } else {
            setOf(voiceId)
        }
        val toDelete = LinkedHashSet<File>()
        toDelete.add(voiceDir(installId))
        toDelete.add(voiceDir(voiceId))
        entry?.let { resolveVoiceBaseDir(it)?.let { dir -> toDelete.add(dir) } }
        for (sid in siblingIds) {
            toDelete.add(voiceDir(sid))
        }
        NeuralVoicesStore.resolveVoiceBaseDir(rootDir(), installId)?.let { toDelete.add(it) }
        NeuralVoicesStore.resolveVoiceBaseDir(rootDir(), voiceId)?.let { toDelete.add(it) }

        val existed = toDelete.any { it.exists() } ||
            readRecords().any { it.id == installId || it.id in siblingIds || it.id == voiceId }
        for (dir in toDelete) {
            if (dir.exists()) dir.deleteRecursively()
        }
        File(partialDir(), "$installId.tar.bz2").delete()
        File(partialDir(), "$voiceId.tar.bz2").delete()
        File(partialDir(), installId).deleteRecursively()
        File(partialDir(), voiceId).deleteRecursively()
        writeRecords(
            readRecords().filterNot {
                it.id == installId || it.id == voiceId || it.id in siblingIds
            },
        )
        reconcile()
        return existed
    }

    fun reconcile() {
        val root = rootDir()
        if (!root.exists()) root.mkdirs()
        purgeAbandonedQuantizedInstalls()
        val records = readRecords().toMutableList()
        val byId = records.associateBy { it.id }.toMutableMap()

        val dirs = root.listFiles { f -> f.isDirectory && f.name != PARTIAL_DIR_NAME }.orEmpty()
        for (dir in dirs) {
            val entry = catalogEntryForDir(dir)
            val model = if (entry != null) {
                NeuralVoiceModel.fromCatalogEntry(entry, dir)
            } else {
                resolveModelInDir(dir.name, dir)
            }
            if (model == null) {
                byId.remove(dir.name)
                entry?.id?.let { byId.remove(it) }
                entry?.installId()?.let { byId.remove(it) }
                Log.w(TAG, "Voz incompleta ignorada (falta espeak u otros): ${dir.name}")
                continue
            }
            val recordId = entry?.installId() ?: dir.name
            if (!byId.containsKey(recordId)) {
                byId[recordId] = InstalledVoiceRecord(
                    id = recordId,
                    installedAtEpochMs = dir.lastModified(),
                    bytesOnDisk = directorySize(dir),
                )
            } else {
                val prev = byId[recordId]!!
                byId[recordId] = prev.copy(bytesOnDisk = directorySize(model.rootDir))
            }
            if (recordId != dir.name) {
                byId.remove(dir.name)
            }
            entry?.let { e ->
                for (sib in VoiceCatalog.siblings(catalog.entries, e)) {
                    if (sib.id != recordId) byId.remove(sib.id)
                }
            }
        }

        val valid = byId.values.filter { rec ->
            resolveModel(rec.id) != null
        }

        writeRecords(valid)
        _installed.value = valid.mapNotNull { rec ->
            val model = resolveModel(rec.id) ?: return@mapNotNull null
            InstalledVoice(
                id = rec.id,
                bytesOnDisk = rec.bytesOnDisk,
                installedAtEpochMs = rec.installedAtEpochMs,
                model = model,
            )
        }.sortedBy { it.id }
    }

    private fun catalogEntryForDir(dir: File): VoiceCatalogEntry? {
        catalog.resolveEntry(dir.name)?.let { return it }
        catalog.entries.firstOrNull { it.installId() == dir.name }?.let { return it }
        catalog.entries.firstOrNull { it.archiveRoot == dir.name }?.let { return it }
        return catalog.entries.firstOrNull { entry ->
            VoiceContentRoot.findNamedFile(dir, entry.onnxFile) != null
        }
    }

    /**
     * Borra instalaciones cuantizadas que ya no están en el catálogo
     * (`*-int8`, `*-fp16`). Evita que [resolveVoiceBaseDir] reutilice un
     * modelo int8 roto al pedir la variante estándar.
     */
    fun purgeAbandonedQuantizedInstalls(): Int {
        val root = rootDir()
        if (!root.isDirectory) return 0
        val catalogIds = catalog.entries.map { it.id }.toSet()
        var removed = 0
        val dirs = root.listFiles { f ->
            f.isDirectory && f.name != PARTIAL_DIR_NAME
        }.orEmpty()
        for (dir in dirs) {
            if (!NeuralVoicesStore.isAbandonedQuantizedName(dir.name)) continue
            if (dir.name in catalogIds) continue
            Log.w(TAG, "Eliminando voz cuantizada no soportada: ${dir.name}")
            if (dir.deleteRecursively()) removed++
            File(partialDir(), "${dir.name}.tar.bz2").delete()
            File(partialDir(), dir.name).deleteRecursively()
        }
        if (removed > 0) {
            writeRecords(
                readRecords().filterNot { NeuralVoicesStore.isAbandonedQuantizedName(it.id) },
            )
        }
        return removed
    }

    private fun resolveWithoutCatalog(voiceId: String): NeuralVoiceModel? {
        if (NeuralVoicesStore.isAbandonedQuantizedName(voiceId) &&
            catalog.resolveEntry(voiceId) == null
        ) {
            return null
        }
        val base = NeuralVoicesStore.resolveVoiceBaseDir(
            voicesRoot = rootDir(),
            voiceId = voiceId,
        ) ?: voiceDir(voiceId).takeIf { it.isDirectory } ?: return null
        return NeuralVoiceModel.resolvePiper(voiceId, base)
            ?: NeuralVoiceModel.resolveKokoro(
                id = voiceId,
                rootDir = base,
                onnxName = "model.onnx",
            )
    }

    private fun resolveModelInDir(id: String, dir: File): NeuralVoiceModel? {
        val entry = catalog.resolveEntry(id)
        if (entry != null) return NeuralVoiceModel.fromCatalogEntry(entry, dir)
        if (NeuralVoicesStore.isAbandonedQuantizedName(dir.name)) return null
        return NeuralVoiceModel.resolvePiper(id, dir)
            ?: NeuralVoiceModel.resolveKokoro(id, dir, onnxName = "model.onnx")
    }

    private fun logVoicesTreeMissing(voiceId: String, entry: VoiceCatalogEntry) {
        val root = rootDir()
        val expected = voiceDir(entry.id).absolutePath
        runCatching {
            Log.e(
                TAG,
                "No se encontró carpeta base para voiceId=$voiceId " +
                    "(catálogo id=${entry.id} archiveRoot=${entry.archiveRoot} " +
                    "onnx=${entry.onnxFile}). Esperada=$expected\n" +
                    "Árbol bajo ${root.absolutePath}:\n" +
                    VoiceContentRoot.formatTree(root),
            )
        }
    }

    private fun registryFile(): File = File(rootDir(), REGISTRY_NAME)

    private fun readRecords(): List<InstalledVoiceRecord> {
        val file = registryFile()
        if (!file.isFile) return emptyList()
        return runCatching {
            json.decodeFromString(
                ListSerializer(InstalledVoiceRecord.serializer()),
                file.readText(),
            )
        }.getOrElse {
            Log.w(TAG, "Registro de voces corrupto; se regenera")
            emptyList()
        }
    }

    private fun writeRecords(records: List<InstalledVoiceRecord>) {
        val root = rootDir()
        root.mkdirs()
        val file = registryFile()
        file.writeText(
            json.encodeToString(ListSerializer(InstalledVoiceRecord.serializer()), records),
        )
    }

    companion object {
        private const val TAG = "InstalledVoices"
        const val PARTIAL_DIR_NAME = ".partial"
        const val REGISTRY_NAME = "installed.json"

        fun directorySize(dir: File): Long {
            if (!dir.exists()) return 0L
            var total = 0L
            dir.walkTopDown().forEach { f ->
                if (f.isFile) total += f.length()
            }
            return total
        }
    }
}
