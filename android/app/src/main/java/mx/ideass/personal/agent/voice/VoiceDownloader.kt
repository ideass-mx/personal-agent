package mx.ideass.personal.agent.voice

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import mx.ideass.personal.agent.app.AppPreferences
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.IOException
import java.io.RandomAccessFile
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import javax.inject.Inject
import javax.inject.Singleton

sealed class VoiceDownloadStatus {
    data object Idle : VoiceDownloadStatus()
    data class Downloading(
        val bytesDownloaded: Long,
        val totalBytes: Long?,
    ) : VoiceDownloadStatus() {
        val progressFraction: Float
            get() {
                val total = totalBytes ?: return 0f
                if (total <= 0L) return 0f
                return (bytesDownloaded.toDouble() / total.toDouble()).toFloat().coerceIn(0f, 1f)
            }
    }
    data object Extracting : VoiceDownloadStatus()
    data class Failed(val message: String) : VoiceDownloadStatus()
}

/**
 * Descarga modelos del catálogo a almacenamiento interno: progreso, reanudable
 * (HTTP Range), verificación SHA-256 y extracción tar.bz2. No bloquea la UI
 * (suspend + IO).
 */
@Singleton
class VoiceDownloader @Inject constructor(
    private val catalog: VoiceCatalog,
    private val installedVoices: InstalledVoices,
    private val preferences: AppPreferences,
) {
    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(5, TimeUnit.MINUTES)
        .followRedirects(true)
        .followSslRedirects(true)
        .build()

    private val mutex = Mutex()
    private val cancelFlags = mutableMapOf<String, AtomicBoolean>()

    private val _statuses = MutableStateFlow<Map<String, VoiceDownloadStatus>>(emptyMap())
    val statuses: StateFlow<Map<String, VoiceDownloadStatus>> = _statuses.asStateFlow()

    fun statusOf(voiceId: String): VoiceDownloadStatus =
        _statuses.value[voiceId] ?: VoiceDownloadStatus.Idle

    fun cancel(voiceId: String) {
        cancelFlags[voiceId]?.set(true)
    }

    /** Borra una voz instalada; si era la activa, elige otra o limpia la preferencia. */
    suspend fun delete(voiceId: String) {
        installedVoices.delete(voiceId)
        val active = preferences.getActiveNeuralVoiceId()
        if (active == voiceId) {
            preferences.saveActiveNeuralVoiceId(
                installedVoices.listInstalled().firstOrNull()?.id,
            )
        }
        setStatus(voiceId, VoiceDownloadStatus.Idle)
    }

    suspend fun download(voiceId: String): Result<Unit> = withContext(Dispatchers.IO) {
        mutex.withLock {
            val entry = catalog.get(voiceId)
                ?: return@withLock Result.failure(
                    IllegalArgumentException("Voz desconocida: $voiceId"),
                )
            val finalDir = installedVoices.voiceDir(voiceId)
            // Completa → no re-descargar. Incompleta/rota → borrar y bajar de nuevo.
            if (VoiceInstallValidator.isComplete(entry, finalDir)) {
                installedVoices.markInstalled(voiceId)
                setStatus(voiceId, VoiceDownloadStatus.Idle)
                return@withLock Result.success(Unit)
            }
            if (finalDir.exists()) {
                Log.w(TAG, "Reinstalando voz incompleta: $voiceId")
            }
            installedVoices.delete(voiceId)
            // Por si quedó la variante cuantizada rota del mismo modelo.
            installedVoices.purgeAbandonedQuantizedInstalls()
            val cancel = AtomicBoolean(false)
            cancelFlags[voiceId] = cancel
            try {
                val result = downloadLocked(entry, cancel)
                if (result.isSuccess) {
                    val active = preferences.getActiveNeuralVoiceId()
                    if (active.isNullOrBlank() || entry.recommended) {
                        preferences.saveActiveNeuralVoiceId(voiceId)
                    }
                }
                result
            } finally {
                cancelFlags.remove(voiceId)
            }
        }
    }

    private fun downloadLocked(
        entry: VoiceCatalogEntry,
        cancel: AtomicBoolean,
    ): Result<Unit> {
        val voiceId = entry.id
        val partialRoot = installedVoices.partialDir().also { it.mkdirs() }
        val archiveFile = File(partialRoot, "$voiceId.tar.bz2")
        val extractDir = File(partialRoot, voiceId)
        val finalDir = installedVoices.voiceDir(voiceId)

        try {
            if (cancel.get()) return cancelled(voiceId)

            downloadArchive(entry, archiveFile, cancel)
            if (cancel.get()) return cancelled(voiceId)

            setStatus(voiceId, VoiceDownloadStatus.Extracting)
            if (!FileSha256.matches(archiveFile, entry.sha256)) {
                archiveFile.delete()
                fail(voiceId, "Checksum incorrecto; descarga corrupta.")
                return Result.failure(IOException("sha256 mismatch"))
            }

            extractDir.deleteRecursively()
            extractDir.mkdirs()
            TarBz2Extractor.extractFlatteningRoot(
                archive = archiveFile,
                destDir = extractDir,
                archiveRoot = entry.archiveRoot,
            )
            if (cancel.get()) {
                extractDir.deleteRecursively()
                return cancelled(voiceId)
            }

            val missing = VoiceInstallValidator.missingRelativePaths(entry, extractDir)
            if (missing.isNotEmpty()) {
                Log.w(TAG, "Modelo incompleto tras extraer ($voiceId): $missing")
                extractDir.deleteRecursively()
                archiveFile.delete()
                fail(
                    voiceId,
                    "Faltan ficheros del modelo (p. ej. espeak-ng-data). Reintenta la descarga.",
                )
                return Result.failure(IOException("incomplete model: $missing"))
            }

            val model = NeuralVoiceModel.fromCatalogEntry(entry, extractDir)
            if (model == null) {
                extractDir.deleteRecursively()
                archiveFile.delete()
                fail(voiceId, "El archivo no contiene un modelo usable.")
                return Result.failure(IOException("incomplete model"))
            }

            if (finalDir.exists()) finalDir.deleteRecursively()
            finalDir.parentFile?.mkdirs()
            if (!extractDir.renameTo(finalDir)) {
                extractDir.copyRecursively(finalDir, overwrite = true)
                extractDir.deleteRecursively()
            }
            archiveFile.delete()

            installedVoices.markInstalled(voiceId)
            setStatus(voiceId, VoiceDownloadStatus.Idle)
            Log.i(TAG, "Voz instalada: $voiceId")
            return Result.success(Unit)
        } catch (t: Throwable) {
            if (cancel.get()) {
                cleanupPartial(archiveFile, extractDir)
                return cancelled(voiceId)
            }
            Log.w(TAG, "Descarga fallida ($voiceId): ${t.message}")
            cleanupPartial(archiveFile, extractDir)
            fail(voiceId, t.message ?: "Error al descargar la voz.")
            return Result.failure(t)
        }
    }

    private fun downloadArchive(
        entry: VoiceCatalogEntry,
        archiveFile: File,
        cancel: AtomicBoolean,
    ) {
        val expectedTotal = entry.sizeBytes.takeIf { it > 0L }
        var existing = if (archiveFile.isFile) archiveFile.length() else 0L
        if (existing > 0L && expectedTotal != null && existing > expectedTotal) {
            archiveFile.delete()
            existing = 0L
        }

        setStatus(
            entry.id,
            VoiceDownloadStatus.Downloading(existing, expectedTotal),
        )

        if (expectedTotal != null && existing == expectedTotal && archiveFile.isFile) {
            return
        }

        val requestBuilder = Request.Builder().url(entry.downloadUrl)
        if (existing > 0L) {
            requestBuilder.header("Range", "bytes=$existing-")
        }
        val response = client.newCall(requestBuilder.build()).execute()
        response.use { resp ->
            if (!resp.isSuccessful && resp.code != 206) {
                throw IOException("HTTP ${resp.code}")
            }
            val body = resp.body ?: throw IOException("Respuesta vacía")
            val resume = resp.code == 206
            if (!resume && existing > 0L) {
                archiveFile.delete()
                existing = 0L
            }

            val total = when {
                resume && expectedTotal != null -> expectedTotal
                resp.header("Content-Length") != null -> {
                    val len = resp.header("Content-Length")!!.toLongOrNull() ?: -1L
                    if (resume && len >= 0) existing + len else len.takeIf { it >= 0 }
                }
                else -> expectedTotal
            }

            RandomAccessFile(archiveFile, "rw").use { raf ->
                if (resume) raf.seek(existing) else raf.setLength(0)
                val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                var downloaded = if (resume) existing else 0L
                body.byteStream().use { input ->
                    while (true) {
                        if (cancel.get()) throw IOException("cancelled")
                        val n = input.read(buffer)
                        if (n < 0) break
                        raf.write(buffer, 0, n)
                        downloaded += n
                        setStatus(
                            entry.id,
                            VoiceDownloadStatus.Downloading(downloaded, total ?: expectedTotal),
                        )
                    }
                }
            }
        }
    }

    private fun cleanupPartial(archive: File, extractDir: File) {
        extractDir.deleteRecursively()
        if (archive.isFile && archive.length() == 0L) archive.delete()
    }

    private fun cancelled(voiceId: String): Result<Unit> {
        setStatus(voiceId, VoiceDownloadStatus.Idle)
        return Result.failure(IOException("cancelled"))
    }

    private fun fail(voiceId: String, message: String) {
        setStatus(voiceId, VoiceDownloadStatus.Failed(message))
    }

    private fun setStatus(voiceId: String, status: VoiceDownloadStatus) {
        _statuses.update { it + (voiceId to status) }
    }

    companion object {
        private const val TAG = "VoiceDownloader"
    }
}
