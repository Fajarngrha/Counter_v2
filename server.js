const express = require('express');
const session = require('express-session');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const config = require('./config');
const { initCounter, handleShiftBoundary, getDashboardData, resetCounter } = require('./services/counterService');
const { initMqtt, publishDeviceReset } = require('./services/mqttService');
const { getHistory, getTarget, updateTarget } = require('./db/database');

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
  res.json(getDashboardData());
});

app.get('/api/history', requireAuth, (req, res) => {
  const end = req.query.end || new Date().toISOString().slice(0, 10);
  const start = req.query.start || end;
  const shift = req.query.shift || 'all';
  const search = req.query.search || '';
  res.json(getHistory(start, end, { shift, search }));
});

app.get('/api/target', requireAuth, (req, res) => {
  res.json(getTarget());
});

app.post('/api/counter/reset', requireAuth, (req, res) => {
  publishDeviceReset();
  const data = resetCounter();
  broadcastDashboard(data);
  res.json(data);
});

app.put('/api/target', requireAuth, (req, res) => {
  const { targetPerHour, pcsPerInterval, intervalSeconds } = req.body;
  if (!targetPerHour || targetPerHour < 1) {
    return res.status(400).json({ error: 'Target tidak valid' });
  }
  updateTarget(
    parseInt(targetPerHour, 10),
    parseInt(pcsPerInterval, 10) || 5,
    parseInt(intervalSeconds, 10) || 10
  );
  res.json(getTarget());
});

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

setInterval(() => {
  if (handleShiftBoundary()) {
    broadcastDashboard();
  }
}, 1000);

setInterval(() => {
  broadcastDashboard();
}, 2000);

server.listen(config.port, () => {
  console.log(`Server berjalan di http://localhost:${config.port}`);
  console.log(`MQTT Broker: ${config.mqtt.brokerUrl}`);
  console.log(`MQTT Topic: ${config.mqtt.topic}`);
});
