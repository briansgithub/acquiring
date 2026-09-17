package com.acquiring.android

import android.content.Context
import android.os.SystemClock
import android.util.Log
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.*
import org.junit.Test
import java.io.File

/** Run after provisioning the immutable offline runtime.db as files/aural-corpus.db. */
class AuralCorpusDeviceTest {
    @Test fun installedSnapshotServesValidatedPassagesInBothViews() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val file = File(context.filesDir, "aural-corpus.db")
        assertTrue("Install the runtime snapshot before this integration test", file.isFile)
        val provider = SqliteAuralExampleProvider(file)
        val elapsed = mutableListOf<Long>()
        for (bassSensitive in listOf(false, true)) {
            var served = 0
            val settings = AuralExampleSettings(distinguishInversions = bassSensitive)
            AuralCurriculum.families.forEach { family -> family.variants.forEach { variant ->
                val base = AuralCurriculum.generate(AuralTarget(family.id, "reproduce", variantId = variant.id,
                    microphoneKind = "bass", octaveShift = 1), 12345)
                val started = SystemClock.elapsedRealtime()
                val source = provider.example(base, settings, AuralSelectionContext())
                elapsed += SystemClock.elapsedRealtime() - started
                if (source != null) {
                    val exercise = auralWithCorpus(base, source)
                    assertEquals(variant.degrees, exercise.fullDegrees)
                    assertEquals(source.passage.events.map { it.bassMidi + 12 }, exercise.events.map { it.bassMidi })
                    assertEquals(source.passage.events.map { it.beats }, exercise.events.map { it.beats })
                    assertNotNull(exercise.provenance.corpus)
                    served++
                }
            } }
            assertTrue("The installed index must supply examples in both musical views", served > 0)
            Log.i("AuralCorpusValidation", "view=$bassSensitive served=$served targets=15")
        }
        Log.i("AuralCorpusValidation", "queries=${elapsed.size} maxMs=${elapsed.maxOrNull()} medianMs=${elapsed.sorted()[elapsed.size / 2]}")
    }
}
