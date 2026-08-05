package mx.ideass.personal.agent.voice

import java.io.File
import java.io.InputStream
import java.security.MessageDigest

object FileSha256 {
    fun hex(file: File): String = file.inputStream().use { hex(it) }

    fun hex(input: InputStream): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val buf = ByteArray(DEFAULT_BUFFER_SIZE)
        while (true) {
            val n = input.read(buf)
            if (n < 0) break
            if (n > 0) digest.update(buf, 0, n)
        }
        return digest.digest().joinToString("") { b -> "%02x".format(b) }
    }

    fun matches(file: File, expectedHex: String): Boolean {
        val expected = expectedHex.trim().lowercase()
        if (expected.isEmpty()) return true
        return hex(file).equals(expected, ignoreCase = true)
    }
}
