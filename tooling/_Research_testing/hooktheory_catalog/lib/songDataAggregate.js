/**
 * Derive catalog-friendly aggregates from parsed Hooktheory API section payloads.
 */

const { chordSignature, computeStatsFromSections } = require('./chordSignature');

function formatTimeSig(meter) {
  if (!meter) return null;
  const num = meter.numBeats ?? meter.num_beats;
  const unit = meter.beatUnit ?? meter.beat_unit;
  if (num == null || unit == null) return null;
  return `${num}/${unit}`;
}

function firstAtBeat(items) {
  if (!items?.length) return null;
  return items.slice().sort((a, b) => (a.beat ?? 0) - (b.beat ?? 0))[0];
}

function countNotes(notes) {
  if (!notes) return { total: 0, unique_scale_degrees: 0, melody_line_count: 0, has_melody: false };
  const sds = new Set();
  if (Array.isArray(notes)) {
    let total = 0;
    for (const n of notes) {
      if (n.isRest) continue;
      total++;
      if (n.sd) sds.add(n.sd);
    }
    return {
      total,
      unique_scale_degrees: sds.size,
      melody_line_count: notes.length ? 1 : 0,
      has_melody: total > 0,
    };
  }
  const keys = Object.keys(notes);
  let total = 0;
  for (const k of keys) {
    for (const n of notes[k] || []) {
      if (n.isRest) continue;
      total++;
      if (n.sd) sds.add(n.sd);
    }
  }
  return {
    total,
    unique_scale_degrees: sds.size,
    melody_line_count: keys.length,
    has_melody: total > 0,
  };
}

function chordExtendedStats(chords) {
  let borrowed = 0;
  let applied = 0;
  let modified = 0;
  let rests = 0;
  let durationSum = 0;
  let durationCount = 0;

  for (const c of chords || []) {
    if (c.isRest) {
      rests++;
      continue;
    }
    if (c.borrowed != null && c.borrowed !== '' && c.borrowed !== false) borrowed++;
    if (c.applied && c.applied !== 0) applied++;
    const hasMod = (c.adds?.length || c.omits?.length || c.alterations?.length || c.suspensions?.length);
    if (hasMod) modified++;
    if (typeof c.duration === 'number') {
      durationSum += c.duration;
      durationCount++;
    }
  }

  return {
    borrowed_chord_count: borrowed,
    applied_chord_count: applied,
    modified_chord_count: modified,
    rest_chord_count: rests,
    avg_chord_duration: durationCount ? durationSum / durationCount : null,
  };
}

function keySignature(key) {
  if (!key) return null;
  return `${key.tonic || '?'}:${key.scale || '?'}`;
}

function parseSectionPayload(sectionName, songId, extracted) {
  const { chords, notes, metadata, songId: apiId, songInfo } = extracted;
  const key0 = firstAtBeat(metadata.keys);
  const tempo0 = firstAtBeat(metadata.tempos);
  const meter0 = firstAtBeat(metadata.meters);
  const noteStats = countNotes(notes);
  const chordStats = chordExtendedStats(chords);

  const youtube = metadata.youtube || null;
  const lyricsValues = metadata.lyrics?.values;
  const hasLyrics = Array.isArray(lyricsValues)
    && lyricsValues.some((v) => typeof v === 'string' && v.trim().length > 0);

  return {
    section_name: sectionName,
    song_id: songId,
    hooktheory_song_name: songInfo || null,
    hooktheory_id: apiId ?? songId,
    end_beat: metadata.endBeat ?? null,
    chord_count: (chords || []).length,
    note_count: noteStats.total,
    key_tonic: key0?.tonic ?? null,
    key_scale: key0?.scale ?? null,
    bpm: tempo0?.bpm ?? null,
    swing_factor: tempo0?.swingFactor ?? null,
    time_sig: formatTimeSig(meter0),
    melody_line_count: noteStats.melody_line_count,
    has_melody: noteStats.has_melody ? 1 : 0,
    pickup: metadata.pickup ? 1 : 0,
    content_fp: metadata.fp ?? null,
    data_version: metadata.version ?? null,
    has_lyrics: hasLyrics ? 1 : 0,
    youtube_id: youtube?.id ?? null,
    youtube_sync_start: youtube?.syncStart ?? null,
    youtube_sync_end: youtube?.syncEnd ?? null,
    unique_scale_degrees: noteStats.unique_scale_degrees,
    ...chordStats,
    chords,
    notes,
    metadata,
    key_signatures: (metadata.keys || []).map(keySignature).filter(Boolean),
  };
}

