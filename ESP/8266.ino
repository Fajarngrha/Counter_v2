#include <ESP8266WiFi.h>
#include <PubSubClient.h>
#include <time.h>
#include <TM1637Display.h>

// Fallback pin alias untuk board "Generic ESP8266 Module"
// (karena beberapa core tidak mendefinisikan D1/D2/D5/D6/D7).
#ifndef D1
#define D0 16
#define D1 5
#define D2 4
#define D3 0
#define D4 2
#define D5 14
#define D6 12
#define D7 13
#define D8 15
#endif

#define USE_HIVEMQ_CLOUD true

const char* ssid = "FID";
const char* password = "FCC_2022#idn";

#if USE_HIVEMQ_CLOUD
#include <WiFiClientSecureBearSSL.h>
const char* mqtt_server = "e49b2fe6d5eb4d3fa5267a1ab8ff12d5.s1.eu.hivemq.cloud";
const int mqtt_port = 8883;
const char* mqtt_user = "espcounter";
const char* mqtt_pass = "Acernitro5";
#else
#include <WiFiClient.h>
const char* mqtt_server = "192.168.1.10";
const int mqtt_port = 1883;
const char* mqtt_user = nullptr;
const char* mqtt_pass = nullptr;
#endif

// Salin dari dashboard -> Copy Device ID
const char* deviceId = "device-8266-01";
const char* mqtt_topic_base = "iot/counter";
String mqtt_topic = "";
String mqtt_topic_command = "";

const long gmtOffsetSeconds = 7 * 3600; // WIB
const int daylightOffsetSeconds = 0;

// Mapping pin ESP8266 (NodeMCU/Wemos)
const int pinRelay = D5;            // input sensor/relay
const int pinBtnResetCounter = D6;  // tombol reset counter aktual
const int pinBtnResetTarget = D7;   // tombol reset target saat ini
const int sevenSegClkPin = D1;
const int sevenSegDioPin = D2;
const int pinLedWifi = LED_BUILTIN; // LED built-in biasanya active LOW (GPIO2)
const bool ledWifiActiveLow = true;

TM1637Display display(sevenSegClkPin, sevenSegDioPin);

volatile unsigned long totalCounter = 0;
unsigned long lastCounterSent = 0;

volatile bool counterEdgePending = false;
volatile unsigned long counterEdgeUs = 0;
bool counterInputArmed = true;
unsigned long counterHighSinceMs = 0;
unsigned long lastCounterAcceptedMs = 0;
const unsigned long counterConfirmUs = 15000;
const unsigned long counterMinIntervalMs = 300;
const unsigned long counterRearmHighStableMs = 120;

const unsigned long buttonDebounceMs = 60;
bool btnCounterLastReading = HIGH;
bool btnCounterStableState = HIGH;
bool btnCounterPressedLatch = false;
unsigned long btnCounterLastChangeMs = 0;
bool btnTargetLastReading = HIGH;
bool btnTargetStableState = HIGH;
bool btnTargetPressedLatch = false;
unsigned long btnTargetLastChangeMs = 0;

unsigned long targetPerHour = 1800;
unsigned long targetPcsPerInterval = 5;
unsigned long targetIntervalSeconds = 10;
unsigned long targetTickerOffset = 0;
String lastShiftName = "";
unsigned long syncedTargetTickerValue = 0;
unsigned long syncedTargetTickerAtMs = 0;
const unsigned long syncedTargetTickerTtlMs = 6000;

unsigned long lastSevenSegUpdateMs = 0;
const unsigned long sevenSegUpdateIntervalMs = 1000;
unsigned long lastSevenSegScrollMs = 0;
const unsigned long sevenSegScrollIntervalMs = 450;
int sevenSegScrollIndex = 0;
String sevenSegLastText = "";

#if USE_HIVEMQ_CLOUD
BearSSL::WiFiClientSecure espClient;
#else
WiFiClient espClient;
#endif
PubSubClient client(espClient);
unsigned long lastMqttReconnectAttempt = 0;
unsigned long lastHeartbeatSentMs = 0;
const unsigned long heartbeatIntervalMs = 10000; // kirim snapshot tiap 10 detik agar status IoT tetap online

