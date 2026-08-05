package mx.ideass.personal.agent.voice

import org.apache.commons.compress.archivers.tar.TarArchiveEntry
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream
import org.apache.commons.compress.compressors.bzip2.BZip2CompressorInputStream
import java.io.File
import java.io.FileInputStream

/**
 * Extrae un `.tar.bz2` de sherpa-onnx a [destDir], aplanando [archiveRoot]
 * (el directorio raíz del tar) para que los ficheros queden directamente en
 * [destDir], incluido el árbol `espeak-ng-data/`.
 *
 * Ejemplo: entrada `vits-piper-…-int8/espeak-ng-data/phontab` con
 * `archiveRoot=vits-piper-…-int8` → `destDir/espeak-ng-data/phontab`.
 * Así el layout instalado es estable; [VoiceContentRoot] además resuelve por
 * búsqueda si alguna instalación antigua quedó anidada. Rechaza path traversal.
 */
object TarBz2Extractor {

    fun extractFlatteningRoot(
        archive: File,
        destDir: File,
        archiveRoot: String,
    ) {
        require(archive.isFile) { "Archivo ausente: ${archive.path}" }
        destDir.mkdirs()
        val rootPrefix = archiveRoot.trim().trimEnd('/') + "/"
        var filesWritten = 0

        FileInputStream(archive).use { fis ->
            BZip2CompressorInputStream(fis).use { bz ->
                TarArchiveInputStream(bz).use { tar ->
                    var entry: TarArchiveEntry? = tar.nextEntry
                    while (entry != null) {
                        val name = entry.name.replace('\\', '/')
                        val relative = relativeUnderRoot(name, archiveRoot, rootPrefix)
                        if (relative == null) {
                            entry = tar.nextEntry
                            continue
                        }
                        require(!relative.contains("..")) {
                            "Entrada insegura en archivo: $name"
                        }
                        val out = File(destDir, relative)
                        if (entry.isDirectory) {
                            out.mkdirs()
                        } else {
                            if (!tar.canReadEntryData(entry)) {
                                throw IllegalStateException(
                                    "No se puede leer la entrada del archivo: $name",
                                )
                            }
                            out.parentFile?.mkdirs()
                            out.outputStream().use { dest ->
                                tar.copyTo(dest)
                            }
                            if (out.length() <= 0L && entry.size > 0L) {
                                throw IllegalStateException(
                                    "Extracción vacía para: $name",
                                )
                            }
                            filesWritten++
                        }
                        entry = tar.nextEntry
                    }
                }
            }
        }
        require(filesWritten > 0) { "El archivo no contenía ficheros útiles" }
    }

    /**
     * @return path relativo bajo [destDir], o null para omitir (entrada root).
     */
    internal fun relativeUnderRoot(
        name: String,
        archiveRoot: String,
        rootPrefix: String = archiveRoot.trim().trimEnd('/') + "/",
    ): String? {
        val normalized = name.replace('\\', '/')
        val root = archiveRoot.trim().trimEnd('/')
        return when {
            normalized == root || normalized == "$root/" -> null
            normalized.startsWith(rootPrefix) ->
                normalized.removePrefix(rootPrefix).takeIf { it.isNotEmpty() }
            // Tar sin el prefijo esperado: usar el path tal cual.
            else -> normalized.takeIf { it.isNotEmpty() && it != "." }
        }
    }
}
