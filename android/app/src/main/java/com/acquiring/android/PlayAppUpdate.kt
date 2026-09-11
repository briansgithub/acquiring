package com.acquiring.android

import android.content.Context
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.install.model.UpdateAvailability
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

enum class PlayUpdateStatus(val label: String) {
    UPDATE_AVAILABLE("Update available"),
    UP_TO_DATE("Up to date"),
    UNAVAILABLE("Update status unavailable")
}

internal fun playUpdateStatusFromAvailability(availability: Int): PlayUpdateStatus = when (availability) {
    UpdateAvailability.UPDATE_AVAILABLE -> PlayUpdateStatus.UPDATE_AVAILABLE
    UpdateAvailability.UPDATE_NOT_AVAILABLE -> PlayUpdateStatus.UP_TO_DATE
    else -> PlayUpdateStatus.UNAVAILABLE
}

internal suspend fun checkPlayUpdateStatus(context: Context): PlayUpdateStatus {
    return try {
        val manager = AppUpdateManagerFactory.create(context)
        suspendCancellableCoroutine { cont ->
            manager.appUpdateInfo
                .addOnSuccessListener { info ->
                    if (cont.isActive) {
                        cont.resume(playUpdateStatusFromAvailability(info.updateAvailability()))
                    }
                }
                .addOnFailureListener {
                    if (cont.isActive) cont.resume(PlayUpdateStatus.UNAVAILABLE)
                }
        }
    } catch (_: Exception) {
        PlayUpdateStatus.UNAVAILABLE
    }
}
