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

function toMinutes(hour, minute) {
  return hour * 60 + minute;
}

function calcDurationHours(shift) {
  const start = toMinutes(shift.startHour, shift.startMin);
  const end = toMinutes(shift.endHour, shift.endMin);
  const durationMinutes = end > start ? (end - start) : (24 * 60 - start + end);
  return durationMinutes / 60;
}

function normalizeShift(shift) {
  return {
    name: shift.name,
    startHour: shift.startHour % 24,
    startMin: shift.startMin,
    endHour: shift.endHour % 24,
    endMin: shift.endMin,
    durationHours: calcDurationHours(shift),
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
  let elapsedMin;

  if (crossesMidnight) {
    if (nowMin >= startMin) {
      elapsedMin = nowMin - startMin;
    } else {
      elapsedMin = 24 * 60 - startMin + nowMin;
    }
  } else {
    elapsedMin = nowMin - startMin;
  }

  const totalMin = shift.durationHours * 60;
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
  const marks = [];
  const seen = new Set();

  for (const shift of SHIFTS) {
    const candidates = [
      { hour: shift.startHour, minute: shift.startMin },
      { hour: shift.endHour, minute: shift.endMin },
    ];

    for (const mark of candidates) {
      const key = `${mark.hour}:${mark.minute}`;
      if (seen.has(key)) continue;
      seen.add(key);
      marks.push(mark);
    }
  }

  return marks;
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
