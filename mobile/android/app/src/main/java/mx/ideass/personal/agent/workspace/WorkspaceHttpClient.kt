package mx.ideass.personal.agent.workspace

import javax.inject.Inject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

class WorkspaceHttpClient @Inject constructor() : WorkspaceGateway {
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }
    private val http = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .build()
    private val media = "application/json; charset=utf-8".toMediaType()

    @Volatile
    var baseUrl: String = ""

    @Volatile
    var token: String = ""

    override fun configure(baseUrl: String, token: String) {
        this.baseUrl = baseUrl
        this.token = token
    }

    override suspend fun listWorkspaces(): List<WorkspaceDto> {
        val body = request("GET", "/workspaces")
        return json.decodeFromString(WorkspaceListResponse.serializer(), body).workspaces
    }

    override suspend fun createWorkspace(name: String, description: String?): WorkspaceDto {
        val payload = buildJsonObject {
            put("name", name)
            if (description != null) put("description", description)
        }.toString()
        val body = request("POST", "/workspaces", payload)
        return json.decodeFromString(WorkspaceDto.serializer(), body)
    }

    override suspend fun createConversation(
        title: String?,
        workspaceId: String?,
    ): ConversationRecordDto {
        val payload = buildJsonObject {
            if (title != null) put("title", title)
            if (workspaceId == null) {
                put("workspaceId", JsonNull)
            } else {
                put("workspaceId", workspaceId)
            }
        }.toString()
        val body = request("POST", "/conversations", payload)
        return json.decodeFromString(ConversationRecordDto.serializer(), body)
    }

    override suspend fun getWorkspace(id: String): WorkspaceDto {
        val body = request("GET", "/workspaces/${enc(id)}")
        return json.decodeFromString(WorkspaceDto.serializer(), body)
    }

    override suspend fun listWorkspaceConversations(
        workspaceId: String,
    ): List<ConversationRecordDto> {
        val body = request("GET", "/workspaces/${enc(workspaceId)}/conversations")
        return json.decodeFromString(
            ListSerializer(ConversationRecordDto.serializer()),
            body,
        )
    }

    override suspend fun getConversationWorkspace(conversationId: String): WorkspaceDto? {
        val body = request("GET", "/conversations/${enc(conversationId)}/workspace")
        return json.decodeFromString(ConversationWorkspaceResponse.serializer(), body).workspace
    }

    override suspend fun setConversationWorkspace(
        conversationId: String,
        workspaceId: String,
    ): ConversationWorkspacePatchResponse {
        val payload = buildJsonObject { put("workspaceId", workspaceId) }.toString()
        val body = request("PATCH", "/conversations/${enc(conversationId)}/workspace", payload)
        return json.decodeFromString(ConversationWorkspacePatchResponse.serializer(), body)
    }

    override suspend fun clearConversationWorkspace(
        conversationId: String,
    ): ConversationWorkspacePatchResponse {
        val payload = """{"workspaceId":null}"""
        val body = request("PATCH", "/conversations/${enc(conversationId)}/workspace", payload)
        return json.decodeFromString(ConversationWorkspacePatchResponse.serializer(), body)
    }

    override suspend fun getConversationMessages(
        conversationId: String,
    ): List<ConversationMessageDto> {
        val body = request("GET", "/conversations/${enc(conversationId)}/messages")
        return json.decodeFromString(
            ListSerializer(ConversationMessageDto.serializer()),
            body,
        )
    }

    private fun enc(id: String): String = java.net.URLEncoder.encode(id, Charsets.UTF_8.name())
        .replace("+", "%20")

    private suspend fun request(method: String, path: String, jsonBody: String? = null): String =
        withContext(Dispatchers.IO) {
            val origin = HubHttpOrigin.fromAddress(baseUrl)
            if (origin.isBlank() || token.isBlank()) {
                throw WorkspaceHttpException(
                    WorkspaceHttpKind.Unauthorized,
                    401,
                    "Hub no configurado.",
                )
            }
            val builder = Request.Builder()
                .url("$origin$path")
                .header("Authorization", "Bearer $token")
            when {
                jsonBody != null -> {
                    builder.method(method, jsonBody.toRequestBody(media))
                    builder.header("Content-Type", "application/json")
                }
                method == "GET" -> builder.get()
                method == "DELETE" -> builder.delete()
                else -> builder.method(method, ByteArray(0).toRequestBody(null))
            }
            val response = try {
                http.newCall(builder.build()).execute()
            } catch (e: IOException) {
                throw WorkspaceHttpException(
                    WorkspaceHttpKind.Network,
                    0,
                    e.message ?: "Error de red.",
                )
            }
            val text = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                val parsed = runCatching {
                    json.decodeFromString(GatewayErrorBody.serializer(), text)
                }.getOrNull()
                throw WorkspaceHttpException(
                    kindForStatus(response.code),
                    response.code,
                    parsed?.error?.message ?: "HTTP ${response.code}",
                    parsed?.error?.code,
                )
            }
            text
        }
}
