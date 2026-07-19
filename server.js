const express = require('express');
const session = require('express-session');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const config = require('./config');
const {
  initCounter,
  handleShiftBoundary,
  getDashboardData,
  resetCounter,
  resetTargetTicker,
  getDeviceIds,
} = require('./services/counterService');
const { getShiftConfig, setShiftConfig } = require('./services/shiftService');
const {
  initMqtt,
  publishDeviceReset,
  publishTargetConfig,
  publishTargetTickerReset,
  publishTargetTickerValue,
} = require('./services/mqttService');
const {
  getHistory,
  getTargetByDevice,
  updateTarget,
  getState,
  ensureDeviceState,
  getAllDeviceMeta,
  updateDeviceMeta,
  deleteDevice,
} = require('./db/database');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax',
    },
  })
);

app.use(express.static(path.join(__dirname, 'public')));

function slugifyDeviceId(text = '') {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function generateDeviceIdFromLabel(label, existingIds = []) {
  const MAX_LEN = 40;
  const base = slugifyDeviceId(label) || 'device';
  let prefix = base.startsWith('device-') ? base : `device-${base}`;
  prefix = prefix.slice(0, MAX_LEN).replace(/-+$/g, '');

  const known = new Set((existingIds || []).map((id) => String(id || '').trim().toLowerCase()));
  if (!known.has(prefix.toLowerCase())) return prefix;

  let seq = 2;
  while (true) {
    const suffix = `-${seq}`;
    const maxPrefixLen = MAX_LEN - suffix.length;
    const pref = prefix.slice(0, maxPrefixLen).replace(/-+$/g, '') || 'device';
    const candidate = `${pref}${suffix}`;
    if (!known.has(candidate.toLowerCase())) return candidate;
    seq += 1;
  }
}

function normalizeLabelKey(label = '') {
  return String(label || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function hasDuplicateMachineLabel(label, excludeDeviceId = null) {
  const candidateKey = normalizeLabelKey(label);
  if (!candidateKey) return false;
  const meta = getAllDeviceMeta();
  const safeExclude = String(excludeDeviceId || '').trim();

  return Object.entries(meta || {}).some(([deviceId, info]) => {
    if (safeExclude && deviceId === safeExclude) return false;
    return normalizeLabelKey(info?.label) === candidateKey;
  });
}

function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.redirect('/');
}

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === config.auth.username && password === config.auth.password) {
    req.session.authenticated = true;
    req.session.username = username;
    return req.session.save((err) => {
      if (err) {
        console.error('[Session] Gagal menyimpan session:', err.message);
        return res.status(500).json({ error: 'Gagal menyimpan session' });
      }
      return res.json({ success: true });
    });
  }
  res.status(401).json({ error: 'Username atau password salah' });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/dashboard', requireAuth, (req, res) => {
  const deviceId = typeof req.query.deviceId === 'string' ? req.query.deviceId : undefined;
  res.json(getDashboardData({ deviceId }));
});

app.get('/api/history', requireAuth, (req, res) => {
  const end = req.query.end || new Date().toISOString().slice(0, 10);
  const start = req.query.start || end;
  const shift = req.query.shift || 'all';
  const device = req.query.device || 'all';
  const search = req.query.search || '';
  res.json(getHistory(start, end, { shift, device, search }));
});

app.get('/api/target', requireAuth, (req, res) => {
  const deviceId = typeof req.query.deviceId === 'string' ? req.query.deviceId : undefined;
  res.json(getTargetByDevice(deviceId));
});

app.get('/api/shifts', requireAuth, (req, res) => {
  res.json({ shifts: getShiftConfig() });
});

app.get('/api/devices', requireAuth, (req, res) => {
  const ids = getDeviceIds();
  const meta = getAllDeviceMeta();
  res.json({
    devices: ids.map((id) => ({
      id,
      label: meta?.[id]?.label || `Mesin ${id}`,
      address: meta?.[id]?.address || null,
      lastTopic: meta?.[id]?.last_topic || null,
    })),
  });
});

app.post('/api/devices', requireAuth, (req, res) => {
  const rawLabel = String(req.body?.label || '').trim();
  let rawId = String(req.body?.deviceId || '').trim();
  if (rawLabel && hasDuplicateMachineLabel(rawLabel)) {
    return res.status(400).json({ error: 'Nama mesin sudah digunakan. Gunakan nama lain.' });
  }
  if (!rawId) {
    rawId = generateDeviceIdFromLabel(rawLabel, getDeviceIds());
  }
  if (!rawId) {
    return res.status(400).json({ error: 'deviceId wajib diisi' });
  }
  if (!/^[a-zA-Z0-9_-]{3,40}$/.test(rawId)) {
    return res.status(400).json({ error: 'Format deviceId tidak valid (3-40, huruf/angka/_/-).' });
  }

  ensureDeviceState(rawId);
  if (rawLabel) {
    updateDeviceMeta(rawId, { label: rawLabel });
  }
  const dashboard = getDashboardData({ deviceId: rawId });
  broadcastDashboard(dashboard);
  return res.json({ success: true, deviceId: rawId, dashboard });
});

