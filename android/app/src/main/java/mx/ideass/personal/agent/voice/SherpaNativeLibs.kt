package mx.ideass.personal.agent.voice

import android.util.Log
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Carga explícita de las nativas de sherpa-onnx en el orden correcto.
 *
 * [OfflineTts] solo hace `System.loadLibrary("sherpa-onnx-jni")`, y ese `.so`
 * declara NEEDED sobre `libonnxruntime.so`. Si el runtime no está en el APK
 * (o el linker no lo resuelve), aparece
 * `UnsatisfiedLinkError: couldn't find "libonnxruntime.so"`.
 *
 * Precargamos `onnxruntime` antes del JNI para fallar de forma controlada
 * y permitir fallback a Android TTS.
 */
object SherpaNativeLibs {
    private const val TAG = "SherpaNativeLibs"

    /** Orden de carga: runtime de inferencia → binding JNI. */
    val LOAD_ORDER = listOf("onnxruntime", "sherpa-onnx-jni")

    private val loaded = AtomicBoolean(false)
    private val loadFailed = AtomicBoolean(false)

    @Volatile
    private var lastError: Throwable? = null

    /**
     * Factoría inyectable (tests JVM): producción usa [System.loadLibrary].
     */
    @Volatile
    internal var loadLibrary: (String) -> Unit = { name -> System.loadLibrary(name) }

    /** true si ambas librerías cargaron (o ya estaban cargadas). */
    fun isReady(): Boolean = loaded.get() && !loadFailed.get()

    fun lastLoadError(): Throwable? = lastError

    /**
     * Idempotente. @return false si falta algún `.so` o dlopen falla
     * (caller → fallback Android TTS; no relanzar).
     */
    @Synchronized
    fun ensureLoaded(): Boolean {
        if (loaded.get()) return !loadFailed.get()
        if (loadFailed.get()) return false

        return try {
            for (name in LOAD_ORDER) {
                loadLibrary(name)
                runCatching { Log.i(TAG, "loadLibrary($name) ok") }
            }
            loaded.set(true)
            true
        } catch (t: Throwable) {
            // UnsatisfiedLinkError / ExceptionInInitializerError / etc.
            lastError = t
            loadFailed.set(true)
            loaded.set(true)
            runCatching {
                Log.e(
                    TAG,
                    "Fallo cargando nativas sherpa (${LOAD_ORDER.joinToString()}). " +
                        "¿Falta libonnxruntime.so / libsherpa-onnx-jni.so en el APK? " +
                        "→ fallback Android TTS",
                    t,
                )
            }
            false
        }
    }

    /** Solo tests: permite reintentar carga. */
    internal fun resetForTests() {
        loaded.set(false)
        loadFailed.set(false)
        lastError = null
    }
}