struct ShiftInfo {
  const char* name;
  uint8_t durationHours;
  unsigned long elapsedSeconds;
};

void buildMqttTopics() {
  mqtt_topic = String(mqtt_topic_base) + "/" + String(deviceId) + "/increment";
  mqtt_topic_command = String(mqtt_topic_base) + "/" + String(deviceId) + "/command";
}

void setWifiLed(bool on) {
  digitalWrite(pinLedWifi, (on ^ ledWifiActiveLow) ? HIGH : LOW);
}

ShiftInfo getShiftInfoFromWib() {
  time_t nowTs = time(nullptr);
  int hour = 0;
  int minute = 0;
  int second = 0;

  if (nowTs > 100000) {
    struct tm info;
    localtime_r(&nowTs, &info);
    hour = info.tm_hour;
    minute = info.tm_min;
    second = info.tm_sec;
  } else {
    unsigned long sec = millis() / 1000UL;
    unsigned long secInDay = sec % 86400UL;
    hour = secInDay / 3600UL;
    minute = (secInDay % 3600UL) / 60UL;
    second = secInDay % 60UL;
  }

  unsigned long nowSec = (unsigned long)hour * 3600UL + (unsigned long)minute * 60UL + (unsigned long)second;
  if (hour >= 7 && hour < 16) return {"S1", 9, nowSec - (7UL * 3600UL)};
  if (hour >= 16 && hour < 23) return {"S2", 7, nowSec - (16UL * 3600UL)};

  // Shift 3: 23:00 - 07:00
  unsigned long startSec = 23UL * 3600UL;
  unsigned long elapsed = (hour >= 23) ? (nowSec - startSec) : (24UL * 3600UL - startSec + nowSec);
  return {"S3", 8, elapsed};
}

unsigned long calcTargetSaatIni(const ShiftInfo& shift) {
  unsigned long targetPerShift = targetPerHour * (unsigned long)shift.durationHours;
  unsigned long intervalCount = (targetIntervalSeconds > 0) ? (shift.elapsedSeconds / targetIntervalSeconds) : 0;
  unsigned long rawTarget = intervalCount * targetPcsPerInterval;
  if (rawTarget > targetPerShift) rawTarget = targetPerShift;
  if (rawTarget <= targetTickerOffset) return 0;
  return rawTarget - targetTickerOffset;
}

String getTimestampWib() {
  time_t nowTs = time(nullptr);
  if (nowTs > 100000) {
    struct tm info;
    localtime_r(&nowTs, &info);
    char out[25];
    snprintf(out, sizeof(out), "%04d-%02d-%02d %02d:%02d:%02d",
             info.tm_year + 1900, info.tm_mon + 1, info.tm_mday,
             info.tm_hour, info.tm_min, info.tm_sec);
    return String(out);
  }

  unsigned long sec = millis() / 1000UL;
  unsigned long hh = (sec / 3600UL) % 24UL;
  unsigned long mm = (sec / 60UL) % 60UL;
  unsigned long ss = sec % 60UL;
  char out[25];
  snprintf(out, sizeof(out), "1970-01-01 %02lu:%02lu:%02lu", hh, mm, ss);
  return String(out);
}

long parseLongField(const String& json, const char* key, long fallbackValue) {
  String quotedKey = String("\"") + key + "\"";
  int keyPos = json.indexOf(quotedKey);
  if (keyPos < 0) return fallbackValue;
  int colonPos = json.indexOf(':', keyPos + quotedKey.length());
  if (colonPos < 0) return fallbackValue;

  int idx = colonPos + 1;
  while (idx < (int)json.length() && (json[idx] == ' ' || json[idx] == '\"')) idx++;
  int endIdx = idx;
  bool hasDigits = false;
  while (endIdx < (int)json.length() && (isDigit(json[endIdx]) || json[endIdx] == '-')) {
    hasDigits = true;
    endIdx++;
  }
  if (!hasDigits) return fallbackValue;
  return json.substring(idx, endIdx).toInt();
}

