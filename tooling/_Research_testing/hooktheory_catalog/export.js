const { main } = require('./lib/export');
if (require.main === module) main();
module.exports = require('./lib/export');
