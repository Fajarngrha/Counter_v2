require('dotenv').config();
const mqtt = require('mqtt');

const brokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
const topic = process.env.MQTT_TOPIC || 'iot/counter/increment';

const client = mqtt.connect(brokerUrl, {
  clientId: `iot-counter-simulator-${Math.random().toString(16).slice(2)}`,
  reconnectPeriod: 3000,
});

client.on('connect', () => {
  console.log(`[SIM] Terhubung ke broker: ${brokerUrl}`);
  console.log(`[SIM] Publish increment ke topik: ${topic}`);
  console.log('[SIM] Tekan Ctrl+C untuk berhenti.');

  let counter = 0;
  setInterval(() => {
    counter += 1;
    const now = new Date();
    const waktu = now.toISOString().slice(0, 19).replace('T', ' ');
    client.publish(topic, JSON.stringify([{ waktu, counter }]));
    process.stdout.write('.');
  }, 1000);
});

client.on('error', (err) => {
  console.error('[SIM] MQTT error:', err.message);
});

