const TARGET_STORAGE_KEY = 'iot_counter_target';

function fmtNumber(n) {
  return new Intl.NumberFormat('id-ID').format(n || 0);
}

function normalizeModel(value) {
  const text = String(value || '').trim();
  if (!text || text === '-') return '';
  return text;
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

async function deleteJson(url) {
  return fetchJson(url, {
    method: 'DELETE',
  });
}

async function saveShiftConfig(shifts, editPassword) {
  const payload = { shifts, editPassword };
  try {
    return await putJson('/api/shifts', payload);
  } catch (err) {
    const networkError = err instanceof TypeError || /failed to fetch/i.test(String(err?.message || ''));
    if (!networkError) throw err;
    // Fallback untuk proxy/WAF yang blok method PUT.
    return postJson('/api/shifts', payload);
  }
}

const el = (id) => document.getElementById(id);

const counterValueEl = el('counterValue');
const counterTargetValueEl = el('counterTargetValue');
const progressFillEl = el('progressFill');
const projectionWrapEl = el('projectionWrap');
const deviceGridEl = el('deviceGrid');
const fleetOnlineDevicesEl = el('fleetOnlineDevices');
const fleetTotalDevicesEl = el('fleetTotalDevices');
const fleetAggregateCounterEl = el('fleetAggregateCounter');
const fleetSelectedDeviceEl = el('fleetSelectedDevice');
const btnAddDeviceEl = el('btnAddDevice');
const targetPerDeviceModalEl = el('targetPerDeviceModal');
const lblTargetDeviceEl = el('lblTargetDevice');
const inpModalModelTargetEl = el('inpModalModelTarget');
const inpModalPcsPerIntervalEl = el('inpModalPcsPerInterval');
const inpModalIntervalSecondsEl = el('inpModalIntervalSeconds');
const btnSavePerDeviceTargetEl = el('btnSavePerDeviceTarget');
const btnCancelPerDeviceTargetEl = el('btnCancelPerDeviceTarget');
const addDeviceModalEl = el('addDeviceModal');
const inpAddDeviceMachineNameEl = el('inpAddDeviceMachineName');
const btnCancelAddDeviceEl = el('btnCancelAddDevice');
const btnSaveAddDeviceEl = el('btnSaveAddDevice');
const addDeviceHintEl = el('addDeviceHint');
const deviceIdResultModalEl = el('deviceIdResultModal');
const inpResultDeviceIdEl = el('inpResultDeviceId');
const resultDeviceHintEl = el('resultDeviceHint');
const btnCloseDeviceIdResultEl = el('btnCloseDeviceIdResult');
const btnCopyDeviceIdResultEl = el('btnCopyDeviceIdResult');
const renameDeviceModalEl = el('renameDeviceModal');
const lblRenameDeviceIdEl = el('lblRenameDeviceId');
const inpRenameDeviceLabelEl = el('inpRenameDeviceLabel');
const renameDeviceHintEl = el('renameDeviceHint');
const btnCancelRenameDeviceEl = el('btnCancelRenameDevice');
const btnSaveRenameDeviceEl = el('btnSaveRenameDevice');

let lastCounter = null;
let lastTargetTickerValue = null;
let latestDashboardData = null;
let targetTickerState = null;
let selectedDeviceId = null;
let editingTargetDeviceId = null;
let deviceMenuOutsideListenerBound = false;
let deviceGridHandlersBound = false;
let openedDeviceMenuId = null;
let renamingDeviceId = null;

function showToast(message, variant = 'info') {
  const text = String(message || '').trim();
  if (!text) return;

  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast--${variant}`;
  toast.textContent = text;
  container.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('show'));

  const close = () => {
    toast.classList.remove('show');
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
      if (container && container.childElementCount === 0) {
        container.remove();
      }
    }, 180);
  };

  setTimeout(close, 2200);
}

function closeAllDeviceMenus() {
  openedDeviceMenuId = null;
  if (!deviceGridEl) return;
  deviceGridEl.querySelectorAll('.device-menu').forEach((m) => m.classList.remove('is-open'));
  deviceGridEl.querySelectorAll('.js-device-menu-toggle').forEach((b) => b.setAttribute('aria-expanded', 'false'));
}

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

function showAddDeviceModal(show) {
  if (!addDeviceModalEl) return;
  addDeviceModalEl.classList.toggle('hidden', !show);
  addDeviceModalEl.classList.toggle('show', show);
  if (show) {
    if (addDeviceHintEl) addDeviceHintEl.textContent = 'Isi nama mesin lalu klik Simpan.';
    setTimeout(() => inpAddDeviceMachineNameEl?.focus(), 0);
  }
}

function showDeviceIdResultModal(show) {
  if (!deviceIdResultModalEl) return;
  deviceIdResultModalEl.classList.toggle('hidden', !show);
  deviceIdResultModalEl.classList.toggle('show', show);
}

function showRenameDeviceModal(show) {
  if (!renameDeviceModalEl) return;
  renameDeviceModalEl.classList.toggle('hidden', !show);
  renameDeviceModalEl.classList.toggle('show', show);
  if (!show) {
    renamingDeviceId = null;
    return;
  }
  setTimeout(() => inpRenameDeviceLabelEl?.focus(), 0);
}

function saveTargetToStorage(model, pcsPerInterval, intervalSeconds) {
  localStorage.setItem(
    TARGET_STORAGE_KEY,
    JSON.stringify({ model: normalizeModel(model) || '-', pcsPerInterval, intervalSeconds })
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

async function refreshDashboard(forceDeviceId) {
  const deviceId = forceDeviceId || selectedDeviceId;
  const query = deviceId ? `?deviceId=${encodeURIComponent(deviceId)}` : '';
  return fetchJson(`/api/dashboard${query}`);
}

function syncTargetTickerState(data) {
  targetTickerState = {
    maxValue: data.targetTicker?.max ?? data.target?.perShift,
    baseValue: data.targetTicker?.value ?? 0,
  };
  updateTargetTickerDisplay();
}

function updateTargetTickerDisplay() {
  if (!targetTickerState) return;

  const value = Number(targetTickerState.baseValue || 0);
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

function toTimeInputValue(hour, minute) {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function parseTimeInput(value) {
  const text = String(value || '').trim();
  const matched = text.match(/^(\d{2}):(\d{2})$/);
  if (!matched) return null;
  const hour = Number(matched[1]);
  const minute = Number(matched[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function normalizeBreaks(shift) {
  if (Array.isArray(shift?.breaks)) {
    return shift.breaks
      .filter((b) => Number.isInteger(b?.startHour) && Number.isInteger(b?.startMin)
        && Number.isInteger(b?.endHour) && Number.isInteger(b?.endMin))
      .slice(0, 2);
  }

  if (
    Number.isInteger(shift?.breakStartHour)
    && Number.isInteger(shift?.breakStartMin)
    && Number.isInteger(shift?.breakEndHour)
    && Number.isInteger(shift?.breakEndMin)
  ) {
    return [{
      startHour: shift.breakStartHour,
      startMin: shift.breakStartMin,
      endHour: shift.breakEndHour,
      endMin: shift.breakEndMin,
    }];
  }
  return [];
}

function setSecondBreakVisibility(prefix, visible) {
  const rowEl = el(`shift${prefix}BreakRow2`);
  const btnEl = el(`btnShift${prefix}AddBreak`);
  if (rowEl) rowEl.classList.toggle('hidden', !visible);
  if (btnEl) btnEl.textContent = visible ? '−' : '+';
}

function setBreakTimeInputs(prefix, shift) {
  const breaks = normalizeBreaks(shift);
  const first = breaks[0] || null;
  const second = breaks[1] || null;

  el(`inpShift${prefix}Break1Start`).value = first ? toTimeInputValue(first.startHour, first.startMin) : '';
  el(`inpShift${prefix}Break1End`).value = first ? toTimeInputValue(first.endHour, first.endMin) : '';
  el(`inpShift${prefix}Break2Start`).value = second ? toTimeInputValue(second.startHour, second.startMin) : '';
  el(`inpShift${prefix}Break2End`).value = second ? toTimeInputValue(second.endHour, second.endMin) : '';
  setSecondBreakVisibility(prefix, !!second);
}

function parseBreakInputs(prefix, shiftName) {
  const ranges = [
    {
      idx: 1,
      startRaw: el(`inpShift${prefix}Break1Start`).value,
      endRaw: el(`inpShift${prefix}Break1End`).value,
    },
    {
      idx: 2,
      startRaw: el(`inpShift${prefix}Break2Start`).value,
      endRaw: el(`inpShift${prefix}Break2End`).value,
    },
  ];

  const breaks = [];
  for (const range of ranges) {
    if (!range.startRaw && !range.endRaw) continue;
    if (!range.startRaw || !range.endRaw) {
      throw new Error(`Jam istirahat ke-${range.idx} ${shiftName} harus diisi lengkap.`);
    }
    const start = parseTimeInput(range.startRaw);
    const end = parseTimeInput(range.endRaw);
    if (!start || !end) {
      throw new Error(`Jam istirahat ke-${range.idx} ${shiftName} belum valid. Gunakan HH:MM.`);
    }
    breaks.push({
      startHour: start.hour,
      startMin: start.minute,
      endHour: end.hour,
      endMin: end.minute,
    });
  }

  return breaks;
}

async function fetchShiftConfig() {
  const data = await fetchJson('/api/shifts');
  return data.shifts || [];
}

function populateShiftForm(shifts) {
  const byName = Object.fromEntries((shifts || []).map((s) => [s.name, s]));
  const s1 = byName['Shift 1'] || { startHour: 7, startMin: 0, endHour: 16, endMin: 0 };
  const s2 = byName['Shift 2'] || { startHour: 16, startMin: 0, endHour: 23, endMin: 0 };
  const s3 = byName['Shift 3'] || { startHour: 23, startMin: 0, endHour: 7, endMin: 0 };

  el('inpShift1Start').value = toTimeInputValue(s1.startHour, s1.startMin);
  el('inpShift1End').value = toTimeInputValue(s1.endHour, s1.endMin);
  el('inpShift2Start').value = toTimeInputValue(s2.startHour, s2.startMin);
  el('inpShift2End').value = toTimeInputValue(s2.endHour, s2.endMin);
  el('inpShift3Start').value = toTimeInputValue(s3.startHour, s3.startMin);
  el('inpShift3End').value = toTimeInputValue(s3.endHour, s3.endMin);
  setBreakTimeInputs('1', s1);
  setBreakTimeInputs('2', s2);
  setBreakTimeInputs('3', s3);
}

function collectShiftForm() {
  const rows = [
    { name: 'Shift 1', prefix: '1', start: el('inpShift1Start').value, end: el('inpShift1End').value },
    { name: 'Shift 2', prefix: '2', start: el('inpShift2Start').value, end: el('inpShift2End').value },
    { name: 'Shift 3', prefix: '3', start: el('inpShift3Start').value, end: el('inpShift3End').value },
  ];

  return rows.map((row) => {
    const start = parseTimeInput(row.start);
    const end = parseTimeInput(row.end);
    if (!start || !end) {
      throw new Error(`Jam ${row.name} belum valid. Gunakan format HH:MM.`);
    }
    return {
      name: row.name,
      startHour: start.hour,
      startMin: start.minute,
      endHour: end.hour,
      endMin: end.minute,
      breaks: parseBreakInputs(row.prefix, row.name),
    };
  });
}

function showShiftModal(show) {
  const overlay = el('shiftConfigModal');
  if (!overlay) return;
  overlay.classList.toggle('hidden', !show);
  overlay.classList.toggle('show', show);
}

function requestTargetPassword(options = {}) {
  return new Promise((resolve) => {
    const overlay = el('targetPasswordModal');
    const input = el('inpModalTargetPassword');
    const btnConfirm = el('btnConfirmTargetPassword');
    const btnCancel = el('btnCancelTargetPassword');
    const titleEl = overlay?.querySelector('h3');
    const labelEl = overlay?.querySelector('label[for="inpModalTargetPassword"]');
    const defaultTitle = titleEl?.textContent || 'Validasi Simpan Target';
    const defaultLabel = labelEl?.textContent || 'Password';
    const defaultPlaceholder = input?.placeholder || 'Masukkan password validasi';
    const title = options.title || defaultTitle;
    const label = options.label || defaultLabel;
    const placeholder = options.placeholder || defaultPlaceholder;

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
      if (titleEl) titleEl.textContent = defaultTitle;
      if (labelEl) labelEl.textContent = defaultLabel;
      input.placeholder = defaultPlaceholder;
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
    if (titleEl) titleEl.textContent = title;
    if (labelEl) labelEl.textContent = label;
    input.placeholder = placeholder;
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
  if (!selectedDeviceId) {
    selectedDeviceId = data.selectedDeviceId || null;
  } else {
    const hasSelected = Array.isArray(data.devices) && data.devices.some((device) => device.id === selectedDeviceId);
    if (!hasSelected) {
      selectedDeviceId = data.selectedDeviceId || selectedDeviceId;
    }
  }

  el('timeNow').textContent = data.time || '--.--.--';
  el('dateNow').textContent = data.date || '-';

  el('shiftLabel').textContent = data.shift?.label || '-';
  el('shiftRange').textContent = data.shift?.timeRange || '-';
  el('counterTitle').textContent = `TOTAL BARANG — ${data.shift?.name || '-'}${selectedDeviceId ? ` (${selectedDeviceId})` : ''}`;

  const newCounter = data.counter || 0;
  counterValueEl.textContent = fmtNumber(newCounter);
  if (lastCounter !== null && newCounter !== lastCounter) pulseCounter();
  lastCounter = newCounter;

  const iotOnline = !!data.iot?.online;
  const totalDevices = Number(data.totals?.totalDevices || data.devices?.length || 0);
  const onlineDevices = Number(data.totals?.onlineDevices || 0);
  el('iotStatus').textContent = iotOnline ? `Online (${onlineDevices}/${totalDevices})` : `Offline (0/${totalDevices})`;
  el('iotStatus').className = `status-value ${iotOnline ? 'status-online' : 'status-offline'}`;
  el('iotStatus').style.fontSize = '1.2rem';
  if (data.sensor?.lastDeviceTime) {
    el('iotLastSeen').textContent = `Data sensor: ${data.sensor.lastDeviceTime}`;
  } else {
    el('iotLastSeen').textContent = data.iot?.lastSeenText ? `Sinyal ${data.iot.lastSeenText}` : '-';
  }

  const storedTarget = loadTargetFromStorage();
  const targetModel = normalizeModel(data.target?.model)
    || normalizeModel(storedTarget?.model)
    || '-';

  el('targetPerHour').textContent = fmtNumber(data.target?.perHour);
  el('targetModel').textContent = targetModel;
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

  if (fleetOnlineDevicesEl) fleetOnlineDevicesEl.textContent = fmtNumber(onlineDevices);
  if (fleetTotalDevicesEl) fleetTotalDevicesEl.textContent = fmtNumber(totalDevices);
  if (fleetAggregateCounterEl) fleetAggregateCounterEl.textContent = fmtNumber(data.aggregateCounter || data.totals?.counter || 0);
  if (fleetSelectedDeviceEl) fleetSelectedDeviceEl.textContent = selectedDeviceId || '-';

  renderDeviceCards(data.devices || [], selectedDeviceId);

  syncTargetTickerState(data);
}

function renderDeviceCards(devices, activeDeviceId) {
  if (!deviceGridEl) return;
  if (!Array.isArray(devices) || devices.length === 0) {
    deviceGridEl.innerHTML = '<div class="device-meta">Belum ada device aktif.</div>';
    return;
  }

  deviceGridEl.innerHTML = devices.map((device) => {
    const isActive = device.id === activeDeviceId;
    const isMenuOpen = openedDeviceMenuId === device.id;
    const statusClass = device.iot?.online ? 'status-online' : 'status-offline';
    const statusText = device.iot?.online ? 'Online' : 'Offline';
    const machineTitle = device.label || `Mesin ${device.id}`;
    return `
      <div class="device-item ${isActive ? 'device-item--active' : ''}" data-device-id="${device.id}" role="button" tabindex="0">
        <div class="device-item-top">
          <span class="device-id">${machineTitle}</span>
          <div class="device-top-right">
            <span class="device-status-badge ${statusClass}">${statusText}</span>
            <div class="device-menu-wrap">
              <button
                class="btn-icon btn-icon--small js-device-menu-toggle"
                type="button"
                title="Aksi device"
                aria-label="Aksi device ${device.id}"
                aria-expanded="${isMenuOpen ? 'true' : 'false'}"
              >&#8942;</button>
              <div class="device-menu ${isMenuOpen ? 'is-open' : ''}" data-device-menu="${device.id}">
                <button class="btn btn-ghost btn-sm js-device-action-copy-id" type="button" data-device-id="${device.id}">Copy Device ID</button>
                <button class="btn btn-ghost btn-sm js-device-action-rename" type="button" data-device-id="${device.id}" data-device-label="${machineTitle}">Ubah Nama</button>
                <button class="btn btn-danger btn-sm js-device-action-delete" type="button" data-device-id="${device.id}" data-device-label="${machineTitle}">Hapus</button>
              </div>
            </div>
          </div>
        </div>
        <div class="device-count">${fmtNumber(device.count)}</div>
        <div class="device-meta">
          <span>Target Saat Ini: ${fmtNumber(device.targetTicker?.value || 0)}</span>
        </div>
      </div>
    `;
  }).join('');

  if (!deviceGridHandlersBound) {
    deviceGridEl.addEventListener('click', async (ev) => {
      const toggleBtn = ev.target.closest('.js-device-menu-toggle');
      if (toggleBtn) {
        ev.stopPropagation();
        const card = toggleBtn.closest('.device-item[data-device-id]');
        const deviceId = card?.getAttribute('data-device-id');
        if (!deviceId) return;
        const isOpening = openedDeviceMenuId !== deviceId;
        closeAllDeviceMenus();
        if (isOpening) {
          openedDeviceMenuId = deviceId;
          const wrap = toggleBtn.closest('.device-menu-wrap');
          const menu = wrap?.querySelector('.device-menu');
          if (menu) menu.classList.add('is-open');
          toggleBtn.setAttribute('aria-expanded', 'true');
        }
        return;
      }

      const renameBtn = ev.target.closest('.js-device-action-rename');
      if (renameBtn) {
        ev.stopPropagation();
        const deviceId = renameBtn.getAttribute('data-device-id');
        const currentLabel = renameBtn.getAttribute('data-device-label') || `Mesin ${deviceId}`;
        if (!deviceId) return;
        renamingDeviceId = deviceId;
        if (lblRenameDeviceIdEl) lblRenameDeviceIdEl.textContent = deviceId;
        if (inpRenameDeviceLabelEl) inpRenameDeviceLabelEl.value = currentLabel;
        if (renameDeviceHintEl) renameDeviceHintEl.textContent = 'Masukkan nama mesin lalu klik Simpan.';
        closeAllDeviceMenus();
        showRenameDeviceModal(true);
        return;
      }

      const copyIdBtn = ev.target.closest('.js-device-action-copy-id');
      if (copyIdBtn) {
        ev.stopPropagation();
        const deviceId = copyIdBtn.getAttribute('data-device-id');
        if (!deviceId) return;
        try {
          if (navigator?.clipboard?.writeText) {
            await navigator.clipboard.writeText(deviceId);
          } else {
            const tmp = document.createElement('input');
            tmp.value = deviceId;
            document.body.appendChild(tmp);
            tmp.select();
            document.execCommand('copy');
            document.body.removeChild(tmp);
          }
          closeAllDeviceMenus();
          showToast(`Device ID copied: ${deviceId}`, 'success');
        } catch {
          showToast('Gagal copy Device ID', 'error');
        }
        return;
      }

      const deleteBtn = ev.target.closest('.js-device-action-delete');
      if (deleteBtn) {
        ev.stopPropagation();
        const deviceId = deleteBtn.getAttribute('data-device-id');
        const deviceLabel = deleteBtn.getAttribute('data-device-label') || deviceId;
        if (!deviceId) return;
        const ok = window.confirm(`Hapus device "${deviceLabel}" (${deviceId})?\nData state device akan dihapus dari dashboard.`);
        if (!ok) return;
        try {
          const res = await deleteJson(`/api/devices/${encodeURIComponent(deviceId)}`);
          selectedDeviceId = res.selectedDeviceId || selectedDeviceId;
          closeAllDeviceMenus();
          render(res.dashboard || await refreshDashboard(selectedDeviceId));
        } catch (err) {
          showToast(err.message || 'Gagal menghapus device', 'error');
        }
        return;
      }

      if (ev.target.closest('.device-menu-wrap')) return;

      const card = ev.target.closest('.device-item[data-device-id]');
      if (!card) return;
      const nextDeviceId = card.getAttribute('data-device-id');
      if (!nextDeviceId || nextDeviceId === selectedDeviceId) return;
      selectedDeviceId = nextDeviceId;
      try {
        closeAllDeviceMenus();
        const latest = await refreshDashboard(nextDeviceId);
        render(latest);
      } catch (err) {
        showToast(err.message || 'Gagal memuat data device', 'error');
      }
    });

    deviceGridEl.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      const card = ev.target.closest('.device-item[data-device-id]');
      if (!card) return;
      if (ev.target.closest('.device-menu-wrap')) return;
      ev.preventDefault();
      card.click();
    });

    deviceGridHandlersBound = true;
  }

  if (!deviceMenuOutsideListenerBound) {
    document.addEventListener('click', (ev) => {
      if (ev.target && ev.target.closest && ev.target.closest('.device-menu-wrap')) return;
      closeAllDeviceMenus();
    });
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') closeAllDeviceMenus();
    });
    deviceMenuOutsideListenerBound = true;
  }
}

function openPerDeviceTargetModal(deviceId) {
  editingTargetDeviceId = deviceId;
  if (lblTargetDeviceEl) lblTargetDeviceEl.textContent = deviceId;

  const target = (latestDashboardData?.devices || []).find((d) => d.id === deviceId)?.target || latestDashboardData?.target || {};
  if (inpModalModelTargetEl) inpModalModelTargetEl.value = target.model || '-';
  if (inpModalPcsPerIntervalEl) inpModalPcsPerIntervalEl.value = target.pcsPerInterval || 1;
  if (inpModalIntervalSecondsEl) inpModalIntervalSecondsEl.value = target.intervalSeconds || 1;

  targetPerDeviceModalEl?.classList.remove('hidden');
  targetPerDeviceModalEl?.classList.add('show');
}

function closePerDeviceTargetModal() {
  editingTargetDeviceId = null;
  targetPerDeviceModalEl?.classList.remove('show');
  targetPerDeviceModalEl?.classList.add('hidden');
}

async function syncTargetToServer(model, pcsPerInterval, intervalSeconds, editPassword, deviceId) {
  const targetPerHour = calcPerHour(pcsPerInterval, intervalSeconds);
  await putJson('/api/target', {
    model,
    targetPerHour,
    pcsPerInterval,
    intervalSeconds,
    editPassword,
    deviceId,
  });
}

async function initTargetConfig() {
  const stored = loadTargetFromStorage();
  if (stored) {
    el('inpModelTarget').value = stored.model || '-';
    el('inpPcsPerInterval').value = stored.pcsPerInterval;
    el('inpIntervalSeconds').value = stored.intervalSeconds;
  } else {
    const query = selectedDeviceId ? `?deviceId=${encodeURIComponent(selectedDeviceId)}` : '';
    const target = await fetchJson(`/api/target${query}`);
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

  const initial = await refreshDashboard();
  render(initial);
  await initTargetConfig();

  if (typeof io === 'function') {
    const socket = io();
    socket.on('dashboard:update', async (data) => {
      if (selectedDeviceId && data.selectedDeviceId && data.selectedDeviceId !== selectedDeviceId) {
        try {
          const fresh = await refreshDashboard(selectedDeviceId);
          render(fresh);
          return;
        } catch (err) {
          console.warn('Gagal sinkron dashboard device terpilih:', err.message);
        }
      }
      render(data);
    });
  } else {
    console.warn('Socket.io tidak tersedia — dashboard tetap jalan tanpa update real-time.');
  }

  el('btnLogout').addEventListener('click', async () => {
    await postJson('/api/logout', {});
    window.location.href = '/';
  });

  btnAddDeviceEl?.addEventListener('click', async () => {
    if (inpAddDeviceMachineNameEl) inpAddDeviceMachineNameEl.value = '';
    showAddDeviceModal(true);
  });

  btnCancelAddDeviceEl?.addEventListener('click', () => {
    showAddDeviceModal(false);
  });

  addDeviceModalEl?.addEventListener('click', (ev) => {
    if (ev.target === addDeviceModalEl) showAddDeviceModal(false);
  });

  deviceIdResultModalEl?.addEventListener('click', (ev) => {
    if (ev.target === deviceIdResultModalEl) showDeviceIdResultModal(false);
  });

  btnCloseDeviceIdResultEl?.addEventListener('click', () => {
    showDeviceIdResultModal(false);
  });

  btnCopyDeviceIdResultEl?.addEventListener('click', async () => {
    const value = String(inpResultDeviceIdEl?.value || '').trim();
    if (!value) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        inpResultDeviceIdEl?.focus();
        inpResultDeviceIdEl?.select();
        document.execCommand('copy');
      }
      if (resultDeviceHintEl) resultDeviceHintEl.textContent = `Device ID berhasil di-copy: ${value}`;
      showToast(`Device ID copied: ${value}`, 'success');
    } catch {
      if (resultDeviceHintEl) resultDeviceHintEl.textContent = 'Gagal copy otomatis. Silakan copy manual dari field Device ID.';
      showToast('Gagal copy Device ID', 'error');
    }
  });

  renameDeviceModalEl?.addEventListener('click', (ev) => {
    if (ev.target === renameDeviceModalEl) showRenameDeviceModal(false);
  });

  btnCancelRenameDeviceEl?.addEventListener('click', () => {
    showRenameDeviceModal(false);
  });

  btnSaveRenameDeviceEl?.addEventListener('click', async () => {
    const deviceId = String(renamingDeviceId || '').trim();
    const label = String(inpRenameDeviceLabelEl?.value || '').trim();
    if (!deviceId) return;
    if (!label) {
      if (renameDeviceHintEl) renameDeviceHintEl.textContent = 'Nama mesin wajib diisi.';
      return;
    }

    try {
      const res = await putJson(`/api/devices/${encodeURIComponent(deviceId)}`, { label });
      selectedDeviceId = deviceId;
      showRenameDeviceModal(false);
      render(res.dashboard || await refreshDashboard(deviceId));
      showToast('Nama mesin berhasil diubah', 'success');
    } catch (err) {
      if (renameDeviceHintEl) renameDeviceHintEl.textContent = err.message || 'Gagal ubah nama mesin';
      showToast(err.message || 'Gagal ubah nama mesin', 'error');
    }
  });

  btnSaveAddDeviceEl?.addEventListener('click', async () => {
    const label = String(inpAddDeviceMachineNameEl?.value || '').trim();
    if (!label) {
      if (addDeviceHintEl) addDeviceHintEl.textContent = 'Nama mesin wajib diisi.';
      return;
    }
    try {
      const res = await postJson('/api/devices', { label });
      selectedDeviceId = res.deviceId || selectedDeviceId;
      render(res.dashboard || await refreshDashboard(selectedDeviceId));
      if (res.deviceId) {
        showAddDeviceModal(false);
        if (inpResultDeviceIdEl) inpResultDeviceIdEl.value = res.deviceId;
        if (resultDeviceHintEl) resultDeviceHintEl.textContent = 'Salin Device ID ini ke firmware ESP.';
        showDeviceIdResultModal(true);
      }
    } catch (err) {
      if (addDeviceHintEl) addDeviceHintEl.textContent = err.message || 'Gagal menambah device';
    }
  });

  btnCancelPerDeviceTargetEl?.addEventListener('click', closePerDeviceTargetModal);
  targetPerDeviceModalEl?.addEventListener('click', (ev) => {
    if (ev.target === targetPerDeviceModalEl) closePerDeviceTargetModal();
  });

  btnSavePerDeviceTargetEl?.addEventListener('click', async () => {
    if (!editingTargetDeviceId) return;
    try {
      const model = normalizeModel(inpModalModelTargetEl?.value) || '-';
      const pcsPerInterval = parseInt(inpModalPcsPerIntervalEl?.value, 10);
      const intervalSeconds = parseInt(inpModalIntervalSecondsEl?.value, 10);
      if (!pcsPerInterval || pcsPerInterval < 1 || !intervalSeconds || intervalSeconds < 1) {
        showToast('PCS dan DETIK harus angka positif.', 'error');
        return;
      }

      const editPassword = await requestTargetPassword({
        title: `Validasi Simpan Target (${editingTargetDeviceId})`,
        label: 'Password',
        placeholder: 'Masukkan password untuk simpan target',
      });
      if (!editPassword) return;

      await syncTargetToServer(model, pcsPerInterval, intervalSeconds, editPassword, editingTargetDeviceId);
      await postJson('/api/target-ticker/reset', { deviceId: editingTargetDeviceId });
      const latest = await refreshDashboard(editingTargetDeviceId);
      selectedDeviceId = editingTargetDeviceId;
      closePerDeviceTargetModal();
      render(latest);
    } catch (err) {
      showToast(err.message || 'Gagal simpan target', 'error');
    }
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
      const data = await postJson('/api/counter/reset', { deviceId: selectedDeviceId });
      render(data);
    } catch (err) {
      showToast(err.message || 'Gagal reset counter', 'error');
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
      const data = await postJson('/api/target-ticker/reset', { deviceId: selectedDeviceId });
      render(data);
    } catch (err) {
      showToast(err.message || 'Gagal reset target saat ini', 'error');
    } finally {
      el('btnResetTargetTicker').disabled = false;
    }
  });

  el('btnEditShift').addEventListener('click', async () => {
    try {
      const shifts = await fetchShiftConfig();
      populateShiftForm(shifts);
      showShiftModal(true);
    } catch (err) {
      showToast(err.message || 'Gagal membuka edit shift', 'error');
    }
  });

  ['1', '2', '3'].forEach((prefix) => {
    el(`btnShift${prefix}AddBreak`).addEventListener('click', () => {
      const rowEl = el(`shift${prefix}BreakRow2`);
      const showing = rowEl && !rowEl.classList.contains('hidden');
      if (showing) {
        el(`inpShift${prefix}Break2Start`).value = '';
        el(`inpShift${prefix}Break2End`).value = '';
      }
      setSecondBreakVisibility(prefix, !showing);
    });
  });

  el('btnCancelShiftConfig').addEventListener('click', () => {
    showShiftModal(false);
  });

  el('shiftConfigModal').addEventListener('click', (ev) => {
    if (ev.target === el('shiftConfigModal')) {
      showShiftModal(false);
    }
  });

  el('btnSaveShiftConfig').addEventListener('click', async () => {
    try {
      const shifts = collectShiftForm();
      const editPassword = await requestTargetPassword({
        title: 'Validasi Simpan Jadwal Shift',
        label: 'Password',
        placeholder: 'Masukkan password untuk simpan jadwal shift',
      });
      if (!editPassword) {
        showToast('Simpan jadwal shift dibatalkan. Password wajib diisi.', 'error');
        return;
      }
      const res = await saveShiftConfig(shifts, editPassword);
      showShiftModal(false);
      render(res.dashboard || await fetchJson('/api/dashboard'));
    } catch (err) {
      const networkError = err instanceof TypeError || /failed to fetch/i.test(String(err?.message || ''));
      showToast(
        networkError
          ? 'Tidak bisa terhubung ke server saat simpan shift. Coba refresh halaman lalu ulangi.'
          : (err.message || 'Gagal simpan jadwal shift'),
        'error'
      );
    }
  });

  el('inpPcsPerInterval').addEventListener('input', updatePreview);
  el('inpIntervalSeconds').addEventListener('input', updatePreview);
  el('inpModelTarget').addEventListener('input', () => {
    el('targetModel').textContent = normalizeModel(el('inpModelTarget').value) || '-';
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
      const model = normalizeModel(el('inpModelTarget').value) || '-';
      const pcsPerInterval = parseInt(el('inpPcsPerInterval').value, 10);
      const intervalSeconds = parseInt(el('inpIntervalSeconds').value, 10);

      if (!pcsPerInterval || pcsPerInterval < 1 || !intervalSeconds || intervalSeconds < 1) {
        showToast('PCS dan DETIK harus angka positif.', 'error');
        return;
      }
      const editPassword = await requestTargetPassword();
      if (!editPassword) {
        showToast('Simpan dibatalkan. Password validasi wajib diisi.', 'error');
        return;
      }

      saveTargetToStorage(model, pcsPerInterval, intervalSeconds);
      await syncTargetToServer(model, pcsPerInterval, intervalSeconds, editPassword, selectedDeviceId);
      // Rebase hitungan "Target Saat Ini" ke target baru agar naik normal dari 0.
      await postJson('/api/target-ticker/reset', { deviceId: selectedDeviceId });

      setEditMode(false);

      const updated = await refreshDashboard(selectedDeviceId);
      render(updated);
    } catch (err) {
      showToast(err.message || 'Gagal simpan target', 'error');
    }
  });
}

init().catch((e) => {
  console.error('Dashboard init error:', e);
  if (e.status === 401 || e.message === 'Unauthorized') {
    window.location.href = '/';
  }
});
