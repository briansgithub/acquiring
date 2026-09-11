package com.acquiring.android

internal const val FAVORITED_CONFIRMATION_MS = 2_000L
internal const val FAVORITED_CONFIRMATION_TEST_TAG = "FavoritedConfirmation"

internal fun shouldShowFavoritedConfirmation(added: Boolean, writeSucceeded: Boolean): Boolean =
    added && writeSucceeded
