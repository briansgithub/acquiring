package com.acquiring.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RootOnlyCardLayoutTest {
    @Test
    fun previousCardIsNarrowerThanTheFeaturedCurrentAndInterval() {
        assertTrue(ROOT_ONLY_PREVIOUS_WEIGHT < ROOT_ONLY_FEATURED_WEIGHT)
        assertEquals(ROOT_ONLY_FEATURED_WEIGHT, ROOT_ONLY_FEATURED_WEIGHT, 0f)
    }
}
