#!/usr/bin/env node
/**
 * MANUAL ONLY: upsert catalog rows from .hooktheory_cache/_metadata.json.
 * Not part of the normal catalog → fetch → test workflow.
 */

const { openDb } = require('../lib/db');
const { syncCacheToCatalog } = require('../lib/cacheSync');

const db = openDb();
const result = syncCacheToCatalog(db);
console.log(JSON.stringify(result, null, 2));