void applyTargetConfig(const String& message) {
  long nextPerHour = parseLongField(message, "targetPerHour", targetPerHour);
  long nextPcs = parseLongField(message, "pcsPerInterval", targetPcsPerInterval);
  long nextSec = parseLongField(message, "intervalSeconds", targetIntervalSeconds);
  long nextOffset = parseLongField(message, "targetTickerOffset", -1);

  if (nextPerHour > 0) targetPerHour = (unsigned long)nextPerHour;
  if (nextPcs > 0) targetPcsPerInterval = (unsigned long)nextPcs;
  if (nextSec > 0) targetIntervalSeconds = (unsigned long)nextSec;
  if (nextOffset >= 0) targetTickerOffset = (unsigned long)nextOffset;
}

void resetTargetTickerOffset() {
  ShiftInfo shift = getShiftInfoFromWib();
  unsigned long intervalCount = (targetIntervalSeconds > 0) ? (shift.elapsedSeconds / targetIntervalSeconds) : 0;
  unsigned long targetPerShift = targetPerHour * (unsigned long)shift.durationHours;
  unsigned long rawTarget = intervalCount * targetPcsPerInterval;
  if (rawTarget > targetPerShift) rawTarget = targetPerShift;
  targetTickerOffset = rawTarget;
}

void ICACHE_RAM_ATTR hitungBarang() {
  if (!counterEdgePending) {
    counterEdgePending = true;
    counterEdgeUs = micros();
  }
}

void publishCounterSnapshot() {
  if (!client.connected()) return;
  String payload = "[{\"deviceId\":\"" + String(deviceId) + "\",\"waktu\":\"" + getTimestampWib() + "\",\"counter\":" + String(totalCounter) +
                   ",\"ip\":\"" + WiFi.localIP().toString() + "\",\"mac\":\"" + WiFi.macAddress() + "\"}]";
  if (client.publish(mqtt_topic.c_str(), payload.c_str())) {
    lastCounterSent = totalCounter;
    lastHeartbeatSentMs = millis();
  }
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  (void)topic;
  String message;
  for (unsigned int i = 0; i < length; i++) message += (char)payload[i];
  String lower = message;
  lower.toLowerCase();

  if (lower.indexOf("\"action\":\"target_config\"") >= 0) {
    applyTargetConfig(message);
    return;
  }

  if (lower.indexOf("\"action\":\"target_ticker_reset\"") >= 0) {
    if (lower.indexOf("\"source\":\"device\"") >= 0) return;
    resetTargetTickerOffset();
    syncedTargetTickerValue = 0;
    syncedTargetTickerAtMs = millis();
    return;
  }

  if (lower.indexOf("\"action\":\"target_ticker_value\"") >= 0) {
    long nextValue = parseLongField(message, "value", -1);
    if (nextValue >= 0) {
      syncedTargetTickerValue = (unsigned long)nextValue;
      syncedTargetTickerAtMs = millis();
    }
    return;
  }

  if (lower.indexOf("reset") >= 0) {
    totalCounter = 0;
    lastCounterSent = 0;
    publishCounterSnapshot();
  }
}

bool setupWifi(unsigned long timeoutMs = 15000) {
  Serial.print("Menghubungkan ke WiFi: ");
  Serial.println(ssid);
  setWifiLed(false);

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.setSleepMode(WIFI_NONE_SLEEP);
  WiFi.disconnect(false);
  delay(100);
  WiFi.begin(ssid, password);

  unsigned long startMs = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - startMs) < timeoutMs) {
    delay(500);
    Serial.print(".");
    display.showNumberDecEx(3333, ((millis() / 500) % 2) ? 0x40 : 0x00, true, 4, 0);
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi Terhubung!");
    Serial.print("IP ESP8266: ");
    Serial.println(WiFi.localIP());
    setWifiLed(true);
    return true;
  }

  Serial.println("\nWiFi gagal tersambung dalam batas waktu. Sistem lanjut tanpa WiFi.");
  return false;
}

