import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { openDb } = require('../_Research_testing/hooktheory_catalog/lib/db.js');
const db = openDb();
for (const id of [
  'emerson-lake-and-palmer__tarkus/Verse/4.5',
  'georges-bizet__larlesienne-suite-no-2---iv-farandole/Intro/10',
  '4lung__thousand-yard-stare/Intro/41',
]) {
  const r = db.prepare('SELECT * FROM engine_errors WHERE id = ?').get(id);
  if (!r) { console.log('missing', id); continue; }
  console.log(id, {
    notes_ok: r.notes_ok,
    failure_class: r.failure_class,
    flags: JSON.parse(r.failure_flags_json || '{}'),
    truth_pcs: JSON.parse(r.truth_pcs_json),
    eng_pcs: JSON.parse(r.eng_pcs_json),
    truth_roman: r.truth_roman,
    eng_roman: r.eng_roman,
  });
}
db.close();
