const { runLightCatalog } = require('./lib/lightCatalog');

if (require.main === module) {
  runLightCatalog().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { runLightCatalog };
