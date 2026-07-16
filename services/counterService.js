const {
  getState,
  updateState,
  saveShiftHistory,
  getTarget,
  buildTargetSnapshot,
} = require('../db/database');
const {
  getCurrentShift,
  getHistoryShift,
  getHistoryShiftDate,
  getShiftDate,
  getNextShift,
  getShiftProgress,
  formatTimeWIB,
  formatDateWIB,
  padTime,
  isAtBoundary,
  getWIBParts,
  formatDateISO,
} = require('./shiftService');

let lastBoundaryMin = -1;
let shiftStartCount = 0;
let shiftStartTime = null;

function calcTargetPerShift(targetPerHour, durationHours) {
  return Math.max(0, Math.round((targetPerHour || 0) * (durationHours || 0)));
}

function calcRawTargetTicker(target, shift, progress) {
  const targetPerShift = calcTargetPerShift(target.target_per_hour, shift.durationHours);
  const elapsedSeconds = Math.floor(progress.elapsedMinutes * 60);
  const intervalCount = target.interval_seconds > 0
    ? Math.floor(elapsedSeconds / target.interval_seconds)
    : 0;

  return Math.min(intervalCount * target.pcs_per_interval, targetPerShift);
}

function saveShiftRecord(tanggal, shift, totalBarang) {
  const target = buildTargetSnapshot(getTarget(), shift);
  saveShiftHistory(tanggal, shift, totalBarang, target);
}

function initCounter() {
  const state = getState();
  const shift = getHistoryShift();
  const shiftDate = getHistoryShiftDate(shift, shift.wib);
  const today = formatDateISO(shift.wib);
  const baselineDeviceCounter = Number.isFinite(state.last_device_counter)
    ? state.last_device_counter
    : null;
  const baselineOffset = baselineDeviceCounter !== null
    ? baselineDeviceCounter
    : (Number.isFinite(state.device_offset) ? state.device_offset : 0);

  if (state.shift !== shift.name || state.shift_date !== shiftDate) {
    if (state.count > 0 || state.shift !== shift.name) {
      saveShiftRecord(state.shift_date, state.shift, state.count);
    }
    updateState({
      shift: shift.name,
      shift_date: shiftDate,
      count: 0,
      daily_total: state.daily_date === today ? state.daily_total : 0,
      daily_date: today,
      last_device_counter: baselineDeviceCounter,
      device_offset: baselineOffset,
      device_reset_pending: baselineDeviceCounter === null,
      target_ticker_offset: 0,
      target_ticker_reset_elapsed_seconds: null,
    });
    shiftStartCount = 0;
  } else {
    shiftStartCount = state.count;
  }

  shiftStartTime = Date.now();
}

function handleShiftBoundary() {
  const wib = getWIBParts();
  const boundary = isAtBoundary(wib, lastBoundaryMin);

  if (!boundary.crossed) return false;

  lastBoundaryMin = boundary.boundaryMin;

  const state = getState();
  const baselineDeviceCounter = Number.isFinite(state.last_device_counter)
    ? state.last_device_counter
    : null;
  const baselineOffset = baselineDeviceCounter !== null
    ? baselineDeviceCounter
    : (Number.isFinite(state.device_offset) ? state.device_offset : 0);
  if (state.count > 0) {
    saveShiftRecord(state.shift_date, state.shift, state.count);
  }

  const now = new Date();
  const newShift = getHistoryShift(now);
  const shiftDate = getHistoryShiftDate(newShift, newShift.wib);
  const today = formatDateISO(newShift.wib);

  updateState({
    shift: newShift.name,
    shift_date: shiftDate,
    count: 0,
    daily_total: state.daily_date === today ? state.daily_total + state.count : state.count,
    daily_date: today,
    last_device_counter: baselineDeviceCounter,
    device_offset: baselineOffset,
    device_reset_pending: baselineDeviceCounter === null,
    target_ticker_offset: 0,
    target_ticker_reset_elapsed_seconds: null,
  });

  shiftStartCount = 0;
  shiftStartTime = Date.now();
  return true;
}

function incrementCounter(amount = 1) {
  const state = getState();
  const shift = getHistoryShift();
  const shiftDate = getHistoryShiftDate(shift, shift.wib);
  const today = formatDateISO(shift.wib);

  let count = state.count;
  let currentShift = state.shift;
  let currentShiftDate = state.shift_date;
  let dailyTotal = state.daily_total;
  let dailyDate = state.daily_date;

  if (currentShift !== shift.name || currentShiftDate !== shiftDate) {
    if (count > 0) {
      saveShiftRecord(currentShiftDate, currentShift, count);
    }
    currentShift = shift.name;
    currentShiftDate = shiftDate;
    count = 0;
    shiftStartCount = 0;
    shiftStartTime = Date.now();
  }

  if (dailyDate !== today) {
    dailyTotal = 0;
    dailyDate = today;
  }

  count += amount;
  dailyTotal += amount;

  updateState({
    shift: currentShift,
    shift_date: currentShiftDate,
    count,
    daily_total: dailyTotal,
    daily_date: dailyDate,
    last_iot_seen: new Date().toISOString(),
  });

  return getDashboardData();
}

