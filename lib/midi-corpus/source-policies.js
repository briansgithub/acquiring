'use strict';

const { stableStringify } = require('./stable-json');
const { sha256String } = require('./hash');

const POLICY_VERSION = '2026-08-19.v3';
const USABILITY_CLASSES = Object.freeze([
  'product_usable',
  'research_only',
  'metadata_only',
  'excluded',
]);

const SOURCE_POLICIES = Object.freeze({
  multtipop: {
    display_name: 'MulTTiPop',
    metadata_mode: 'gated_bulk',
    automation_policy: 'after_manual_access_approval',
    artifact_mode: 'evaluation_only',
    default_rights_status: 'evaluation_only_unverified',
    official_urls: ['https://huggingface.co/datasets/gclef-cmu/multtipop'],
    note: 'Keep the published test material frozen and isolated from all training and threshold tuning.',
  },
  gigamidi: {
    display_name: 'GigaMIDI',
    metadata_mode: 'gated_bulk',
    automation_policy: 'after_manual_access_approval',
    artifact_mode: 'research_only',
    default_rights_status: 'research_only_unverified',
    official_urls: [
      'https://github.com/Metacreation-Lab/GigaMIDI-Dataset',
      'https://huggingface.co/datasets/Metacreation/GigaMIDI',
    ],
    note: 'Non-commercial research/education access; do not redistribute corpus artifacts.',
  },
  metamidi: {
    display_name: 'MetaMIDI',
    metadata_mode: 'gated_bulk',
    automation_policy: 'after_manual_access_approval',
    artifact_mode: 'research_only',
    default_rights_status: 'research_only_unverified',
    official_urls: [
      'https://github.com/Metacreation-Lab/MetaMIDI-Dataset',
      'https://zenodo.org/records/5142664',
    ],
    note: 'Research/data-mining/ML access is gated and redistribution is prohibited.',
  },
  lakh: {
    display_name: 'Lakh MIDI Dataset',
    metadata_mode: 'public_bulk',
    automation_policy: 'official_bulk_only',
    artifact_mode: 'research_only',
    default_rights_status: 'research_only_unverified',
    official_urls: ['https://colinraffel.com/projects/lmd/'],
    note: 'Dataset is labeled CC BY 4.0, but underlying scraped-file provenance requires legal review.',
  },
  pdmx: {
    display_name: 'PDMX',
    metadata_mode: 'public_bulk',
    automation_policy: 'official_bulk_only',
    artifact_mode: 'verified_open',
    default_rights_status: 'needs_license_filter',
    official_urls: [
      'https://github.com/pnlong/PDMX',
      'https://zenodo.org/records/15571083',
    ],
    note: 'Only ingest the no-license-conflict, deduplicated, valid subset and retain per-row license evidence.',
  },
  pop909: {
    display_name: 'POP909',
    metadata_mode: 'public_bulk',
    automation_policy: 'official_bulk_only',
    artifact_mode: 'evaluation_only',
    default_rights_status: 'evaluation_only_unverified',
    official_urls: ['https://github.com/music-x-lab/POP909-Dataset'],
    note: 'Repository license does not necessarily clear underlying compositions.',
  },
  pop909_cl: {
    display_name: 'POP909-CL',
    metadata_mode: 'public_bulk',
    automation_policy: 'official_bulk_only',
    artifact_mode: 'evaluation_only',
    default_rights_status: 'evaluation_only_unverified',
    official_urls: ['https://github.com/music-x-lab/POP909-Dataset'],
    note: 'Use compatible chord/key annotations only in the isolated external-evaluation lane.',
  },
  musicbrainz: {
    display_name: 'MusicBrainz identity metadata',
    metadata_mode: 'public_api_or_bulk',
    automation_policy: 'rate_limited_metadata_only',
    artifact_mode: 'blocked',
    default_rights_status: 'metadata_only',
    official_urls: [
      'https://musicbrainz.org/doc/MusicBrainz_API',
      'https://musicbrainz.org/doc/MusicBrainz_Database/Download',
    ],
    note: 'Identity bridge only; no MIDI artifacts. Respect the API rate limit or use compatible bulk data.',
  },
  mutopia: {
    display_name: 'Mutopia Project',
    metadata_mode: 'public_index',
    automation_policy: 'rate_limited_official_files',
    artifact_mode: 'verified_open',
    default_rights_status: 'needs_per_item_review',
    official_urls: [
      'https://www.mutopiaproject.org/',
      'https://www.mutopiaproject.org/legal.html',
    ],
    note: 'Retain each item’s public-domain or Creative Commons license and attribution.',
  },
  internet_archive: {
    display_name: 'Internet Archive',
    metadata_mode: 'public_api',
    automation_policy: 'rate_limited_api',
    artifact_mode: 'verified_open',
    default_rights_status: 'needs_per_item_review',
    official_urls: [
      'https://archive.org/developers/metadata.html',
      'https://archive.org/developers/bots.html',
    ],
    note: 'Availability is not permission; require explicit compatible per-item rights metadata.',
  },
  maestro: {
    display_name: 'MAESTRO',
    metadata_mode: 'public_bulk',
    automation_policy: 'official_bulk_only',
    artifact_mode: 'research_only',
    default_rights_status: 'cc_by_nc_research',
    official_urls: ['https://magenta.withgoogle.com/datasets/maestro'],
    note: 'CC BY-NC-SA; retain attribution and use only within allowed non-commercial scope.',
  },
  asap: {
    display_name: 'ASAP',
    metadata_mode: 'public_bulk',
    automation_policy: 'official_bulk_only',
    artifact_mode: 'research_only',
    default_rights_status: 'cc_by_nc_research',
    official_urls: ['https://github.com/fosfrancesco/asap-dataset'],
    note: 'CC BY-NC-SA; intended here as a classical evaluation corpus.',
  },
  giantmidi_piano: {
    display_name: 'GiantMIDI-Piano',
    metadata_mode: 'clickthrough_bulk',
    automation_policy: 'after_manual_terms_acceptance',
    artifact_mode: 'research_only',
    default_rights_status: 'research_only_unverified',
    official_urls: ['https://github.com/bytedance/GiantMIDI-Piano'],
    note: 'Machine-transcribed classical data; preserve source/disclaimer provenance.',
  },
  slakh2100: {
    display_name: 'Slakh2100',
    metadata_mode: 'public_bulk',
    automation_policy: 'official_bulk_only',
    artifact_mode: 'research_only',
    default_rights_status: 'research_only_unverified',
    official_urls: ['https://www.slakh.com/'],
    note: 'Lakh-derived; use redux/split2 to avoid known duplicate leakage.',
  },
  midifiles_com: {
    display_name: 'MIDIFILES.COM',
    metadata_mode: 'public_catalog',
    automation_policy: 'written_contract_required',
    artifact_mode: 'contract_required',
    default_rights_status: 'personal_use_only',
    official_urls: [
      'https://www.midifiles.com/products/catalog',
      'https://www.midifiles.com/products/pages/terms',
    ],
    note: 'Consumer purchases do not authorize corpus ingestion or training.',
  },
  hit_trax: {
    display_name: 'Hit Trax MIDI',
    metadata_mode: 'public_catalog',
    automation_policy: 'written_contract_required',
    artifact_mode: 'contract_required',
    default_rights_status: 'personal_use_only',
    official_urls: [
      'https://www.midi.com.au/',
      'https://www.midi.com.au/terms-and-conditions/',
    ],
    note: 'A separate written data/training license is required.',
  },
  musescore: {
    display_name: 'MuseScore.com',
    metadata_mode: 'partner_only',
    automation_policy: 'blocked_without_partnership',
    artifact_mode: 'blocked',
    default_rights_status: 'unknown',
    official_urls: [
      'https://musescore.com/robots.txt',
      'https://musescore.org/en/node/307933',
    ],
    note: 'Do not scrape search or download endpoints; pursue a written partnership.',
  },
  spotify: {
    display_name: 'Spotify Platform',
    metadata_mode: 'platform_api_restricted',
    automation_policy: 'blocked_for_ml_ingestion',
    artifact_mode: 'blocked',
    default_rights_status: 'platform_restricted',
    official_urls: ['https://developer.spotify.com/policy'],
    note: 'Platform content must not be used to train or otherwise ingest into ML/AI models.',
  },
  bitmidi: {
    display_name: 'BitMidi',
    metadata_mode: 'public_search',
    automation_policy: 'blocked_without_provenance',
    artifact_mode: 'blocked',
    default_rights_status: 'unknown',
    official_urls: ['https://bitmidi.com/about'],
    note: 'Corpus provenance and reusable rights are unresolved.',
  },
  freemidi: {
    display_name: 'FreeMidi',
    metadata_mode: 'public_search',
    automation_policy: 'blocked_without_provenance',
    artifact_mode: 'blocked',
    default_rights_status: 'unknown',
    official_urls: ['https://freemidi.org/'],
    note: 'No first-party corpus license or automation permission has been established.',
  },
  local_authorized: {
    display_name: 'Locally Supplied Authorized MIDI',
    metadata_mode: 'local_files',
    automation_policy: 'offline_only',
    artifact_mode: 'contract_required',
    default_rights_status: 'needs_per_item_review',
    official_urls: [],
    note: 'Use for user-supplied files only after recording an explicit compatible rights status.',
  },
});

