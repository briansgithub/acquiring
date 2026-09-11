package com.acquiring.android

import android.content.Context
import android.content.Intent

internal data class AudioDiagnosticEvent(
    val timestampMs: Long,
    val operation: String,
    val state: Map<String, String>,
    val errorDomain: String? = null,
    val errorCode: Int? = null
)

internal object AudioDiagnostics {
    const val EVENT_LIMIT = 128

    val ALLOWED_OPERATIONS = setOf(
        "app.audioInitialized",
        "quiz.playRequest",
        "quiz.lifecyclePause",
        "quiz.reset",
        "engine.stopAll",
        "engine.reset",
        "diagnostics.export",
        "diagnostics.reset"
    )

    val ALLOWED_STATE_KEYS = setOf(
        "phase",
        "playing",
        "hasFocus",
        "underrunCount"
    )

    private val lock = Any()
    private val events = ArrayDeque<AudioDiagnosticEvent>()

    fun record(
        operation: String,
        state: Map<String, String> = emptyMap(),
        errorDomain: String? = null,
        errorCode: Int? = null,
        timestampMs: Long = System.currentTimeMillis()
    ) {
        if (operation !in ALLOWED_OPERATIONS) return
        val sanitized = state.filterKeys { it in ALLOWED_STATE_KEYS }
            .mapValues { (_, value) -> value.take(32) }
        val event = AudioDiagnosticEvent(
            timestampMs = timestampMs,
            operation = operation,
            state = sanitized,
            errorDomain = errorDomain?.take(64),
            errorCode = errorCode
        )
        synchronized(lock) {
            events.addLast(event)
            while (events.size > EVENT_LIMIT) events.removeFirst()
        }
    }

    fun snapshot(): List<AudioDiagnosticEvent> = synchronized(lock) { events.toList() }

    fun clearForTests() {
        synchronized(lock) { events.clear() }
    }

    fun exportText(): String {
        record("diagnostics.export")
        val items = snapshot().joinToString(",") { event ->
            val state = event.state.entries.sortedBy { it.key }
                .joinToString(",") { (key, value) ->
                    "\"${escapeJson(key)}\":\"${escapeJson(value)}\""
                }
            buildString {
                append("{\"timestampMs\":")
                append(event.timestampMs)
                append(",\"operation\":\"")
                append(escapeJson(event.operation))
                append("\",\"state\":{")
                append(state)
                append("}")
                event.errorDomain?.let {
                    append(",\"errorDomain\":\"")
                    append(escapeJson(it))
                    append('"')
                }
                event.errorCode?.let {
                    append(",\"errorCode\":")
                    append(it)
                }
                append('}')
            }
        }
        return "{\"schemaVersion\":1,\"events\":[$items]}"
    }

    private fun escapeJson(value: String): String =
        value.replace("\\", "\\\\").replace("\"", "\\\"")

    fun resetEngine() {
        record("diagnostics.reset")
        record("engine.stopAll")
        AudioEngine.stopAllPlayback()
        record("engine.reset")
        record("quiz.reset")
        QuizPlaybackController.reset()
    }

    fun shareIntent(text: String): Intent =
        Intent(Intent.ACTION_SEND)
            .setType("text/plain")
            .putExtra(Intent.EXTRA_SUBJECT, "Acquiring audio diagnostics")
            .putExtra(Intent.EXTRA_TEXT, text)

    fun share(context: Context) {
        val chooser = Intent.createChooser(shareIntent(exportText()), "Share audio diagnostics")
        chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(chooser)
    }
}
