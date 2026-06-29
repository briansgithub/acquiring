#!/usr/bin/env node
/**
 * Upsert catalog rows from .hooktheory_cache/_metadata.json (URL slug join).
 */

const { openDb } = require('../lib/db');
const { syncCacheToCatalog } = require('../lib/cacheSync');

const db = openDb();
const result = syncCacheToCatalog(db);
console.log(JSON.stringify(result, null, 2));
