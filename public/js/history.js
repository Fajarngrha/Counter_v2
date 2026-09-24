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
let currentDevices = [];

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

function deviceLabel(row) {
  return row.device_label || row.device_id || 'legacy';
}

function naturalCompare(a, b) {
  return String(a).localeCompare(String(b), 'id', { numeric: true, sensitivity: 'base' });
}

function summarizeRows(rows) {
  const totalBarang = rows.reduce((s, r) => s + (r.total_barang || 0), 0);
  const totalTarget = rows.reduce((s, r) => s + (r.target_per_shift || 0), 0);
  const achievement = totalTarget > 0 ? Math.round((totalBarang / totalTarget) * 100) : 0;
  return {
    totalRecords: rows.length,
    totalBarang,
    totalTarget,
    achievement,
  };
}

function groupRowsByDevice(rows, devices = []) {
  const map = new Map();

  (devices || []).forEach((item) => {
    const device = typeof item === 'string'
      ? { id: item, label: item }
      : item;
    if (!device?.id || device.id === 'legacy') return;
    map.set(device.id, {
      id: device.id,
      label: device.label || device.id,
      rows: [],
    });
  });

  rows.forEach((row) => {
    const id = row.device_id || 'legacy';
    if (!map.has(id)) {
      map.set(id, {
        id,
        label: deviceLabel(row),
        rows: [],
      });
    }
    map.get(id).rows.push(row);
  });

  return Array.from(map.values()).sort((a, b) => naturalCompare(a.label, b.label));
}

function filterGroups(groups, { device = 'all', search = '' } = {}) {
  const q = String(search || '').trim().toLowerCase();
  return groups.filter((group) => {
    if (device && device !== 'all' && group.id !== device) return false;
    if (!q) return true;
    const haystack = `${group.label} ${group.id}`.toLowerCase();
    if (haystack.includes(q)) return true;
    return group.rows.length > 0;
  });
}

