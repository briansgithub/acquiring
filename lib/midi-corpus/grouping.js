'use strict';

const { sha256String } = require('./hash');
const { stableStringify } = require('./stable-json');

const GROUPING_POLICY = Object.freeze({
  id: 'hooktheory-composition-evidence-union-v2',
  version: 2,
  identity_version: 'evidence-union-v2',
  evidence_order: Object.freeze([
    'artist_title',
    'decoded_payload',
    'hooktheory_section_id',
    'section_fp',
    'music_exact',
    'music_transposition',
    'music_section_pair',
    'music_long_section',
    'music_shingle_pair',
    'fallback_slug',
  ]),
  fingerprint: Object.freeze({
    timing_quantum: 1 / 24,
    minimum_song_events: 24,
    minimum_song_beats: 16,
    minimum_song_chords: 4,
    minimum_song_notes: 12,
    minimum_section_events: 12,
    minimum_section_beats: 8,
    minimum_long_section_events: 24,
    minimum_long_section_beats: 16,
    shingle_events: 12,
    bottom_shingles: 8,
  }),
  limits: Object.freeze({
    max_records: 250_000,
    max_evidence_keys: 2_500_000,
    max_evidence_per_record: 128,
    max_sections_per_payload: 64,
    max_events_per_section: 50_000,
    max_section_pair_evidence: 32,
    max_shingle_pair_evidence: 28,
  }),
});

const CHORD_FIELDS = [
  'root', 'type', 'inversion', 'applied', 'borrowed',
  'adds', 'omits', 'alterations', 'suspensions',
];
const NATURAL_PC = Object.freeze({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 });

class GroupingLimitError extends Error {
  constructor(limit, value) {
    super(`Composition grouping exceeded ${limit}: ${value}`);
    this.name = 'GroupingLimitError';
    this.code = 'GROUPING_LIMIT_EXCEEDED';
    this.limit = limit;
    this.value = value;
  }
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function quantize(value, quantum = 0.000001) {
  const number = finite(value);
  if (number == null) return null;
  return Math.round(number / quantum) * quantum;
}

function normalizeScalar(value) {
  if (value == null) return null;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return String(value).trim();
}

function normalizeArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeScalar).sort((a, b) => compareText(stableStringify(a), stableStringify(b)));
}