function applyDeviceCounter(deviceCounter, deviceTime) {
  const state = getState();
  const shift = getHistoryShift();
  const shiftDate = getHistoryShiftDate(shift, shift.wib);
  const today = formatDateISO(shift.wib);

  let count = state.count;
  let currentShift = state.shift;
  let currentShiftDate = state.shift_date;
  let dailyTotal = state.daily_total;
  let dailyDate = state.daily_date;

  if (currentShift !== shift.name || currentShiftDate !== shiftDate) {
    if (count > 0) {
      saveShiftRecord(currentShiftDate, currentShift, count);
    }
    currentShift = shift.name;
    currentShiftDate = shiftDate;
    count = 0;
    shiftStartCount = 0;
    shiftStartTime = Date.now();
  }

  if (dailyDate !== today) {
    dailyTotal = 0;
    dailyDate = today;
  }

  const parsed = Number(deviceCounter);
  const nextDeviceCounter = Number.isFinite(parsed) && parsed >= 0
    ? Math.floor(parsed)
    : Number.isFinite(state.last_device_counter) ? state.last_device_counter : 0;

  let deviceOffset = Number.isFinite(state.device_offset) ? state.device_offset : null;
  const deviceResetPending = !!state.device_reset_pending;
  const lastDeviceCounter = Number.isFinite(state.last_device_counter)
    ? state.last_device_counter
    : null;

  // Migrasi mulus dari mode lama (absolute counter) ke mode offset.
  if (deviceOffset === null) {
    // Izinkan offset bernilai negatif supaya migrasi dari mode lama tetap mulus
    // walau counter device sempat mulai lagi dari angka kecil.
    deviceOffset = nextDeviceCounter - count;
  }

  // Setelah reset dashboard, paket pertama dari device dijadikan anchor.
  // Jika paket pertama > 0 (umumnya paket trigger pertama), tampilkan sebagai 1.
  if (deviceResetPending) {
    deviceOffset = nextDeviceCounter > 0 ? (nextDeviceCounter - 1) : 0;
  } else if (lastDeviceCounter !== null && nextDeviceCounter < lastDeviceCounter) {
    // Jika counter device turun (misalnya device reset), offset boleh negatif
    // agar counter dashboard tetap lanjut dari angka sekarang (tanpa freeze).
    deviceOffset = nextDeviceCounter - count;
  }

  const mappedCounter = Math.max(0, nextDeviceCounter - deviceOffset);
  const safeCounter = Math.max(count, mappedCounter);
  const delta = safeCounter - count;
  count = safeCounter;
  dailyTotal += delta;

  updateState({
    shift: currentShift,
    shift_date: currentShiftDate,
    count,
    daily_total: dailyTotal,
    daily_date: dailyDate,
    last_iot_seen: new Date().toISOString(),
    last_device_time: deviceTime || null,
    last_device_counter: nextDeviceCounter,
    device_offset: deviceOffset,
    device_reset_pending: false,
  });

  return getDashboardData();
}

function resetCounter() {
  const state = getState();
  const shift = getHistoryShift();
  const shiftDate = getHistoryShiftDate(shift, shift.wib);
  const today = formatDateISO(shift.wib);
  const prevCount = state.count;

  if (prevCount > 0) {
    saveShiftRecord(state.shift_date, state.shift, prevCount);
  }

  let dailyTotal = state.daily_total;
  let dailyDate = state.daily_date;

  if (dailyDate !== today) {
    dailyTotal = 0;
    dailyDate = today;
  } else if (prevCount > 0) {
    dailyTotal = Math.max(0, dailyTotal - prevCount);
  }

  const currentDeviceCounter = Number.isFinite(state.last_device_counter)
    ? state.last_device_counter
    : null;
  const nextOffset = currentDeviceCounter !== null
    ? currentDeviceCounter
    : Number.isFinite(state.device_offset) ? state.device_offset : 0;

  shiftStartCount = 0;
  shiftStartTime = Date.now();

  updateState({
    shift: shift.name,
    shift_date: shiftDate,
    count: 0,
    daily_total: dailyTotal,
    daily_date: dailyDate,
    last_iot_seen: new Date().toISOString(),
    device_offset: nextOffset,
    device_reset_pending: currentDeviceCounter === null,
  });

  return getDashboardData();
}

function resetTargetTicker() {
  const state = getState();
  const target = getTarget();
  const shift = getCurrentShift();
  const progress = getShiftProgress(shift, shift.wib);
  const rawTargetTicker = calcRawTargetTicker(target, shift, progress);
  const elapsedSeconds = Math.floor(progress.elapsedMinutes * 60);

  updateState({
    target_ticker_offset: rawTargetTicker,
    target_ticker_reset_elapsed_seconds: elapsedSeconds,
  });

  return getDashboardData();
}

function updateIotSeen() {
  updateState({ last_iot_seen: new Date().toISOString() });
}

