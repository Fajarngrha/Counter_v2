const path = require('path');
const fs = require('fs');
const { getShiftDurationHours } = require('../services/shiftService');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'db.json');

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

function nowIso() {
  return new Date().toISOString();
}

function normalizeHistoryRow(row, fallbackTarget) {
  const duration = row.shift_duration_hours || getShiftDurationHours(row.shift);
  const targetPerHour = row.target_per_hour ?? fallbackTarget.target_per_hour;
  const targetPerShift = row.target_per_shift ?? Math.round(targetPerHour * duration);
  const achievement = targetPerShift > 0
    ? Math.round((row.total_barang / targetPerShift) * 100)
    : 0;

  return {
    ...row,
    shift_duration_hours: duration,
    target_per_hour: targetPerHour,
    target_per_shift: targetPerShift,
    model: row.model ?? fallbackTarget.model ?? '-',
    pcs_per_interval: row.pcs_per_interval ?? fallbackTarget.pcs_per_interval,
    interval_seconds: row.interval_seconds ?? fallbackTarget.interval_seconds,
    achievement_percent: achievement,
    rate_label: `${row.pcs_per_interval ?? fallbackTarget.pcs_per_interval} pcs / ${row.interval_seconds ?? fallbackTarget.interval_seconds} detik`,
  };
}

function seedDemoHistory(data) {
  let id = data._meta.last_history_id || 0;
  DEMO_HISTORY.forEach((row) => {
    id += 1;
    data.shift_history.push({ id, ...row });
  });
  data._meta.last_history_id = id;
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
        last_device_counter: null,
        device_offset: 0,
        device_reset_pending: false,
        target_ticker_offset: 0,
        target_ticker_reset_elapsed_seconds: null,
        updated_at: nowIso(),
      },
      production_target: {
        target_per_hour: 1800,
        model: '-',
        pcs_per_interval: 5,
        interval_seconds: 10,
      },
      _meta: { last_history_id: 0, demo_seeded: false },
    };
    seedDemoHistory(initial);
    initial._meta.demo_seeded = true;
    fs.writeFileSync(dbPath, JSON.stringify(initial, null, 2), 'utf-8');
  }

  const data = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
  let mutated = false;

  if (!data._meta) data._meta = { last_history_id: 0 };
  if (!data._meta.demo_seeded) mutated = true;
  if (!data.shift_history) data.shift_history = [];
  if (!data.production_target) {
    data.production_target = {
      target_per_hour: 1800,
      model: '-',
      pcs_per_interval: 5,
      interval_seconds: 10,
    };
    mutated = true;
  }
  if (!data.production_target.model) {
    data.production_target.model = '-';
    mutated = true;
  }

  if (!data._meta.demo_seeded && data.shift_history.length === 0) {
    seedDemoHistory(data);
    data._meta.demo_seeded = true;
    mutated = true;
  }

  if (mutated) {
    writeDb(data);
  }

  return data;
}

function writeDb(data) {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf-8');
}

function buildTargetSnapshot(target, shiftName) {
  const durationHours = getShiftDurationHours(shiftName);
  const targetPerHour = target.target_per_hour;
  return {
    target_per_hour: targetPerHour,
    target_per_shift: Math.round(targetPerHour * durationHours),
    model: target.model || '-',
    pcs_per_interval: target.pcs_per_interval,
    interval_seconds: target.interval_seconds,
    shift_duration_hours: durationHours,
  };
}

function saveShiftHistory(tanggal, shift, totalBarang, targetSnapshot) {
  const data = readDb();
  const target = targetSnapshot || buildTargetSnapshot(data.production_target, shift);
  const existingIdx = data.shift_history.findIndex(
    (row) => row.tanggal === tanggal && row.shift === shift
  );
  const savedAt = nowIso();

  if (existingIdx >= 0) {
    const existing = data.shift_history[existingIdx];
    data.shift_history[existingIdx] = {
      ...existing,
      tanggal,
      shift,
      total_barang: totalBarang,
      target_per_hour: target.target_per_hour,
      target_per_shift: target.target_per_shift,
      model: target.model || '-',
      pcs_per_interval: target.pcs_per_interval,
      interval_seconds: target.interval_seconds,
      shift_duration_hours: target.shift_duration_hours,
      timestamp_saved: savedAt,
    };
    writeDb(data);
    return { changes: 1, lastInsertRowid: existing.id };
  }

  const id = (data._meta.last_history_id || 0) + 1;
  data._meta.last_history_id = id;
  data.shift_history.push({
    id,
    tanggal,
    shift,
    total_barang: totalBarang,
    target_per_hour: target.target_per_hour,
    target_per_shift: target.target_per_shift,
    model: target.model || '-',
    pcs_per_interval: target.pcs_per_interval,
    interval_seconds: target.interval_seconds,
    shift_duration_hours: target.shift_duration_hours,
    timestamp_saved: savedAt,
  });

  writeDb(data);
  return { changes: 1, lastInsertRowid: id };
}

function getHistory(startDate, endDate, options = {}) {
  const data = readDb();
  const fallbackTarget = data.production_target;
  const { shift = 'all', search = '' } = options;
  const q = search.trim().toLowerCase();

  let rows = data.shift_history.filter(
    (r) => r.tanggal >= startDate && r.tanggal <= endDate
  );

  if (shift && shift !== 'all') {
    rows = rows.filter((r) => r.shift === shift);
  }

  if (q) {
    rows = rows.filter((r) => {
      const haystack = `${r.tanggal} ${r.shift} ${r.total_barang}`.toLowerCase();
      return haystack.includes(q);
    });
  }

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

  const enriched = rows.map((r) => normalizeHistoryRow(r, fallbackTarget));

  const totalBarang = enriched.reduce((s, r) => s + r.total_barang, 0);
  const totalTarget = enriched.reduce((s, r) => s + r.target_per_shift, 0);
  const overallAchievement = totalTarget > 0
    ? Math.round((totalBarang / totalTarget) * 100)
    : 0;

  return {
    rows: enriched,
    summary: {
      totalRecords: enriched.length,
      totalBarang,
      totalTarget,
      overallAchievement,
    },
  };
}

function getState() {
  const data = readDb();
  return {
    last_device_time: null,
    last_device_counter: null,
    device_offset: 0,
    device_reset_pending: false,
    target_ticker_offset: 0,
    target_ticker_reset_elapsed_seconds: null,
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

function updateTarget(targetPerHour, pcsPerInterval, intervalSeconds, model = '-') {
  const data = readDb();
  data.production_target = {
    target_per_hour: targetPerHour,
    model: model || '-',
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
  buildTargetSnapshot,
};
