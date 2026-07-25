/**
 * Dynamic SQL query builder for progression search.
 */

const { resolveFilterKeys, FILTERS } = require('./filterRegistry');
const { parseSequenceInput, sequenceToProgression } = require('./normalize');

function buildFilterClauses(activeFilters) {
  const clauses = [];
  const params = [];
  for (const key of resolveFilterKeys(activeFilters)) {
    const def = FILTERS[key];
    if (def.type === 'bit') {
      clauses.push('(n.attribute_flags & ?) != 0');
      params.push(1 << def.bit);
    } else if (def.type === 'json') {
      clauses.push(`json_extract(n.metadata, '${def.path}') = ?`);
      params.push(def.equals);
    }
  }
  return { clauses, params };
}

function buildSearchQuery(opts) {
  const {
    mode = 'functional',
    sequence,
    length: lengthIn,
    sectionType,
    beatThreshold = 0,
    filters,
    limit = 50,
  } = opts;

  const tokens = parseSequenceInput(sequence);
  const length = lengthIn || tokens.length;
  const progression = sequenceToProgression(tokens);

  const where = ['n.search_mode = ?', 'n.length = ?', 'n.progression = ?'];
  const params = [mode, length, progression];

  if (sectionType) {
    where.push('n.section_type = ?');
    params.push(sectionType);
  }

  if (beatThreshold > 0) {
    where.push('CAST(json_extract(n.metadata, \'$.min_chord_duration\') AS REAL) >= ?');
    params.push(beatThreshold);
  }

  const { clauses: filterClauses, params: filterParams } = buildFilterClauses(filters);
  where.push(...filterClauses);
  params.push(...filterParams);

  const sql = `
    SELECT
      n.slug,
      n.section_type,
      n.start_position,
      n.beat_duration,
      n.attribute_flags,
      n.metadata,
      stats.song_count
    FROM ngrams n
    INNER JOIN (
      SELECT progression, search_mode, COUNT(DISTINCT slug) AS song_count
      FROM ngrams
      WHERE search_mode = ? AND length = ? AND progression = ?
      GROUP BY progression, search_mode
    ) stats ON stats.progression = n.progression AND stats.search_mode = n.search_mode
    WHERE ${where.join(' AND ')}
    ORDER BY stats.song_count DESC, n.slug, n.section_type, n.start_position
    LIMIT ?
  `;

  const allParams = [
    mode, length, progression,
    ...params,
    limit,
  ];

  return {
    sql,
    params: allParams,
    progression,
    length,
    mode,
  };
}

module.exports = { buildSearchQuery, buildFilterClauses };
