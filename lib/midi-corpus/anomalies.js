'use strict';

const SEVERITY_ORDER = Object.freeze({ fatal: 0, error: 1, warning: 2, info: 3 });

function anomaly(code, category, severity, detail) {
  const value = { code, category, severity };
  if (detail !== undefined) value.detail = detail;
  return value;
}

function compareAnomalies(left, right) {
  return (SEVERITY_ORDER[left.severity] ?? 99) - (SEVERITY_ORDER[right.severity] ?? 99)
    || left.code.localeCompare(right.code, 'en');
}

function classifyCatalogRow(row) {
  const anomalies = [];
  if (typeof row.slug !== 'string' || !row.slug.trim()) {
    anomalies.push(anomaly('missing_slug', 'catalog_metadata', 'fatal'));
  }
  if (typeof row.artist !== 'string' || !row.artist.trim()) {
    anomalies.push(anomaly('missing_artist', 'catalog_metadata', 'warning'));
  }
  if (typeof row.title !== 'string' || !row.title.trim()) {
    anomalies.push(anomaly('missing_title', 'catalog_metadata', 'warning'));
  }
  if (typeof row.url !== 'string' || !row.url.trim()) {
    anomalies.push(anomaly('missing_source_url', 'provenance', 'warning'));
  } else {
    try {
      const parsed = new URL(row.url);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('unsupported protocol');
    } catch {
      anomalies.push(anomaly('invalid_source_url', 'provenance', 'warning'));
    }
  }
  if (row.status !== 'enriched') {
    anomalies.push(anomaly('catalog_status_not_enriched', 'catalog_metadata', 'info', {
      status: row.status == null ? null : String(row.status),
    }));
  }
  if (row.dataBlob == null) {
    anomalies.push(anomaly('missing_data_blob', 'payload_encoding', 'fatal'));
  }
  const artist = String(row.artist ?? '');
  const title = String(row.title ?? '');
  if (/[()]|test-?\d/i.test(artist) || /hookpad|tutorial|major[- ]scales?|minor[- ]scales?|test-?\d/i.test(title)) {
    anomalies.push(anomaly('probable_non_song_entry', 'catalog_content', 'warning'));
  }
  return anomalies.sort(compareAnomalies);
}

