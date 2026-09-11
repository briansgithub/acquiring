package com.acquiring.android

import com.google.android.play.core.install.model.UpdateAvailability
import org.junit.Assert.assertEquals
import org.junit.Test

class PlayAppUpdateTest {
    @Test
    fun mapsPlayAvailabilityWithoutCrashingOnUnknownCodes() {
        assertEquals(
            PlayUpdateStatus.UPDATE_AVAILABLE,
            playUpdateStatusFromAvailability(UpdateAvailability.UPDATE_AVAILABLE)
        )
        assertEquals(
            PlayUpdateStatus.UP_TO_DATE,
            playUpdateStatusFromAvailability(UpdateAvailability.UPDATE_NOT_AVAILABLE)
        )
        assertEquals(PlayUpdateStatus.UNAVAILABLE, playUpdateStatusFromAvailability(0))
        assertEquals(PlayUpdateStatus.UNAVAILABLE, playUpdateStatusFromAvailability(99))
    }
}
