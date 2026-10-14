# Local catalog browser proof

Run from pwa under the repository run controller with a verified immutable chunk directory, a separate ignored job directory below pwa/.artifacts, and the expected manifest SHA256:

```text
node scripts/catalog/browser-proof.mjs CHUNK_DIRECTORY .artifacts/pwa-port/JOB_NAME MANIFEST_SHA256
```

This opt-in maintenance tool builds a production test entry using the real catalog worker and SQLite preservation plugin. It serves only127.0.0.1:5179, streams existing immutable chunks, uses a retained Chrome profile, seeds/checks all10user record kinds and their outbox, activates only a validated bundle, then shuts down both browser and server and starts a new browser offline before navigation. It checks cached worker/WASM startup and native catalog inspection. It does not publish assets, package catalogs again, expose test routes in the app, measure phone memory, or prove physical-device/Safari behavior.

Intent is immutable within a job; mismatched source/manifest/snapshot/attempt/origin fails closed. Each invocation saves a start receipt including Git revision/PID and bounded progress/validation/activation/result receipts. Catalog journal/cache and the retained profile are the recovery authority. The loop emits occasional chunk progress; no full database is buffered. On interruption, inspect the parent run controller and actual process/side-effect state before retrying with the same arguments and a fresh controller run ID. Do not remove the profile, staging files or intent to force a clean run. A successful repeated prepare inspects its validated target rather than downloading again.

Generated output/profile/data/ordinary logs are ignored local state. Keep source chunks separate from the job. The build receipt records asset/version identities; raw database hashes come from the trusted manifest and are verified incrementally by the importer. A test entry proof remains separate from public app installer integration.
