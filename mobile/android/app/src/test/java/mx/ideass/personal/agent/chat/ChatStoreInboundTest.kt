package mx.ideass.personal.agent.chat

import mx.ideass.personal.agent.network.ChatInbound
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ChatStoreInboundTest {
    @Test
    fun assistantDelta_replaceOverwritesAppendAccumulates() {
        val threads = ChatThreads()
        threads.setVisibleSession("s1")
        threads.handleInbound("s1", ChatInbound.AssistantDelta("Ho", replace = false, sessionKey = "s1"))
        threads.handleInbound("s1", ChatInbound.AssistantDelta("la", replace = false, sessionKey = "s1"))
        assertEquals("Hola", threads.visibleMessages().single().text)

        threads.handleInbound(
            "s1",
            ChatInbound.AssistantDelta("Hola mundo", replace = true, sessionKey = "s1"),
        )
        assertEquals("Hola mundo", threads.visibleMessages().single().text)

        threads.handleInbound("s1", ChatInbound.AssistantDelta("!", replace = false, sessionKey = "s1"))
        assertEquals("Hola mundo!", threads.visibleMessages().single().text)
    }

    @Test
    fun interleavedSessions_doNotMixBubbles() {
        val threads = ChatThreads()
        val main = "agent:main:main"
        val work = "agent:main:dashboard:work-1"

        threads.setVisibleSession(main)
        threads.appendUser(main, "hola main", queued = false)
        threads.handleInbound(
            main,
            ChatInbound.AssistantDelta("respuesta main", replace = true, sessionKey = main),
        )
        threads.handleInbound(main, ChatInbound.AssistantDone(main))

        // Tráfico de otra sesión mientras main está visible: no contamina la UI.
        threads.appendUser(work, "hola trabajo", queued = false)
        val painted = threads.handleInbound(
            work,
            ChatInbound.AssistantDelta("respuesta trabajo", replace = true, sessionKey = work),
        )
        assertFalse(painted)
        assertEquals(
            listOf("hola main", "respuesta main"),
            threads.visibleMessages().map { it.text },
        )
        assertEquals(
            listOf("hola trabajo", "respuesta trabajo"),
            threads.messagesFor(work).map { it.text },
        )

        // Cambiar de sesión muestra el hilo correcto.
        threads.setVisibleSession(work)
        assertEquals(
            listOf("hola trabajo", "respuesta trabajo"),
            threads.visibleMessages().map { it.text },
        )

        threads.setVisibleSession(main)
        assertEquals(
            listOf("hola main", "respuesta main"),
            threads.visibleMessages().map { it.text },
        )
    }

    @Test
    fun inboundForHiddenSession_doesNotAffectVisible() {
        val threads = ChatThreads()
        threads.setVisibleSession("visible")
        threads.appendUser("visible", "ui", queued = false)

        threads.handleInbound(
            "hidden",
            ChatInbound.AssistantDelta("secreto", replace = true, sessionKey = "hidden"),
        )
        threads.handleInbound("hidden", ChatInbound.AssistantDone("hidden"))
        threads.handleInbound(
            "hidden",
            ChatInbound.Error("E", "boom", sessionKey = "hidden"),
        )

        assertEquals(listOf("ui"), threads.visibleMessages().map { it.text })
        assertTrue(threads.messagesFor("hidden").any { it.text.contains("secreto") })
        assertTrue(threads.messagesFor("hidden").any { it.text.contains("boom") })
    }

    @Test
    fun inboundSealed_coversTerminalStates() {
        val events: List<ChatInbound> = listOf(
            ChatInbound.AssistantDelta("x", sessionKey = "s"),
            ChatInbound.AssistantDone("agent:main:main"),
            ChatInbound.Error("E", "boom", sessionKey = "s"),
        )
        assertEquals(3, events.size)
        assertEquals("agent:main:main", events[1].sessionKey)
    }

    @Test
    fun appendToQuickSession_doesNotPaintActiveThread() {
        val threads = ChatThreads()
        val work = "agent:main:dashboard:work"
        val quick = "agent:main:dashboard:rapidas"

        threads.setVisibleSession(work)
        threads.appendUser(work, "en trabajo", queued = false)
        threads.appendUser(quick, "por voz", queued = false)
        threads.handleInbound(
            quick,
            ChatInbound.AssistantDelta("respuesta rapidas", replace = true, sessionKey = quick),
        )
        threads.handleInbound(quick, ChatInbound.AssistantDone(quick))

        assertEquals(listOf("en trabajo"), threads.visibleMessages().map { it.text })
        assertEquals(
            listOf("por voz", "respuesta rapidas"),
            threads.messagesFor(quick).map { it.text },
        )
    }

    @Test
    fun interleavedRuns_sameSession_keepBothBubblesComplete() {
        val threads = ChatThreads()
        val key = "agent:main:dashboard:streak-1"
        threads.setVisibleSession(key)
        threads.appendUser(key, "sabes qué me pasó", queued = false)
        threads.appendUser(key, "Dame solo un título…", queued = false)

        // Deltas mezclados; finales en orden inverso (título primero).
        threads.handleInbound(
            key,
            ChatInbound.AssistantDelta("N", replace = false, sessionKey = key, runId = "run-A"),
        )
        threads.handleInbound(
            key,
            ChatInbound.AssistantDelta(
                "Datos adicionales",
                replace = true,
                sessionKey = key,
                runId = "run-B",
            ),
        )
        threads.handleInbound(
            key,
            ChatInbound.AssistantDelta(
                "Nunca lo conté del todo",
                replace = true,
                sessionKey = key,
                runId = "run-A",
            ),
        )
        threads.handleInbound(
            key,
            ChatInbound.AssistantDelta(
                "Datos adicionales sobre lo ocurrido",
                replace = true,
                sessionKey = key,
                runId = "run-B",
            ),
        )
        threads.handleInbound(key, ChatInbound.AssistantDone(key, runId = "run-B"))
        threads.handleInbound(
            key,
            ChatInbound.AssistantDelta(
                "Nunca lo conté del todo a nadie",
                replace = true,
                sessionKey = key,
                runId = "run-A",
            ),
        )
        threads.handleInbound(key, ChatInbound.AssistantDone(key, runId = "run-A"))

        assertEquals(
            listOf(
                "sabes qué me pasó",
                "Dame solo un título…",
                "Nunca lo conté del todo a nadie",
                "Datos adicionales sobre lo ocurrido",
            ),
            threads.visibleMessages().map { it.text },
        )
        assertFalse(threads.hasAssistantWork(key))
        assertTrue(threads.visibleMessages().none { it.streaming })
    }

    @Test
    fun snapshotReplace_prefersFullTextOverConcat() {
        val threads = ChatThreads()
        threads.setVisibleSession("s1")
        threads.appendUser("s1", "hola", queued = false)
        threads.handleInbound(
            "s1",
            ChatInbound.AssistantDelta("Ho", replace = false, sessionKey = "s1", runId = "r1"),
        )
        threads.handleInbound(
            "s1",
            ChatInbound.AssistantDelta(
                "Hola completo",
                replace = true,
                sessionKey = "s1",
                runId = "r1",
            ),
        )
        threads.handleInbound("s1", ChatInbound.AssistantDone("s1", runId = "r1"))
        assertEquals(
            listOf("hola", "Hola completo"),
            threads.visibleMessages().map { it.text },
        )
    }

    @Test
    fun pendingReply_countsAsAssistantWorkUntilDone() {
        val threads = ChatThreads()
        threads.appendUser("s1", "ping", queued = false)
        assertTrue(threads.hasAssistantWork("s1"))
        threads.handleInbound("s1", ChatInbound.AssistantDone("s1", runId = "r1"))
        assertFalse(threads.hasAssistantWork("s1"))
    }

    @Test
    fun removeSessions_dropsPartitionIncludingQueued() {
        val threads = ChatThreads()
        threads.setVisibleSession("keep")
        threads.appendUser("keep", "queda", queued = false)
        threads.appendUser("trash", "en cola", queued = true)
        assertTrue(threads.hasAssistantWork("trash"))
        assertEquals(setOf("keep", "trash"), threads.knownSessionKeys())

        threads.removeSessions(listOf("trash"))
        assertFalse(threads.knownSessionKeys().contains("trash"))
        assertEquals(listOf("queda"), threads.messagesFor("keep").map { it.text })
        assertTrue(threads.messagesFor("trash").isEmpty())
        assertFalse(threads.hasAssistantWork("trash"))
        assertEquals("keep", threads.visibleSessionKey)
    }

    @Test
    fun removeSessions_clearsVisibleIfDeleted() {
        val threads = ChatThreads()
        threads.setVisibleSession("gone")
        threads.appendUser("gone", "hola", queued = true)
        threads.removeSessions(listOf("gone"))
        assertEquals(null, threads.visibleSessionKey)
        assertTrue(threads.visibleMessages().isEmpty())
    }

    @Test
    fun confirmRequest_doesNotAddChatBubble() {
        val threads = ChatThreads()
        threads.setVisibleSession("c_1")
        threads.appendUser("c_1", "escribe", queued = false)
        threads.handleInbound(
            "c_1",
            ChatInbound.ConfirmRequest(
                confirmationId = "cf_1",
                toolCallId = "call_1",
                toolName = "filesystem.write",
                inputJson = """{"path":"a.txt"}""",
                conversationId = "c_1",
            ),
        )
        assertEquals(listOf("escribe"), threads.visibleMessages().map { it.text })
    }

    @Test
    fun chunkWithConversationKey_doesNotPaintOtherVisibleThread() {
        val threads = ChatThreads()
        val a = "c_a"
        val b = "c_b"
        threads.setVisibleSession(b)
        threads.appendUser(a, "msg A", queued = false)
        threads.handleInbound(
            a,
            ChatInbound.AssistantDelta(
                text = "respuesta A",
                replace = true,
                sessionKey = a,
            ),
        )
        assertEquals(emptyList<String>(), threads.visibleMessages().map { it.text })
        assertEquals(listOf("msg A", "respuesta A"), threads.messagesFor(a).map { it.text })
    }

    @Test
    fun errorWithConversationKey_doesNotPaintOtherVisibleThread() {
        val threads = ChatThreads()
        val a = "c_a"
        threads.setVisibleSession("c_b")
        threads.appendUser(a, "msg A", queued = false)
        threads.handleInbound(
            a,
            ChatInbound.Error(code = "internal", message = "fallo", sessionKey = a),
        )
        assertEquals(emptyList<String>(), threads.visibleMessages().map { it.text })
        assertTrue(threads.messagesFor(a).any { it.text.contains("fallo") })
    }

    @Test
    fun errorAgentDisconnected_showsHumanCopy() {
        val threads = ChatThreads()
        threads.setVisibleSession("c_1")
        threads.handleInbound(
            "c_1",
            ChatInbound.Error(
                code = "agent_disconnected",
                message = "agent_disconnected",
                sessionKey = "c_1",
            ),
        )
        val text = threads.visibleMessages().last().text
        assertTrue(text.contains("PC"))
        assertFalse(text.contains("Error: agent_disconnected"))
    }
}
