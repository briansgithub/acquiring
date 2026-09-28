package com.acquiring.android

import org.junit.Assert.assertEquals
import org.junit.Test

class AuralPatternSongTest {
    @Test fun minimumPopularityIsInclusiveAndExcludesMissingOrInvalidScores() {
        assertEquals(true,auralMeetsMinimumPopularity(0.8,80))
        assertEquals(false,auralMeetsMinimumPopularity(0.7999,80))
        assertEquals(false,auralMeetsMinimumPopularity(null,80))
        assertEquals(false,auralMeetsMinimumPopularity(Double.NaN,80))
        assertEquals(false,auralMeetsMinimumPopularity(1.1,80))
        assertEquals(true,auralMeetsMinimumPopularity(0.0,0))
        assertEquals(false,auralMeetsMinimumPopularity(null,0))
        assertEquals(true,auralMeetsMinimumPopularity(null,null))
    }
    @Test fun popularityRanksAboveAlphabeticalOrderAndZeroRanksAboveUnknown() {
        val songs=listOf(
            AuralPatternSong("unknown","A missing score","Artist"),
            AuralPatternSong("zero","Zero","Artist",0.0),
            AuralPatternSong("low","Alpha","Artist",0.2),
            AuralPatternSong("high","Zulu","Artist",0.9),
            AuralPatternSong("tie-z","beta","Zulu",0.9),
            AuralPatternSong("tie-a","Beta","Alpha",0.9))
        assertEquals(listOf("tie-a","tie-z","high","low","zero","unknown"),songs.sortedWith(auralPatternSongOrder).map { it.id })
    }
}
