package com.sacredring.android

import java.io.ByteArrayInputStream
import java.util.zip.GZIPInputStream

object DataUtils {
    /**
     * Decompresses a GZIP-compressed ByteArray into a String.
     * Returns the raw string if decompression fails (assuming it might be uncompressed).
     */
    fun decompress(data: ByteArray): String {
        return try {
            GZIPInputStream(ByteArrayInputStream(data)).bufferedReader().use { it.readText() }
        } catch (e: Exception) {
            data.decodeToString()
        }
    }
}
