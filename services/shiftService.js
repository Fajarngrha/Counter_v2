const fs = require('fs');
const path = require('path');
const config = require('../config');

const DEFAULT_SHIFTS = [
  { name: 'Shift 1', startHour: 7, startMin: 15, endHour: 15, endMin: 50 },
  { name: 'Shift 2', startHour: 16, startMin: 15, endHour: 23, endMin: 50 },
  { name: 'Shift 3', startHour: 0, startMin: 15, endHour: 6, endMin: 50 },
];

const dataDir = path.join(__dirname, '..', 'data');
const shiftConfigPath = path.join(dataDir, 'shift-config.json');
const SHIFT_NAMES = new Set(['Shift 1', 'Shift 2', 'Shift 3']);
const HISTORY_BOUNDARIES = [
  { hour: 0, minute: 0 },
  { hour: 7, minute: 0 },
  { hour: 16, minute: 0 },
];

function toMinutes(hour, minute) {
  return hour * 60 + minute;
}

function durationCircularMinutes(startMin, endMin) {
  return endMin > startMin ? (endMin - startMin) : (24 * 60 - startMin + endMin);
}

function overlapLinearMinutes(aStart, aEnd, bStart, bEnd) {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

function extractRawBreaks(shift) {
  if (Array.isArray(shift.breaks)) {
    return shift.breaks;
  }

  const legacy = [
    shift.breakStartHour,
    shift.breakStartMin,
    shift.breakEndHour,
    shift.breakEndMin,
  ];
  if (legacy.every((v) => v === null || v === undefined || v === '')) {
    return [];
  }
  return [{
    startHour: shift.breakStartHour,
    startMin: shift.breakStartMin,
    endHour: shift.breakEndHour,
    endMin: shift.breakEndMin,
  }];
}

function normalizeBreaks(shift) {
  return extractRawBreaks(shift)
    .filter((b) => Number.isInteger(b?.startHour) && Number.isInteger(b?.startMin)
      && Number.isInteger(b?.endHour) && Number.isInteger(b?.endMin))
    .slice(0, 2)
    .map((b) => ({
      startHour: b.startHour % 24,
      startMin: b.startMin,
      endHour: b.endHour % 24,
      endMin: b.endMin,
    }));
}

function calcBreakOverlapMinutes(shift, windowDurationMinutes, breaks = normalizeBreaks(shift)) {
  if (windowDurationMinutes <= 0) return 0;
  if (!breaks.length) return 0;

  const shiftStartMin = toMinutes(shift.startHour, shift.startMin);
  const intervalStart = 0;
  const intervalEnd = windowDurationMinutes;
  let overlapTotal = 0;

  for (const br of breaks) {
    const breakStartMin = toMinutes(br.startHour, br.startMin);
    const breakEndMin = toMinutes(br.endHour, br.endMin);
    const breakDurationMinutes = durationCircularMinutes(breakStartMin, breakEndMin);
    if (breakDurationMinutes <= 0) continue;
    const breakStartOffset = (breakStartMin - shiftStartMin + 24 * 60) % (24 * 60);

    for (const candidateStart of [breakStartOffset - 24 * 60, breakStartOffset, breakStartOffset + 24 * 60]) {
      const candidateEnd = candidateStart + breakDurationMinutes;
      overlapTotal += overlapLinearMinutes(intervalStart, intervalEnd, candidateStart, candidateEnd);
    }
  }

  return Math.min(windowDurationMinutes, Math.max(0, overlapTotal));
}

function calcDurationHours(shift) {
  const start = toMinutes(shift.startHour, shift.startMin);
  const end = toMinutes(shift.endHour, shift.endMin);
  const durationMinutes = durationCircularMinutes(start, end);
  const breakMinutes = calcBreakOverlapMinutes(shift, durationMinutes);
  return Math.max(1, durationMinutes - breakMinutes) / 60;
}

function normalizeShift(shift) {
  const breaks = normalizeBreaks(shift);
  const normalized = {
    name: shift.name,
    startHour: shift.startHour % 24,
    startMin: shift.startMin,
    endHour: shift.endHour % 24,
    endMin: shift.endMin,
    breaks,
  };

  return {
    ...normalized,
    durationHours: calcDurationHours(normalized),
  };
}

function validateShiftInput(shifts) {
  if (!Array.isArray(shifts) || shifts.length !== 3) {
    throw new Error('Konfigurasi shift harus berisi 3 shift.');
  }

  const names = new Set(shifts.map((s) => s.name));
  if (names.size !== 3 || ![...names].every((name) => SHIFT_NAMES.has(name))) {
    throw new Error('Nama shift wajib: Shift 1, Shift 2, Shift 3.');
  }

  for (const shift of shifts) {
    const nums = [shift.startHour, shift.startMin, shift.endHour, shift.endMin];
    if (nums.some((n) => !Number.isInteger(n))) {
      throw new Error(`Jam shift ${shift.name} tidak valid.`);
    }
    if (shift.startHour < 0 || shift.startHour > 23 || shift.endHour < 0 || shift.endHour > 23) {
      throw new Error(`Jam shift ${shift.name} harus 00-23.`);
    }
    if (shift.startMin < 0 || shift.startMin > 59 || shift.endMin < 0 || shift.endMin > 59) {
      throw new Error(`Menit shift ${shift.name} harus 00-59.`);
    }
    if (shift.startHour === shift.endHour && shift.startMin === shift.endMin) {
      throw new Error(`Start dan end ${shift.name} tidak boleh sama.`);
    }

    const rawBreaks = extractRawBreaks(shift);
    if (rawBreaks.length > 2) {
      throw new Error(`Maksimal 2 jam istirahat untuk ${shift.name}.`);
    }
    for (const [idx, br] of rawBreaks.entries()) {
      const values = [br?.startHour, br?.startMin, br?.endHour, br?.endMin];
      const empty = values.every((v) => v === null || v === undefined || v === '');
      if (empty) continue;
      if (values.some((v) => !Number.isInteger(v))) {
        throw new Error(`Jam istirahat ke-${idx + 1} ${shift.name} tidak valid.`);
      }
      if (
        br.startHour < 0 || br.startHour > 23 || br.endHour < 0 || br.endHour > 23
        || br.startMin < 0 || br.startMin > 59 || br.endMin < 0 || br.endMin > 59
      ) {
        throw new Error(`Jam istirahat ke-${idx + 1} ${shift.name} harus 00:00-23:59.`);
      }
      if (br.startHour === br.endHour && br.startMin === br.endMin) {
        throw new Error(`Mulai dan selesai istirahat ke-${idx + 1} ${shift.name} tidak boleh sama.`);
      }
    }

    const normalized = normalizeShift(shift);
    const shiftStart = toMinutes(normalized.startHour, normalized.startMin);
    const shiftEnd = toMinutes(normalized.endHour, normalized.endMin);
    const shiftDuration = durationCircularMinutes(shiftStart, shiftEnd);
    if (normalized.breaks.length) {
      const breakInShift = calcBreakOverlapMinutes(normalized, shiftDuration, normalized.breaks);
      if (breakInShift <= 0) {
        throw new Error(`Jam istirahat ${shift.name} harus berada di dalam rentang shift.`);
      }
      if (breakInShift >= shiftDuration) {
        throw new Error(`Total durasi istirahat ${shift.name} terlalu panjang.`);
      }
      const firstBreak = normalized.breaks[0];
      const secondBreak = normalized.breaks[1];
      if (firstBreak && secondBreak) {
        const overlap1 = calcBreakOverlapMinutes(normalized, shiftDuration, [firstBreak]);
        const overlap2 = calcBreakOverlapMinutes(normalized, shiftDuration, [secondBreak]);
        const overlapBoth = calcBreakOverlapMinutes(normalized, shiftDuration, [firstBreak, secondBreak]);
        if (overlapBoth < overlap1 + overlap2) {
          throw new Error(`Jam istirahat ${shift.name} tidak boleh saling tumpang tindih.`);
        }
      }
    }
  }
}

function loadShiftConfig() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(shiftConfigPath)) {
    const initial = DEFAULT_SHIFTS.map(normalizeShift);
    fs.writeFileSync(shiftConfigPath, JSON.stringify(initial, null, 2), 'utf-8');
    return initial;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(shiftConfigPath, 'utf-8'));
    validateShiftInput(parsed);
    return parsed.map(normalizeShift);
  } catch {
    const fallback = DEFAULT_SHIFTS.map(normalizeShift);
    fs.writeFileSync(shiftConfigPath, JSON.stringify(fallback, null, 2), 'utf-8');
    return fallback;
  }
}

