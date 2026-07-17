const mqtt = require('mqtt');
const config = require('../config');
const { applyDeviceCounter, resetTargetTicker, resetCounter, getDeviceIds } = require('./counterService');
const { getStateByDevice } = require('../db/database');

let client = null;
let connected = false;
let broadcastFn = null;
let latestTargetConfig = null;

function normalizeDeviceId(deviceId) {
  const id = String(deviceId || '').trim();
  return id || 'device-1';
}

function topicToSubscription(topic, suffix) {
  const text = String(topic || '').trim();
  if (!text) return text;
  if (text.includes('+')) return text;
  const cleanSuffix = `/${suffix}`;
  if (text.endsWith(cleanSuffix)) {
    return `${text.slice(0, -cleanSuffix.length)}/+${cleanSuffix}`;
  }
  return text;
}

function extractDeviceIdFromTopic(topic, suffix) {
  const text = String(topic || '').trim();
  if (!text) return null;
  if (text === config.mqtt.topic || text === config.mqtt.commandTopic) return null;
  const match = text.match(new RegExp(`^(.+)/([^/]+)/${suffix}$`));
  if (!match) return null;
  return normalizeDeviceId(match[2]);
}

function buildDeviceTopic(baseTopic, deviceId, suffix) {
  const text = String(baseTopic || '').trim();
  if (!text) return text;
  const safeDeviceId = normalizeDeviceId(deviceId);
  if (text.includes('+')) {
    return text.replace('+', safeDeviceId);
  }
  const cleanSuffix = `/${suffix}`;
  if (text.endsWith(cleanSuffix)) {
    return `${text.slice(0, -cleanSuffix.length)}/${safeDeviceId}${cleanSuffix}`;
  }
  return text;
}

function resolveTargetTickerOffset(explicitOffset, deviceId = 'device-1') {
  if (Number.isFinite(explicitOffset)) {
    return Math.max(0, Math.floor(explicitOffset));
  }

  const state = getStateByDevice(deviceId);
  const persistedOffset = Number(state?.target_ticker_offset);
  if (Number.isFinite(persistedOffset)) {
    return Math.max(0, Math.floor(persistedOffset));
  }

  return 0;
}