function tonicPc(value) {
  const match = String(value || '').trim().replace(/♭/g, 'b').replace(/♯/g, '#')
    .match(/^([A-Ga-g])([#bx]*)$/);
  if (!match) return null;
  let pc = NATURAL_PC[match[1].toUpperCase()];
  for (const accidental of match[2]) {
    if (accidental === '#') pc += 1;
    else if (accidental === 'b') pc -= 1;
    else if (accidental === 'x') pc += 2;
  }
  return ((pc % 12) + 12) % 12;
}

function metadataFor(section) {
  return section?.metadata && typeof section.metadata === 'object' && !Array.isArray(section.metadata)
    ? section.metadata
    : section || {};
}

function looksLikeSection(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && (
    Array.isArray(value.chords)
    || value.notes !== undefined
    || value.stringSongId !== undefined
    || value.songId !== undefined
    || value.sectionId !== undefined
  ));
}

function sectionEntries(payload, limit) {
  const entry = (key, candidate, keyIsEvidence) => {
    const section = looksLikeSection(candidate?.hooktheory) ? candidate.hooktheory : candidate;
    return [key, section, keyIsEvidence, candidate];
  };
  let entries;
  if (looksLikeSection(payload)) {
    entries = [entry('root', payload, false)];
  } else if (Array.isArray(payload)) {
    entries = payload.map((section, index) => entry(String(index), section, false));
  } else if (payload?.sections && Array.isArray(payload.sections)) {
    entries = payload.sections.map((section, index) => entry(String(index), section, false));
  } else if (payload && typeof payload === 'object') {
    entries = Object.keys(payload).sort(compareText).map((key) => entry(key, payload[key], true));
  } else {
    entries = [];
  }
  return entries.filter(([, section]) => looksLikeSection(section)).slice(0, limit);
}

function flattenNotes(value, output, limit) {
  if (output.length > limit || value == null) return;
  if (Array.isArray(value)) {
    for (const entry of value) {
      flattenNotes(entry, output, limit);
      if (output.length > limit) return;
    }
    return;
  }
  if (typeof value === 'object') {
    if ('sd' in value || 'beat' in value || 'isRest' in value) {
      output.push(value);
      return;
    }
    for (const key of Object.keys(value).sort(compareText)) {
      flattenNotes(value[key], output, limit);
      if (output.length > limit) return;
    }
  }
}

function normalizedKeys(section, robust) {
  const metadata = metadataFor(section);
  const keys = Array.isArray(metadata.keys) ? metadata.keys : Array.isArray(section.keys) ? section.keys : [];
  return keys.map((entry) => ({
    beat: quantize(entry?.beat, robust ? GROUPING_POLICY.fingerprint.timing_quantum : 0.000001),
    scale: String(entry?.scale || 'major').trim(),
    ...(robust ? {} : { tonic_pc: tonicPc(entry?.tonic) }),
  })).sort((left, right) => (
    (left.beat ?? 0) - (right.beat ?? 0)
    || compareText(stableStringify(left), stableStringify(right))
  ));
}

function normalizedChord(chord, robust) {
  const quantum = robust ? GROUPING_POLICY.fingerprint.timing_quantum : 0.000001;
  const result = {
    beat: quantize(chord?.beat, quantum),
    duration: quantize(chord?.duration, quantum),
    root: normalizeScalar(chord?.root),
    type: normalizeScalar(chord?.type ?? 5),
    applied: normalizeScalar(chord?.applied ?? 0),
    borrowed: Array.isArray(chord?.borrowed) ? normalizeArray(chord.borrowed) : normalizeScalar(chord?.borrowed),
    is_rest: Boolean(chord?.isRest),
  };
  for (const field of CHORD_FIELDS) {
    if (field in result || !(field in (chord || {}))) continue;
    result[field] = Array.isArray(chord[field]) ? normalizeArray(chord[field]) : normalizeScalar(chord[field]);
  }
  return result;
}

function normalizedNote(note, robust) {
  const quantum = robust ? GROUPING_POLICY.fingerprint.timing_quantum : 0.000001;
  return {
    beat: quantize(note?.beat, quantum),
    duration: quantize(note?.duration, quantum),
    sd: String(note?.sd ?? note?.scale_degree ?? 'rest').trim(),
    ...(robust ? {} : { octave: finite(note?.octave) ?? 0 }),
    is_rest: Boolean(note?.isRest),
  };
}

function eventSort(left, right) {
  return (left.beat ?? 0) - (right.beat ?? 0)
    || compareText(stableStringify(left), stableStringify(right));
}

function normalizeMusicalSection(section, policy = GROUPING_POLICY) {
  const limit = policy.limits.max_events_per_section;
  const chords = Array.isArray(section?.chords) ? section.chords : [];
  const notes = [];
  flattenNotes(section?.notes, notes, limit);
  if (chords.length + notes.length > limit) return { safe: false, reason: 'event_limit' };

  const exactChords = chords.map((event) => normalizedChord(event, false)).sort(eventSort);
  const exactNotes = notes.map((event) => normalizedNote(event, false)).sort(eventSort);
  const robustChords = chords.map((event) => normalizedChord(event, true)).sort(eventSort);
  const robustNotes = notes.map((event) => normalizedNote(event, true)).sort(eventSort);
  const robustTokens = [
    ...robustChords.map((event) => ({ ...event, lane: 'chord' })),
    ...robustNotes.map((event) => ({ ...event, lane: 'melody' })),
  ].sort(eventSort).map((event) => stableStringify(event));
  let duration = 0;
  for (const event of [...exactChords, ...exactNotes]) {
    duration = Math.max(duration, Number(event.beat || 0) + Number(event.duration || 0) - 1);
  }

  return {
    safe: true,
    chordCount: chords.length,
    noteCount: notes.length,
    eventCount: chords.length + notes.length,
    duration,
    exact: {
      keys: normalizedKeys(section, false),
      chords: exactChords,
      notes: exactNotes,
    },
    robust: {
      keys: normalizedKeys(section, true),
      events: robustTokens,
    },
    robustTokens,
  };
}

function validOpaqueValue(value, minimumLength = 3) {
  if (value == null) return null;
  if (!['string', 'number', 'bigint'].includes(typeof value)) return null;
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  const text = String(value).trim();
  if (text.length < minimumLength || text.length > 256) return null;
  return text;
}

function validMapSectionId(value) {
  const text = validOpaqueValue(value, 10);
  if (!text) return null;
  if (/^\d{5,}$/.test(text)) return text;
  if (!/^[A-Za-z0-9_-]{10,64}$/.test(text)) return null;
  const upper = (text.match(/[A-Z]/g) || []).length;
  const lower = (text.match(/[a-z]/g) || []).length;
  return /[-_\d]/.test(text) || (upper >= 2 && lower >= 2) ? text : null;
}

function digestEvidence(type, value) {
  return {
    type,
    digest: sha256String(`${type}\0${typeof value === 'string' ? value : stableStringify(value)}`),
  };
}

function evidencePriority(type, policy) {
  const index = policy.evidence_order.indexOf(type);
  return index < 0 ? policy.evidence_order.length : index;
}

function dedupeAndBoundEvidence(evidence, policy) {
  const unique = new Map();
  for (const item of evidence) unique.set(`${item.type}:${item.digest}`, item);
  return [...unique.values()].sort((left, right) => (
    evidencePriority(left.type, policy) - evidencePriority(right.type, policy)
    || compareText(left.digest, right.digest)
  )).slice(0, policy.limits.max_evidence_per_record);
}

function safeSong(stats, fingerprint) {
  return stats.events >= fingerprint.minimum_song_events
    && stats.duration >= fingerprint.minimum_song_beats
    && stats.chords >= fingerprint.minimum_song_chords
    && stats.notes >= fingerprint.minimum_song_notes;
}

function shinglePairEvidence(tokens, policy) {
  const fingerprint = policy.fingerprint;
  if (tokens.length < fingerprint.minimum_long_section_events) return [];
  const hashes = new Set();
  for (let index = 0; index + fingerprint.shingle_events <= tokens.length; index += 1) {
    hashes.add(sha256String(tokens.slice(index, index + fingerprint.shingle_events).join('\u001f')));
  }
  const bottom = [...hashes].sort(compareText).slice(0, fingerprint.bottom_shingles);
  const pairs = [];
  for (let left = 0; left < bottom.length; left += 1) {
    for (let right = left + 1; right < bottom.length; right += 1) {
      pairs.push(digestEvidence('music_shingle_pair', `${bottom[left]}\0${bottom[right]}`));
      if (pairs.length >= policy.limits.max_shingle_pair_evidence) return pairs;
    }
  }
  return pairs;
}

function extractGroupingEvidence({ identity, payload, decodedSha256 = null }, policy = GROUPING_POLICY) {
  const evidence = [];
  evidence.push(digestEvidence(identity.usedFallback ? 'fallback_slug' : 'artist_title', identity.canonicalKey));
  if (decodedSha256) evidence.push(digestEvidence('decoded_payload', decodedSha256));

  const entries = sectionEntries(payload, policy.limits.max_sections_per_payload);
  const normalizedSections = [];
  for (const [entryId, section, entryIdIsEvidence, envelope] of entries) {
    if (entryIdIsEvidence) {
      const value = validMapSectionId(entryId);
      if (value) evidence.push(digestEvidence('hooktheory_section_id', value));
    }
    for (const source of envelope === section ? [section] : [envelope, section]) {
      for (const field of ['stringSongId', 'songId', 'sectionId', 'ID']) {
        const value = validOpaqueValue(source?.[field]);
        if (value) evidence.push(digestEvidence('hooktheory_section_id', value));
      }
    }
    const metadata = metadataFor(section);
    for (const value of [
      envelope?.fp,
      envelope?.fingerprint,
      section?.fp,
      metadata?.fp,
      section?.fingerprint,
      metadata?.fingerprint,
    ]) {
      const fingerprintValue = validOpaqueValue(value, 8);
      if (fingerprintValue) evidence.push(digestEvidence('section_fp', fingerprintValue));
    }
    const normalized = normalizeMusicalSection(section, policy);
    if (normalized.safe) normalizedSections.push(normalized);
  }

  const totals = normalizedSections.reduce((summary, section) => ({
    sections: summary.sections + 1,
    chords: summary.chords + section.chordCount,
    notes: summary.notes + section.noteCount,
    events: summary.events + section.eventCount,
    duration: summary.duration + section.duration,
  }), { sections: 0, chords: 0, notes: 0, events: 0, duration: 0 });

  let exactComputed = false;
  let transpositionComputed = false;
  if (normalizedSections.length && safeSong(totals, policy.fingerprint)) {
    const exactHashes = normalizedSections.map((section) => sha256String(stableStringify(section.exact))).sort(compareText);
    const robustHashes = normalizedSections.map((section) => sha256String(stableStringify(section.robust))).sort(compareText);
    evidence.push(digestEvidence('music_exact', exactHashes));
    evidence.push(digestEvidence('music_transposition', robustHashes));
    exactComputed = true;
    transpositionComputed = true;

    const uniqueRobust = [...new Set(robustHashes)];
    let pairCount = 0;
    for (let left = 0; left < uniqueRobust.length; left += 1) {
      for (let right = left + 1; right < uniqueRobust.length; right += 1) {
        evidence.push(digestEvidence('music_section_pair', `${uniqueRobust[left]}\0${uniqueRobust[right]}`));
        pairCount += 1;
        if (pairCount >= policy.limits.max_section_pair_evidence) break;
      }
      if (pairCount >= policy.limits.max_section_pair_evidence) break;
    }
  }

  for (const section of normalizedSections) {
    if (section.eventCount < policy.fingerprint.minimum_long_section_events
      || section.duration < policy.fingerprint.minimum_long_section_beats
      || section.chordCount < policy.fingerprint.minimum_song_chords
      || section.noteCount < policy.fingerprint.minimum_song_notes) continue;
    const sectionHash = sha256String(stableStringify(section.robust));
    evidence.push(digestEvidence('music_long_section', sectionHash));
    evidence.push(...shinglePairEvidence(section.robustTokens, policy));
  }

  return {
    evidence: dedupeAndBoundEvidence(evidence, policy),
    fingerprint_summary: {
      sections_considered: entries.length,
      safe_sections: normalizedSections.length,
      chord_events: totals.chords,
      melody_events: totals.notes,
      total_events: totals.events,
      duration_beats: quantize(totals.duration),
      exact_computed: exactComputed,
      transposition_invariant_computed: transpositionComputed,
    },
  };
}

class GroupingIndex {
  constructor(policy = GROUPING_POLICY) {
    this.policy = policy;
    this.records = [];
    this.recordIndex = new Map();
    this.parent = [];
    this.evidenceOwner = new Map();
    this.evidenceKeysByType = {};
    this.unionCountsByType = {};
    this.linkTypes = [];
    this.finalized = null;
  }

  find(index) {
    let root = index;
    while (this.parent[root] !== root) root = this.parent[root];
    while (this.parent[index] !== index) {
      const next = this.parent[index];
      this.parent[index] = root;
      index = next;
    }
    return root;
  }

  union(left, right, evidenceType) {
    let leftRoot = this.find(left);
    let rightRoot = this.find(right);
    if (leftRoot === rightRoot) {
      if (left !== right) this.linkTypes[leftRoot].add(evidenceType);
      return;
    }
    if (leftRoot > rightRoot) [leftRoot, rightRoot] = [rightRoot, leftRoot];
    this.parent[rightRoot] = leftRoot;
    for (const type of this.linkTypes[rightRoot]) this.linkTypes[leftRoot].add(type);
    this.linkTypes[leftRoot].add(evidenceType);
    this.unionCountsByType[evidenceType] = (this.unionCountsByType[evidenceType] || 0) + 1;
  }

  addRecord(recordId, seedGroupId, evidence) {
    if (this.finalized) throw new Error('Grouping index has already been finalized');
    if (this.records.length >= this.policy.limits.max_records) {
      throw new GroupingLimitError('max_records', this.records.length + 1);
    }
    if (this.recordIndex.has(recordId)) throw new Error(`Duplicate grouping record: ${recordId}`);
    const index = this.records.length;
    const normalizedEvidence = dedupeAndBoundEvidence(evidence || [], this.policy);
    this.records.push({
      recordId,
      seedGroupId,
      evidenceTypes: [...new Set(normalizedEvidence.map((item) => item.type))].sort(compareText),
    });
    this.recordIndex.set(recordId, index);
    this.parent.push(index);
    this.linkTypes.push(new Set());

    for (const item of normalizedEvidence) {
      const key = `${item.type}:${item.digest}`;
      const owner = this.evidenceOwner.get(key);
      if (owner === undefined) {
        if (this.evidenceOwner.size >= this.policy.limits.max_evidence_keys) {
          throw new GroupingLimitError('max_evidence_keys', this.evidenceOwner.size + 1);
        }
        this.evidenceOwner.set(key, index);
        this.evidenceKeysByType[item.type] = (this.evidenceKeysByType[item.type] || 0) + 1;
      } else {
        this.union(index, owner, item.type);
      }
    }
  }

  finalize() {
    if (this.finalized) return this.finalized;
    const componentMembers = new Map();
    for (let index = 0; index < this.records.length; index += 1) {
      const root = this.find(index);
      if (!componentMembers.has(root)) componentMembers.set(root, []);
      componentMembers.get(root).push(index);
    }

    const byRecordId = new Map();
    let linkedComponents = 0;
    let linkedRecords = 0;
    for (const [root, members] of componentMembers) {
      const memberIds = members.map((index) => this.records[index].recordId).sort(compareText);
      const seedIds = [...new Set(members.map((index) => this.records[index].seedGroupId))].sort(compareText);
      const groupId = sha256String(`composition-union-v2\0${seedIds.join('\0')}\0${memberIds.join('\0')}`);
      const evidenceTypeSet = new Set();
      for (const index of members) {
        for (const type of this.records[index].evidenceTypes) evidenceTypeSet.add(type);
      }
      const evidenceTypes = [...evidenceTypeSet].sort(compareText);
      const linkedBy = [...this.linkTypes[this.find(root)]].sort(compareText);
      if (members.length > 1) {
        linkedComponents += 1;
        linkedRecords += members.length;
      }
      for (const index of members) {
        byRecordId.set(this.records[index].recordId, {
          groupId,
          componentAnchor: memberIds[0],
          componentSize: members.length,
          evidenceTypes,
          linkedBy,
        });
      }
    }

    this.finalized = {
      byRecordId,
      summary: {
        policy_id: this.policy.id,
        policy_version: this.policy.version,
        components: componentMembers.size,
        linked_components: linkedComponents,
        linked_records: linkedRecords,
        evidence_keys: this.evidenceOwner.size,
        evidence_keys_by_type: Object.fromEntries(Object.entries(this.evidenceKeysByType).sort(([a], [b]) => compareText(a, b))),
        unions_by_type: Object.fromEntries(Object.entries(this.unionCountsByType).sort(([a], [b]) => compareText(a, b))),
        bounded_state: {
          records: this.records.length,
          evidence_keys: this.evidenceOwner.size,
          max_records: this.policy.limits.max_records,
          max_evidence_keys: this.policy.limits.max_evidence_keys,
        },
      },
    };
    return this.finalized;
  }
}

module.exports = {
  GROUPING_POLICY,
  GroupingIndex,
  GroupingLimitError,
  extractGroupingEvidence,
  normalizeMusicalSection,
};
