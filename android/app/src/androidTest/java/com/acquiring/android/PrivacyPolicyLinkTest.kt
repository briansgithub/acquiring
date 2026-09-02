package com.acquiring.android

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.UriHandler
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class PrivacyPolicyLinkTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun visibleLinkOpensPublishedPolicy() {
        var openedUrl: String? = null
        val uriHandler = object : UriHandler {
            override fun openUri(uri: String) { openedUrl = uri }
        }
        composeRule.setContent {
            CompositionLocalProvider(LocalUriHandler provides uriHandler) {
                MaterialTheme { PrivacyPolicyLink() }
            }
        }
        composeRule.onNodeWithText("Privacy policy").assertIsDisplayed().performClick()
        composeRule.runOnIdle {
            assertEquals("https://bellsworth.dev/apps/acquiring/privacy/", openedUrl)
        }
    }
}