function renderDeviceFilterOptions(devices = []) {
  const select = document.getElementById('deviceFilter');
  if (!select) return;
  const current = select.value || 'all';
  const list = Array.isArray(devices) ? devices : [];
  const normalized = list.map((item) => (
    typeof item === 'string'
      ? { id: item, label: item }
      : { id: item.id, label: item.label || item.id }
  ));

  select.innerHTML = [
    '<option value="all">Semua Device</option>',
    ...normalized.map((device) => (
      `<option value="${esc(device.id)}">${esc(device.label)}${device.label !== device.id ? ` — ${esc(device.id)}` : ''}</option>`
    )),
  ].join('');

  const stillExists = current === 'all' || normalized.some((device) => device.id === current);
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

function renderShiftRow(r) {
  const pct = r.achievement_percent || 0;
  const achClass = getAchievementClass(pct);
  const progClass = getProgressClass(pct);

  return `
    <tr class="js-history-shift-row${r.has_chart ? ' has-chart' : ''}" data-device="${esc(r.device_id || '')}" data-tanggal="${esc(r.tanggal)}" data-shift="${esc(r.shift)}" title="Klik untuk melihat grafik shift ini">
      <td>${esc(formatTanggalLabel(r.tanggal))}</td>
      <td><span class="${shiftBadgeClass(r.shift)}">${esc(r.shift)}</span></td>
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
}

function getDetailDeviceId() {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = String(params.get('device') || '').trim();
  if (fromQuery && fromQuery !== 'all') return fromQuery;
  const match = window.location.pathname.match(/^\/history\/device\/([^/]+)$/i);
  return match ? decodeURIComponent(match[1]) : '';
}

function deviceHref(id) {
  return `/history?device=${encodeURIComponent(id)}`;
}

function displayDeviceLabel(id, label) {
  if (id === 'legacy') return 'Data lama';
  return label || id || 'Mesin';
}

function latestRow(rows) {
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

function renderLastAchievement(row) {
  if (!row) {
    return `<div class="history-empty-log">Belum ada pencapaian yang tersimpan untuk mesin ini.</div>`;
  }

  const pct = row.achievement_percent || 0;
  return `
    <div class="history-last-achievement">
      <div class="history-last-label">Pencapaian terakhir tersimpan</div>
      <div class="history-last-grid">
        <div class="history-last-item">
          <div class="history-last-item-label">Tanggal / Shift</div>
          <div class="history-last-item-value">${esc(formatTanggalLabel(row.tanggal))}</div>
          <div class="history-last-shift"><span class="${shiftBadgeClass(row.shift)}">${esc(row.shift)}</span></div>
        </div>
        <div class="history-last-item">
          <div class="history-last-item-label">Total Barang</div>
          <div class="history-last-item-value">${fmtNumber(row.total_barang)} pcs</div>
        </div>
        <div class="history-last-item">
          <div class="history-last-item-label">Target / Shift</div>
          <div class="history-last-item-value summary-green">${fmtNumber(row.target_per_shift)} pcs</div>
        </div>
        <div class="history-last-item">
          <div class="history-last-item-label">Pencapaian</div>
          <div class="history-last-item-value achievement-cell ${getAchievementClass(pct)}">
            ${getTrendIcon(pct)} ${pct}%
          </div>
          <div class="mini-progress-bar">
            <div class="mini-progress-fill ${getProgressClass(pct)}" style="width:${Math.min(100, pct)}%"></div>
          </div>
          <div class="progress-ratio">${fmtNumber(row.total_barang)} / ${fmtNumber(row.target_per_shift)} · ${esc(formatSavedAt(row.timestamp_saved))}</div>
        </div>
      </div>
      <div class="history-shift-chart-card">
        <div class="history-shift-chart-title">Grafik shift ${esc(row.shift)}</div>
        <div class="history-shift-chart-wrap">
          <canvas class="js-history-shift-chart" data-device="${esc(row.device_id || '')}" data-tanggal="${esc(row.tanggal)}" data-shift="${esc(row.shift)}"></canvas>
        </div>
      </div>
    </div>
  `;
}

function renderFullTable(rows) {
  if (!rows.length) {
    return `<div class="history-empty-log">Belum ada log shift. Data akan terisi otomatis saat pergantian shift.</div>`;
  }

  return `
    ${renderLastAchievement(latestRow(rows))}
    <table class="data-table history-table">
      <thead>
        <tr>
          <th>Tanggal</th>
          <th>Shift</th>
          <th>Total Barang</th>
          <th>Target / Jam</th>
          <th>Target / Shift</th>
          <th>Pencapaian</th>
          <th>Progress</th>
          <th>Disimpan Pada</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(renderShiftRow).join('')}
      </tbody>
    </table>
  `;
}

function applyPageMode(detailDeviceId, devices = []) {
  const page = document.querySelector('.history-page');
  const titleEl = document.getElementById('historyTitle');
  const subtitleEl = document.getElementById('historySubtitle');
  const backEl = document.getElementById('btnBackHistory');
  const isDetail = Boolean(detailDeviceId);
  page?.classList.toggle('is-device-detail', isDetail);

  if (!isDetail) {
    if (titleEl) titleEl.textContent = 'Riwayat Produksi';
    document.title = 'IoT Production Counter - Riwayat';
    if (subtitleEl) {
      subtitleEl.textContent = 'Klik nama mesin untuk membuka riwayat lengkap. Klik kartu untuk melihat pencapaian terakhir.';
    }
    if (backEl) backEl.setAttribute('href', '/dashboard');
    return;
  }

  const meta = (devices || []).find((item) => (typeof item === 'string' ? item : item.id) === detailDeviceId);
  const label = displayDeviceLabel(detailDeviceId, typeof meta === 'string' ? meta : (meta?.label || detailDeviceId));
  if (titleEl) titleEl.textContent = `Riwayat ${label}`;
  document.title = `Riwayat ${label}`;
  if (subtitleEl) subtitleEl.textContent = `Device ID: ${detailDeviceId}`;
  if (backEl) backEl.setAttribute('href', '/history');
}

function renderRows(rows, devices = []) {
  currentRows = rows;
  currentDevices = Array.isArray(devices) ? devices : [];
  const groupsEl = document.getElementById('historyGroups');
  const empty = document.getElementById('emptyState');
  const detailDeviceId = getDetailDeviceId();
  const device = detailDeviceId || document.getElementById('deviceFilter').value;
  const search = document.getElementById('searchInput').value.trim();

  applyPageMode(detailDeviceId, currentDevices);
  const groups = filterGroups(groupRowsByDevice(rows, currentDevices), { device, search });

  if (!groups.length) {
    groupsEl.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';

  groupsEl.innerHTML = groups.map((group) => {
    const stats = summarizeRows(group.rows);
    const href = deviceHref(group.id);
    const label = displayDeviceLabel(group.id, group.label);

    if (detailDeviceId) {
      return `
        <section class="history-device-group is-detail-open" data-device-id="${esc(group.id)}">
          <div class="history-device-header" aria-expanded="true">
            <div class="history-device-identity">
              <div class="history-device-name">${esc(label)}</div>
              <div class="history-device-id">${esc(group.id)} · ${fmtNumber(stats.totalRecords)} shift</div>
            </div>
            <div class="history-device-stats">
              <div class="history-device-stat">
                <div class="history-device-stat-label">Total Barang</div>
                <div class="history-device-stat-value">${fmtNumber(stats.totalBarang)} pcs</div>
              </div>
              <div class="history-device-stat">
                <div class="history-device-stat-label">Target</div>
                <div class="history-device-stat-value summary-green">${fmtNumber(stats.totalTarget)} pcs</div>
              </div>
              <div class="history-device-stat">
                <div class="history-device-stat-label">Pencapaian</div>
                <div class="history-device-stat-value ${getAchievementClass(stats.achievement)}">${stats.achievement}%</div>
              </div>
            </div>
          </div>
          <div class="history-device-body">
            ${renderFullTable(group.rows)}
          </div>
        </section>
      `;
    }

    return `
      <section class="history-device-group" data-device-id="${esc(group.id)}">
        <div class="history-device-header" role="button" tabindex="0" aria-expanded="false">
          <svg class="history-device-toggle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
          <div class="history-device-identity">
            <a class="history-device-name" href="${esc(href)}">${esc(label)}</a>
            <div class="history-device-id">${esc(group.id)} · ${fmtNumber(stats.totalRecords)} shift</div>
          </div>
          <div class="history-device-stats">
            <div class="history-device-stat">
              <div class="history-device-stat-label">Total Barang</div>
              <div class="history-device-stat-value">${fmtNumber(stats.totalBarang)} pcs</div>
            </div>
            <div class="history-device-stat">
              <div class="history-device-stat-label">Target</div>
              <div class="history-device-stat-value summary-green">${fmtNumber(stats.totalTarget)} pcs</div>
            </div>
            <div class="history-device-stat">
              <div class="history-device-stat-label">Pencapaian</div>
              <div class="history-device-stat-value ${getAchievementClass(stats.achievement)}">${stats.achievement}%</div>
            </div>
          </div>
        </div>
        <div class="history-device-body">
          ${renderLastAchievement(latestRow(group.rows))}
        </div>
      </section>
    `;
  }).join('');
}

function setAllGroupsOpen(open) {
  document.querySelectorAll('.history-device-group').forEach((group) => {
    group.classList.toggle('is-open', open);
    const btn = group.querySelector('.history-device-header');
    if (btn) btn.setAttribute('aria-expanded', String(open));
  });
}

async function loadHistory() {
  const start = document.getElementById('startDate').value;
  const end = document.getElementById('endDate').value;
  const shift = document.getElementById('shiftFilter').value;
  const detailDeviceId = getDetailDeviceId();
  const device = detailDeviceId || document.getElementById('deviceFilter').value;
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
  renderRows(data.rows || [], data.devices || []);
  paintVisibleHistoryCharts();
  return data;
}

function formatHistoryTick(ts) {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(ts));
}

function buildHistoryChartPoints(points) {
  const out = [];
  let cumulative = 0;
  (points || []).forEach((point, index) => {
    const prev = points[index - 1];
    const hasPulse = point.produced === true || Number(point.delta) > 0
      || (Number(point.count) || 0) > (prev ? Number(prev.count) || 0 : Number(point.count) || 0);
    if (hasPulse) cumulative += 1;
    out.push({ x: Number(point.ts), y: cumulative });
  });
  return out;
}

async function paintHistoryChart(canvas) {
  if (!canvas || typeof Chart === 'undefined') return;
  const device = canvas.getAttribute('data-device');
  const tanggal = canvas.getAttribute('data-tanggal');
  const shift = canvas.getAttribute('data-shift');
  if (!device || !tanggal || !shift) return;
  try {
    const payload = await fetchJson(`/api/history-chart?device=${encodeURIComponent(device)}&tanggal=${encodeURIComponent(tanggal)}&shift=${encodeURIComponent(shift)}`);
    const data = buildHistoryChartPoints(payload.points || []);
    if (canvas._chart) {
      canvas._chart.destroy();
      canvas._chart = null;
    }
    if (!data.length) {
      canvas.parentElement?.classList.add('is-empty');
      return;
    }
    canvas.parentElement?.classList.remove('is-empty');
    canvas._chart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        datasets: [{
          label: payload.device_label || device,
          data,
          borderColor: '#388bfd',
          backgroundColor: '#388bfd33',
          borderWidth: 2,
          tension: 0,
          stepped: 'before',
          pointRadius: 0,
          fill: true,
        }],
      },
      options: {
        parsing: false,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title(items) { return formatHistoryTick(items[0]?.parsed?.x); },
              label(item) { return `${fmtNumber(item.parsed?.y || 0)} pcs kumulatif`; },
            },
          },
        },
        scales: {
          x: {
            type: 'linear',
            ticks: { color: '#8b949e', maxTicksLimit: 6, callback: (value) => formatHistoryTick(value) },
            grid: { color: 'rgba(48, 54, 61, 0.7)' },
          },
          y: {
            beginAtZero: true,
            ticks: { color: '#8b949e' },
            grid: { color: 'rgba(48, 54, 61, 0.7)' },
          },
        },
      },
    });
  } catch (err) {
    console.warn('Gagal memuat grafik riwayat:', err.message);
  }
}

function paintVisibleHistoryCharts() {
  document.querySelectorAll('.js-history-shift-chart').forEach((canvas) => {
    paintHistoryChart(canvas);
  });
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
    'Nama Mesin',
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
    r.device_label || r.device_id || 'legacy',
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

  document.getElementById('historyGroups').addEventListener('click', (e) => {
    const shiftRow = e.target.closest('.js-history-shift-row');
    if (shiftRow && getDetailDeviceId()) {
      const canvas = document.querySelector('.js-history-shift-chart');
      if (canvas) {
        canvas.setAttribute('data-device', shiftRow.getAttribute('data-device') || '');
        canvas.setAttribute('data-tanggal', shiftRow.getAttribute('data-tanggal') || '');
        canvas.setAttribute('data-shift', shiftRow.getAttribute('data-shift') || '');
        const title = document.querySelector('.history-shift-chart-title');
        if (title) title.textContent = `Grafik shift ${shiftRow.getAttribute('data-shift') || ''}`;
        paintHistoryChart(canvas);
      }
      return;
    }
    if (getDetailDeviceId()) return;
    if (e.target.closest('.history-device-name')) return;
    const header = e.target.closest('.history-device-header');
    if (!header) return;
    const group = header.closest('.history-device-group');
    if (!group) return;
    const open = !group.classList.contains('is-open');
    group.classList.toggle('is-open', open);
    header.setAttribute('aria-expanded', String(open));
    if (open) paintVisibleHistoryCharts();
  });

  document.getElementById('btnExpandAll').addEventListener('click', () => setAllGroupsOpen(true));
  document.getElementById('btnCollapseAll').addEventListener('click', () => setAllGroupsOpen(false));

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