function getIotStatus() {
  const state = getState();
  if (!state.last_iot_seen) {
    return { online: false, lastSeen: null, lastSeenText: 'Belum pernah terhubung' };
  }

  const lastSeen = new Date(state.last_iot_seen);
  const diffMs = Date.now() - lastSeen.getTime();
  const online = diffMs < 30000;

  let lastSeenText;
  if (diffMs < 60000) {
    lastSeenText = 'Baru saja';
  } else if (diffMs < 3600000) {
    lastSeenText = `${Math.floor(diffMs / 60000)}m lalu`;
  } else if (diffMs < 86400000) {
    lastSeenText = `${Math.floor(diffMs / 3600000)}j lalu`;
  } else {
    lastSeenText = `${Math.floor(diffMs / 86400000)}d lalu`;
  }

  return { online, lastSeen: state.last_iot_seen, lastSeenText };
}

function getDashboardData() {
  const state = getState();
  const target = getTarget();
  const shift = getCurrentShift();
  const shiftDate = getShiftDate(shift, shift.wib);
  const nextShift = getNextShift(shift);
  const progress = getShiftProgress(shift, shift.wib);
  const iot = getIotStatus();

  const targetPerShift = calcTargetPerShift(target.target_per_hour, shift.durationHours);
  const elapsedHours = progress.elapsedMinutes / 60;
  const currentRate = elapsedHours > 0.01 ? Math.round(state.count / elapsedHours) : 0;
  const projection = elapsedHours > 0.01
    ? Math.round((state.count / elapsedHours) * shift.durationHours)
    : 0;

  const expectedByNow = Math.round(targetPerShift * progress.fraction);
  const elapsedSeconds = Math.floor(progress.elapsedMinutes * 60);
  const totalSeconds = Math.floor(progress.totalMinutes * 60);
  const shiftWindowClosed = elapsedSeconds >= totalSeconds;
  const targetTickerOffset = Number.isFinite(state.target_ticker_offset)
    ? state.target_ticker_offset
    : 0;
  const targetTickerResetElapsedSeconds = Number.isFinite(state.target_ticker_reset_elapsed_seconds)
    ? Math.max(0, Math.floor(state.target_ticker_reset_elapsed_seconds))
    : null;
  const rawTargetByInterval = shiftWindowClosed ? 0 : calcRawTargetTicker(target, shift, progress);
  const remainingTargetAfterReset = Math.max(0, targetPerShift - targetTickerOffset);
  let targetByInterval;
  if (shiftWindowClosed) {
    targetByInterval = 0;
  } else if (targetTickerResetElapsedSeconds !== null) {
    const elapsedSinceReset = Math.max(0, elapsedSeconds - targetTickerResetElapsedSeconds);
    const intervalCountSinceReset = target.interval_seconds > 0
      ? Math.floor(elapsedSinceReset / target.interval_seconds)
      : 0;
    targetByInterval = Math.min(intervalCountSinceReset * target.pcs_per_interval, remainingTargetAfterReset);
  } else {
    targetByInterval = Math.max(0, rawTargetByInterval - targetTickerOffset);
  }
  const behind = expectedByNow - state.count;
  const progressPercent = targetPerShift > 0
    ? Math.min(100, Math.round((state.count / targetPerShift) * 100))
    : 0;

  const today = formatDateISO(shift.wib);
  const dailyTotal = state.daily_date === today ? state.daily_total : state.count;

  return {
    time: formatTimeWIB(),
    date: formatDateWIB(),
    shift: {
      name: shift.name,
      label: `${shift.name} Sedang Berjalan`,
      timeRange: `${padTime(shift.startHour, shift.startMin)} – ${padTime(shift.endHour, shift.endMin)} WIB`,
      date: shiftDate,
      durationHours: shift.durationHours,
    },
    nextShift: {
      name: nextShift.name,
      startTime: `${padTime(nextShift.startHour, nextShift.startMin)} WIB`,
    },
    counter: state.count,
    dailyTotal,
    iot,
    sensor: {
      lastDeviceTime: state.last_device_time || null,
    },
    target: {
      perHour: target.target_per_hour,
      perShift: targetPerShift,
      model: target.model || '-',
      pcsPerInterval: target.pcs_per_interval,
      intervalSeconds: target.interval_seconds,
      rateLabel: `${target.pcs_per_interval} pcs / ${target.interval_seconds} detik`,
    },
    progress: {
      elapsedSeconds,
      totalSeconds,
    },
    targetTicker: {
      value: targetByInterval,
      max: shiftWindowClosed ? 0 : remainingTargetAfterReset,
    },
    analytics: {
      currentRate,
      projection,
      expectedByNow,
      behind: behind > 0 ? behind : 0,
      ahead: behind < 0 ? Math.abs(behind) : 0,
      progressPercent,
      isBehind: behind > 0,
    },
    updatedAt: state.updated_at,
  };
}

module.exports = {
  initCounter,
  handleShiftBoundary,
  incrementCounter,
  applyDeviceCounter,
  resetCounter,
  resetTargetTicker,
  updateIotSeen,
  getDashboardData,
};
