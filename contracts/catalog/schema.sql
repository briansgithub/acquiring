PRAGMA user_version = 3;

CREATE TABLE IF NOT EXISTS songs (
    slug TEXT NOT NULL PRIMARY KEY,
    artist TEXT,
    title TEXT,
    url TEXT NOT NULL,
    status TEXT NOT NULL,
    dataBlob BLOB
);

CREATE TABLE IF NOT EXISTS song_browse_entries (
    slug TEXT NOT NULL PRIMARY KEY,
    artist TEXT,
    title TEXT,
    alphaGroup TEXT NOT NULL,
    complexityRating REAL,
    complexityBucket INTEGER
);

CREATE TABLE IF NOT EXISTS song_browse_modes (
    slug TEXT NOT NULL,
    mode TEXT NOT NULL,
    PRIMARY KEY (slug, mode)
);

CREATE INDEX IF NOT EXISTS index_song_browse_entries_alphaGroup
    ON song_browse_entries (alphaGroup);
CREATE INDEX IF NOT EXISTS index_song_browse_entries_complexityBucket
    ON song_browse_entries (complexityBucket);
CREATE INDEX IF NOT EXISTS index_song_browse_modes_mode
    ON song_browse_modes (mode);
