# 05 — Validate and log

Never ship a fix without proving it didn't break the things that already work, then record it so the next agent inherits your reasoning.

## Regression gates (run after every change)

1. **Touched bucket** — confirm the fix landed:
   ```bash
   node _Decode_oracle/testModification.js <bucket> --rerun --db-dir _Decode_oracle/chord_db_corpus4
   ```

2. **Rebuild + guard the big buckets.** Rebuild the corpus4 DB and confirm the large, already-high buckets did **not** drop:
   ```bash
   node _Decode_oracle/buildChordDb.js --corpus _Decode_oracle/corpus4.json --db-dir _Decode_oracle/chord_db_corpus4
   ```
   - `type=5` (~11k chords, ~98.9%) and `type=7` (~3k chords, ~97%) dominate the corpus. A fix that lifts a small bucket but dents either of these is a net loss — reject it.

3. **Cross-check earlier corpora** so you don't break past wins:
   ```bash
   node _Decode_oracle/buildChordDb.js --corpus _Decode_oracle/corpus2.json --db-dir _Decode_oracle/chord_db_corpus2
   node _Decode_oracle/buildChordDb.js --corpus _Decode_oracle/corpus3.json --db-dir _Decode_oracle/chord_db_corpus3
   ```
   - corpus2 should stay ~99.9%, corpus3 ~99.6%. Any regression here means your change is too broad.

4. **Tier-1 regression songs** — must stay 100% `notesOk`:
   ```bash
   node _Decode_oracle/compare.js _Decode_oracle/out/the-proclaimers__500-miles/scrape.json
   node _Decode_oracle/compare.js _Decode_oracle/out/the-beatles__eleanor-rigby/scrape.json
   ```

5. **Lint** the files you edited (no new errors).

The target bar is **≥99% `notesOk` per corpus**. Prefer leaving a single-song edge case unfixed over introducing any regression in the gates above.

## Logging protocol (do this every time you change `web-player/lib`)

1. **Append a numbered entry** to [`_Decode_oracle/DECODE_FIX_LOG.md`](../_Decode_oracle/DECODE_FIX_LOG.md), continuing the sequence (find the last `## Fix NNN`). Each entry states: **symptom → root cause → fix → files → exposed-by song(s)**, plus the before/after DB numbers. Use sub-letters (036a, 036b, …) when one session lands several related fixes.
2. **Update the status table** in [`README.md`](README.md) if any corpus-wide number changed.
3. **Record deferrals** (single-song edge cases, unimplemented features) at the end of your fix-log entry and/or in [`_Decode_oracle/REMAINING_FAILURES.md`](../_Decode_oracle/REMAINING_FAILURES.md) so nobody re-chases them.

## Do-not-reapply (without fresh validation)

These were tried and reverted because they regressed elsewhere (see the "Attempted / reverted" section of the fix log):

- Forcing uppercase Roman on all suspended chords.
- `joinRoman` column-clustering for figured bass.
- DP alignment replacing the greedy proportional alignment in `compare.js`.

## Known deferred / non-engine issues

Authoritative list: [`_Decode_oracle/REMAINING_FAILURES.md`](../_Decode_oracle/REMAINING_FAILURES.md). Categories you will keep seeing:

- **Harness/alignment** — e.g. Penny Lane figured-bass dual representation, count mismatches.
- **Piano noise** — piano scrape disagreeing with a correct letter inference.
- **Symbol-only** — token ordering (`Vsus47` vs `V⁷sus4`); notes are already OK so `notesOk` passes.
- **Unimplemented JSON fields** — `substitutions[]` (incl. tritone subs), `pedal`, `alternate`. Do not file these as engine bugs.

## Conventions reminder

- Debug scripts/output → `_Debug_testing/`; research scripts/output → `_Research_testing/`.
- Keep files ≤400 lines; encapsulate into a new module rather than growing `music.js`.
- Surgical edits only; never rewrite a file to fix one branch.
