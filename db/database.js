const path = require('path');
const fs = require('fs');
const { getShiftDurationHours } = require('../services/shiftService');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'db.json');
const seriesPath = path.join(dataDir, 'production-series.json');

const SERIES_MAX_POINTS = 1800;
const SERIES_HEARTBEAT_MS = 25000;
const SERIES_MAX_AGE_MS = 48 * 60 * 60 * 1000;
const SERIES_IDLE_MIN_MS = 2 * 60 * 1000;

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

const DEFAULT_DEVICE_ID = 'device-1';
const DEFAULT_TARGET = {
  target_per_hour: 1800,
  model: '-',
  pcs_per_interval: 5,
  interval_seconds: 10,
};

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
    device_id: row.device_id || 'legacy',
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

function createDefaultCurrentState(today) {
  return {
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
  };
}

function normalizeDeviceState(state = {}) {
  return {
    shift: 'Shift 1',
    shift_date: null,
    count: 0,
    daily_total: 0,
    daily_date: null,
    last_iot_seen: null,
    last_device_time: null,
    last_device_counter: null,
    device_offset: 0,
    device_reset_pending: false,
    target_ticker_offset: 0,
    target_ticker_reset_elapsed_seconds: null,
    updated_at: nowIso(),
    ...state,
  };
}

function normalizeDeviceLabel(label, deviceId) {
  const text = String(label || '').trim();
  if (text.length > 0) return text.slice(0, 60);
  return `Mesin ${deviceId}`;
}

function normalizeDeviceAddress(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  return text.slice(0, 120);
}

function normalizeDeviceMeta(meta = {}, deviceId) {
  return {
    label: normalizeDeviceLabel(meta.label, deviceId),
    address: normalizeDeviceAddress(meta.address),
    last_topic: normalizeDeviceAddress(meta.last_topic),
  };
}

function migrateLegacyStateToDevices(data) {
  if (!data.devices || typeof data.devices !== 'object') {
    data.devices = {};
  }

  const keys = Object.keys(data.devices);
  if (keys.length === 0) {
    const legacy = data.current_state ? normalizeDeviceState(data.current_state) : null;
    data.devices[DEFAULT_DEVICE_ID] = legacy || normalizeDeviceState();
  }

  const normalizedDevices = {};
  for (const [deviceId, state] of Object.entries(data.devices)) {
    if (!deviceId) continue;
    normalizedDevices[deviceId] = normalizeDeviceState(state);
  }
  data.devices = normalizedDevices;

  const selected = String(data.selected_device_id || '').trim();
  if (!selected || !data.devices[selected]) {
    data.selected_device_id = Object.keys(data.devices)[0] || DEFAULT_DEVICE_ID;
  }

  // Pertahankan kompatibilitas field lama untuk komponen yang belum migrasi.
  data.current_state = normalizeDeviceState(data.devices[data.selected_device_id]);
}

function migrateDeviceMeta(data) {
  if (!data.device_meta || typeof data.device_meta !== 'object') {
    data.device_meta = {};
  }

  const normalized = {};
  for (const deviceId of Object.keys(data.devices || {})) {
    normalized[deviceId] = normalizeDeviceMeta(data.device_meta[deviceId], deviceId);
  }
  data.device_meta = normalized;
}

function normalizeTarget(target = {}) {
  const targetPerHour = Number(target.target_per_hour);
  const pcsPerInterval = Number(target.pcs_per_interval);
  const intervalSeconds = Number(target.interval_seconds);
  return {
    target_per_hour: Number.isFinite(targetPerHour) && targetPerHour > 0
      ? Math.floor(targetPerHour)
      : DEFAULT_TARGET.target_per_hour,
    model: (typeof target.model === 'string' && target.model.trim().length > 0)
      ? target.model.trim()
      : DEFAULT_TARGET.model,
    pcs_per_interval: Number.isFinite(pcsPerInterval) && pcsPerInterval > 0
      ? Math.floor(pcsPerInterval)
      : DEFAULT_TARGET.pcs_per_interval,
    interval_seconds: Number.isFinite(intervalSeconds) && intervalSeconds > 0
      ? Math.floor(intervalSeconds)
      : DEFAULT_TARGET.interval_seconds,
  };
}