const OPEN_RIGHTS = new Set([
  'public_domain_verified',
  'cc0_verified',
  'cc_by_verified',
  'cc_by_sa_verified',
]);
const RESEARCH_RIGHTS = new Set([
  'research_access_granted',
  'research_only_unverified',
  'cc_by_nc_research',
  ...OPEN_RIGHTS,
]);
const CONTRACT_RIGHTS = new Set([
  'licensed_for_research',
  'licensed_for_training',
  'licensed_for_product',
  'licensed_for_redistribution',
]);

function artifactPurposeDecision(policy, sourceId, status, purpose) {
  let allowed = false;
  let reason = '';

  switch (policy.artifact_mode) {
    case 'blocked':
      reason = `Source ${sourceId} is blocked by policy`;
      break;
    case 'verified_open':
      allowed = OPEN_RIGHTS.has(status);
      reason = allowed ? 'Explicit open rights accepted' : 'Explicit compatible per-item rights are required';
      break;
    case 'research_only':
      allowed = ['research', 'evaluation'].includes(purpose) && RESEARCH_RIGHTS.has(status);
      reason = allowed ? 'Allowed only in the research/evaluation lane' : 'Research scope and compatible rights status are required';
      break;
    case 'evaluation_only':
      allowed = purpose === 'evaluation' && ['evaluation_only_unverified', ...RESEARCH_RIGHTS].includes(status);
      reason = allowed ? 'Allowed only in the isolated evaluation lane' : 'Evaluation-only scope is required';
      break;
    case 'contract_required':
      allowed = CONTRACT_RIGHTS.has(status)
        && (purpose !== 'product' || ['licensed_for_product', 'licensed_for_redistribution'].includes(status));
      reason = allowed ? 'Recorded contract-derived rights accepted' : 'Written compatible data rights are required';
      break;
    default:
      reason = `Unsupported artifact policy mode: ${policy.artifact_mode}`;
  }

  return { allowed, reason };
}

