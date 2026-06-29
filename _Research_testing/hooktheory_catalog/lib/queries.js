/**
 * Read-only query helpers for the web song selector.
 * Kept separate from db.js to avoid bloating that module past the line limit.
 */

function listAllSongsMinimal(db) {
  return db.prepare(`
    SELECT slug, artist, title, status
    FROM songs
    ORDER BY artist, title
  `).all();
}

function getSongDetail(db, slug) {
  return db.prepare(`
    SELECT
      s.slug, s.artist, s.title, s.url, s.status, s.difficulty_label,
      s.discovery_source, s.first_seen_at, s.last_checked_at, s.error_message,
      s.cache_dir, s.processed_at, s.oracle_tested_at,
      s.oracle_out_dir, s.oracle_summary_json, s.harvest_mode,
      m.complexity_rating, m.chord_complexity_ht, m.melodic_complexity_ht,
      m.chord_melody_tension_ht, m.chord_progression_novelty_ht, m.chord_bass_melody_ht,
      m.metrics_source,
      st.unique_chords, st.unique_transitions, st.total_chords, st.section_count,
      st.borrowed_chord_count, st.applied_chord_count, st.modified_chord_count,
      st.rest_chord_count, st.avg_chord_duration,
      d.primary_key_tonic, d.primary_key_scale, d.bpm, d.swing_factor, d.time_sig,
      d.has_melody, d.melody_line_count, d.total_notes, d.unique_scale_degrees,
      d.has_lyrics, d.youtube_id, d.pickup, d.key_change_count, d.total_beats
    FROM songs s
    LEFT JOIN song_metrics m ON m.slug = s.slug
    LEFT JOIN song_stats st ON st.slug = s.slug
    LEFT JOIN song_details d ON d.slug = s.slug
    WHERE s.slug = ?
  `).get(slug);
}

function listSongSections(db, slug) {
  return db.prepare(`
    SELECT section_name, song_id, chord_count, note_count,
      key_tonic, key_scale, bpm, time_sig
    FROM song_sections
    WHERE slug = ?
    ORDER BY rowid
  `).all(slug);
}

module.exports = {
  listAllSongsMinimal,
  getSongDetail,
  listSongSections,
};
