function esc(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function fmtNumber(n) {
  return new Intl.NumberFormat('id-ID').format(n || 0);
}

async function fetchJson(url) {
  const res = await fetch(url, { credentials: 'same-origin' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request gagal');
  return data;
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request gagal');
  return data;
}

let currentRows = [];

function getAchievementClass(pct) {
  if (pct >= 100) return 'ach-green';
  if (pct >= 80) return 'ach-yellow';
  return 'ach-red';
}

function getProgressClass(pct) {
  if (pct >= 100) return 'mini-progress-fill--green';
  if (pct >= 80) return 'mini-progress-fill--yellow';
  return 'mini-progress-fill--red';
}

function getTrendIcon(pct) {
  if (pct >= 100) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>`;
  }
  if (pct >= 80) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
  }
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"></polyline><polyline points="17 18 23 18 23 12"></polyline></svg>`;
}

function formatTanggalLabel(isoDate) {
  const d = new Date(`${isoDate}T12:00:00`);
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);
}

function formatSavedAt(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(d).replace(',', ',');
}

function shiftBadgeClass(shift) {
  if (shift === 'Shift 1') return 'shift-badge shift-badge--1';
  if (shift === 'Shift 2') return 'shift-badge shift-badge--2';
  return 'shift-badge shift-badge--3';
}

function renderDeviceFilterOptions(devices = []) {
  const select = document.getElementById('deviceFilter');
  if (!select) return;
  const current = select.value || 'all';
  const list = Array.isArray(devices) ? devices : [];
  select.innerHTML = [
    '<option value="all">Semua Device</option>',
    ...list.map((deviceId) => `<option value="${esc(deviceId)}">${esc(deviceId)}</option>`),
  ].join('');

  const stillExists = current === 'all' || list.includes(current);
  select.value = stillExists ? current : 'all';
}

function renderSummary(summary) {
  const pct = summary.overallAchievement || 0;
  document.getElementById('sumRecords').textContent = fmtNumber(summary.totalRecords);
  document.getElementById('sumBarang').textContent = fmtNumber(summary.totalBarang);
  document.getElementById('sumTarget').textContent = fmtNumber(summary.totalTarget);

  const achEl = document.getElementById('sumAchievement');
  achEl.textContent = `${pct}%`;
  achEl.className = `summary-value ${getAchievementClass(pct)}`;

  const fill = document.getElementById('sumAchievementFill');
  fill.style.width = `${Math.min(100, pct)}%`;
  fill.className = `mini-progress-fill ${getProgressClass(pct)}`;
}

function renderRows(rows) {
  currentRows = rows;
  const tbody = document.getElementById('tbody');
  const empty = document.getElementById('emptyState');
  const wrap = document.getElementById('tableWrap');

  if (!rows.length) {
    tbody.innerHTML = '';
    wrap.style.display = 'none';
    empty.style.display = 'block';
    return;
  }

  wrap.style.display = 'block';
  empty.style.display = 'none';

  tbody.innerHTML = rows
    .map((r) => {
      const pct = r.achievement_percent || 0;
      const achClass = getAchievementClass(pct);
      const progClass = getProgressClass(pct);

      return `
        <tr>
          <td>${esc(formatTanggalLabel(r.tanggal))}</td>
          <td><span class="${shiftBadgeClass(r.shift)}">${esc(r.shift)}</span></td>
          <td>${esc(r.device_id || 'legacy')}</td>
          <td class="total-cell">${fmtNumber(r.total_barang)} pcs</td>
          <td class="target-cell">${fmtNumber(r.target_per_hour)} pcs/jam</td>
          <td class="target-cell">${fmtNumber(r.target_per_shift)} pcs</td>
          <td>
            <span class="achievement-cell ${achClass}">
              ${getTrendIcon(pct)}
              ${pct}%
            </span>
          </td>
          <td class="progress-cell">
            <div class="mini-progress-bar">
              <div class="mini-progress-fill ${progClass}" style="width:${Math.min(100, pct)}%"></div>
            </div>
            <div class="progress-ratio">${fmtNumber(r.total_barang)} / ${fmtNumber(r.target_per_shift)}</div>
          </td>
          <td class="saved-at">${esc(formatSavedAt(r.timestamp_saved))}</td>
        </tr>
      `;
    })
    .join('');
}

async function loadHistory() {
  const start = document.getElementById('startDate').value;
  const end = document.getElementById('endDate').value;
  const shift = document.getElementById('shiftFilter').value;
  const device = document.getElementById('deviceFilter').value;
  const search = document.getElementById('searchInput').value.trim();

  const params = new URLSearchParams({
    start,
    end,
    shift,
    device,
    search,
  });

  const data = await fetchJson(`/api/history?${params.toString()}`);
  renderDeviceFilterOptions(data.devices || []);
  renderSummary(data.summary || {});
  renderRows(data.rows || []);
  return data;
}

function exportCsv() {
  if (!currentRows.length) {
    alert('Tidak ada data untuk diekspor.');
    return;
  }

  const headers = [
    'Tanggal',
    'Shift',
    'Device',
    'Total Barang',
    'Target Per Jam',
    'Target Per Shift',
    'Pencapaian %',
    'Disimpan Pada',
  ];

  const lines = currentRows.map((r) => [
    r.tanggal,
    r.shift,
    r.device_id || 'legacy',
    r.total_barang,
    r.target_per_hour,
    r.target_per_shift,
    r.achievement_percent,
    r.timestamp_saved,
  ]);

  const csv = [headers, ...lines]
    .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `riwayat-produksi-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function setDefaultDates() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 90);
  document.getElementById('endDate').value = end.toISOString().slice(0, 10);
  document.getElementById('startDate').value = start.toISOString().slice(0, 10);
}

async function init() {
  const session = await fetchJson('/api/session');
  if (!session.authenticated) {
    window.location.href = '/';
    return;
  }

  setDefaultDates();
  await loadHistory();

  document.getElementById('btnApply').addEventListener('click', () => {
    loadHistory().catch((e) => alert(e.message));
  });

  document.getElementById('searchInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadHistory().catch((err) => alert(err.message));
  });
  document.getElementById('deviceFilter').addEventListener('change', () => {
    loadHistory().catch((e) => alert(e.message));
  });

  document.getElementById('btnExport').addEventListener('click', exportCsv);

  document.getElementById('btnLogout').addEventListener('click', async () => {
    await postJson('/api/logout', {});
    window.location.href = '/';
  });
}

init().catch((e) => {
  console.error(e);
  window.location.href = '/';
});
