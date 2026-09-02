package com.acquiring.android

import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource

@Composable
internal fun PrivacyPolicyLink() {
    val uriHandler = LocalUriHandler.current
    val policyUrl = stringResource(R.string.privacy_policy_url)
    TextButton(onClick = { uriHandler.openUri(policyUrl) }) {
        Text(stringResource(R.string.privacy_policy))
    }
}