function flattenNoteCount(notes) {
  if (!Array.isArray(notes)) return null;
  let count = 0;
  for (const entry of notes) {
    if (Array.isArray(entry)) count += entry.length;
    else count += 1;
  }
  return count;
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function inspectTimedEvents(events, kind, anomalies, sectionId) {
  if (!Array.isArray(events)) {
    anomalies.push(anomaly(`invalid_${kind}_array`, 'musical_structure', 'error', { section_id: sectionId }));
    return 0;
  }

  let invalid = 0;
  for (const event of events) {
    if (!event || typeof event !== 'object' || Array.isArray(event)) {
      invalid += 1;
      continue;
    }
    if (!('beat' in event) || !finiteNumber(event.beat) || event.beat < 0) invalid += 1;
    if ('duration' in event && (!finiteNumber(event.duration) || event.duration <= 0)) invalid += 1;
  }
  if (invalid > 0) {
    anomalies.push(anomaly(`invalid_${kind}_events`, 'musical_timing', 'error', {
      count: invalid,
      section_id: sectionId,
    }));
  }
  return events.length;
}

function inspectChordSemantics(events, anomalies, sectionId) {
  if (!Array.isArray(events)) return;
  const counts = {
    invalid_chord_root: 0,
    invalid_chord_inversion: 0,
    unsupported_chord_suspension: 0,
  };
  for (const chord of events) {
    if (!chord || typeof chord !== 'object' || Array.isArray(chord)) continue;
    if (!chord.isRest && (!Number.isInteger(chord.root) || chord.root < 1 || chord.root > 7)) {
      counts.invalid_chord_root += 1;
    }
    if (!Number.isInteger(chord.inversion) || chord.inversion < 0 || chord.inversion > 3) {
      counts.invalid_chord_inversion += 1;
    }
    if (Array.isArray(chord.suspensions)
      && chord.suspensions.some((value) => value !== 2 && value !== 4)) {
      counts.unsupported_chord_suspension += 1;
    }
  }
  for (const [code, count] of Object.entries(counts)) {
    if (count) anomalies.push(anomaly(code, 'musical_harmony', 'error', { count, section_id: sectionId }));
  }
}

function inspectMetadataEvents(metadata, anomalies, sectionId) {
  const invalidTonics = (Array.isArray(metadata.keys) ? metadata.keys : [])
    .filter((event) => !/^[A-G](?:bb|##|b|#|x)?$/.test(String(event?.tonic || ''))).length;
  if (invalidTonics) {
    anomalies.push(anomaly('invalid_key_tonic_events', 'musical_context', 'error', {
      count: invalidTonics,
      section_id: sectionId,
    }));
  }

  const invalidTempos = (Array.isArray(metadata.tempos) ? metadata.tempos : [])
    .filter((event) => !finiteNumber(event?.bpm) || event.bpm < 20 || event.bpm > 300).length;
  if (invalidTempos) {
    anomalies.push(anomaly('extreme_or_invalid_bpm_events', 'musical_timing', 'error', {
      count: invalidTempos,
      section_id: sectionId,
      accepted_range: [20, 300],
    }));
  }

  const invalidMeters = (Array.isArray(metadata.meters) ? metadata.meters : [])
    .filter((event) => !finiteNumber(event?.numBeats) || event.numBeats <= 0
      || !finiteNumber(event?.beatUnit) || event.beatUnit <= 0).length;
  if (invalidMeters) {
    anomalies.push(anomaly('invalid_meter_events', 'musical_timing', 'error', {
      count: invalidMeters,
      section_id: sectionId,
    }));
  }
}

function sectionEntries(payload) {
  if (Array.isArray(payload)) return payload.map((value, index) => [String(index), value]);
  if (!payload || typeof payload !== 'object') return [];
  return Object.entries(payload);
}

function summarizePayload(payload) {
  const anomalies = [];
  if (!payload || typeof payload !== 'object') {
    return {
      summary: null,
      anomalies: [anomaly('payload_not_object', 'payload_shape', 'fatal')],
    };
  }

  const entries = sectionEntries(payload);
  if (entries.length === 0) {
    anomalies.push(anomaly('empty_section_map', 'payload_shape', 'fatal'));
  }

  let chordCount = 0;
  let noteCount = 0;
  let validSections = 0;
  let keyEventCount = 0;
  let tempoEventCount = 0;
  let meterEventCount = 0;
  const sectionIds = new Set();

  for (const [mapKey, section] of entries) {
    const sectionId = String(section?.stringSongId ?? section?.songId ?? mapKey);
    if (!section || typeof section !== 'object' || Array.isArray(section)) {
      anomalies.push(anomaly('invalid_section_object', 'payload_shape', 'error', { section_id: sectionId }));
      continue;
    }
    validSections += 1;
    if (sectionIds.has(sectionId)) {
      anomalies.push(anomaly('duplicate_section_id', 'payload_shape', 'error', { section_id: sectionId }));
    }
    sectionIds.add(sectionId);

    chordCount += inspectTimedEvents(section.chords, 'chord', anomalies, sectionId);
    inspectChordSemantics(section.chords, anomalies, sectionId);
    const sectionNoteCount = flattenNoteCount(section.notes);
    if (sectionNoteCount == null) {
      anomalies.push(anomaly('invalid_note_array', 'musical_structure', 'error', { section_id: sectionId }));
    } else {
      noteCount += sectionNoteCount;
      inspectTimedEvents(section.notes.flat ? section.notes.flat(1) : section.notes, 'note', anomalies, sectionId);
    }

    const metadata = section.metadata && typeof section.metadata === 'object' ? section.metadata : section;
    inspectMetadataEvents(metadata, anomalies, sectionId);
    if (Array.isArray(metadata.keys)) keyEventCount += metadata.keys.length;
    if (Array.isArray(metadata.tempos)) tempoEventCount += metadata.tempos.length;
    if (Array.isArray(metadata.meters)) meterEventCount += metadata.meters.length;
  }

  if (validSections > 0 && chordCount === 0) {
    anomalies.push(anomaly('no_chord_events', 'musical_content', 'warning'));
  }
  if (validSections > 0 && noteCount === 0) {
    anomalies.push(anomaly('no_note_events', 'musical_content', 'info'));
  }
  if (validSections > 0 && keyEventCount === 0) {
    anomalies.push(anomaly('missing_key_map', 'musical_context', 'warning'));
  }
  if (validSections > 0 && tempoEventCount === 0) {
    anomalies.push(anomaly('missing_tempo_map', 'musical_context', 'info'));
  }
  if (validSections > 0 && meterEventCount === 0) {
    anomalies.push(anomaly('missing_meter_map', 'musical_context', 'info'));
  }

  return {
    summary: {
      section_count: entries.length,
      valid_section_count: validSections,
      chord_count: chordCount,
      note_count: noteCount,
      key_event_count: keyEventCount,
      tempo_event_count: tempoEventCount,
      meter_event_count: meterEventCount,
    },
    anomalies: anomalies.sort(compareAnomalies),
  };
}

function summarizeAnomalies(records) {
  const byCode = {};
  const bySeverity = {};
  let affectedRecords = 0;
  for (const record of records) {
    const values = Array.isArray(record.anomalies) ? record.anomalies : [];
    if (values.length > 0) affectedRecords += 1;
    for (const item of values) {
      byCode[item.code] = (byCode[item.code] || 0) + 1;
      bySeverity[item.severity] = (bySeverity[item.severity] || 0) + 1;
    }
  }
  return { affected_records: affectedRecords, by_code: byCode, by_severity: bySeverity };
}

module.exports = {
  SEVERITY_ORDER,
  anomaly,
  classifyCatalogRow,
  compareAnomalies,
  summarizeAnomalies,
  summarizePayload,
};
