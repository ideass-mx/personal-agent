package mx.ideass.personal.agent.voice

import android.content.Context
import java.io.File

/**
 * Rutas locales de voces neuronales instaladas.
 *
 * Destino canónico de descarga: `{filesDir}/neural_voices/<id>/`.
 * Al cargar, [resolveVoiceBaseDir] localiza la carpeta real (p. ej.
 * `archiveRoot` del tar u otro nombre usable) sin asumir que el nombre == id.
 *
 * Catálogo: solo modelos **no cuantizados** hasta confirmar soporte int8
 * del AAR integrado (las variantes `-int8`/`-fp16` se purgan al reconciliar).
 */
object NeuralVoicesStore {
    const val ROOT_DIR_NAME = "neural_voices"

    /** Voz de prueba / recomendada (Piper es-MX claude-high, no cuantizada). */
    const val CP1_TEST_VOICE_ID = "vits-piper-es_MX-claude-high"
    /** Alias legado (misma voz; antes apuntaba a la carpeta `-int8`). */
    const val CP1_TEST_VOICE_ID_SHORT = "vits-piper-es_MX-claude-high"
    const val CP1_TEST_ONNX_NAME = "es_MX-claude-high.onnx"

    /** Sufijos de variantes cuantizadas abandonadas (runtime no fiable). */
    val ABANDONED_QUANTIZED_SUFFIXES = listOf("-int8", "-fp16")

    fun rootDir(context: Context): File =
        File(context.applicationContext.filesDir, ROOT_DIR_NAME)

    /** Destino canónico al instalar (siempre el id del catálogo). */
    fun voiceDir(context: Context, voiceId: String): File =
        File(rootDir(context), voiceId)

    /**
     * Carpeta base real bajo [voicesRoot] para [voiceId].
     *
     * Orden: nombre == id → == archiveRoot → prefijo id + sufijo → contiene
     * [onnxFile]. Ignora carpetas con sufijo cuantizado abandonado salvo que
     * el [voiceId]/[archiveRoot] pedido sea exactamente esa carpeta.
     * Solo se acepta si el layout es usable (tokens + phontab + onnx).
     */
    fun resolveVoiceBaseDir(
        voicesRoot: File,
        voiceId: String,
        archiveRoot: String? = null,
        onnxFile: String? = null,
    ): File? {
        if (!voicesRoot.isDirectory || voiceId.isBlank()) return null
        val dirs = voicesRoot.listFiles { f ->
            f.isDirectory && f.name != InstalledVoices.PARTIAL_DIR_NAME
        }.orEmpty()
        if (dirs.isEmpty()) return null

        val rootHint = archiveRoot?.trim()?.trimEnd('/')
        val allowExactQuantized = isAbandonedQuantizedName(voiceId) ||
            (!rootHint.isNullOrEmpty() && isAbandonedQuantizedName(rootHint))

        fun acceptable(dir: File): Boolean {
            if (allowExactQuantized) return true
            if (!isAbandonedQuantizedName(dir.name)) return true
            // Solo si el id/archivo pedido apunta exactamente a esa carpeta.
            return dir.name == voiceId || dir.name == rootHint
        }

        val ranked = LinkedHashSet<File>()
        dirs.firstOrNull { it.name == voiceId }?.let { ranked.add(it) }
        if (!rootHint.isNullOrEmpty()) {
            dirs.firstOrNull { it.name == rootHint }?.let { ranked.add(it) }
        }
        // id → carpeta con sufijo (p. ej. archiveRoot distinto del id)
        dirs.filter { dir ->
            dir.name.startsWith("$voiceId-") || dir.name.startsWith("${voiceId}_")
        }.sortedBy { it.name }.forEach { ranked.add(it) }
        // id con sufijo → carpeta más corta (raro, pero simétrico)
        dirs.filter { dir ->
            voiceId.startsWith("${dir.name}-") || voiceId.startsWith("${dir.name}_")
        }.forEach { ranked.add(it) }
        if (!onnxFile.isNullOrBlank()) {
            dirs.filter { VoiceContentRoot.findNamedFile(it, onnxFile) != null }
                .forEach { ranked.add(it) }
        }

        return ranked.firstOrNull { dir ->
            acceptable(dir) && isUsableVoiceDir(dir, preferredOnnxName = onnxFile)
        }
    }

    fun isAbandonedQuantizedName(name: String): Boolean =
        ABANDONED_QUANTIZED_SUFFIXES.any { name.endsWith(it) }

    fun isUsableVoiceDir(
        dir: File,
        preferredOnnxName: String? = null,
    ): Boolean {
        if (!dir.isDirectory) return false
        val tokens = VoiceContentRoot.resolveTokens(dir) ?: return false
        val dataDir = VoiceContentRoot.resolveEspeakDataDir(dir) ?: return false
        val onnx = VoiceContentRoot.resolveOnnx(dir, preferredOnnxName) ?: return false
        return VoiceContentRoot.assertRuntimePaths(
            modelFile = onnx,
            tokensFile = tokens,
            dataDir = dataDir,
            searchRoot = dir,
            logOnFailure = false,
        )
    }

    fun resolveInstalledPiper(
        context: Context,
        voiceId: String,
        preferredOnnxName: String? = null,
    ): NeuralVoiceModel? {
        val root = rootDir(context)
        val base = resolveVoiceBaseDir(
            voicesRoot = root,
            voiceId = voiceId,
            onnxFile = preferredOnnxName,
        ) ?: return null
        return NeuralVoiceModel.resolvePiper(
            id = voiceId,
            rootDir = base,
            preferredOnnxName = preferredOnnxName,
        )
    }

    fun resolveCp1TestVoice(context: Context): NeuralVoiceModel? =
        resolveInstalledPiper(
            context = context,
            voiceId = CP1_TEST_VOICE_ID,
            preferredOnnxName = CP1_TEST_ONNX_NAME,
        ) ?: resolveInstalledPiper(
            context = context,
            voiceId = CP1_TEST_VOICE_ID_SHORT,
            preferredOnnxName = CP1_TEST_ONNX_NAME,
        )

    /**
     * Voz neuronal a usar (legado CP2). Preferir [InstalledVoices.resolveForPlayback]
     * con `active_voice_id`.
     */
    fun resolveActiveOrAnyInstalled(context: Context): NeuralVoiceModel? {
        resolveCp1TestVoice(context)?.let { return it }
        val root = rootDir(context)
        if (!root.isDirectory) return null
        val dirs = root.listFiles { f ->
            f.isDirectory && f.name != InstalledVoices.PARTIAL_DIR_NAME
        }.orEmpty().sortedBy { it.name }
        for (dir in dirs) {
            if (isAbandonedQuantizedName(dir.name)) continue
            NeuralVoiceModel.resolvePiper(id = dir.name, rootDir = dir)?.let { return it }
            NeuralVoiceModel.resolveKokoro(
                id = dir.name,
                rootDir = dir,
                onnxName = "model.onnx",
            )?.let { return it }
        }
        return null
    }
}
