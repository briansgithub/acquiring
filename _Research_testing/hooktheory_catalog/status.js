const { main } = require('./lib/status');
if (require.main === module) main();
module.exports = require('./lib/status');
