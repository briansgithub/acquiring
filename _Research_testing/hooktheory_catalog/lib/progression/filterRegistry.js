/**
 * UI filter registry — maps toggle keys to bitmask bits or JSON metadata paths.
 */

const FILTERS = {
  minorTriads: { type: 'bit', bit: 0, label: 'Minor triads' },
  sevenths: { type: 'bit', bit: 1, label: '7ths / extensions' },
  inversions: { type: 'bit', bit: 2, label: 'Inversions / slash' },
  suspended: { type: 'bit', bit: 3, label: 'Suspended' },
  altered: { type: 'bit', bit: 4, label: 'Altered notes' },
  hasBorrowed: { type: 'json', path: '$.has_borrowed', equals: 1, label: 'Borrowed' },
  hasApplied: { type: 'json', path: '$.has_applied', equals: 1, label: 'Applied / secondary' },
};

function listFilters() {
  return Object.entries(FILTERS).map(([key, def]) => ({ key, ...def }));
}

function resolveFilterKeys(input) {
  if (!input) return [];
  if (Array.isArray(input)) return input.filter((k) => FILTERS[k]);
  return String(input)
    .split(',')
    .map((s) => s.trim())
    .filter((k) => FILTERS[k]);
}

module.exports = { FILTERS, listFilters, resolveFilterKeys };
