package com.acquiring.android

internal object PhoneOrientationPolicy {
    const val TABLET_SMALLEST_WIDTH_DP = 600

    fun locksPortrait(smallestScreenWidthDp: Int): Boolean =
        smallestScreenWidthDp < TABLET_SMALLEST_WIDTH_DP
}
