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
const { getHistory, getTarget, updateTarget, getState } = require('./db/database');

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
  res.json(getTarget());
});

app.get('/api/shifts', requireAuth, (req, res) => {
  res.json({ shifts: getShiftConfig() });
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
  const { targetPerHour, pcsPerInterval, intervalSeconds, model, editPassword } = req.body;
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
    safeModel
  );
  const target = getTarget();
  const deviceIds = getDeviceIds();
  deviceIds.forEach((deviceId) => {
    publishTargetConfig(target, { targetTickerOffset: getState(deviceId).target_ticker_offset, deviceId });
    publishTargetTickerValue(getDashboardData({ deviceId })?.targetTicker?.value ?? 0, { deviceId });
  });
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
  publishTargetConfig(getTarget(), { targetTickerOffset: getState(deviceId).target_ticker_offset, deviceId });
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
