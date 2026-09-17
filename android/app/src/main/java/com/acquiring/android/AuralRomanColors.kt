package com.acquiring.android

import androidx.compose.ui.graphics.Color
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.contentOrNull

/** Match Playback's legible chord-lane tint, using harmonic context rather than numeral case. */
internal fun auralRomanColor(mode:String?):Color = mode?.let(::playbackLaneTint) ?: Color.Unspecified

internal fun AuralPatternTarget.harmonicMode():String? = runCatching {
    Json.parseToJsonElement(tokens.first()).jsonObject["mode"]?.jsonPrimitive?.contentOrNull
}.getOrNull()

internal fun AuralExercise.harmonicMode():String? = provenance.corpus?.passage?.keyScale
    ?: provenance.target.pattern?.harmonicMode()
    ?: "major".takeIf { provenance.target.pattern==null }
