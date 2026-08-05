package mx.ideass.personal.agent.voice

import android.util.Log
import java.io.File

/**
 * Descubre rutas reales del modelo en disco buscando ficheros, no por convención
 * de carpetas. Tras un `.tar.bz2` (aplano o con subdirectorio raíz) localiza
 * `phontab`, `.onnx` y `tokens.txt` bajo la carpeta de la voz.
 *
 * Semántica sherpa-onnx / espeak-ng: [resolveEspeakDataDir] es la carpeta que
 * **contiene** `phontab` (típicamente `…/espeak-ng-data`), no su padre. El motor
 * abre `dataDir/phontab` directamente.
 */
object VoiceContentRoot {
    private const val TAG = "VoiceContentRoot"
    private const val MAX_WALK_DEPTH = 6
    private const val TREE_LOG_MAX_LINES = 80

    /**
     * Raíz de contenido del paquete: directorio que contiene el `.onnx` /
     * `tokens.txt` junto al árbol `espeak-ng-data/` (padre de la carpeta con
     * `phontab` cuando esa carpeta se llama `espeak-ng-data`).
     */
    fun discover(
        installDir: File,
        archiveRootHint: String? = null,
    ): File? {
        if (!installDir.isDirectory) return null

        val hint = archiveRootHint?.trim()?.trimEnd('/')
        if (!hint.isNullOrEmpty()) {
            val nested = File(installDir, hint)
            packageRootFromPhontab(nested)?.let { return it }
        }

        packageRootFromPhontab(installDir)?.let { return it }

        val children = installDir.listFiles { f -> f.isDirectory }.orEmpty()
        if (children.size == 1) {
            packageRootFromPhontab(children[0])?.let { return it }
        }

        return null
    }

    /**
     * Carpeta que contiene `phontab` (dataDir para OfflineTts).
     * Busca el fichero `phontab` bajo [searchRoot]; no asume el nombre
     * `espeak-ng-data` salvo como pista de orden de búsqueda.
     */
    fun resolveEspeakDataDir(searchRoot: File): File? {
        val phontab = findNamedFile(searchRoot, VoiceInstallValidator.PHONTAB)
            ?: return null
        return phontab.parentFile
            ?.takeIf { it.isDirectory }
            ?.canonicalFile
    }

    fun resolveOnnx(searchRoot: File, preferredOnnxName: String?): File? {
        if (!preferredOnnxName.isNullOrBlank()) {
            findNamedFile(searchRoot, preferredOnnxName.trim())?.let {
                return it.canonicalFile
            }
        }
        val onnxFiles = findFiles(searchRoot) { f ->
            f.isFile &&
                f.name.endsWith(".onnx", ignoreCase = true) &&
                f.length() > 0L
        }
        return onnxFiles.singleOrNull()?.canonicalFile
    }

    fun resolveTokens(searchRoot: File): File? =
        findNamedFile(searchRoot, NeuralVoiceModel.TOKENS_FILE_NAME)?.canonicalFile

    fun resolveVoices(searchRoot: File, voicesName: String): File? =
        findNamedFile(searchRoot, voicesName)?.canonicalFile

    /**
     * Guardarraíl: model / tokens / dataDir(+phontab) deben existir.
     * Si falla, loguea rutas esperadas y un listado del árbol de [searchRoot]
     * (o del padre común) para diagnosticar desajustes de extracción.
     */
    fun assertRuntimePaths(
        modelFile: File,
        tokensFile: File,
        dataDir: File,
        searchRoot: File? = null,
        logOnFailure: Boolean = true,
    ): Boolean {
        val phontab = File(dataDir, VoiceInstallValidator.PHONTAB)
        val okModel = modelFile.isFile && modelFile.length() > 0L
        val okTokens = tokensFile.isFile && tokensFile.length() > 0L
        val okData = dataDir.isDirectory && phontab.isFile && phontab.length() > 0L
        if (okModel && okTokens && okData) return true
        if (logOnFailure) {
            val treeRoot = searchRoot
                ?: dataDir.parentFile
                ?: dataDir
            runCatching {
                Log.e(
                    TAG,
                    "Rutas OfflineTts inválidas: " +
                        "model=${modelFile.absolutePath} exists=$okModel; " +
                        "tokens=${tokensFile.absolutePath} exists=$okTokens; " +
                        "dataDir=${dataDir.absolutePath} exists=${dataDir.isDirectory}; " +
                        "phontab=${phontab.absolutePath} exists=${phontab.isFile}\n" +
                        "Árbol bajo ${treeRoot.absolutePath}:\n" +
                        formatTree(treeRoot),
                )
            }
        }
        return false
    }

