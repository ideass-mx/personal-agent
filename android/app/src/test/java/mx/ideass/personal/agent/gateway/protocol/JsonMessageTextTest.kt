package mx.ideass.personal.agent.gateway.protocol

import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class JsonMessageTextTest {
    @Test
    fun extract_stringContent() {
        val msg = buildJsonObject {
            put("role", "assistant")
            put("content", "hola")
        }
        assertEquals("hola", JsonMessageText.extract(msg))
    }

    @Test
    fun extract_arrayContent_doesNotThrow() {
        val msg = buildJsonObject {
            put("role", "assistant")
            put(
                "content",
                buildJsonArray {
                    add(buildJsonObject {
                        put("type", "text")
                        put("text", "parte ")
                    })
                    add(buildJsonObject {
                        put("type", "text")
                        put("text", "dos")
                    })
                },
            )
        }
        assertEquals("parte dos", JsonMessageText.extract(msg))
    }

    @Test
    fun extract_emptyArrayContent_returnsNull() {
        val msg = buildJsonObject {
            put("content", buildJsonArray { })
        }
        assertNull(JsonMessageText.extract(msg))
    }

    @Test
    fun extract_topLevelArray_doesNotThrow() {
        val msg = buildJsonArray {
            add(buildJsonObject {
                put("type", "text")
                put("text", "x")
            })
        }
        assertEquals("x", JsonMessageText.extract(msg))
    }

    @Test
    fun extract_null_returnsNull() {
        assertNull(JsonMessageText.extract(null))
        assertNull(JsonMessageText.extract(JsonNull))
    }
}
