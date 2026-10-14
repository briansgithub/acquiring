# Persistent user records

`openUserDatabase()` owns only IndexedDB `acquiring-user` (schema2). Catalog databases, OPFS files and active-catalog pointers are excluded. Stores cover preferences, ordered playlist metadata/membership, history, harvest overlays, octave offsets, learning events/summaries/profiles and quiz preferences. Business rules belong to their feature modules.

Every write uses `mutate` with a durable, caller-supplied operation ID, exact timestamp and JSON value. Record, namespace sequence and pending receipt commit in one transaction. Replaying the same command returns the existing receipt, even after acknowledgment. Reusing its ID with changed data aborts. Retain operation receipts and tombstones; there is no destructive outbox cleanup. Future sync may acknowledge only after the server confirms the same IDs. Acknowledgment is atomic and unknown IDs abort the whole batch.

Guest and `account:<UUID>` keys are isolated. Selecting an account never implicitly adopts guest data; explicit recoverable merge is T25. Fresh PWA profiles require no Android migration. Schema1 fixture records survive schema2 upgrade; blocked upgrades ask for other tabs to close rather than rebuilding data. Version changes close this connection; consumers must reopen.

Browser acceptance fixtures exercise actual IndexedDB restart, other-connection upgrade blocking, injected mid-write abort, operation replay, acknowledgment rollback, tombstones, namespace separation and a separately replaced catalog database. This isolated replacement drill is not the later full OPFS/catalog installation test. Production harness files are excluded from the normal app build.
