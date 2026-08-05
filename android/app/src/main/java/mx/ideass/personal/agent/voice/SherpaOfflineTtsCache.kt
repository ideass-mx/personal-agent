package mx.ideass.personal.agent.voice

import android.util.Log

/**
 * Cache de **un** [SherpaOfflineSynthesizer] (voz activa).
 *
 * Kokoro ~365 MB en RAM: no se cachean varios modelos a la vez.
 * Al cambiar de paquete / idioma espeak (Kokoro) / hilos / silenceScale
 * se libera el anterior y se carga el nuevo.
 *
 * El sid (speaker) no forma parte de la clave: se pasa en cada
 * [SherpaOfflineSynthesizer.synthesize].
 */
object SherpaOfflineTtsCache {
    private const val TAG = "SherpaOfflineTtsCache"

    data class Key(
        val rootPath: String,
        val engine: NeuralVoiceEngine,
        /** Solo Kokoro: idioma espeak embebido en OfflineTtsKokoroModelConfig. */
        val kokoroEspeakLang: String,
        val numThreads: Int,
        val silenceScale: Float,
    ) {
        companion object {
            fun from(
                model: NeuralVoiceModel,
                numThreads: Int,
                silenceScale: Float,
            ): Key =
                Key(
                    rootPath = model.rootDir.absolutePath,
                    engine = model.engine,
                    kokoroEspeakLang =
                        if (model.engine == NeuralVoiceEngine.Kokoro) {
                            KokoroVoices.espeakLang(model.language)
                        } else {
                            ""
                        },
                    numThreads = numThreads.coerceAtLeast(1),
                    silenceScale = silenceScale,
                )
        }
    }

    private data class Entry(
        val key: Key,
        val synth: SherpaOfflineSynthesizer,
    )

    private val lock = Any()
    private var entry: Entry? = null

    /**
     * Factoría inyectable (tests JVM con [SherpaOfflineSynthesizer.createTestStub]).
     * Producción delega a [SherpaOfflineSynthesizer.createOrNull].
     */
    @Volatile
    internal var createSynthesizer: (
        NeuralVoiceModel,
        Int,
        Float,
        Boolean,
    ) -> SherpaOfflineSynthesizer? = { model, numThreads, silenceScale, debug ->
        SherpaOfflineSynthesizer.createOrNull(model, numThreads, silenceScale, debug)
    }

    /** Cuántas veces se creó OfflineTts (tests / logcat). */
    @Volatile
    var createCount: Int = 0
        private set

    /** Última carga desde disco (ms); -1 si aún no hubo MISS. */
    @Volatile
    var lastLoadMs: Long = -1L
        private set

    /** true si el último [getOrCreate] reutilizó la instancia. */
    @Volatile
    var lastWasHit: Boolean = false
        private set

    /**
     * Devuelve el sintetizador cacheado o crea uno nuevo (liberando el previo
     * si la clave cambió). Null si el layout/JNI/modelo fallan.
     */
    fun getOrCreate(
        model: NeuralVoiceModel,
        numThreads: Int = 2,
        silenceScale: Float = 0.2f,
        debug: Boolean = false,
    ): SherpaOfflineSynthesizer? {
        val key = Key.from(model, numThreads, silenceScale)
        synchronized(lock) {
            val cur = entry
            if (cur != null && cur.key == key) {
                lastWasHit = true
                runCatching {
                    Log.i(
                        TAG,
                        "cache HIT createCount=$createCount " +
                            "engine=${key.engine} root=${key.rootPath} " +
                            "kokoroLang=${key.kokoroEspeakLang.ifEmpty { "-" }}",
                    )
                }
                return cur.synth
            }
            cur?.let {
                runCatching {
                    Log.i(
                        TAG,
                        "cache REPLACE: liberando anterior engine=${it.key.engine} " +
                            "root=${it.key.rootPath}",
                    )
                }
                runCatching { it.synth.close() }
            }
            entry = null
            lastWasHit = false
            val t0 = System.nanoTime()
            val synth = createSynthesizer(model, numThreads, silenceScale, debug)
            val loadMs = (System.nanoTime() - t0) / 1_000_000L
            if (synth == null) {
                lastLoadMs = loadMs
                runCatching { Log.w(TAG, "cache MISS falló loadMs=$loadMs key=$key") }
                return null
            }
            createCount += 1
            lastLoadMs = loadMs
            entry = Entry(key, synth)
            runCatching {
                Log.i(
                    TAG,
                    "cache MISS loadMs=$loadMs createCount=$createCount " +
                        "engine=${key.engine} root=${key.rootPath} " +
                        "kokoroLang=${key.kokoroEspeakLang.ifEmpty { "-" }} " +
                        "threads=${key.numThreads}",
                )
            }
            return synth
        }
    }

    /** Precarga en background (activar voz / primer uso). */
    fun warm(
        model: NeuralVoiceModel,
        numThreads: Int = 2,
        silenceScale: Float = 0.2f,
    ): Boolean = getOrCreate(model, numThreads, silenceScale) != null

    /** Libera si el cache apunta a [rootPath] (p. ej. al borrar el paquete). */
    fun releaseIfRoot(rootPath: String) {
        synchronized(lock) {
            val cur = entry ?: return
            if (cur.key.rootPath != rootPath) return
            runCatching { Log.i(TAG, "cache RELEASE root=$rootPath") }
            runCatching { cur.synth.close() }
            entry = null
        }
    }

    fun clear() {
        synchronized(lock) {
            entry?.let { runCatching { it.synth.close() } }
            entry = null
        }
    }

    /** Clave actualmente cacheada (tests). */
    fun cachedKeyOrNull(): Key? = synchronized(lock) { entry?.key }

    fun resetForTests() {
        clear()
        createCount = 0
        lastLoadMs = -1L
        lastWasHit = false
        createSynthesizer = { model, numThreads, silenceScale, debug ->
            SherpaOfflineSynthesizer.createOrNull(model, numThreads, silenceScale, debug)
        }
    }
}
