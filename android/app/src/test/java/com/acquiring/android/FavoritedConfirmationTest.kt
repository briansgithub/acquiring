package com.acquiring.android

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FavoritedConfirmationTest {
    @Test
    fun onlySuccessfulStarsShowTheBubble() {
        assertTrue(shouldShowFavoritedConfirmation(added = true, writeSucceeded = true))
        assertFalse(shouldShowFavoritedConfirmation(added = true, writeSucceeded = false))
        assertFalse(shouldShowFavoritedConfirmation(added = false, writeSucceeded = true))
        assertFalse(shouldShowFavoritedConfirmation(added = false, writeSucceeded = false))
    }
}
