package com.acquiring.android

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PrivacyPolicyResourceTest {
    @Test
    fun policyLabelAndUrlMatchPublishedAndroidPolicy() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        assertEquals("Privacy policy", context.getString(R.string.privacy_policy))
        assertEquals(
            "https://bellsworth.dev/apps/acquiring/privacy/",
            context.getString(R.string.privacy_policy_url)
        )
    }
}
