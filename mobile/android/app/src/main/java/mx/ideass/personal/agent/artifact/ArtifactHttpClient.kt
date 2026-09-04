package mx.ideass.personal.agent.artifact

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import mx.ideass.personal.agent.workspace.GatewayErrorBody
import mx.ideass.personal.agent.workspace.HubHttpOrigin
import mx.ideass.personal.agent.workspace.WorkspaceHttpException
import mx.ideass.personal.agent.workspace.WorkspaceHttpKind
import mx.ideass.personal.agent.workspace.kindForStatus
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.IOException
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import kotlinx.serialization.json.Json

/**
 * Cliente HTTP mínimo para delivery de Artifacts (PHASE 58).
 * Reutiliza Bearer + opcional X-Device-Id (device auth).
 * No es UI de browser; no toca pairing/WS.
 */
class ArtifactHttpClient @Inject constructor() {
    private val json = Json { ignoreUnknownKeys = true }
    private val http = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)
        .build()

    @Volatile
    var baseUrl: String = ""

    @Volatile
    var token: String = ""

    /** Requerido cuando authKind=device. */
    @Volatile
    var deviceId: String = ""

    @Volatile
    var authKind: String = "install"

    fun configure(
        baseUrl: String,
        token: String,
        deviceId: String = "",
        authKind: String = "install",
    ) {
        this.baseUrl = baseUrl
        this.token = token
        this.deviceId = deviceId
        this.authKind = if (authKind == "device") "device" else "install"
    }

    data class ArtifactMetadata(
        val contentType: String?,
        val contentLength: Long?,
        val contentDisposition: String?,
        val acceptRanges: String?,
    )

    suspend fun getArtifactMetadata(artifactId: String): ArtifactMetadata =
        withContext(Dispatchers.IO) {
            val response = execute("HEAD", artifactId)
            try {
                if (!response.isSuccessful) {
                    throw httpError(response.code, response.body?.string().orEmpty())
                }
                ArtifactMetadata(
                    contentType = response.header("Content-Type"),
                    contentLength = response.header("Content-Length")?.toLongOrNull(),
                    contentDisposition = response.header("Content-Disposition"),
                    acceptRanges = response.header("Accept-Ranges"),
                )
            } finally {
                response.close()
            }
        }

    /**
     * Descarga streaming a [destFile] (no carga el Artifact entero en RAM del caller).
     */
    suspend fun downloadArtifact(artifactId: String, destFile: File): Long =
        withContext(Dispatchers.IO) {
            val response = execute("GET", artifactId)
            try {
                if (!response.isSuccessful) {
                    throw httpError(response.code, response.body?.string().orEmpty())
                }
                val body = response.body
                    ?: throw WorkspaceHttpException(
                        WorkspaceHttpKind.Network,
                        0,
                        "Respuesta sin cuerpo.",
                    )
                destFile.parentFile?.mkdirs()
                var total = 0L
                body.byteStream().use { input ->
                    destFile.outputStream().use { output ->
                        val buf = ByteArray(64 * 1024)
                        while (true) {
                            val n = input.read(buf)
                            if (n < 0) break
                            output.write(buf, 0, n)
                            total += n
                        }
                    }
                }
                total
            } finally {
                response.close()
            }
        }

    private fun execute(method: String, artifactId: String): okhttp3.Response {
        val origin = HubHttpOrigin.fromAddress(baseUrl)
        if (origin.isBlank() || token.isBlank()) {
            throw WorkspaceHttpException(
                WorkspaceHttpKind.Unauthorized,
                401,
                "Gateway no configurado.",
            )
        }
        val id = java.net.URLEncoder.encode(artifactId, Charsets.UTF_8.name())
            .replace("+", "%20")
        val builder = Request.Builder()
            .url("$origin/artifacts/$id")
            .header("Authorization", "Bearer $token")
            .method(method, null)
        if (authKind == "device" && deviceId.isNotBlank()) {
            builder.header("X-Device-Id", deviceId)
        }
        return try {
            http.newCall(builder.build()).execute()
        } catch (e: IOException) {
            throw WorkspaceHttpException(
                WorkspaceHttpKind.Network,
                0,
                e.message ?: "Error de red.",
            )
        }
    }

    private fun httpError(code: Int, text: String): WorkspaceHttpException {
        val parsed = runCatching {
            json.decodeFromString(GatewayErrorBody.serializer(), text)
        }.getOrNull()
        return WorkspaceHttpException(
            kindForStatus(code),
            code,
            parsed?.error?.message ?: "HTTP $code",
            parsed?.error?.code,
        )
    }
}
