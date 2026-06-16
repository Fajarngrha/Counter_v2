require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT, 10) || 3000,
  sessionSecret: process.env.SESSION_SECRET || 'iot-counter-dev-secret',
  mqtt: {
    brokerUrl: process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883',
    topic: process.env.MQTT_TOPIC || 'iot/counter/increment',
    clientId: process.env.MQTT_CLIENT_ID || 'iot-counter-server',
  },
  auth: {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || 'admin123',
  },
  timezone: 'Asia/Jakarta',
};
