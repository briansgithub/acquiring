#!/usr/bin/env node
const { runLightCatalog } = require('../lib/lightCatalog');

runLightCatalog().catch((e) => {
  console.error(e);
  process.exit(1);
});
