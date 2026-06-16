const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'db.json');

function nowIso() {
  return new Date().toISOString();
}

function readDb() {
  if (!fs.existsSync(dbPath)) {
    const today = new Date().toISOString().slice(0, 10);
    const initial = {
      shift_history: [],
      current_state: {
        shift: 'Shift 1',
        shift_date: today,
        count: 0,
        daily_total: 0,
        daily_date: today,
        last_iot_seen: null,
        last_device_time: null,
        updated_at: nowIso(),
      },
      production_target: {
        target_per_hour: 1800,
        pcs_per_interval: 5,
        interval_seconds: 10,
      },
      _meta: { last_history_id: 0 },
    };
    fs.writeFileSync(dbPath, JSON.stringify(initial, null, 2), 'utf-8');
  }

  return JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
}

function writeDb(data) {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf-8');
}

function saveShiftHistory(tanggal, shift, totalBarang) {
  const data = readDb();
  const id = (data._meta.last_history_id || 0) + 1;
  data._meta.last_history_id = id;

  data.shift_history.push({
    id,
    tanggal,
    shift,
    total_barang: totalBarang,
    timestamp_saved: nowIso(),
  });

  writeDb(data);
  return { changes: 1, lastInsertRowid: id };
}

function getHistory(startDate, endDate) {
  const data = readDb();
  const rows = data.shift_history.filter(
    (r) => r.tanggal >= startDate && r.tanggal <= endDate
  );

  const shiftOrder = { 'Shift 3': 1, 'Shift 2': 2, 'Shift 1': 3 };
  rows.sort((a, b) => {
    if (a.tanggal !== b.tanggal) return a.tanggal < b.tanggal ? 1 : -1;
    if (shiftOrder[a.shift] !== shiftOrder[b.shift]) {
      return shiftOrder[a.shift] < shiftOrder[b.shift] ? 1 : -1;
    }
    if (a.timestamp_saved !== b.timestamp_saved) {
      return a.timestamp_saved < b.timestamp_saved ? 1 : -1;
    }
    return b.id - a.id;
  });

  return rows;
}

function getState() {
  const data = readDb();
  return {
    last_device_time: null,
    ...data.current_state,
  };
}

function updateState(fields) {
  const data = readDb();
  data.current_state = {
    ...data.current_state,
    ...fields,
    updated_at: nowIso(),
  };
  writeDb(data);
}

function getTarget() {
  const data = readDb();
  return data.production_target;
}

function updateTarget(targetPerHour, pcsPerInterval, intervalSeconds) {
  const data = readDb();
  data.production_target = {
    target_per_hour: targetPerHour,
    pcs_per_interval: pcsPerInterval,
    interval_seconds: intervalSeconds,
  };
  writeDb(data);
}

module.exports = {
  saveShiftHistory,
  getHistory,
  getState,
  updateState,
  getTarget,
  updateTarget,
};
