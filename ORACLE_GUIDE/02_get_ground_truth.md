# 02 — Get ground truth (discover, build a corpus, scrape)

Goal: produce `_Decode_oracle/out/<slug>/scrape.json` for a set of **unique, not-yet-processed** songs. That JSON is the ground truth everything else compares against.

## What "ground truth" is

For each chord, Hooktheory renders an SVG label (e.g. `viiø⁴²`) and, when available, a piano-roll. The scraper captures:

- the section's **API JSON** (the raw chord objects — what the engine consumes),
- the ordered **rendered chord-view labels** (the authoritative symbol channel),
- **strip screenshots** (the vision channel),
- optional **piano DOM notes** (`pianoNotes.js`).

**Precedence** (most to least authoritative): rendered SVG label → letter-inferred pitch-class set → piano scrape *only when it agrees with the letter inference*. Never treat the raw JSON alone as truth; it frequently omits `alterations`/`omits`/`ø`.

## Step 1 — Discover candidate URLs (optional, only if you need more songs)

`_Research_testing/discover_theorytab_search.js` walks Hooktheory search for `a–z` / `0–9` and appends new TheoryTab URLs to `_Research_testing/discovered_urls.json`:

```bash
node _Research_testing/discover_theorytab_search.js
```

There is also `_Research_testing/discover_theorytab_urls.js` for link-crawl discovery. Both are additive and idempotent (dedupe into the same file).

## Step 2 — Build a corpus of unique, unprocessed songs

A "corpus" is a JSON manifest of `{ url, slug, tier, … }` entries. Use the corpus4 builder as the template — it specifically **excludes** anything already scraped or known-bad:

```bash
node _Decode_oracle/corpus4/buildCorpus4.js --target 500          # writes corpus4.json
node _Decode_oracle/corpus4/buildCorpus4.js --target 500 --dry-run # preview, no write
```

How it picks songs (in [`buildCorpus4.js`](../_Decode_oracle/corpus4/buildCorpus4.js)):

1. **processed** = every slug with a valid `out/<slug>/scrape.json` (already used to train the engine).
2. **blocked** = processed ∪ slugs that previously 404'd or scraped invalid.
3. Pool the remaining URLs from all sources (curated corpora, tier seeds, `discovered_urls.json`, cache metadata), drop junk slugs, tier them, and fill to `--target`.

To start a brand-new corpusN, copy the corpus4 pattern (it reuses `corpus3/buildCorpus3.js` helpers and `corpus3/tierMeta.js`) and point the output at `corpusN.json`. The key invariant: **a song already in any `out/<slug>/` must not reappear**, so each corpus tests genuinely new material.

## Step 3 — Batch scrape the corpus

```bash
node _Decode_oracle/batchScrapeCorpus.js --corpus _Decode_oracle/corpus4.json
node _Decode_oracle/batchScrapeCorpus.js --corpus _Decode_oracle/corpus4.json --limit 20   # first 20 only
node _Decode_oracle/batchScrapeCorpus.js --corpus _Decode_oracle/corpus4.json --compare     # also run compare per song
```

- Already-scraped songs are skipped (cache). Only valid scrapes (`scrapeOk` — has rendered chords) are reused; failed/empty caches are re-attempted.
- Each song lands in `_Decode_oracle/out/<slug>/scrape.json` plus screenshots.
- Slugs are sanitized for Windows (`: * ? " < > |` → `-`) by `slugForUrl` in `run.js`.

Single song, end to end (scrape + compare + report), no browser-display check:

```bash
node _Decode_oracle/run.js https://www.hooktheory.com/theorytab/view/artist/song --no-browser
```

## Step 4 — Check progress and backfill failures

Some URLs 404 or render nothing. Check coverage and top up to the target with fresh unprocessed URLs:

```bash
node _Research_testing/corpus4_status.js                              # how many of the manifest scraped OK
node _Research_testing/corpus4_backfill.js                            # replace failed entries with new pool URLs
```

`corpus4_backfill.js` removes dead manifest entries and pulls replacements from the unprocessed pool (excluding anything already in the manifest or blocked), so you still reach 500 *scannable* songs.

## What's in `scrape.json`

Per section: `metadata` (key, tempo), the array of chord objects (`root`, `type`, `borrowed`, `inversion`, `alterations`, `adds`, `omits`, `suspensions`, …), the ordered rendered labels, and piano notes when present. Field meanings are in [`reference.md`](reference.md).

Once you have scrapes, go to [`03_build_database.md`](03_build_database.md).