function normalizeTargetConfig(target, explicitOffset, deviceId = 'device-1') {
  return {
    targetPerHour: Number(target?.target_per_hour ?? target?.targetPerHour) || 0,
    pcsPerInterval: Number(target?.pcs_per_interval ?? target?.pcsPerInterval) || 0,
    intervalSeconds: Number(target?.interval_seconds ?? target?.intervalSeconds) || 0,
    targetTickerOffset: resolveTargetTickerOffset(explicitOffset ?? target?.targetTickerOffset, deviceId),
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
      return { counter: num, waktu: null, mode: 'absolute', deviceId: null };
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
    return { counter: Math.floor(counter), waktu, mode: 'absolute', deviceId: normalizeDeviceId(data.deviceId) };
  }

  // Kompatibilitas: beberapa device kirim nilai increment per event via "count".
  if (data.count !== undefined && data.count !== null) {
    const countDelta = Number(data.count);
    if (!Number.isFinite(countDelta) || countDelta < 0) {
      throw new Error('Nilai count tidak valid');
    }
    return { counter: Math.floor(countDelta), waktu, mode: 'delta', deviceId: normalizeDeviceId(data.deviceId) };
  }

  const fallbackCounterRaw = data.value ?? data.amount;
  const fallbackCounter = Number(fallbackCounterRaw);
  if (!Number.isFinite(fallbackCounter) || fallbackCounter < 0) {
    throw new Error('Nilai counter tidak valid');
  }
  return { counter: Math.floor(fallbackCounter), waktu, mode: 'absolute', deviceId: normalizeDeviceId(data.deviceId) };
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
    const telemetrySubTopic = topicToSubscription(config.mqtt.topic, 'increment');
    client.subscribe(telemetrySubTopic, (err) => {
      if (err) console.error('[MQTT] Gagal subscribe:', err.message);
      else console.log(`[MQTT] Subscribe ke topik: ${telemetrySubTopic}`);
    });
    if (telemetrySubTopic !== config.mqtt.topic) {
      client.subscribe(config.mqtt.topic, (err) => {
        if (err) console.error('[MQTT] Gagal subscribe legacy topic:', err.message);
        else console.log(`[MQTT] Subscribe ke topik legacy: ${config.mqtt.topic}`);
      });
    }
    if (config.mqtt.commandTopic && config.mqtt.commandTopic !== config.mqtt.topic) {
      const commandSubTopic = topicToSubscription(config.mqtt.commandTopic, 'command');
      client.subscribe(commandSubTopic, (err) => {
        if (err) console.error('[MQTT] Gagal subscribe command topic:', err.message);
        else console.log(`[MQTT] Subscribe ke topik command: ${commandSubTopic}`);
      });
      if (commandSubTopic !== config.mqtt.commandTopic) {
        client.subscribe(config.mqtt.commandTopic, (err) => {
          if (err) console.error('[MQTT] Gagal subscribe command topic legacy:', err.message);
          else console.log(`[MQTT] Subscribe ke topik command legacy: ${config.mqtt.commandTopic}`);
        });
      }
    }
    if (latestTargetConfig) {
      const ids = getDeviceIds();
      ids.forEach((deviceId) => publishTargetConfig(latestTargetConfig, { deviceId }));
    }
  });

  client.on('message', (topic, message) => {
    try {
      const command = parseCommandPayload(message);
      const action = String(command.action || '').toLowerCase();
      const source = String(command.source || '').toLowerCase();
      const topicDeviceId = extractDeviceIdFromTopic(topic, 'increment') || extractDeviceIdFromTopic(topic, 'command');
      const payloadDeviceId = normalizeDeviceId(command.deviceId || null);
      const deviceId = topicDeviceId || payloadDeviceId;
      const shouldTreatAsCommand = topic.endsWith('/command') || topic === config.mqtt.commandTopic || isCommandAction(action);

      if (shouldTreatAsCommand) {
        if (action === 'reset' && source !== 'server') {
          const data = resetCounter(deviceId);
          publishDeviceReset(deviceId);
          console.log(`[MQTT] Reset counter dari device ${deviceId} diproses (topic=${topic}).`);
          if (broadcastFn) broadcastFn(data);
        }

        if (action === 'target_ticker_reset' && source !== 'server') {
          const data = resetTargetTicker(deviceId);
          const state = getStateByDevice(deviceId);
          publishTargetTickerReset({
            targetTickerOffset: state.target_ticker_offset,
            deviceId,
          });
          if (broadcastFn) broadcastFn(data);
        }
        return;
      }

      const { counter, waktu, mode, deviceId: payloadSensorDeviceId } = parseSensorPayload(message);
      const sensorDeviceId = topicDeviceId || payloadSensorDeviceId;
      let data;
      if (mode === 'delta') {
        const state = getStateByDevice(sensorDeviceId);
        const base = Number.isFinite(state.last_device_counter)
          ? state.last_device_counter
          : Number.isFinite(state.count) ? state.count : 0;
        const syntheticAbsolute = base + counter;
        data = applyDeviceCounter(syntheticAbsolute, waktu, sensorDeviceId);
      } else {
        data = applyDeviceCounter(counter, waktu, sensorDeviceId);
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

function publishIncrement(amount = 1, deviceId = 'device-1') {
  if (client && connected) {
    const topic = buildDeviceTopic(config.mqtt.topic, deviceId, 'increment');
    client.publish(topic, JSON.stringify({ count: amount, deviceId: normalizeDeviceId(deviceId) }));
  }
}

function publishDeviceReset(deviceId = 'device-1') {
  if (!client || !connected) return false;

  const safeDeviceId = normalizeDeviceId(deviceId);
  const topic = buildDeviceTopic(config.mqtt.commandTopic, safeDeviceId, 'command');
  const payload = JSON.stringify({ action: 'reset', source: 'server', deviceId: safeDeviceId });
  client.publish(topic, payload);
  console.log(`[MQTT] Perintah reset dikirim ke ${topic}: ${payload}`);
  return true;
}

function publishTargetConfig(target, options = {}) {
  if (!target) return false;
  const safeDeviceId = normalizeDeviceId(options.deviceId);

  latestTargetConfig = normalizeTargetConfig(target, options.targetTickerOffset, safeDeviceId);

  if (!client || !connected) return false;

  const topic = buildDeviceTopic(config.mqtt.commandTopic, safeDeviceId, 'command');
  const payload = JSON.stringify({
    action: 'target_config',
    source: 'server',
    deviceId: safeDeviceId,
    ...latestTargetConfig,
  });

  client.publish(topic, payload, { retain: true });
  console.log(`[MQTT] Konfigurasi target dikirim ke ${topic}: ${payload}`);
  return true;
}

function publishTargetTickerReset(options = {}) {
  if (!client || !connected) return false;

  const safeDeviceId = normalizeDeviceId(options.deviceId);
  const topic = buildDeviceTopic(config.mqtt.commandTopic, safeDeviceId, 'command');
  const payload = JSON.stringify({
    action: 'target_ticker_reset',
    source: 'server',
    deviceId: safeDeviceId,
    targetTickerOffset: resolveTargetTickerOffset(options.targetTickerOffset, safeDeviceId),
  });
  client.publish(topic, payload);
  console.log(`[MQTT] Perintah reset target ticker dikirim ke ${topic}: ${payload}`);
  return true;
}

function publishTargetTickerValue(value, options = {}) {
  if (!client || !connected) return false;

  const safeDeviceId = normalizeDeviceId(options.deviceId);
  const safeValue = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  const topic = buildDeviceTopic(config.mqtt.commandTopic, safeDeviceId, 'command');
  const payload = JSON.stringify({
    action: 'target_ticker_value',
    source: 'server',
    deviceId: safeDeviceId,
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