bool reconnectMqtt() {
  if (client.connected()) return true;
  String clientId = "ESP8266Client-";
  clientId += String(ESP.getChipId(), HEX);
  bool ok = false;
#if USE_HIVEMQ_CLOUD
  ok = client.connect(clientId.c_str(), mqtt_user, mqtt_pass);
#else
  ok = client.connect(clientId.c_str());
#endif
  if (ok) {
    client.subscribe(mqtt_topic_command.c_str());
    Serial.print("MQTT connected, subscribe: ");
    Serial.println(mqtt_topic_command);
  } else {
    Serial.print("MQTT gagal, state=");
    Serial.println(client.state());
  }
  return ok;
}

void showNumberOnSevenSeg(unsigned long value) {
  display.showNumberDec((int)value, true, 4, 0);
}

void showScrollingNumber(const String& text) {
  if (text != sevenSegLastText) {
    sevenSegLastText = text;
    sevenSegScrollIndex = 0;
  }
  if (millis() - lastSevenSegScrollMs < sevenSegScrollIntervalMs) return;
  lastSevenSegScrollMs = millis();

  String padded = "    " + text + "    ";
  int maxStart = padded.length() - 4;
  if (maxStart < 0) maxStart = 0;
  if (sevenSegScrollIndex > maxStart) sevenSegScrollIndex = 0;

  String window = padded.substring(sevenSegScrollIndex, sevenSegScrollIndex + 4);
  uint8_t segs[4];
  for (int i = 0; i < 4; i++) segs[i] = (window[i] >= '0' && window[i] <= '9') ? display.encodeDigit(window[i] - '0') : 0x00;
  display.setSegments(segs);
  sevenSegScrollIndex++;
}

void updateSevenSegmentDisplay() {
  ShiftInfo shift = getShiftInfoFromWib();
  if (lastShiftName != shift.name) {
    lastShiftName = shift.name;
    targetTickerOffset = 0;
  }

  unsigned long localTarget = calcTargetSaatIni(shift);
  unsigned long targetSaatIni = localTarget;
  if (syncedTargetTickerAtMs > 0 && (millis() - syncedTargetTickerAtMs) <= syncedTargetTickerTtlMs) {
    targetSaatIni = syncedTargetTickerValue;
  }

  if (targetSaatIni <= 9999UL) {
    showNumberOnSevenSeg(targetSaatIni);
    sevenSegLastText = "";
    return;
  }
  showScrollingNumber(String(targetSaatIni));
}

void processCounterInput() {
  bool pinHigh = (digitalRead(pinRelay) == HIGH);
  if (!counterInputArmed) {
    if (pinHigh) {
      if (counterHighSinceMs == 0) counterHighSinceMs = millis();
      else if ((millis() - counterHighSinceMs) >= counterRearmHighStableMs) counterInputArmed = true;
    } else {
      counterHighSinceMs = 0;
    }
  }

  if (!counterEdgePending) return;
  if ((micros() - counterEdgeUs) < counterConfirmUs) return;

  bool stillLow = (digitalRead(pinRelay) == LOW);
  unsigned long nowMs = millis();
  if (stillLow && counterInputArmed && (nowMs - lastCounterAcceptedMs) >= counterMinIntervalMs) {
    totalCounter++;
    lastCounterAcceptedMs = nowMs;
    counterInputArmed = false;
    counterHighSinceMs = 0;
  }
  counterEdgePending = false;
}

void triggerCounterResetFromButton() {
  totalCounter = 0;
  lastCounterSent = 0;
  publishCounterSnapshot();
  if (client.connected()) {
    String payload = "{\"action\":\"reset\",\"source\":\"device\",\"deviceId\":\"" + String(deviceId) + "\"}";
    client.publish(mqtt_topic_command.c_str(), payload.c_str());
  }
}

void triggerTargetResetFromButton() {
  resetTargetTickerOffset();
  syncedTargetTickerValue = 0;
  syncedTargetTickerAtMs = millis();
  if (client.connected()) {
    String payload = "{\"action\":\"target_ticker_reset\",\"source\":\"device\",\"deviceId\":\"" + String(deviceId) +
                     "\",\"targetTickerOffset\":" + String(targetTickerOffset) + "}";
    client.publish(mqtt_topic_command.c_str(), payload.c_str());
  }
}

