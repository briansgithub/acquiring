package com.acquiring.android

import android.net.Uri
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp

@Composable
internal fun LibraryHooktheorySearch(
    onFocusChanged: (Boolean) -> Unit = {}
) {
    var query by rememberSaveable { mutableStateOf("") }
    var openError by rememberSaveable { mutableStateOf<String?>(null) }
    val uriHandler = LocalUriHandler.current
    val search = {
        val term = query.trim()
        if (term.isNotEmpty()) {
            val url = "https://www.hooktheory.com/theorytab/search?q=${Uri.encode(term)}"
            openError = runCatching { uriHandler.openUri(url) }
                .exceptionOrNull()
                ?.let { "Couldn't open Hooktheory.com. Search for '$term' in the browser." }
        }
    }

    Column(modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
        Text(
            text = "Search on Hooktheory",
            style = MaterialTheme.typography.titleSmall,
            modifier = Modifier.padding(bottom = 8.dp)
        )
        OutlinedTextField(
            value = query,
            onValueChange = { query = it.replace("\n", "") },
            label = { Text("Search Hooktheory.com") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = { search() }),
            modifier = Modifier
                .fillMaxWidth()
                .onFocusChanged { onFocusChanged(it.isFocused) }
                .semantics { contentDescription = "Search Hooktheory.com" }
        )
        Button(
            onClick = search,
            enabled = query.isNotBlank(),
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 8.dp)
        ) {
            Text("Search Hooktheory.com ↗")
        }
        openError?.let { message ->
            Text(
                text = message,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(top = 8.dp)
            )
        }
    }
}
