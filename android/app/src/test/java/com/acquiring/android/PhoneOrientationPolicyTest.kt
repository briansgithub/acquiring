package com.acquiring.android

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PhoneOrientationPolicyTest {
    @Test
    fun phonesLockPortraitAndTabletsDoNot() {
        assertTrue(PhoneOrientationPolicy.locksPortrait(411))
        assertTrue(PhoneOrientationPolicy.locksPortrait(PhoneOrientationPolicy.TABLET_SMALLEST_WIDTH_DP - 1))
        assertFalse(PhoneOrientationPolicy.locksPortrait(PhoneOrientationPolicy.TABLET_SMALLEST_WIDTH_DP))
        assertFalse(PhoneOrientationPolicy.locksPortrait(800))
    }
}
