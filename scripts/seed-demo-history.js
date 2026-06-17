/**
 * Isi data demo riwayat produksi (7 shift) untuk pengujian UI.
 * Menjalankan: npm run seed:demo
 */
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'db.json');

const DEMO_HISTORY = [
  {
    tanggal: '2026-06-10',
    shift: 'Shift 3',
    total_barang: 1180,
    target_per_hour: 1800,
    target_per_shift: 14400,
    pcs_per_interval: 5,
    interval_seconds: 10,
    shift_duration_hours: 8,
    timestamp_saved: '2026-06-10T16:00:05.000Z',
  },
  {
    tanggal: '2026-06-10',
    shift: 'Shift 2',
    total_barang: 998,
    target_per_hour: 1800,
    target_per_shift: 12600,
    pcs_per_interval: 5,
    interval_seconds: 10,
    shift_duration_hours: 7,
    timestamp_saved: '2026-06-10T09:00:03.000Z',
  },
  {
    tanggal: '2026-06-10',
    shift: 'Shift 1',
    total_barang: 1420,
    target_per_hour: 1800,
    target_per_shift: 16200,
    pcs_per_interval: 5,
    interval_seconds: 10,
    shift_duration_hours: 9,
    timestamp_saved: '2026-06-10T02:00:02.000Z',
  },
  {
    tanggal: '2026-06-09',
    shift: 'Shift 3',
    total_barang: 1245,
    target_per_hour: 1800,
    target_per_shift: 14400,
    pcs_per_interval: 5,
    interval_seconds: 10,
    shift_duration_hours: 8,
    timestamp_saved: '2026-06-09T16:00:04.000Z',
  },
  {
    tanggal: '2026-06-09',
    shift: 'Shift 2',
    total_barang: 1131,
    target_per_hour: 1800,
    target_per_shift: 12600,
    pcs_per_interval: 5,
    interval_seconds: 10,
    shift_duration_hours: 7,
    timestamp_saved: '2026-06-09T09:00:01.000Z',
  },
  {
    tanggal: '2026-06-09',
    shift: 'Shift 1',
    total_barang: 1580,
    target_per_hour: 1800,
    target_per_shift: 16200,
    pcs_per_interval: 5,
    interval_seconds: 10,
    shift_duration_hours: 9,
    timestamp_saved: '2026-06-09T02:00:06.000Z',
  },
  {
    tanggal: '2026-06-08',
    shift: 'Shift 3',
    total_barang: 1321,
    target_per_hour: 1800,
    target_per_shift: 14400,
    pcs_per_interval: 5,
    interval_seconds: 10,
    shift_duration_hours: 8,
    timestamp_saved: '2026-06-08T16:00:05.000Z',
  },
];

if (!fs.existsSync(dbPath)) {
  console.error('File db.json tidak ditemukan. Jalankan server sekali terlebih dahulu.');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
if (!data._meta) data._meta = { last_history_id: 0 };

let id = data._meta.last_history_id || 0;
DEMO_HISTORY.forEach((row) => {
  id += 1;
  data.shift_history.push({ id, ...row });
});
data._meta.last_history_id = id;
data._meta.demo_seeded = true;

fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf-8');
console.log(`Demo riwayat ditambahkan: ${DEMO_HISTORY.length} record.`);
