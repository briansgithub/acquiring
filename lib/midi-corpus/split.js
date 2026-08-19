'use strict';

const crypto = require('node:crypto');

const SPLIT_POLICY_V1 = Object.freeze({
  id: 'composition-sha256-bucket-v1',
  seed: 'hooktheory-midi-theory-v1',
  bucketCount: 10_000,
  ranges: Object.freeze({
    train: Object.freeze([0, 8_000]),
    validation: Object.freeze([8_000, 9_000]),
    test: Object.freeze([9_000, 10_000]),
  }),
});

const SPLIT_POLICY = Object.freeze({
  id: 'composition-evidence-union-sha256-bucket-v2',
  version: 2,
  seed: 'hooktheory-midi-theory-v2',
  grouping_policy_id: 'hooktheory-composition-evidence-union-v2',
  bucketCount: 10_000,
  ranges: Object.freeze({
    train: Object.freeze([0, 8_000]),
    validation: Object.freeze([8_000, 9_000]),
    test: Object.freeze([9_000, 10_000]),
  }),
});

function splitBucket(groupId, policy = SPLIT_POLICY) {
  const digest = crypto
    .createHash('sha256')
    .update(policy.seed)
    .update('\0')
    .update(groupId)
    .digest();
  return Number(digest.readBigUInt64BE(0) % BigInt(policy.bucketCount));
}

function assignSplit(groupId, policy = SPLIT_POLICY) {
  const bucket = splitBucket(groupId, policy);
  if (bucket < policy.ranges.train[1]) return { split: 'train', bucket };
  if (bucket < policy.ranges.validation[1]) return { split: 'validation', bucket };
  return { split: 'test', bucket };
}

module.exports = {
  SPLIT_POLICY,
  SPLIT_POLICY_V1,
  assignSplit,
  splitBucket,
};
