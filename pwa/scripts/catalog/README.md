# Immutable PWA catalog chunks

The producer accepts the local, checksum-bearing Android source delivery manifest and adjacent `.db.gz` archives. It verifies archive hashes, streams at most8MiB raw chunks, verifies full database hashes/lengths, and emits independently compressed content-addressed chunks. Only a completely verified bundle receives `manifest.json`. Sources are read-only. The PWA manifest pins source snapshot, source schema and source-manifest SHA256.

```text
python pwa/scripts/catalog/package_catalog.py --source-manifest acquiring_data/aural-catalog-delivery-v3-64cfa299cc74/aural-catalog-manifest-v3.json --output .artifacts/pwa-port/aural-chunks-64cfa299cc74 --kind aural
python -m unittest discover -s pwa/scripts/catalog -p test_package_catalog.py -v
```

Output is generated, large, ignored local data; never commit or publish it as source. Supply immutable chunk objects without HTTP `Content-Encoding:gzip` when publishing is authorized. A valid existing chunk is verified and reused without rewriting. Partial temporary files remain preserved and are never accepted as chunks. An immutable-path mismatch fails for inspection instead of overwriting. `--max-new-chunks N` makes a bounded checkpoint with `complete:false`; repeat against exactly the same input/output to resume. A cut anywhere resumes by inspecting bytes, never trusting progress metadata alone. Intent prevents accidentally mixing inputs in one output directory.

This is packaging only. Browser quota, streamed SQLite import, quick_check/metadata validation, active-pointer recovery, tab ownership and full-size physical-device proof are separate T05 slices. Current SQLite npm3.53.4-build2 does not document `preserveOnInitFailure` (upstream adds it in3.54); runtime integration must establish a tested non-destructive path first. Official API reference: https://sqlite.org/wasm/doc/trunk/persistence.md .