function migrateLegacyTargets(data) {
  const legacyTarget = normalizeTarget(data.production_target || DEFAULT_TARGET);
  if (!data.production_targets || typeof data.production_targets !== 'object') {
    data.production_targets = {};
  }

  const deviceIds = Object.keys(data.devices || {});
  if (deviceIds.length === 0) {
    data.production_targets[DEFAULT_DEVICE_ID] = normalizeTarget(data.production_targets[DEFAULT_DEVICE_ID] || legacyTarget);
  } else {
    for (const deviceId of deviceIds) {
      data.production_targets[deviceId] = normalizeTarget(data.production_targets[deviceId] || legacyTarget);
    }
  }

  data.production_target = legacyTarget;
}

function readDb() {
  if (!fs.existsSync(dbPath)) {
    const today = new Date().toISOString().slice(0, 10);
    const initial = {
      shift_history: [],
      current_state: createDefaultCurrentState(today),
      devices: {
        [DEFAULT_DEVICE_ID]: createDefaultCurrentState(today),
      },
      selected_device_id: DEFAULT_DEVICE_ID,
      production_target: { ...DEFAULT_TARGET },
      production_targets: {
        [DEFAULT_DEVICE_ID]: { ...DEFAULT_TARGET },
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
  migrateLegacyStateToDevices(data);
  migrateDeviceMeta(data);
  if (!data.production_target) {
    data.production_target = { ...DEFAULT_TARGET };
    mutated = true;
  }
  if (!data.production_target.model) {
    data.production_target.model = DEFAULT_TARGET.model;
    mutated = true;
  }
  migrateLegacyTargets(data);

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

function saveShiftHistory(tanggal, shift, totalBarang, targetSnapshot, deviceId = DEFAULT_DEVICE_ID) {
  const data = readDb();
  const target = targetSnapshot || buildTargetSnapshot(data.production_target, shift);
  const safeDeviceId = String(deviceId || '').trim() || DEFAULT_DEVICE_ID;
  const existingIdx = data.shift_history.findIndex(
    (row) => row.tanggal === tanggal && row.shift === shift && (row.device_id || 'legacy') === safeDeviceId
  );
  const savedAt = nowIso();

  if (existingIdx >= 0) {
    const existing = data.shift_history[existingIdx];
    data.shift_history[existingIdx] = {
      ...existing,
      tanggal,
      shift,
      device_id: safeDeviceId,
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
    device_id: safeDeviceId,
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
  const { shift = 'all', device = 'all', search = '' } = options;
  const q = search.trim().toLowerCase();

  let rows = data.shift_history.filter(
    (r) => r.tanggal >= startDate && r.tanggal <= endDate
  );

  if (shift && shift !== 'all') {
    rows = rows.filter((r) => r.shift === shift);
  }

  if (device && device !== 'all') {
    rows = rows.filter((r) => (r.device_id || 'legacy') === device);
  }

  const deviceMeta = data.device_meta || {};
  const labelOf = (deviceId) => normalizeDeviceLabel(deviceMeta[deviceId]?.label, deviceId);

  if (q) {
    rows = rows.filter((r) => {
      const deviceId = r.device_id || 'legacy';
      const haystack = `${r.tanggal} ${r.shift} ${r.total_barang} ${deviceId} ${labelOf(deviceId)}`.toLowerCase();
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

  const enriched = rows.map((r) => {
    const row = normalizeHistoryRow(r, fallbackTarget);
    return {
      ...row,
      device_label: labelOf(row.device_id),
    };
  });

  const totalBarang = enriched.reduce((s, r) => s + r.total_barang, 0);
  const totalTarget = enriched.reduce((s, r) => s + r.target_per_shift, 0);
  const overallAchievement = totalTarget > 0
    ? Math.round((totalBarang / totalTarget) * 100)
    : 0;

  return {
    rows: enriched,
    devices: Array.from(new Set([
      ...Object.keys(data.devices || {}),
      ...data.shift_history.map((r) => r.device_id || 'legacy'),
    ]))
      .filter((id) => id && id !== 'legacy')
      .map((id) => ({
        id,
        label: labelOf(id),
      }))
      .sort((a, b) => String(a.label).localeCompare(String(b.label), 'id', { numeric: true, sensitivity: 'base' })),
    summary: {
      totalRecords: enriched.length,
      totalBarang,
      totalTarget,
      overallAchievement,
    },
  };
}

function getState(deviceId = DEFAULT_DEVICE_ID) {
  return getStateByDevice(deviceId);
}

function updateState(fields, deviceId = DEFAULT_DEVICE_ID) {
  return updateStateByDevice(fields, deviceId);
}

function getStateByDevice(deviceId = DEFAULT_DEVICE_ID) {
  const data = readDb();
  const safeDeviceId = String(deviceId || '').trim() || DEFAULT_DEVICE_ID;
  const existing = data.devices[safeDeviceId];
  return normalizeDeviceState(existing || {});
}

function updateStateByDevice(fields, deviceId = DEFAULT_DEVICE_ID) {
  const data = readDb();
  const safeDeviceId = String(deviceId || '').trim() || DEFAULT_DEVICE_ID;
  const next = {
    ...normalizeDeviceState(data.devices[safeDeviceId]),
    ...fields,
    updated_at: nowIso(),
  };
  data.devices[safeDeviceId] = next;
  data.selected_device_id = safeDeviceId;
  data.current_state = next;
  writeDb(data);
}

function getAllDeviceStates() {
  const data = readDb();
  const out = {};
  for (const [deviceId, state] of Object.entries(data.devices || {})) {
    out[deviceId] = normalizeDeviceState(state);
  }
  return out;
}

function getDeviceIds() {
  return Object.keys(getAllDeviceStates());
}

function ensureDeviceState(deviceId) {
  const data = readDb();
  const safeDeviceId = String(deviceId || '').trim();
  if (!safeDeviceId) {
    throw new Error('deviceId wajib diisi.');
  }

  if (!data.devices[safeDeviceId]) {
    const base = data.current_state ? normalizeDeviceState(data.current_state) : normalizeDeviceState();
    data.devices[safeDeviceId] = {
      ...base,
      count: 0,
      daily_total: 0,
      last_iot_seen: null,
      last_device_time: null,
      last_device_counter: null,
      device_offset: 0,
      device_reset_pending: false,
      target_ticker_offset: 0,
      target_ticker_reset_elapsed_seconds: null,
      updated_at: nowIso(),
    };
    const legacyTarget = normalizeTarget(data.production_target || DEFAULT_TARGET);
    data.production_targets[safeDeviceId] = normalizeTarget(data.production_targets?.[safeDeviceId] || legacyTarget);
    if (!data.device_meta || typeof data.device_meta !== 'object') data.device_meta = {};
    data.device_meta[safeDeviceId] = normalizeDeviceMeta(data.device_meta[safeDeviceId], safeDeviceId);
    writeDb(data);
    const seriesData = readSeriesFile();
    if (!Array.isArray(seriesData[safeDeviceId])) {
      seriesData[safeDeviceId] = [];
      writeSeriesFile(seriesData);
    }
  }

  return normalizeDeviceState(data.devices[safeDeviceId]);
}

function getDeviceMeta(deviceId = DEFAULT_DEVICE_ID) {
  const data = readDb();
  const safeDeviceId = String(deviceId || '').trim() || DEFAULT_DEVICE_ID;
  return normalizeDeviceMeta(data.device_meta?.[safeDeviceId], safeDeviceId);
}

function getAllDeviceMeta() {
  const data = readDb();
  const out = {};
  for (const deviceId of Object.keys(data.devices || {})) {
    out[deviceId] = normalizeDeviceMeta(data.device_meta?.[deviceId], deviceId);
  }
  return out;
}

function updateDeviceMeta(deviceId, fields = {}) {
  const data = readDb();
  const safeDeviceId = String(deviceId || '').trim();
  if (!safeDeviceId) throw new Error('deviceId wajib diisi.');
  if (!data.devices[safeDeviceId]) throw new Error('deviceId tidak ditemukan.');
  if (!data.device_meta || typeof data.device_meta !== 'object') data.device_meta = {};

  data.device_meta[safeDeviceId] = normalizeDeviceMeta({
    ...data.device_meta[safeDeviceId],
    ...fields,
  }, safeDeviceId);
  writeDb(data);
  return data.device_meta[safeDeviceId];
}

function deleteDevice(deviceId) {
  const data = readDb();
  const safeDeviceId = String(deviceId || '').trim();
  if (!safeDeviceId) throw new Error('deviceId wajib diisi.');
  if (!data.devices[safeDeviceId]) throw new Error('deviceId tidak ditemukan.');

  const deviceIds = Object.keys(data.devices || {});
  if (deviceIds.length <= 1) {
    throw new Error('Minimal harus ada 1 device aktif.');
  }

  delete data.devices[safeDeviceId];
  if (data.production_targets && typeof data.production_targets === 'object') {
    delete data.production_targets[safeDeviceId];
  }
  if (data.production_series && typeof data.production_series === 'object') {
    delete data.production_series[safeDeviceId];
  }
  if (fs.existsSync(seriesPath)) {
    try {
      const seriesData = readSeriesFile();
      delete seriesData[safeDeviceId];
      writeSeriesFile(seriesData);
    } catch {
      // ignore series cleanup error
    }
  }
  if (data.device_meta && typeof data.device_meta === 'object') {
    delete data.device_meta[safeDeviceId];
  }

  const remaining = Object.keys(data.devices || {});
  if (!remaining.length) {
    throw new Error('Gagal menghapus device terakhir.');
  }

  if (!data.selected_device_id || !data.devices[data.selected_device_id]) {
    data.selected_device_id = remaining[0];
  }
  data.current_state = normalizeDeviceState(data.devices[data.selected_device_id]);
  writeDb(data);
  return { deleted: safeDeviceId, selectedDeviceId: data.selected_device_id };
}

function getTarget() {
  return getTargetByDevice(DEFAULT_DEVICE_ID);
}

function getTargetByDevice(deviceId = DEFAULT_DEVICE_ID) {
  const data = readDb();
  const safeDeviceId = String(deviceId || '').trim() || DEFAULT_DEVICE_ID;
  const target = data.production_targets?.[safeDeviceId];
  const fallback = normalizeTarget(data.production_target || DEFAULT_TARGET);
  return normalizeTarget(target || fallback);
}

function getAllTargets() {
  const data = readDb();
  const out = {};
  for (const deviceId of Object.keys(data.devices || {})) {
    out[deviceId] = getTargetByDevice(deviceId);
  }
  return out;
}

function updateTarget(targetPerHour, pcsPerInterval, intervalSeconds, model = '-', deviceId = DEFAULT_DEVICE_ID) {
  const data = readDb();
  const safeDeviceId = String(deviceId || '').trim() || DEFAULT_DEVICE_ID;
  const next = normalizeTarget({
    target_per_hour: targetPerHour,
    model: model || '-',
    pcs_per_interval: pcsPerInterval,
    interval_seconds: intervalSeconds,
  });
  if (!data.production_targets || typeof data.production_targets !== 'object') {
    data.production_targets = {};
  }
  data.production_targets[safeDeviceId] = next;
  data.production_target = next;
  writeDb(data);
}

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

function parseSampleTime(waktu) {
  if (!waktu) return new Date();
  const text = String(waktu).trim();
  if (!text) return new Date();

  const hasZone = /[zZ]$/.test(text) || /[+-]\d{2}:?\d{2}$/.test(text);
  const match = text.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  let parsed = null;

  // Payload ESP/RTC tanpa zona = jam WIB, jangan di-parse sebagai UTC server.
  if (match && !hasZone) {
    const sec = match[4] || '00';
    parsed = new Date(`${match[1]}T${match[2]}:${match[3]}:${sec}+07:00`);
  } else {
    const native = Date.parse(text);
    if (Number.isFinite(native)) parsed = new Date(native);
  }

  if (!parsed || Number.isNaN(parsed.getTime())) return new Date();

  // Jika jam device jauh dari jam server, pakai waktu terima aktual.
  if (Math.abs(parsed.getTime() - Date.now()) > 3 * 60 * 60 * 1000) {
    return new Date();
  }
  return parsed;
}

function readSeriesFile() {
  if (!fs.existsSync(seriesPath)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(seriesPath, 'utf-8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeSeriesFile(data) {
  fs.writeFileSync(seriesPath, JSON.stringify(data), 'utf-8');
}

function pruneSeriesList(list, nowMs = Date.now()) {
  const minTs = nowMs - SERIES_MAX_AGE_MS;
  let next = (Array.isArray(list) ? list : []).filter((row) => Number(row?.ts) >= minTs);
  if (next.length > SERIES_MAX_POINTS) {
    next = next.slice(next.length - SERIES_MAX_POINTS);
  }
  return next;
}

function appendProductionSample(deviceId, options = {}) {
  const safeDeviceId = String(deviceId || '').trim() || DEFAULT_DEVICE_ID;
  const count = Math.max(0, Math.floor(Number(options.count) || 0));
  const delta = Math.max(0, Math.floor(Number(options.delta) || 0));
  const at = parseSampleTime(options.waktu);
  const ts = at.getTime();
  const wib = toWibParts(at);
  const produced = delta > 0;
  const data = readSeriesFile();
  const list = pruneSeriesList(data[safeDeviceId] || [], ts);
  const last = list[list.length - 1];

  if (!produced && last && ts - Number(last.ts) < SERIES_HEARTBEAT_MS) {
    return null;
  }

  const sample = {
    ts,
    tanggal: wib.tanggal,
    jam: wib.jam,
    menit: wib.menit,
    detik: wib.detik,
    waktu: wib.waktu,
    count,
    delta,
    produced,
    device_id: safeDeviceId,
  };
  list.push(sample);
  data[safeDeviceId] = pruneSeriesList(list, ts);
  writeSeriesFile(data);
  return sample;
}

function findIdleWindows(points, nowMs = Date.now()) {
  const idle = [];
  if (!Array.isArray(points) || points.length === 0) return idle;
  const prod = points.filter((row) => row.produced || Number(row.delta) > 0);
  const markers = prod.length ? prod : points;
  let prev = markers[0];
  for (let i = 1; i < markers.length; i += 1) {
    const cur = markers[i];
    const gap = Number(cur.ts) - Number(prev.ts);
    if (gap >= SERIES_IDLE_MIN_MS) {
      idle.push({
        startTs: Number(prev.ts),
        endTs: Number(cur.ts),
        startWaktu: `${prev.tanggal} ${prev.waktu}`,
        endWaktu: `${cur.tanggal} ${cur.waktu}`,
        durationMs: gap,
        count: Number(prev.count) || 0,
      });
    }
    prev = cur;
  }
  const last = markers[markers.length - 1];
  const tailGap = nowMs - Number(last.ts);
  if (tailGap >= SERIES_IDLE_MIN_MS) {
    const nowParts = toWibParts(new Date(nowMs));
    idle.push({
      startTs: Number(last.ts),
      endTs: nowMs,
      startWaktu: `${last.tanggal} ${last.waktu}`,
      endWaktu: `${nowParts.tanggal} ${nowParts.waktu}`,
      durationMs: tailGap,
      count: Number(last.count) || 0,
    });
  }
  return idle.slice(-12);
}

function getProductionSeries(options = {}) {
  const requestedMinutes = Number(options.minutes);
  const requestedHours = Number(options.hours);
  const minutes = Number.isFinite(requestedMinutes) && requestedMinutes > 0
    ? requestedMinutes
    : (Number.isFinite(requestedHours) && requestedHours > 0 ? requestedHours * 60 : 60);
  const windowMinutes = Math.min(48 * 60, Math.max(1, Math.floor(minutes)));
  const filterDevice = String(options.device || 'all').trim() || 'all';
  const nowMs = Date.now();
  const minTs = nowMs - windowMinutes * 60 * 1000;
  const raw = readSeriesFile();
  const meta = getAllDeviceMeta();
  const ids = Object.keys(getAllDeviceStates());
  const known = new Set(ids);
  const series = {};

  for (const deviceId of known) {
    if (filterDevice !== 'all' && deviceId !== filterDevice) continue;
    const points = pruneSeriesList(raw[deviceId] || [], nowMs)
      .filter((row) => Number(row.ts) >= minTs)
      .map((row) => ({
        ts: Number(row.ts),
        tanggal: row.tanggal,
        jam: row.jam,
        menit: row.menit,
        detik: row.detik,
        waktu: row.waktu,
        count: Number(row.count) || 0,
        delta: Number(row.delta) || 0,
        produced: !!row.produced,
        device_id: deviceId,
        device_label: normalizeDeviceLabel(meta[deviceId]?.label, deviceId),
      }));
    series[deviceId] = {
      id: deviceId,
      label: normalizeDeviceLabel(meta[deviceId]?.label, deviceId),
      points,
      idle: findIdleWindows(points, nowMs),
    };
  }

  return { minutes: windowMinutes, hours: windowMinutes / 60, generatedAt: nowMs, series };
}

module.exports = {
  saveShiftHistory,
  getHistory,
  getState,
  updateState,
  getStateByDevice,
  updateStateByDevice,
  getAllDeviceStates,
  getDeviceIds,
  ensureDeviceState,
  getDeviceMeta,
  getAllDeviceMeta,
  updateDeviceMeta,
  deleteDevice,
  getTarget,
  getTargetByDevice,
  getAllTargets,
  updateTarget,
  buildTargetSnapshot,
  appendProductionSample,
  getProductionSeries,
};
