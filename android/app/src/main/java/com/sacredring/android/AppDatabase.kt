package com.sacredring.android

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [Song::class, SongBrowseEntry::class, SongBrowseMode::class],
    version = AppDatabase.SCHEMA_VERSION
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun songDao(): SongDao

    companion object {
        const val SCHEMA_VERSION = 3

        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                SongBrowseSchema.createStatements.forEach(db::execSQL)
                // This copies only small scalar columns. The large dataBlob is
                // checked for nullability in SQLite and never enters app memory.
                db.execSQL(SongBrowseSchema.BACKFILL_ENTRIES)
            }
        }

        val MIGRATION_2_3 = object : Migration(2, SCHEMA_VERSION) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(SongBrowseSchema.NORMALIZE_ALPHA_GROUPS)
            }
        }
    }
}
