const fs = require('fs');
const stats = fs.statSync('sacred_ring_data/catalog/harvested_songs.db');
console.log(`Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
