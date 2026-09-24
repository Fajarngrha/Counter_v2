/**
 * Reset offset counter ESP tanpa mengubah angka dashboard.
 * Pakai jika web Online tapi counter tidak bertambah (setelah restore backup).
 *
 *   node scripts/resync-device-offset.js
 */
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'db.json');
if (!fs.existsSync(dbPath)) {
  console.error('data/db.json tidak ditemukan.');
  process.exit(1);
}

const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
const ids = Object.keys(db.devices || {});
if (!ids.length) {
  console.error('Tidak ada device di db.json.');
  process.exit(1);
}

for (const id of ids) {
  db.devices[id].device_offset = null;
  db.devices[id].last_device_counter = null;
  db.devices[id].device_reset_pending = false;
}

fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
console.log(`Offset di-reset untuk ${ids.length} device:`);
console.log(ids.join(', '));
console.log('Restart service, lalu biarkan mesin berproduksi. Paket berikutnya akan menaikkan counter.');
