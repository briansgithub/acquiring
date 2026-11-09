package com.acquiring.android

import android.content.res.Resources
import java.nio.ByteBuffer
import java.nio.ByteOrder

internal const val SPOKEN_ROOT_DEGREE_SAMPLE_RATE = 22_050

// Mono signed 16-bit PCM, generated with eSpeak NG 1.52.0: -v en-us -s 235 -z.
internal fun loadSpokenRootDegrees(resources: Resources): List<ShortArray> = listOf(
    R.raw.root_degree_one,
    R.raw.root_degree_two,
    R.raw.root_degree_three,
    R.raw.root_degree_four,
    R.raw.root_degree_five,
    R.raw.root_degree_six,
    R.raw.root_degree_seven
).map { id ->
    val bytes = resources.openRawResource(id).use { it.readBytes() }
    val pcm = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer()
    ShortArray(pcm.remaining()).also { pcm.get(it) }
}