app.put('/api/devices/:id', requireAuth, (req, res) => {
  const deviceId = String(req.params.id || '').trim();
  const label = String(req.body?.label || '').trim();
  if (!deviceId) return res.status(400).json({ error: 'deviceId tidak valid' });
  if (!label) return res.status(400).json({ error: 'Label wajib diisi' });
  if (label.length > 60) return res.status(400).json({ error: 'Maksimal 60 karakter' });
  if (hasDuplicateMachineLabel(label, deviceId)) {
    return res.status(400).json({ error: 'Nama mesin sudah digunakan. Gunakan nama lain.' });
  }

  try {
    const updated = updateDeviceMeta(deviceId, { label });
    const dashboard = getDashboardData({ deviceId });
    broadcastDashboard(dashboard);
    return res.json({ success: true, deviceId, meta: updated, dashboard });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Gagal update label device' });
  }
});

app.delete('/api/devices/:id', requireAuth, (req, res) => {
  const deviceId = String(req.params.id || '').trim();
  if (!deviceId) return res.status(400).json({ error: 'deviceId tidak valid' });

  try {
    const result = deleteDevice(deviceId);
    const dashboard = getDashboardData({ deviceId: result.selectedDeviceId });
    broadcastDashboard(dashboard);
    return res.json({ success: true, ...result, dashboard });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Gagal menghapus device' });
  }
});

app.post('/api/counter/reset', requireAuth, (req, res) => {
  const deviceId = req.body?.deviceId;
  publishDeviceReset(deviceId);
  const data = resetCounter(deviceId);
  const selectedDeviceId = data?.selectedDeviceId;
  publishTargetTickerValue(data?.targetTicker?.value ?? 0, { deviceId: selectedDeviceId });
  broadcastDashboard(data);
  res.json(data);
});

app.post('/api/target-ticker/reset', requireAuth, (req, res) => {
  const deviceId = req.body?.deviceId;
  const data = resetTargetTicker(deviceId);
  const selectedDeviceId = data?.selectedDeviceId;
  publishTargetTickerReset({
    targetTickerOffset: getState(selectedDeviceId).target_ticker_offset,
    deviceId: selectedDeviceId,
  });
  publishTargetTickerValue(data?.targetTicker?.value ?? 0, { deviceId: selectedDeviceId });
  broadcastDashboard(data);
  res.json(data);
});

app.put('/api/target', requireAuth, (req, res) => {
  const {
    targetPerHour,
    pcsPerInterval,
    intervalSeconds,
    model,
    editPassword,
    deviceId,
  } = req.body;
  const safeDeviceId = String(deviceId || '').trim() || getDashboardData().selectedDeviceId || 'device-1';
  if (!editPassword || editPassword !== config.auth.password) {
    return res.status(403).json({ error: 'Password validasi salah' });
  }
  if (!targetPerHour || targetPerHour < 1) {
    return res.status(400).json({ error: 'Target tidak valid' });
  }
  const safeModel = (typeof model === 'string' && model.trim().length > 0) ? model.trim() : '-';
  updateTarget(
    parseInt(targetPerHour, 10),
    parseInt(pcsPerInterval, 10) || 5,
    parseInt(intervalSeconds, 10) || 10,
    safeModel,
    safeDeviceId
  );
  const target = getTargetByDevice(safeDeviceId);
  publishTargetConfig(target, { targetTickerOffset: getState(safeDeviceId).target_ticker_offset, deviceId: safeDeviceId });
  publishTargetTickerValue(getDashboardData({ deviceId: safeDeviceId })?.targetTicker?.value ?? 0, { deviceId: safeDeviceId });
  res.json(target);
});

function handleShiftUpdate(req, res) {
  const { shifts, editPassword } = req.body || {};
  if (!editPassword || editPassword !== config.auth.password) {
    return res.status(403).json({ error: 'Password validasi salah' });
  }

  try {
    const updated = setShiftConfig(shifts);
    const data = getDashboardData();
    broadcastDashboard(data);
    return res.json({ shifts: updated, dashboard: data });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Konfigurasi shift tidak valid' });
  }
}

app.put('/api/shifts', requireAuth, handleShiftUpdate);
// Fallback untuk environment/proxy yang membatasi method PUT.
app.post('/api/shifts', requireAuth, handleShiftUpdate);

app.get('/api/session', (req, res) => {
  res.json({ authenticated: !!(req.session && req.session.authenticated) });
});

app.get('/dashboard', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/history', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'history.html'));
});

function broadcastDashboard(data) {
  io.emit('dashboard:update', data || getDashboardData());
}

io.on('connection', (socket) => {
  socket.emit('dashboard:update', getDashboardData());
});

initCounter();
initMqtt(broadcastDashboard);
getDeviceIds().forEach((deviceId) => {
  publishTargetConfig(getTargetByDevice(deviceId), { targetTickerOffset: getState(deviceId).target_ticker_offset, deviceId });
});

setInterval(() => {
  if (handleShiftBoundary()) {
    broadcastDashboard();
  }
}, 1000);

setInterval(() => {
  const data = getDashboardData();
  const deviceIds = getDeviceIds();
  deviceIds.forEach((deviceId) => {
    const perDevice = getDashboardData({ deviceId });
    publishTargetTickerValue(perDevice?.targetTicker?.value ?? 0, { deviceId });
  });
  broadcastDashboard(data);
}, 1000);

server.listen(config.port, () => {
  console.log(`Server berjalan di http://localhost:${config.port}`);
  console.log(`MQTT Broker: ${config.mqtt.brokerUrl}`);
  console.log(`MQTT Topic: ${config.mqtt.topic}`);
});
