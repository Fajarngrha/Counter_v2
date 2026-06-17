const config = require('../config');

const SHIFTS = [
  { name: 'Shift 1', startHour: 7, startMin: 0, endHour: 16, endMin: 0, durationHours: 9 },
  { name: 'Shift 2', startHour: 16, startMin: 0, endHour: 23, endMin: 0, durationHours: 7 },
  { name: 'Shift 3', startHour: 23, startMin: 0, endHour: 7, endMin: 0, durationHours: 8 },
];

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

function toMinutes(hour, minute) {
  return hour * 60 + minute;
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

    if (shift.name === 'Shift 3') {
      if (nowMin >= startMin || nowMin < endMin) {
        return { ...shift, wib };
      }
    } else if (nowMin >= startMin && nowMin < endMin) {
      return { ...shift, wib };
    }
  }

  return { ...SHIFTS[0], wib };
}

function getShiftDate(shift, wib) {
  if (shift.name !== 'Shift 3') {
    return formatDateISO(wib);
  }

  const nowMin = toMinutes(wib.hour, wib.minute);
  const startMin = toMinutes(shift.startHour, shift.startMin);

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
  let elapsedMin;

  if (shift.name === 'Shift 3') {
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
  return [
    { hour: 7, minute: 0 },
    { hour: 16, minute: 0 },
    { hour: 23, minute: 0 },
  ];
}

function isAtBoundary(wib, lastCheckMin) {
  const nowMin = toMinutes(wib.hour, wib.minute);
  const boundaries = getBoundaryTimes();

  for (const b of boundaries) {
    const bMin = toMinutes(b.hour, b.minute);
    if (wib.hour === b.hour && wib.minute === b.minute && wib.second === 0) {
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
  SHIFTS,
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
};
