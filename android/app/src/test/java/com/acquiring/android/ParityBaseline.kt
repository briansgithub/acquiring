package com.acquiring.android

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertTrue

/**
 * Reads contracts/fixtures/parity_baseline.json -- the ratchet that lets the
 * chord-parity corpora report a real number instead of being all-or-nothing.
 * A channel fails when it diverges from the web reference *more* than the
 * baseline allows, and nags to be lowered when it diverges less.
 */
object ParityBaseline {
    private val CHANNELS = listOf("roman", "letter", "pcs", "midi", "rootMidi", "toneLabels")

    private fun limits(corpus: String): Map<String, Int> {
        val stream = javaClass.classLoader?.getResourceAsStream("parity_baseline.json")
            ?: throw IllegalStateException("parity_baseline.json missing from test resources")
        val root = Json.parseToJsonElement(stream.bufferedReader().use { it.readText() }).jsonObject
        val section = root[corpus] as? JsonObject ?: return emptyMap()
        return section.mapNotNull { (k, v) -> v.jsonPrimitive.intOrNull?.let { k to it } }.toMap()
    }

    fun assertWithinBaseline(
        corpus: String,
        counts: Map<String, Int>,
        total: Int,
        samples: List<String>
    ) {
        val allowed = limits(corpus)
        val regressions = mutableListOf<String>()
        val improvements = mutableListOf<String>()

        println("=== $corpus: Android vs web reference over $total cases ===")
        for (channel in CHANNELS) {
            val actual = counts[channel] ?: 0
            val limit = allowed[channel] ?: 0
            val matching = total - actual
            println(
                String.format(
                    "  %-11s %6d/%6d (%5.1f%%) diverging %5d, baseline %5d",
                    channel, matching, total, matching * 100.0 / total, actual, limit
                )
            )
            if (actual > limit) regressions += "$channel: $actual diverging, baseline allows $limit"
            else if (actual < limit) improvements += "$channel: $actual < $limit"
        }

        if (improvements.isNotEmpty()) {
            println(
                "Parity improved — lower these in contracts/fixtures/parity_baseline.json " +
                    "under \"$corpus\": ${improvements.joinToString(", ")}"
            )
        }
        assertTrue(
            "$corpus parity regressed:\n" + regressions.joinToString("\n") +
                "\n\nFirst 25 diverging cases:\n" + samples.take(25).joinToString("\n"),
            regressions.isEmpty()
        )
    }
}
