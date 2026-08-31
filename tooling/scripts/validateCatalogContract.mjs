import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const contract = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "contracts", "catalog", "contract.json"), "utf8")
);
const databasePath = process.argv[2] ? path.resolve(process.argv[2]) : null;

if (!databasePath) {
  throw new Error("Usage: node tooling/scripts/validateCatalogContract.mjs <catalog.db>");
}

const db = new Database(databasePath, { readonly: true, fileMustExist: true });
try {
  const quickCheck = db.pragma("quick_check", { simple: true });
  if (quickCheck !== "ok") throw new Error(`PRAGMA quick_check failed: ${quickCheck}`);

  const schemaVersion = db.pragma("user_version", { simple: true });
  if (schemaVersion !== contract.schemaVersion) {
    throw new Error(`Expected schema ${contract.schemaVersion}, found ${schemaVersion}`);
  }

  for (const [table, requiredColumns] of Object.entries(contract.requiredTables)) {
    const columns = new Set(db.pragma(`table_info(${JSON.stringify(table)})`).map((column) => column.name));
    for (const column of requiredColumns) {
      if (!columns.has(column)) throw new Error(`Missing ${table}.${column}`);
    }
  }

  const indexes = new Set(
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all().map((row) => row.name)
  );
  for (const index of contract.requiredIndexes) {
    if (!indexes.has(index)) throw new Error(`Missing index ${index}`);
  }

  const browseRows = db.prepare("SELECT COUNT(*) AS count FROM song_browse_entries").get().count;
  const rowsWithChords = db.prepare(`
    SELECT COUNT(*) AS count
    FROM song_browse_entries AS entries
    INNER JOIN songs ON songs.slug = entries.slug
    WHERE songs.dataBlob IS NOT NULL
  `).get().count;
  if (browseRows < contract.minimumBrowseRows || rowsWithChords !== browseRows) {
    throw new Error(`Incomplete catalog: ${browseRows} browse rows, ${rowsWithChords} with chords`);
  }

  console.log(`catalog contract passed (${browseRows} browse rows, schema ${schemaVersion})`);
} finally {
  db.close();
}
