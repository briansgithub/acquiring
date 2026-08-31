Light catalog batch is started from the web player Song Selector UI
(Bulk light catalog section), not from scripts in this folder.

CLI equivalent (advanced):
  node cli/lightCatalog.js --harvest-only --limit 50   # database only
  node cli/lightCatalog.js --limit 50 --meili-pages 25   # discover + harvest
  node cli/lightCatalog.js --all                         # full run

Pause / resume / cancel: use the Song Selector panel while the player server runs.
