package com.sacredring.android

import androidx.room.Database
import androidx.room.RoomDatabase

@Database(entities = [Song::class], version = 2)
abstract class AppDatabase : RoomDatabase() {
    abstract fun songDao(): SongDao
}
