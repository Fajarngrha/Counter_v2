/**
 * Isi data simulasi grafik produksi (8 jam terakhir) untuk laporan.
 * Menjalankan: npm run seed:chart
 *
 * Data dibuat per device yang sudah ada di dashboard, termasuk jeda idle
 * supaya analisis "mesin tidak berproduksi" terlihat di grafik.
 */
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
const dbPath = path.join(dataDir, 'db.json');
const seriesPath = path.join(dataDir, 'production-series.json');

function toWibParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    tanggal: `${parts.year}-${parts.month}-${parts.day}`,
    jam: parts.hour,
    menit: parts.minute,
    detik: parts.second,
    waktu: `${parts.hour}:${parts.minute}:${parts.second}`,
  };
}

function makeSample(deviceId, at, count, delta) {
  const wib = toWibParts(at);
  return {
    ts: at.getTime(),
    tanggal: wib.tanggal,
    jam: wib.jam,
    menit: wib.menit,
    detik: wib.detik,
    waktu: wib.waktu,
    count,
    delta,
    produced: delta > 0,
    device_id: deviceId,
  };
}

function hashSeed(text) {
  return Array.from(String(text)).reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
}

function buildDeviceSeries(deviceId, nowMs, hours = 8) {
  const seed = hashSeed(deviceId);
  const stepMs = 20000;
  const startMs = nowMs - hours * 60 * 60 * 1000;
  const pcsPerTick = 1 + (seed % 3);
  const idleWindows = [
    { from: startMs + (35 + (seed % 20)) * 60 * 1000, dur: (4 + (seed % 5)) * 60 * 1000 },
    { from: startMs + (140 + (seed % 30)) * 60 * 1000, dur: (6 + (seed % 7)) * 60 * 1000 },
    { from: startMs + (280 + (seed % 40)) * 60 * 1000, dur: (8 + (seed % 6)) * 60 * 1000 },
  ];

  const inIdle = (ts) => idleWindows.some((win) => ts >= win.from && ts < win.from + win.dur);

  const points = [];
  let count = 40 + (seed % 80);
  points.push(makeSample(deviceId, new Date(startMs), count, 0));

  for (let ts = startMs + stepMs; ts <= nowMs; ts += stepMs) {
    const idle = inIdle(ts);
    const delta = idle ? 0 : pcsPerTick;
    count += delta;
    if (idle && points.length && !points[points.length - 1].produced && ts - points[points.length - 1].ts < 25000) {
      continue;
    }
    points.push(makeSample(deviceId, new Date(ts), count, delta));
  }

  return { points, lastCount: count };
}

if (!fs.existsSync(dbPath)) {
  console.error('db.json tidak ditemukan. Jalankan dashboard sekali dulu.');
  process.exit(1);
}

const db = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
const deviceIds = Object.keys(db.devices || {});
if (!deviceIds.length) {
  console.error('Belum ada device di dashboard.');
  process.exit(1);
}

const nowMs = Date.now();
const series = {};
for (const deviceId of deviceIds) {
  const built = buildDeviceSeries(deviceId, nowMs, 8);
  series[deviceId] = built.points;
  if (db.devices[deviceId]) {
    db.devices[deviceId].count = built.lastCount;
    db.devices[deviceId].daily_total = built.lastCount;
    db.devices[deviceId].last_iot_seen = new Date(nowMs).toISOString();
  }
}

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(seriesPath, JSON.stringify(series));
fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf-8');

const publicDir = path.join(__dirname, '..', 'public', 'data');
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
const publicPayload = {
  minutes: 480,
  hours: 8,
  generatedAt: nowMs,
  series: {},
};
for (const deviceId of deviceIds) {
  publicPayload.series[deviceId] = {
    id: deviceId,
    label: db.device_meta?.[deviceId]?.label || `Mesin ${deviceId}`,
    points: series[deviceId],
    idle: [],
  };
}
fs.writeFileSync(path.join(publicDir, 'production-series.json'), JSON.stringify(publicPayload));

console.log(`Simulasi grafik siap: ${deviceIds.length} device, 8 jam terakhir.`);
deviceIds.forEach((id) => {
  const label = db.device_meta?.[id]?.label || id;
  const n = series[id].length;
  const last = series[id][n - 1];
  console.log(`- ${label} (${id}): ${n} titik, counting akhir ${last.count} pcs`);
});
console.log('Refresh dashboard, pilih rentang 8 jam pada menu garis tiga.');
