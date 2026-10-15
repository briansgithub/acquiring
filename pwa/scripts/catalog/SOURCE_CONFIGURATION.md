# Catalog discovery configuration

The app reads /catalog-sources.json from its own origin. It is a small runtime deployment file, excluded from the shell cache so catalog discovery can change without replacing an active app. The committed empty list reports that downloads are being prepared. No production endpoint is invented or published by this implementation.

Each configured source has one allowed kind (songs or aural), an immutable HTTPS manifest URL ending in /manifest.json, and SHA256 of that exact JSON file's bytes. HTTPS CORS must allow the app origin; chunks must retain the producer's exact gzip bytes and have no HTTP Content-Encoding:gzip. URLs cannot contain credentials,queries or fragments. HTTP is accepted only for localhost acceptance fixtures. Configuration and all referenced bytes are public assets; never put secrets in them.

```json
{
  "schemaVersion": "acquiring-pwa-catalog-sources-1",
  "catalogs": [
    {
      "kind": "aural",
      "manifestUrl": "https://YOUR_PUBLIC_DATA_HOST/IMMUTABLE_SNAPSHOT/manifest.json",
      "manifestSha256": "REPLACE_WITH_EXACT_64_CHARACTER_LOWERCASE_SHA256"
    }
  ]
}
```

The example above is documentation and is not a usable deployment configuration. A manifest describes exactly all3Aural files or the1schema-v3song database, with the existing producer's ordered8MiB raw chunks. The app accepts at most2distinct kinds and bounds discovery to16KiB/manifests to512KiB. It verifies the manifest byte hash before parsing and validates kind/schema/chunks before prepare. Changing the manifest/source creates a new attempt; old installed data is retained through validation and cold-worker confirmation.

The app's advisory discovery/attempt keys use acquiring.catalog.* localStorage; acquiring-catalog-state IndexedDB and verified OPFS files remain authoritative. User records live separately in acquiring-user and are not removed or rewritten by discovery/install. No general cache/snapshot cleanup is implemented yet.
