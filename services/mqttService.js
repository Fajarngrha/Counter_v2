const mqtt = require('mqtt');
const config = require('../config');
const { applyDeviceCounter } = require('./counterService');

let client = null;
let connected = false;
let broadcastFn = null;
let latestTargetConfig = null;

function parseSensorPayload(raw) {
  const payload = raw.toString().trim();
  let parsed;

  try {
    parsed = JSON.parse(payload);
  } catch {
    const num = parseInt(payload, 10);
    if (!isNaN(num) && num >= 0) {
      return { counter: num, waktu: null };
    }
    throw new Error('Payload bukan JSON valid atau angka counter');
  }

  const data = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!data || typeof data !== 'object') {
    throw new Error('Payload JSON tidak memiliki objek data');
  }

  const counterRaw = data.counter ?? data.count ?? data.value ?? data.amount;
  const counter = Number(counterRaw);
  if (!Number.isFinite(counter) || counter < 0) {
    throw new Error('Nilai counter tidak valid');
  }

  const waktuRaw = data.waktu ?? data.timestamp ?? null;
  const waktu = waktuRaw ? String(waktuRaw) : null;

  return { counter: Math.floor(counter), waktu };
}

function initMqtt(broadcast) {
  broadcastFn = broadcast;

  const options = {
    clientId: config.mqtt.clientId,
    reconnectPeriod: 5000,
    connectTimeout: 10000,
  };

  if (config.mqtt.username) {
    options.username = config.mqtt.username;
    options.password = config.mqtt.password;
  }

  client = mqtt.connect(config.mqtt.brokerUrl, options);

  client.on('connect', () => {
    connected = true;
    console.log(`[MQTT] Terhubung ke ${config.mqtt.brokerUrl}`);
    client.subscribe(config.mqtt.topic, (err) => {
      if (err) console.error('[MQTT] Gagal subscribe:', err.message);
      else console.log(`[MQTT] Subscribe ke topik: ${config.mqtt.topic}`);
    });
    if (latestTargetConfig) {
      publishTargetConfig(latestTargetConfig);
    }
  });

  client.on('message', (topic, message) => {
    try {
      const { counter, waktu } = parseSensorPayload(message);
      const data = applyDeviceCounter(counter, waktu);
      if (broadcastFn) broadcastFn(data);
    } catch (err) {
      console.error('[MQTT] Error memproses pesan:', err.message);
    }
  });

  client.on('error', (err) => {
    console.error('[MQTT] Error:', err.message);
  });

  client.on('close', () => {
    connected = false;
    console.log('[MQTT] Koneksi terputus');
  });

  client.on('reconnect', () => {
    console.log('[MQTT] Mencoba reconnect...');
  });
}

function publishIncrement(amount = 1) {
  if (client && connected) {
    client.publish(config.mqtt.topic, JSON.stringify({ count: amount }));
  }
}

function publishDeviceReset() {
  if (!client || !connected) return false;

  const topic = config.mqtt.commandTopic;
  client.publish(topic, JSON.stringify({ action: 'reset' }));
  console.log(`[MQTT] Perintah reset dikirim ke ${topic}`);
  return true;
}

function publishTargetConfig(target) {
  if (!target) return false;

  latestTargetConfig = {
    targetPerHour: Number(target.target_per_hour) || 0,
    pcsPerInterval: Number(target.pcs_per_interval) || 0,
    intervalSeconds: Number(target.interval_seconds) || 0,
  };

  if (!client || !connected) return false;

  const topic = config.mqtt.commandTopic;
  const payload = JSON.stringify({
    action: 'target_config',
    ...latestTargetConfig,
  });

  client.publish(topic, payload, { retain: true });
  console.log(`[MQTT] Konfigurasi target dikirim ke ${topic}: ${payload}`);
  return true;
}

function publishTargetTickerReset() {
  if (!client || !connected) return false;

  const topic = config.mqtt.commandTopic;
  client.publish(topic, JSON.stringify({ action: 'target_ticker_reset' }));
  console.log(`[MQTT] Perintah reset target ticker dikirim ke ${topic}`);
  return true;
}

function isMqttConnected() {
  return connected;
}

module.exports = {
  initMqtt,
  publishIncrement,
  publishDeviceReset,
  publishTargetConfig,
  publishTargetTickerReset,
  isMqttConnected,
};
