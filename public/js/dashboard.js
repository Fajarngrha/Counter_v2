const TARGET_STORAGE_KEY = 'iot_counter_target';

function fmtNumber(n) {
  return new Intl.NumberFormat('id-ID').format(n || 0);
}

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, {
    credentials: 'same-origin',
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Request gagal');
    err.status = res.status;
    throw err;
  }
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
const counterTargetValueEl = el('counterTargetValue');
const progressFillEl = el('progressFill');
const projectionWrapEl = el('projectionWrap');

let lastCounter = null;
let lastTargetTickerValue = null;
let latestDashboardData = null;
let targetTickerState = null;

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

function saveTargetToStorage(model, pcsPerInterval, intervalSeconds) {
  localStorage.setItem(
    TARGET_STORAGE_KEY,
    JSON.stringify({ model, pcsPerInterval, intervalSeconds })
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

function calcLiveIntervalTarget(state) {
  if (!state?.pcsPerInterval || !state?.intervalSeconds) return 0;

  const elapsedNow = state.baseElapsedSeconds + (Date.now() - state.syncedAt) / 1000;
  const elapsedDelta = Math.max(0, elapsedNow - state.baseElapsedSeconds);
  const intervals = Math.floor(elapsedDelta / state.intervalSeconds);
  const value = state.baseValue + intervals * state.pcsPerInterval;
  const max = state.maxValue || value;
  return Math.min(value, max);
}

function syncTargetTickerState(data) {
  targetTickerState = {
    pcsPerInterval: data.target?.pcsPerInterval,
    intervalSeconds: data.target?.intervalSeconds,
    maxValue: data.targetTicker?.max ?? data.target?.perShift,
    baseValue: data.targetTicker?.value ?? 0,
    baseElapsedSeconds: data.progress?.elapsedSeconds ?? 0,
    syncedAt: Date.now(),
  };
  updateTargetTickerDisplay();
}

function updateTargetTickerDisplay() {
  if (!targetTickerState) return;

  const value = calcLiveIntervalTarget(targetTickerState);
  const { maxValue } = targetTickerState;

  counterTargetValueEl.textContent = fmtNumber(value);
  // el('counterTargetRate').textContent = `+${pcsPerInterval} pcs / ${intervalSeconds} dtk`;
  // el('counterTargetMax').textContent = `dari ${fmtNumber(targetPerShift)} pcs shift`;

  const reachedMax = value >= maxValue;
  counterTargetValueEl.classList.toggle('counter-target-value--max', reachedMax);

  if (lastTargetTickerValue !== null && value > lastTargetTickerValue) {
    counterTargetValueEl.classList.add('pulse');
    setTimeout(() => counterTargetValueEl.classList.remove('pulse'), 150);
  }
  lastTargetTickerValue = value;
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

function requestTargetPassword() {
  return new Promise((resolve) => {
    const overlay = el('targetPasswordModal');
    const input = el('inpModalTargetPassword');
    const btnConfirm = el('btnConfirmTargetPassword');
    const btnCancel = el('btnCancelTargetPassword');

    if (!overlay || !input || !btnConfirm || !btnCancel) {
      resolve((window.prompt('Masukkan password validasi untuk menyimpan perubahan target:') || '').trim());
      return;
    }

    const close = (value) => {
      overlay.classList.remove('show');
      overlay.classList.add('hidden');
      btnConfirm.removeEventListener('click', onConfirm);
      btnCancel.removeEventListener('click', onCancel);
      overlay.removeEventListener('click', onOverlayClick);
      input.removeEventListener('keydown', onInputKeydown);
      resolve(value);
    };

    const onConfirm = () => close(input.value.trim());
    const onCancel = () => close('');
    const onOverlayClick = (ev) => {
      if (ev.target === overlay) onCancel();
    };
    const onInputKeydown = (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        onConfirm();
      } else if (ev.key === 'Escape') {
        ev.preventDefault();
        onCancel();
      }
    };

    input.value = '';
    overlay.classList.remove('hidden');
    overlay.classList.add('show');
    btnConfirm.addEventListener('click', onConfirm);
    btnCancel.addEventListener('click', onCancel);
    overlay.addEventListener('click', onOverlayClick);
    input.addEventListener('keydown', onInputKeydown);
    setTimeout(() => input.focus(), 0);
  });
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

  const storedTarget = loadTargetFromStorage();
  const targetModel = data.target?.model || storedTarget?.model || '-';

  el('targetPerHour').textContent = fmtNumber(data.target?.perHour);
  el('targetModel').textContent = targetModel;
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

  syncTargetTickerState(data);
}

async function syncTargetToServer(model, pcsPerInterval, intervalSeconds, editPassword) {
  const targetPerHour = calcPerHour(pcsPerInterval, intervalSeconds);
  await putJson('/api/target', { model, targetPerHour, pcsPerInterval, intervalSeconds, editPassword });
}

async function initTargetConfig() {
  const stored = loadTargetFromStorage();
  if (stored) {
    el('inpModelTarget').value = stored.model || '-';
    el('inpPcsPerInterval').value = stored.pcsPerInterval;
    el('inpIntervalSeconds').value = stored.intervalSeconds;
  } else {
    const target = await fetchJson('/api/target');
    el('inpModelTarget').value = target.model || '-';
    el('inpPcsPerInterval').value = target.pcs_per_interval;
    el('inpIntervalSeconds').value = target.interval_seconds;
    saveTargetToStorage(target.model || '-', target.pcs_per_interval, target.interval_seconds);
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

  setInterval(updateTargetTickerDisplay, 1000);

  if (typeof io === 'function') {
    const socket = io();
    socket.on('dashboard:update', (data) => {
      render(data);
    });
  } else {
    console.warn('Socket.io tidak tersedia — dashboard tetap jalan tanpa update real-time.');
  }

  el('btnLogout').addEventListener('click', async () => {
    await postJson('/api/logout', {});
    window.location.href = '/';
  });

  el('btnResetCounter').addEventListener('click', async () => {
    const current = latestDashboardData?.counter || 0;
    const shiftName = latestDashboardData?.shift?.name || 'shift ini';
    const message = current > 0
      ? `Reset counter ${shiftName} dari ${fmtNumber(current)} ke 0?\n\nData shift akan disimpan ke riwayat sebelum di-reset.`
      : `Reset counter ${shiftName} ke 0?`;

    if (!confirm(message)) return;

    try {
      el('btnResetCounter').disabled = true;
      const data = await postJson('/api/counter/reset', {});
      render(data);
    } catch (err) {
      alert(err.message);
    } finally {
      el('btnResetCounter').disabled = false;
    }
  });

  el('btnResetTargetTicker').addEventListener('click', async () => {
    const current = Number(latestDashboardData?.targetTicker?.value || 0);
    if (current <= 0) return;

    if (!confirm(`Reset Target Saat Ini dari ${fmtNumber(current)} ke 0?`)) return;

    try {
      el('btnResetTargetTicker').disabled = true;
      const data = await postJson('/api/target-ticker/reset', {});
      render(data);
    } catch (err) {
      alert(err.message);
    } finally {
      el('btnResetTargetTicker').disabled = false;
    }
  });

  el('inpPcsPerInterval').addEventListener('input', updatePreview);
  el('inpIntervalSeconds').addEventListener('input', updatePreview);
  el('inpModelTarget').addEventListener('input', () => {
    el('targetModel').textContent = (el('inpModelTarget').value || '').trim() || '-';
  });

  el('btnEditTarget').addEventListener('click', () => {
    const stored = loadTargetFromStorage();
    if (stored) {
      el('inpModelTarget').value = stored.model || '-';
      el('inpPcsPerInterval').value = stored.pcsPerInterval;
      el('inpIntervalSeconds').value = stored.intervalSeconds;
    } else if (latestDashboardData?.target) {
      el('inpModelTarget').value = latestDashboardData.target.model || '-';
      el('inpPcsPerInterval').value = latestDashboardData.target.pcsPerInterval;
      el('inpIntervalSeconds').value = latestDashboardData.target.intervalSeconds;
    }
    updatePreview();
    setEditMode(true);
  });

  el('btnCancelEdit').addEventListener('click', () => {
    const stored = loadTargetFromStorage();
    if (stored) {
      el('inpModelTarget').value = stored.model || '-';
      el('inpPcsPerInterval').value = stored.pcsPerInterval;
      el('inpIntervalSeconds').value = stored.intervalSeconds;
    }
    updatePreview();
    setEditMode(false);
  });

  el('btnSaveTarget').addEventListener('click', async () => {
    try {
      const model = (el('inpModelTarget').value || '').trim() || '-';
      const pcsPerInterval = parseInt(el('inpPcsPerInterval').value, 10);
      const intervalSeconds = parseInt(el('inpIntervalSeconds').value, 10);

      if (!pcsPerInterval || pcsPerInterval < 1 || !intervalSeconds || intervalSeconds < 1) {
        alert('PCS dan DETIK harus angka positif.');
        return;
      }
      const editPassword = await requestTargetPassword();
      if (!editPassword) {
        alert('Simpan dibatalkan. Password validasi wajib diisi.');
        return;
      }

      saveTargetToStorage(model, pcsPerInterval, intervalSeconds);
      await syncTargetToServer(model, pcsPerInterval, intervalSeconds, editPassword);
      // Rebase hitungan "Target Saat Ini" ke target baru agar naik normal dari 0.
      await postJson('/api/target-ticker/reset', {});

      setEditMode(false);

      const updated = await fetchJson('/api/dashboard');
      render(updated);
    } catch (err) {
      alert(err.message);
    }
  });
}

init().catch((e) => {
  console.error('Dashboard init error:', e);
  if (e.status === 401 || e.message === 'Unauthorized') {
    window.location.href = '/';
  }
});