function persistShiftConfig(shifts) {
  fs.writeFileSync(shiftConfigPath, JSON.stringify(shifts, null, 2), 'utf-8');
}

let SHIFTS = loadShiftConfig();

function getWIBParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: config.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type).value;

  return {
    year: parseInt(get('year'), 10),
    month: parseInt(get('month'), 10),
    day: parseInt(get('day'), 10),
    hour: parseInt(get('hour'), 10) % 24,
    minute: parseInt(get('minute'), 10),
    second: parseInt(get('second'), 10),
  };
}

function getShiftConfig() {
  return SHIFTS.map((s) => ({ ...s }));
}

function setShiftConfig(nextShifts) {
  validateShiftInput(nextShifts);
  const normalized = nextShifts.map(normalizeShift);
  persistShiftConfig(normalized);
  SHIFTS = normalized;
  return getShiftConfig();
}

function formatDateISO(parts) {
  const y = parts.year;
  const m = String(parts.month).padStart(2, '0');
  const d = String(parts.day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getCurrentShift(date = new Date()) {
  const wib = getWIBParts(date);
  const nowMin = toMinutes(wib.hour, wib.minute);

  for (const shift of SHIFTS) {
    const startMin = toMinutes(shift.startHour, shift.startMin);
    const endMin = toMinutes(shift.endHour, shift.endMin);
    const crossesMidnight = endMin <= startMin;
    const inRange = crossesMidnight
      ? (nowMin >= startMin || nowMin < endMin)
      : (nowMin >= startMin && nowMin < endMin);
    if (inRange) {
      return { ...shift, wib };
    }
  }

  return { ...SHIFTS[0], wib };
}

function getHistoryShift(date = new Date()) {
  const wib = getWIBParts(date);
  const nowMin = toMinutes(wib.hour, wib.minute);

  if (nowMin >= 7 * 60 && nowMin < 16 * 60) {
    return { name: 'Shift 1', durationHours: 9, wib };
  }
  if (nowMin >= 16 * 60) {
    return { name: 'Shift 2', durationHours: 8, wib };
  }
  return { name: 'Shift 3', durationHours: 7, wib };
}

function getHistoryShiftDate(shift, wib) {
  if (shift.name === 'Shift 2' || shift.name === 'Shift 1') {
    return formatDateISO(wib);
  }

  // Shift 3 (00:00 - 07:00) dicatat ke tanggal sebelumnya agar urutan histori konsisten.
  const yesterday = new Date(
    Date.UTC(wib.year, wib.month - 1, wib.day) - 24 * 60 * 60 * 1000
  );
  const yParts = getWIBParts(yesterday);
  return formatDateISO(yParts);
}

function getShiftDate(shift, wib) {
  const nowMin = toMinutes(wib.hour, wib.minute);
  const startMin = toMinutes(shift.startHour, shift.startMin);
  const endMin = toMinutes(shift.endHour, shift.endMin);
  const crossesMidnight = endMin <= startMin;
  if (!crossesMidnight) {
    return formatDateISO(wib);
  }

  if (nowMin >= startMin) {
    return formatDateISO(wib);
  }

  const yesterday = new Date(
    Date.UTC(wib.year, wib.month - 1, wib.day) - 24 * 60 * 60 * 1000
  );
  const yParts = getWIBParts(yesterday);
  return formatDateISO(yParts);
}

function getNextShift(currentShift) {
  const idx = SHIFTS.findIndex((s) => s.name === currentShift.name);
  return SHIFTS[(idx + 1) % SHIFTS.length];
}

function getShiftProgress(shift, wib) {
  const nowMin = toMinutes(wib.hour, wib.minute) + wib.second / 60;
  const startMin = toMinutes(shift.startHour, shift.startMin);
  const endMin = toMinutes(shift.endHour, shift.endMin);
  const crossesMidnight = endMin <= startMin;
  let elapsedRawMin;

  if (crossesMidnight) {
    if (nowMin >= startMin) {
      elapsedRawMin = nowMin - startMin;
    } else {
      elapsedRawMin = 24 * 60 - startMin + nowMin;
    }
  } else {
    elapsedRawMin = nowMin - startMin;
  }

  const totalRawMin = durationCircularMinutes(startMin, endMin);
  const safeElapsedRaw = Math.max(0, Math.min(totalRawMin, elapsedRawMin));
  const breakElapsedMin = calcBreakOverlapMinutes(shift, safeElapsedRaw);
  const breakTotalMin = calcBreakOverlapMinutes(shift, totalRawMin);
  const elapsedMin = Math.max(0, safeElapsedRaw - breakElapsedMin);
  const totalMin = Math.max(1, totalRawMin - breakTotalMin);

  return {
    elapsedMinutes: elapsedMin,
    totalMinutes: totalMin,
    fraction: Math.min(1, Math.max(0, elapsedMin / totalMin)),
  };
}

function formatTimeWIB(date = new Date()) {
  const wib = getWIBParts(date);
  const h = String(wib.hour).padStart(2, '0');
  const m = String(wib.minute).padStart(2, '0');
  const s = String(wib.second).padStart(2, '0');
  return `${h}.${m}.${s}`;
}

function formatDateWIB(date = new Date()) {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: config.timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function padTime(hour, min) {
  return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function getBoundaryTimes() {
  return HISTORY_BOUNDARIES;
}

function isAtBoundary(wib, lastCheckMin) {
  const nowMin = toMinutes(wib.hour, wib.minute);
  const boundaries = getBoundaryTimes();

  for (const b of boundaries) {
    const bMin = toMinutes(b.hour, b.minute);
    // Tidak pakai syarat detik==0 agar tidak miss boundary saat event loop delay.
    if (wib.hour === b.hour && wib.minute === b.minute) {
      if (lastCheckMin !== bMin) {
        return { crossed: true, boundaryMin: bMin };
      }
    }
  }

  return { crossed: false, boundaryMin: nowMin };
}

function getShiftByName(name) {
  return SHIFTS.find((s) => s.name === name) || SHIFTS[0];
}

function getShiftDurationHours(shiftName) {
  return getShiftByName(shiftName).durationHours;
}

module.exports = {
  getWIBParts,
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
  formatDateISO,
  getShiftByName,
  getShiftDurationHours,
  getShiftConfig,
  setShiftConfig,
};
