const TARGET_STORAGE_KEY = 'iot_counter_target';

function fmtNumber(n) {
  return new Intl.NumberFormat('id-ID').format(n || 0);
}

async function fetchJson(url, opts) {
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request gagal');
  return data;
}

async function postJson(url, body) {
  return fetchJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function putJson(url, body) {
  return fetchJson(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const el = (id) => document.getElementById(id);

const counterValueEl = el('counterValue');
const progressFillEl = el('progressFill');
const alertBoxEl = el('alertBox');
const alertIconEl = el('alertIcon');
const projectionWrapEl = el('projectionWrap');

let lastCounter = null;
let latestDashboardData = null;

function loadTargetFromStorage() {
  try {
    const raw = localStorage.getItem(TARGET_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.pcsPerInterval || !parsed.intervalSeconds) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveTargetToStorage(pcsPerInterval, intervalSeconds) {
  localStorage.setItem(
    TARGET_STORAGE_KEY,
    JSON.stringify({ pcsPerInterval, intervalSeconds })
  );
}

function calcPerHour(pcs, seconds) {
  if (!pcs || !seconds) return 0;
  return Math.round((pcs / seconds) * 3600);
}

function getProgressColorClass(percent) {
  if (percent >= 75) return 'progress-fill--green';
  if (percent >= 50) return 'progress-fill--blue';
  if (percent >= 25) return 'progress-fill--yellow';
  return 'progress-fill--red';
}

function pulseCounter() {
  counterValueEl.classList.add('pulse');
  setTimeout(() => counterValueEl.classList.remove('pulse'), 150);
}

function updatePreview() {
  const pcs = parseInt(el('inpPcsPerInterval').value, 10) || 0;
  const sec = parseInt(el('inpIntervalSeconds').value, 10) || 0;
  el('hintPcs').textContent = pcs || '-';
  el('hintSec').textContent = sec || '-';
  el('previewPerHour').textContent = fmtNumber(calcPerHour(pcs, sec));
}

function setEditMode(active) {
  el('targetEditForm').classList.toggle('hidden', !active);
  el('targetActionsView').classList.toggle('hidden', active);
  el('targetActionsEdit').classList.toggle('hidden', !active);
}

function renderDifferenceIndicator(analytics) {
  const behind = analytics?.behind || 0;
  const ahead = analytics?.ahead || 0;
  const expected = analytics?.expectedByNow || 0;

  alertBoxEl.classList.remove('alert-box--ahead', 'alert-box--neutral');

  if (behind > 0) {
    alertBoxEl.classList.remove('hidden');
    alertIconEl.innerHTML = `
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
      <path d="M12 9v4"></path>
      <path d="M12 17h.01"></path>
    `;
    el('alertText').textContent =
      `Tertinggal ${fmtNumber(behind)} pcs dari ekspektasi waktu saat ini (${fmtNumber(expected)} pcs)`;
    return;
  }

  if (ahead > 0) {
    alertBoxEl.classList.remove('hidden');
    alertBoxEl.classList.add('alert-box--ahead');
    alertIconEl.innerHTML = `
      <path d="M23 6l-9.5 9.5-5-5L1 18"></path>
      <path d="M17 6h6v6"></path>
    `;
    el('alertText').textContent =
      `Unggul ${fmtNumber(ahead)} pcs dari ekspektasi waktu saat ini (${fmtNumber(expected)} pcs)`;
    return;
  }

  alertBoxEl.classList.remove('hidden');
  alertBoxEl.classList.add('alert-box--neutral');
  alertIconEl.innerHTML = `
    <circle cx="12" cy="12" r="10"></circle>
    <path d="M12 8v4"></path>
    <path d="M12 16h.01"></path>
  `;
  el('alertText').textContent = `Sesuai ekspektasi waktu saat ini (${fmtNumber(expected)} pcs)`;
}

function render(data) {
  latestDashboardData = data;

  el('timeNow').textContent = data.time || '--.--.--';
  el('dateNow').textContent = data.date || '-';

  el('shiftLabel').textContent = data.shift?.label || '-';
  el('shiftRange').textContent = data.shift?.timeRange || '-';
  el('counterTitle').textContent = `TOTAL BARANG — ${data.shift?.name || '-'}`;

  const newCounter = data.counter || 0;
  counterValueEl.textContent = fmtNumber(newCounter);
  if (lastCounter !== null && newCounter !== lastCounter) pulseCounter();
  lastCounter = newCounter;

  const iotOnline = !!data.iot?.online;
  el('iotStatus').textContent = iotOnline ? 'Online' : 'Offline';
  el('iotStatus').className = `status-value ${iotOnline ? 'status-online' : 'status-offline'}`;
  el('iotStatus').style.fontSize = '1.2rem';
  if (data.sensor?.lastDeviceTime) {
    el('iotLastSeen').textContent = `Data sensor: ${data.sensor.lastDeviceTime}`;
  } else {
    el('iotLastSeen').textContent = data.iot?.lastSeenText ? `Sinyal ${data.iot.lastSeenText}` : '-';
  }

  el('targetPerHour').textContent = fmtNumber(data.target?.perHour);
  el('shiftHours').textContent = data.shift?.durationHours ?? '-';
  el('targetPerShift').textContent = fmtNumber(data.target?.perShift);
  el('currentRate').textContent = fmtNumber(data.analytics?.currentRate);
  el('projection').textContent = fmtNumber(data.analytics?.projection);

  const targetPerShift = data.target?.perShift || 0;
  const projection = data.analytics?.projection || 0;
  projectionWrapEl.className = 'value';
  if (projection < targetPerShift * 0.5) {
    projectionWrapEl.classList.add('red');
  } else if (projection >= targetPerShift) {
    projectionWrapEl.classList.add('green-proj');
  }

  const pct = data.analytics?.progressPercent ?? 0;
  el('progressPercent').textContent = pct;
  progressFillEl.style.width = `${pct}%`;
  progressFillEl.className = `progress-fill ${getProgressColorClass(pct)}`;
  el('progressMax').textContent = `${fmtNumber(targetPerShift)} pcs`;

  el('rateLabel').textContent = data.target?.rateLabel || '-';

  el('dailyTotal').textContent = fmtNumber(data.dailyTotal);
  el('nextShiftName').textContent = data.nextShift?.name || '-';
  el('nextShiftStart').textContent = data.nextShift?.startTime || '-';

  renderDifferenceIndicator(data.analytics);
}

async function syncTargetToServer(pcsPerInterval, intervalSeconds) {
  const targetPerHour = calcPerHour(pcsPerInterval, intervalSeconds);
  await putJson('/api/target', { targetPerHour, pcsPerInterval, intervalSeconds });
}

async function initTargetConfig() {
  const stored = loadTargetFromStorage();
  if (stored) {
    el('inpPcsPerInterval').value = stored.pcsPerInterval;
    el('inpIntervalSeconds').value = stored.intervalSeconds;
    try {
      await syncTargetToServer(stored.pcsPerInterval, stored.intervalSeconds);
    } catch (err) {
      console.warn('Gagal sync target ke server:', err.message);
    }
  } else {
    const target = await fetchJson('/api/target');
    el('inpPcsPerInterval').value = target.pcs_per_interval;
    el('inpIntervalSeconds').value = target.interval_seconds;
    saveTargetToStorage(target.pcs_per_interval, target.interval_seconds);
  }
  updatePreview();
}

async function init() {
  const session = await fetchJson('/api/session');
  if (!session.authenticated) {
    window.location.href = '/';
    return;
  }

  await initTargetConfig();

  const initial = await fetchJson('/api/dashboard');
  render(initial);

  const socket = io();
  socket.on('dashboard:update', (data) => {
    render(data);
  });

  el('btnLogout').addEventListener('click', async () => {
    await postJson('/api/logout', {});
    window.location.href = '/';
  });

  el('inpPcsPerInterval').addEventListener('input', updatePreview);
  el('inpIntervalSeconds').addEventListener('input', updatePreview);

  el('btnEditTarget').addEventListener('click', () => {
    const stored = loadTargetFromStorage();
    if (stored) {
      el('inpPcsPerInterval').value = stored.pcsPerInterval;
      el('inpIntervalSeconds').value = stored.intervalSeconds;
    } else if (latestDashboardData?.target) {
      el('inpPcsPerInterval').value = latestDashboardData.target.pcsPerInterval;
      el('inpIntervalSeconds').value = latestDashboardData.target.intervalSeconds;
    }
    updatePreview();
    setEditMode(true);
  });

  el('btnCancelEdit').addEventListener('click', () => {
    const stored = loadTargetFromStorage();
    if (stored) {
      el('inpPcsPerInterval').value = stored.pcsPerInterval;
      el('inpIntervalSeconds').value = stored.intervalSeconds;
    }
    updatePreview();
    setEditMode(false);
  });

  el('btnSaveTarget').addEventListener('click', async () => {
    try {
      const pcsPerInterval = parseInt(el('inpPcsPerInterval').value, 10);
      const intervalSeconds = parseInt(el('inpIntervalSeconds').value, 10);

      if (!pcsPerInterval || pcsPerInterval < 1 || !intervalSeconds || intervalSeconds < 1) {
        alert('PCS dan DETIK harus angka positif.');
        return;
      }

      saveTargetToStorage(pcsPerInterval, intervalSeconds);
      await syncTargetToServer(pcsPerInterval, intervalSeconds);

      setEditMode(false);

      const updated = await fetchJson('/api/dashboard');
      render(updated);
    } catch (err) {
      alert(err.message);
    }
  });
}

init().catch((e) => {
  console.error(e);
  window.location.href = '/';
});
