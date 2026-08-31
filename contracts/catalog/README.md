# Acquiring catalog contract

The mobile applications consume a gzip-compressed SQLite database named `catalog.db.gz`. Decompression produces `catalog.db`, whose schema is defined by `schema.sql` and described for validation by `contract.json`.

The catalog is replaceable product data. User-owned data such as playlists must live in a separate database and must never be included in an atomic catalog swap.

Before installation, clients must:

1. Decompress into a staging file beside the live database.
2. Require the declared schema version, tables, columns, and indexes.
3. Require `PRAGMA quick_check` to return `ok`.
4. Require at least the declared minimum number of browse rows and ensure every browse row has a non-null chord payload.
5. Replace the live file atomically when supported, retaining a recoverable backup otherwise.

The database and gzip archive are release artifacts and are intentionally excluded from Git.
