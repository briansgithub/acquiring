#!/usr/bin/env node
/** Run tested only for the six songs already fetched. */
const { openDb } = require('./hooktheory_catalog/lib/db');
const { runPipelineAction } = require('./hooktheory_catalog/lib/pipelineOps');

const SLUGS = [
  'scott-joplin__maple-leaf-rag',
  'scott-joplin__gladiolus-rag',
  'lady-gaga__bad-romance',
  'guns-n-roses__sweet-child-o-mine',
  'nintendo__earthbound-zero---pollyanna',
  'queen__bohemian-rhapsody',
];

async function main() {
  const db = openDb();
  for (const slug of SLUGS) {
    const title = db.prepare('SELECT title FROM songs WHERE slug = ?').get(slug)?.title || slug;
    process.stdout.write(`[${title}] tested… `);
    try {
      const r = await runPipelineAction(db, slug, 'tested');
      if (!r.ok) throw new Error(r.error);
      const disc = r.oracleSummary?.discrepancies ?? '?';
      console.log(`ok (${disc} discrepancies)`);
    } catch (e) {
      console.log(`FAILED: ${e.message}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
