# Acquiring PWA

Independent React/TypeScript/Vite app. Android shipping revision `801cf7984171d772afc4406ddb5c79c0cb7fd20a` is the behavior reference. Existing web/iOS runtimes are excluded.

From `pwa/` with Node24 and Python3:

```text
npm ci
npm run check
npm run test:recovery
npm run test:catalog
npm run test:browser
npm run dev
```

Browser checks use installed Google Chrome locally. CI installs Playwright Chromium. `test:parity` currently validates the shared input corpus contract; musical output parity belongs to T03. A successful shell build does not prove catalog, audio, microphone or account parity.

`build` emits a versioned shell cache for only bundled assets. It never caches large catalogs or API responses. A waiting service worker activates after old clients close. Routes use origin-root paths; Cloudflare Pages `_redirects` serves the app for bookmarks. Production HTTPS is required for installation/storage/microphone. `dist/` is generated and ignored.

Unattended development: read `../docs/pwa-port/HANDOFF.md`, `tasks.json`, `RUNBOOK.md` and `MODEL_ROUTING.md`. Run mutations/checks through `scripts/run-control/run_control.py`; state and receipts remain in the repository's ignored `.artifacts/pwa-port/`.

Controller children default to repository root even when invoked elsewhere. Use `run --cwd pwa` for package commands; on Windows invoke the Node npm CLI (see controller README), or pass `--prefix pwa` explicitly.
