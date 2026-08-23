package mx.ideass.personal.agent.chat

import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import mx.ideass.personal.agent.gateway.protocol.ChatHistoryResult
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ChatHistoryMapperTest {
    @Test
    fun toChatMessages_parsesRoleAndContent() {
        val result = ChatHistoryResult(
            messages = listOf(
                buildJsonObject {
                    put("id", "u1")
                    put("role", "user")
                    put("content", "hola")
                },
                buildJsonObject {
                    put("messageId", "a1")
                    put("role", "assistant")
                    put(
                        "content",
                        buildJsonArray {
                            add(buildJsonObject {
                                put("type", "text")
                                put("text", "mundo")
                            })
                        },
                    )
                },
                buildJsonObject {
                    put("role", "system")
                    put("content", "ignorar")
                },
            ),
        )
        val messages = ChatHistoryMapper.toChatMessages(result)
        assertEquals(2, messages.size)
        assertEquals(ChatMessage("u1", "hola", fromUser = true), messages[0])
        assertEquals(ChatMessage("a1", "mundo", fromUser = false), messages[1])
    }

    @Test
    fun merge_dedupesByIdAndByFingerprint() {
        val remote = listOf(
            ChatMessage("srv-1", "hola", fromUser = true),
            ChatMessage("srv-2", "respuesta", fromUser = false),
        )
        val local = listOf(
            ChatMessage("local-uuid", "hola", fromUser = true), // mismo texto: duplicado
            ChatMessage("srv-2", "respuesta", fromUser = false), // mismo id
            ChatMessage("local-q", "pendiente", fromUser = true, queued = true),
        )
        val merged = ChatHistoryMapper.merge(local, remote)
        assertEquals(
            listOf("srv-1", "srv-2", "local-q"),
            merged.map { it.id },
        )
        assertTrue(merged.single { it.id == "local-q" }.queued)
    }

    @Test
    fun merge_keepsLocalWhenRemoteEmpty() {
        val local = listOf(ChatMessage("1", "solo local", fromUser = true))
        assertEquals(local, ChatHistoryMapper.merge(local, emptyList()))
    }

    @Test
    fun switchSession_loadsHistoryForCorrectKey() {
        val loadedKeys = mutableListOf<String>()
        val histories = mapOf(
            "agent:main:main" to listOf(ChatMessage("m1", "main msg", fromUser = true)),
            "agent:main:dashboard:work" to listOf(ChatMessage("w1", "work msg", fromUser = true)),
        )
        val threads = ChatThreads()

        fun activateAndLoad(sessionKey: String) {
            threads.setVisibleSession(sessionKey)
            loadedKeys += sessionKey
            val remote = histories.getValue(sessionKey)
            val merged = ChatHistoryMapper.merge(threads.messagesFor(sessionKey), remote)
            threads.replaceMessages(sessionKey, merged)
        }

        activateAndLoad("agent:main:main")
        activateAndLoad("agent:main:dashboard:work")
        activateAndLoad("agent:main:main")

        assertEquals(
            listOf(
                "agent:main:main",
                "agent:main:dashboard:work",
                "agent:main:main",
            ),
            loadedKeys,
        )
        threads.setVisibleSession("agent:main:dashboard:work")
        assertEquals(listOf("work msg"), threads.visibleMessages().map { it.text })
        threads.setVisibleSession("agent:main:main")
        assertEquals(listOf("main msg"), threads.visibleMessages().map { it.text })
    }

    @Test
    fun merge_noDuplicatesAfterSecondHistoryFetch() {
        val remote = listOf(
            ChatMessage("1", "a", fromUser = true),
            ChatMessage("2", "b", fromUser = false),
        )
        val once = ChatHistoryMapper.merge(emptyList(), remote)
        val twice = ChatHistoryMapper.merge(once, remote)
        assertEquals(once, twice)
        assertEquals(2, twice.size)
    }
}