function aggregateSongFromSections(sections) {
  const baseStats = computeStatsFromSections(sections);
  const ext = sections.reduce((acc, sec) => {
    const s = chordExtendedStats(sec.chords);
    acc.borrowed_chord_count += s.borrowed_chord_count;
    acc.applied_chord_count += s.applied_chord_count;
    acc.modified_chord_count += s.modified_chord_count;
    acc.rest_chord_count += s.rest_chord_count;
    if (s.avg_chord_duration != null) {
      acc._durSum += s.avg_chord_duration * (sec.chord_count || 0);
      acc._durN += sec.chord_count || 0;
    }
    return acc;
  }, {
    borrowed_chord_count: 0,
    applied_chord_count: 0,
    modified_chord_count: 0,
    rest_chord_count: 0,
    _durSum: 0,
    _durN: 0,
  });

  const keySet = new Set();
  let totalNotes = 0;
  let uniqueSdMax = 0;
  let melodyLines = 0;
  let hasMelody = false;
  let hasLyrics = false;
  let totalBeats = 0;
  let youtubeId = null;
  let youtubeSyncStart = null;
  let youtubeSyncEnd = null;

  for (const sec of sections) {
    for (const ks of sec.key_signatures || []) keySet.add(ks);
    totalNotes += sec.note_count || 0;
    uniqueSdMax = Math.max(uniqueSdMax, sec.unique_scale_degrees || 0);
    melodyLines = Math.max(melodyLines, sec.melody_line_count || 0);
    if (sec.has_melody) hasMelody = true;
    if (sec.has_lyrics) hasLyrics = true;
    if (sec.end_beat != null) totalBeats += sec.end_beat;
    if (!youtubeId && sec.youtube_id) {
      youtubeId = sec.youtube_id;
      youtubeSyncStart = sec.youtube_sync_start;
      youtubeSyncEnd = sec.youtube_sync_end;
    }
  }

  const primary = sections[0] || {};
  const extra = {
    lyrics: sections.map((s) => s.metadata?.lyrics).filter(Boolean),
    bands: sections.map((s) => s.metadata?.bands).filter(Boolean),
    breaks: sections.map((s) => s.metadata?.breaks).filter(Boolean),
    keyFrames: sections.map((s) => s.metadata?.keyFrames).filter(Boolean),
    keys: sections.map((s) => ({ section: s.section_name, keys: s.metadata?.keys || [] })),
    tempos: sections.map((s) => ({ section: s.section_name, tempos: s.metadata?.tempos || [] })),
    meters: sections.map((s) => ({ section: s.section_name, meters: s.metadata?.meters || [] })),
    internal_sections: sections.map((s) => ({
      section: s.section_name,
      sections: s.metadata?.sections || [],
    })),
    visible_melodies: sections.map((s) => s.metadata?.visibleMelodies).filter(Boolean),
    active_melody_index: sections.map((s) => s.metadata?.activeMelodyIndex).filter((v) => v != null),
    external_mp3: sections.map((s) => ({
      section: s.section_name,
      url: s.metadata?.externalMp3Url || null,
      startBeat: s.metadata?.externalMp3StartBeat ?? null,
      duration: s.metadata?.externalMp3Duration ?? null,
    })).filter((r) => r.url),
  };

  return {
    stats: {
      ...baseStats,
      borrowed_chord_count: ext.borrowed_chord_count,
      applied_chord_count: ext.applied_chord_count,
      modified_chord_count: ext.modified_chord_count,
      rest_chord_count: ext.rest_chord_count,
      avg_chord_duration: ext._durN ? ext._durSum / ext._durN : null,
    },
    details: {
      hooktheory_song_name: primary.hooktheory_song_name,
      primary_section_id: primary.song_id,
      data_version: primary.data_version,
      primary_key_tonic: primary.key_tonic,
      primary_key_scale: primary.key_scale,
      bpm: primary.bpm,
      swing_factor: primary.swing_factor,
      time_sig: primary.time_sig,
      has_melody: hasMelody ? 1 : 0,
      melody_line_count: melodyLines,
      total_notes: totalNotes,
      unique_scale_degrees: uniqueSdMax,
      has_lyrics: hasLyrics ? 1 : 0,
      youtube_id: youtubeId,
      youtube_sync_start: youtubeSyncStart,
      youtube_sync_end: youtubeSyncEnd,
      content_fp: primary.content_fp,
      pickup: primary.pickup ? 1 : 0,
      key_change_count: keySet.size,
      total_beats: totalBeats || null,
      extra_json: JSON.stringify(extra),
    },
    sectionsForDb: sections.map((s) => ({
      section_name: s.section_name,
      song_id: s.song_id,
      hooktheory_id: s.hooktheory_id,
      end_beat: s.end_beat,
      chord_count: s.chord_count,
      note_count: s.note_count,
      key_tonic: s.key_tonic,
      key_scale: s.key_scale,
      bpm: s.bpm,
      time_sig: s.time_sig,
      swing_factor: s.swing_factor,
      melody_line_count: s.melody_line_count,
      has_melody: s.has_melody,
      pickup: s.pickup,
      content_fp: s.content_fp,
      borrowed_chord_count: s.borrowed_chord_count,
      applied_chord_count: s.applied_chord_count,
      modified_chord_count: s.modified_chord_count,
      section_data_json: JSON.stringify({
        keys: s.metadata?.keys || [],
        tempos: s.metadata?.tempos || [],
        meters: s.metadata?.meters || [],
        internal_sections: s.metadata?.sections || [],
        youtube: s.metadata?.youtube || null,
        lyrics: s.metadata?.lyrics || null,
        bands: s.metadata?.bands || null,
        breaks: s.metadata?.breaks || [],
        keyFrames: s.metadata?.keyFrames || [],
        visibleMelodies: s.metadata?.visibleMelodies || null,
        activeMelodyIndex: s.metadata?.activeMelodyIndex ?? null,
        externalMp3Url: s.metadata?.externalMp3Url || null,
        fp: s.metadata?.fp || null,
        version: s.metadata?.version ?? null,
      }),
    })),
  };
}

module.exports = {
  formatTimeSig,
  countNotes,
  chordExtendedStats,
  parseSectionPayload,
  aggregateSongFromSections,
  chordSignature,
};
