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

let lastCounter = null;

function pulseCounter() {
  counterValueEl.classList.add('pulse');
  setTimeout(() => counterValueEl.classList.remove('pulse'), 150);
}

function render(data) {
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

  const pct = data.analytics?.progressPercent ?? 0;
  el('progressPercent').textContent = pct;
  progressFillEl.style.width = `${pct}%`;

  el('rateLabel').textContent = data.target?.rateLabel || '-';

  el('dailyTotal').textContent = fmtNumber(data.dailyTotal);
  el('nextShiftName').textContent = data.nextShift?.name || '-';
  el('nextShiftStart').textContent = data.nextShift?.startTime || '-';

  if (data.analytics?.isBehind && (data.analytics?.behind || 0) > 0) {
    alertBoxEl.classList.remove('hidden');
    el('alertText').textContent =
      `Tertinggal ${fmtNumber(data.analytics.behind)} pcs dari ekspektasi waktu saat ini (${fmtNumber(data.analytics.expectedByNow)} pcs)`;
  } else {
    alertBoxEl.classList.add('hidden');
  }
}

async function init() {
  const session = await fetchJson('/api/session');
  if (!session.authenticated) {
    window.location.href = '/';
    return;
  }

  const initial = await fetchJson('/api/dashboard');
  render(initial);

  const socket = io();
  socket.on('dashboard:update', (data) => {
    render(data);
  });

  el('btnManual').addEventListener('click', async () => {
    try {
      const updated = await postJson('/api/increment', { amount: 1 });
      render(updated);
    } catch (err) {
      alert(err.message);
    }
  });

  el('btnLogout').addEventListener('click', async () => {
    await postJson('/api/logout', {});
    window.location.href = '/';
  });

  // Modal edit target
  const modalOverlay = el('modalOverlay');
  const openModal = async () => {
    const target = await fetchJson('/api/target');
    el('inpTargetPerHour').value = target.target_per_hour;
    el('inpPcsPerInterval').value = target.pcs_per_interval;
    el('inpIntervalSeconds').value = target.interval_seconds;
    modalOverlay.classList.add('show');
  };

  const closeModal = () => modalOverlay.classList.remove('show');

  el('btnEditTarget').addEventListener('click', () => openModal().catch((e) => alert(e.message)));
  el('btnCancelModal').addEventListener('click', closeModal);

  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  el('btnSaveTarget').addEventListener('click', async () => {
    try {
      const targetPerHour = parseInt(el('inpTargetPerHour').value, 10);
      const pcsPerInterval = parseInt(el('inpPcsPerInterval').value, 10);
      const intervalSeconds = parseInt(el('inpIntervalSeconds').value, 10);

      await putJson('/api/target', { targetPerHour, pcsPerInterval, intervalSeconds });
      closeModal();
    } catch (err) {
      alert(err.message);
    }
  });
}

init().catch((e) => {
  console.error(e);
  window.location.href = '/';
});

