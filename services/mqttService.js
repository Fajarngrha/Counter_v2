const mqtt = require('mqtt');
const config = require('../config');
const { applyDeviceCounter, resetTargetTicker, resetCounter } = require('./counterService');
const { getState } = require('../db/database');

let client = null;
let connected = false;
let broadcastFn = null;
let latestTargetConfig = null;

function resolveTargetTickerOffset(explicitOffset) {
  if (Number.isFinite(explicitOffset)) {
    return Math.max(0, Math.floor(explicitOffset));
  }

  const state = getState();
  const persistedOffset = Number(state?.target_ticker_offset);
  if (Number.isFinite(persistedOffset)) {
    return Math.max(0, Math.floor(persistedOffset));
  }

  return 0;
}

function normalizeTargetConfig(target, explicitOffset) {
  return {
    targetPerHour: Number(target?.target_per_hour ?? target?.targetPerHour) || 0,
    pcsPerInterval: Number(target?.pcs_per_interval ?? target?.pcsPerInterval) || 0,
    intervalSeconds: Number(target?.interval_seconds ?? target?.intervalSeconds) || 0,
    targetTickerOffset: resolveTargetTickerOffset(explicitOffset ?? target?.targetTickerOffset),
  };
}

function parseSensorPayload(raw) {
  const payload = raw.toString().trim();
  let parsed;

  try {
    parsed = JSON.parse(payload);
  } catch {
    const num = parseInt(payload, 10);
    if (!isNaN(num) && num >= 0) {
      return { counter: num, waktu: null, mode: 'absolute' };
    }
    throw new Error('Payload bukan JSON valid atau angka counter');
  }

  const data = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!data || typeof data !== 'object') {
    throw new Error('Payload JSON tidak memiliki objek data');
  }

  const waktuRaw = data.waktu ?? data.timestamp ?? null;
  const waktu = waktuRaw ? String(waktuRaw) : null;
  if (data.counter !== undefined && data.counter !== null) {
    const counter = Number(data.counter);
    if (!Number.isFinite(counter) || counter < 0) {
      throw new Error('Nilai counter tidak valid');
    }
    return { counter: Math.floor(counter), waktu, mode: 'absolute' };
  }

  // Kompatibilitas: beberapa device kirim nilai increment per event via "count".
  if (data.count !== undefined && data.count !== null) {
    const countDelta = Number(data.count);
    if (!Number.isFinite(countDelta) || countDelta < 0) {
      throw new Error('Nilai count tidak valid');
    }
    return { counter: Math.floor(countDelta), waktu, mode: 'delta' };
  }

  const fallbackCounterRaw = data.value ?? data.amount;
  const fallbackCounter = Number(fallbackCounterRaw);
  if (!Number.isFinite(fallbackCounter) || fallbackCounter < 0) {
    throw new Error('Nilai counter tidak valid');
  }
  return { counter: Math.floor(fallbackCounter), waktu, mode: 'absolute' };
}

function parseCommandPayload(raw) {
  const payload = raw.toString().trim();
  try {
    const parsed = JSON.parse(payload);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    // ignore parse error and fallback below
  }
  return { action: payload };
}

function isCommandAction(action) {
  const normalized = String(action || '').toLowerCase();
  return normalized === 'reset' || normalized === 'target_ticker_reset' || normalized === 'target_config';
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
    if (config.mqtt.commandTopic && config.mqtt.commandTopic !== config.mqtt.topic) {
      client.subscribe(config.mqtt.commandTopic, (err) => {
        if (err) console.error('[MQTT] Gagal subscribe command topic:', err.message);
        else console.log(`[MQTT] Subscribe ke topik command: ${config.mqtt.commandTopic}`);
      });
    }
    if (latestTargetConfig) {
      publishTargetConfig(latestTargetConfig);
    }
  });

  client.on('message', (topic, message) => {
    try {
      const command = parseCommandPayload(message);
      const action = String(command.action || '').toLowerCase();
      const source = String(command.source || '').toLowerCase();
      const shouldTreatAsCommand = topic === config.mqtt.commandTopic || isCommandAction(action);

      if (shouldTreatAsCommand) {
        if (action === 'reset' && source !== 'server') {
          const data = resetCounter();
          publishDeviceReset();
          console.log(`[MQTT] Reset counter dari device diproses (topic=${topic}).`);
          if (broadcastFn) broadcastFn(data);
        }

        if (action === 'target_ticker_reset' && source !== 'server') {
          const data = resetTargetTicker();
          publishTargetTickerReset({ targetTickerOffset: getState().target_ticker_offset });
          if (broadcastFn) broadcastFn(data);
        }
        return;
      }

      const { counter, waktu, mode } = parseSensorPayload(message);
      let data;
      if (mode === 'delta') {
        const state = getState();
        const base = Number.isFinite(state.last_device_counter)
          ? state.last_device_counter
          : Number.isFinite(state.count) ? state.count : 0;
        const syntheticAbsolute = base + counter;
        data = applyDeviceCounter(syntheticAbsolute, waktu);
      } else {
        data = applyDeviceCounter(counter, waktu);
      }
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
  const payload = JSON.stringify({ action: 'reset', source: 'server' });
  client.publish(topic, payload);
  console.log(`[MQTT] Perintah reset dikirim ke ${topic}: ${payload}`);
  return true;
}

function publishTargetConfig(target, options = {}) {
  if (!target) return false;

  latestTargetConfig = normalizeTargetConfig(target, options.targetTickerOffset);

  if (!client || !connected) return false;

  const topic = config.mqtt.commandTopic;
  const payload = JSON.stringify({
    action: 'target_config',
    source: 'server',
    ...latestTargetConfig,
  });

  client.publish(topic, payload, { retain: true });
  console.log(`[MQTT] Konfigurasi target dikirim ke ${topic}: ${payload}`);
  return true;
}

function publishTargetTickerReset(options = {}) {
  if (!client || !connected) return false;

  const topic = config.mqtt.commandTopic;
  const payload = JSON.stringify({
    action: 'target_ticker_reset',
    source: 'server',
    targetTickerOffset: resolveTargetTickerOffset(options.targetTickerOffset),
  });
  client.publish(topic, payload);
  console.log(`[MQTT] Perintah reset target ticker dikirim ke ${topic}: ${payload}`);
  return true;
}

function publishTargetTickerValue(value) {
  if (!client || !connected) return false;

  const safeValue = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  const topic = config.mqtt.commandTopic;
  const payload = JSON.stringify({
    action: 'target_ticker_value',
    source: 'server',
    value: safeValue,
  });
  client.publish(topic, payload);
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
  publishTargetTickerValue,
  isMqttConnected,
};