    /** Listado legible del árbol (acotado) para logs de diagnóstico. */
    fun formatTree(root: File, maxLines: Int = TREE_LOG_MAX_LINES): String {
        if (!root.exists()) return "(ausente)"
        val lines = ArrayList<String>(maxLines + 1)
        fun walk(dir: File, prefix: String) {
            if (lines.size >= maxLines) {
                if (lines.lastOrNull() != "…") lines.add("…")
                return
            }
            val children = dir.listFiles()?.sortedWith(
                compareBy<File> { !it.isDirectory }.thenBy { it.name },
            ).orEmpty()
            for (child in children) {
                if (lines.size >= maxLines) {
                    lines.add("…")
                    return
                }
                val marker = if (child.isDirectory) "${child.name}/" else child.name
                lines.add("$prefix$marker")
                if (child.isDirectory) walk(child, "$prefix  ")
            }
        }
        lines.add("${root.name}/")
        if (root.isDirectory) walk(root, "  ")
        return lines.joinToString("\n")
    }

    private fun packageRootFromPhontab(searchRoot: File): File? {
        if (!searchRoot.isDirectory) return null
        val dataDir = resolveEspeakDataDir(searchRoot) ?: return null
        val tokens = resolveTokens(searchRoot) ?: return null
        val hasOnnx = findFiles(searchRoot) {
            it.isFile && it.name.endsWith(".onnx", ignoreCase = true) && it.length() > 0L
        }.isNotEmpty()
        if (!hasOnnx) return null

        val tokensParent = tokens.parentFile ?: return null
        val dataParent = dataDir.parentFile
        if (dataParent != null && dataParent.canonicalFile == tokensParent.canonicalFile) {
            return tokensParent.canonicalFile
        }
        // Tokens y espeak en niveles distintos: usar el ancestro común bajo searchRoot.
        return commonAncestor(tokensParent, dataDir)?.canonicalFile
            ?: searchRoot.canonicalFile
    }

    private fun commonAncestor(a: File, b: File): File? {
        val aChain = generateSequence(a.canonicalFile) { it.parentFile?.canonicalFile }.toList()
        val bCanon = b.canonicalFile
        val bSet = generateSequence(bCanon) { it.parentFile?.canonicalFile }.map { it.path }.toSet()
        return aChain.firstOrNull { it.path in bSet }
    }

    fun findNamedFile(root: File, fileName: String, maxDepth: Int = MAX_WALK_DEPTH): File? {
        if (!root.isDirectory || fileName.isBlank()) return null
        // Pista rápida: layout plano típico espeak-ng-data/phontab.
        if (fileName == VoiceInstallValidator.PHONTAB) {
            val conventional = File(root, VoiceInstallValidator.ESPEAK_PHONTAB)
            if (conventional.isFile && conventional.length() > 0L) {
                return conventional
            }
        }
        val direct = File(root, fileName)
        if (direct.isFile && direct.length() > 0L) return direct

        fun walk(dir: File, depth: Int): File? {
            if (depth > maxDepth) return null
            val hit = File(dir, fileName)
            if (hit.isFile && hit.length() > 0L) return hit
            val children = dir.listFiles { f -> f.isDirectory }.orEmpty().sortedBy { child ->
                when {
                    fileName == VoiceInstallValidator.PHONTAB &&
                        child.name == NeuralVoiceModel.ESPEAK_DATA_DIR_NAME -> 0
                    else -> 1
                }
            }
            for (child in children) {
                walk(child, depth + 1)?.let { return it }
            }
            return null
        }
        return walk(root, 0)
    }

    private fun findFiles(
        root: File,
        maxDepth: Int = MAX_WALK_DEPTH,
        predicate: (File) -> Boolean,
    ): List<File> {
        if (!root.isDirectory) return emptyList()
        val out = ArrayList<File>()
        fun walk(dir: File, depth: Int) {
            if (depth > maxDepth) return
            for (child in dir.listFiles().orEmpty()) {
                if (predicate(child)) out.add(child)
                if (child.isDirectory) walk(child, depth + 1)
            }
        }
        walk(root, 0)
        return out
    }
}