/**
 * Collapse detailed source-specific rights into the only four classes consumers
 * may use for routing. The raw status, evidence, and policy remain authoritative
 * provenance and are deliberately stored separately.
 */
function classifyUsabilityClass({ sourceId, rightsStatus, entity = 'source_item' }) {
  if (!['source_item', 'artifact'].includes(entity)) {
    throw new TypeError(`Unsupported usability entity: ${entity}`);
  }
  const policy = getSourcePolicy(sourceId);
  const status = String(rightsStatus || policy.default_rights_status);
  if (artifactPurposeDecision(policy, sourceId, status, 'product').allowed) return 'product_usable';
  if (
    artifactPurposeDecision(policy, sourceId, status, 'research').allowed
    || artifactPurposeDecision(policy, sourceId, status, 'evaluation').allowed
  ) return 'research_only';

  if (entity === 'artifact') return 'excluded';
  if (policy.automation_policy === 'blocked_for_ml_ingestion' || status === 'platform_restricted') {
    return 'excluded';
  }
  return 'metadata_only';
}

function getSourcePolicy(sourceId) {
  const policy = SOURCE_POLICIES[sourceId];
  if (!policy) {
    const error = new Error(`Unknown MIDI source policy: ${sourceId}`);
    error.code = 'UNKNOWN_SOURCE_POLICY';
    throw error;
  }
  return { source_id: sourceId, policy_version: POLICY_VERSION, ...policy };
}

function listSourcePolicies() {
  return Object.keys(SOURCE_POLICIES).sort().map(getSourcePolicy);
}

function sourcePolicyHash(sourceId) {
  return sha256String(stableStringify(getSourcePolicy(sourceId)));
}

function evaluateArtifactRights({ sourceId, rightsStatus, purpose = 'research' }) {
  const policy = getSourcePolicy(sourceId);
  const status = String(rightsStatus || policy.default_rights_status);
  const { allowed, reason } = artifactPurposeDecision(policy, sourceId, status, purpose);

  return {
    allowed,
    source_id: sourceId,
    purpose,
    rights_status: status,
    artifact_mode: policy.artifact_mode,
    policy_version: POLICY_VERSION,
    policy_sha256: sourcePolicyHash(sourceId),
    usability_class: classifyUsabilityClass({ sourceId, rightsStatus: status, entity: 'artifact' }),
    reason,
  };
}

function assertArtifactRights(input) {
  const decision = evaluateArtifactRights(input);
  if (!decision.allowed) {
    const error = new Error(decision.reason);
    error.name = 'RightsPolicyError';
    error.code = 'RIGHTS_POLICY_DENIED';
    error.decision = decision;
    throw error;
  }
  return decision;
}

module.exports = {
  POLICY_VERSION,
  SOURCE_POLICIES,
  USABILITY_CLASSES,
  assertArtifactRights,
  classifyUsabilityClass,
  evaluateArtifactRights,
  getSourcePolicy,
  listSourcePolicies,
  sourcePolicyHash,
};
