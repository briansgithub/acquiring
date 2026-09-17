PRAGMA user_version = 1;
CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE quiz_song (song_id TEXT PRIMARY KEY, title TEXT, artist TEXT, popularity REAL, confidence REAL NOT NULL DEFAULT 0);
CREATE TABLE quiz_section (section_id TEXT PRIMARY KEY, song_id TEXT NOT NULL REFERENCES quiz_song(song_id), popularity REAL, confidence REAL NOT NULL DEFAULT 0);
CREATE TABLE quiz_occurrence (
 occurrence_id TEXT PRIMARY KEY, source_id TEXT NOT NULL, pattern_id TEXT NOT NULL,
 song_id TEXT NOT NULL REFERENCES quiz_song(song_id), section_id TEXT NOT NULL REFERENCES quiz_section(section_id),
 view TEXT NOT NULL CHECK(view IN ('harmony','harmony_bass')),
 family_id TEXT NOT NULL, variant_id TEXT NOT NULL, payload TEXT NOT NULL
);
CREATE INDEX quiz_target ON quiz_occurrence(family_id,variant_id,view,song_id,section_id);
CREATE INDEX quiz_source ON quiz_occurrence(source_id);