void handleButtons() {
  unsigned long nowMs = millis();

  bool r1 = digitalRead(pinBtnResetCounter);
  if (r1 != btnCounterLastReading) { btnCounterLastReading = r1; btnCounterLastChangeMs = nowMs; }
  if ((nowMs - btnCounterLastChangeMs) >= buttonDebounceMs && r1 != btnCounterStableState) {
    btnCounterStableState = r1;
    bool pressed = (btnCounterStableState == LOW);
    if (pressed && !btnCounterPressedLatch) { btnCounterPressedLatch = true; triggerCounterResetFromButton(); }
    else if (!pressed) btnCounterPressedLatch = false;
  }

  bool r2 = digitalRead(pinBtnResetTarget);
  if (r2 != btnTargetLastReading) { btnTargetLastReading = r2; btnTargetLastChangeMs = nowMs; }
  if ((nowMs - btnTargetLastChangeMs) >= buttonDebounceMs && r2 != btnTargetStableState) {
    btnTargetStableState = r2;
    bool pressed = (btnTargetStableState == LOW);
    if (pressed && !btnTargetPressedLatch) { btnTargetPressedLatch = true; triggerTargetResetFromButton(); }
    else if (!pressed) btnTargetPressedLatch = false;
  }
}

void setup() {
  Serial.begin(115200);
  delay(1200);
  Serial.println("\n--- ESP8266 Counter Start ---");
  buildMqttTopics();
  Serial.print("Device ID: ");
  Serial.println(deviceId);
  Serial.print("Topic increment: ");
  Serial.println(mqtt_topic);
  Serial.print("Topic command: ");
  Serial.println(mqtt_topic_command);

  pinMode(pinRelay, INPUT_PULLUP);
  pinMode(pinBtnResetCounter, INPUT_PULLUP);
  pinMode(pinBtnResetTarget, INPUT_PULLUP);
  pinMode(pinLedWifi, OUTPUT);
  setWifiLed(false);

  display.setBrightness(7, true);
  display.showNumberDec(1111, true, 4, 0);
  delay(600);

  attachInterrupt(digitalPinToInterrupt(pinRelay), hitungBarang, FALLING);

#if USE_HIVEMQ_CLOUD
  espClient.setInsecure();
  espClient.setBufferSizes(512, 512);
  client.setBufferSize(512);
#endif
  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(mqttCallback);

  setupWifi(15000);
  configTime(gmtOffsetSeconds, daylightOffsetSeconds, "pool.ntp.org", "id.pool.ntp.org", "time.google.com");

  display.showNumberDec(5555, true, 4, 0);
  delay(500);
  lastSevenSegUpdateMs = 0;
}

void loop() {
  processCounterInput();
  handleButtons();

  setWifiLed(WiFi.status() == WL_CONNECTED);
  static unsigned long lastWifiRetryMs = 0;
  if (WiFi.status() != WL_CONNECTED && millis() - lastWifiRetryMs > 30000) {
    lastWifiRetryMs = millis();
    Serial.println("WiFi retry...");
    WiFi.disconnect(false);
    WiFi.begin(ssid, password);
  }

  if (WiFi.status() == WL_CONNECTED) {
    if (!client.connected()) {
      if (millis() - lastMqttReconnectAttempt > 5000) {
        lastMqttReconnectAttempt = millis();
        reconnectMqtt();
      }
    } else {
      client.loop();
    }
  }

  // Heartbeat periodik: walau tidak ada barang, dashboard tetap tahu device online.
  if (client.connected() && (millis() - lastHeartbeatSentMs) >= heartbeatIntervalMs) {
    publishCounterSnapshot();
  }

  if (totalCounter != lastCounterSent && client.connected()) {
    publishCounterSnapshot();
  }

  if (millis() - lastSevenSegUpdateMs >= sevenSegUpdateIntervalMs) {
    lastSevenSegUpdateMs = millis();
    updateSevenSegmentDisplay();
  }
}
