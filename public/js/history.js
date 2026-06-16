function esc(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function fetchJson(url) {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request gagal');
  return data;
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request gagal');
  return data;
}

function setDefaultDates() {
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('startDate').value = today;
  document.getElementById('endDate').value = today;
}

function renderRows(rows) {
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
    .map(
      (r) => `
        <tr>
          <td>${esc(r.id)}</td>
          <td>${esc(r.tanggal)}</td>
          <td>${esc(r.shift)}</td>
          <td class="total-cell">${new Intl.NumberFormat('id-ID').format(r.total_barang)}</td>
          <td>${esc(r.timestamp_saved)}</td>
        </tr>
      `
    )
    .join('');
}

async function loadHistory() {
  const start = document.getElementById('startDate').value;
  const end = document.getElementById('endDate').value;

  const rows = await fetchJson(`/api/history?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
  renderRows(rows);
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

  document.getElementById('btnLogout').addEventListener('click', async () => {
    await postJson('/api/logout', {});
    window.location.href = '/';
  });
}

init().catch((e) => {
  console.error(e);
  window.location.href = '/';
});

