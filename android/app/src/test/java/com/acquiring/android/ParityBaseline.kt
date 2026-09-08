package com.acquiring.android

import org.junit.Assert.assertTrue

/** Compatibility entrypoint for older tests; discrepancy budgets are retired. */
@Deprecated("Use exact per-channel assertions against the shared chord contract")
object ParityBaseline {
    fun assertWithinBaseline(
        corpus: String,
        counts: Map<String, Int>,
        total: Int,
        samples: List<String>
    ) {
        assertTrue("$corpus must contain chord cases", total > 0)
        assertTrue(
            "$corpus requires exact parity: $counts\n" + samples.take(25).joinToString("\n"),
            counts.values.all { it == 0 }
        )
    }
}
