const Database = require('better-sqlite3');
const db = new Database('sacred_ring_data/catalog/hooktheory_catalog.db');
const schema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='songs'").get();
console.log(schema.sql);
db.close();
