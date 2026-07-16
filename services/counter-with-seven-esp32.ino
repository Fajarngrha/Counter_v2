#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <time.h>
#include <Wire.h>
#include <RTClib.h>
#include <TM1637Display.h>
#define USE_HIVEMQ_CLOUD true

const char* ssid = "FID";
const char* password = "FCC_2022#idn";
#if USE_HIVEMQ_CLOUD
const char* mqtt_server = "e49b2fe6d5eb4d3fa5267a1ab8ff12d5.s1.eu.hivemq.cloud";  // contoh: xxxx.s1.eu.hivemq.cloud
const int mqtt_port = 8883;
const char* mqtt_user = "espcounter";
const char* mqtt_pass = "Acernitro5";
#else
const char* mqtt_server = "172.20.10.3";
const int mqtt_port = 1883;
const char* mqtt_user = nullptr;
const char* mqtt_pass = nullptr;
#endif

const char* mqtt_topic = "iot/counter/increment";
const char* mqtt_topic_command = "iot/counter/command";
const long gmtOffsetSeconds = 7 * 3600; // WIB UTC+7
const int daylightOffsetSeconds = 0;

#define USE_ESP32_DEVKIT true

#if USE_ESP32_DEVKIT
// ESP32 DevKit (aman dari pin strapping yang sensitif)
const int pinRelay = 27;
const int pinBtnResetCounter = 25;
const int pinBtnResetTarget = 26;
const int rtcSdaPin = 21;
const int rtcSclPin = 22;
const int sevenSegClkPin = 4;
const int sevenSegDioPin = 5;
const int pinLedPower = 32;   // LED merah (power): ON terus setelah boot
const int pinLedWifi = 33;    // LED hijau: ON saat WiFi tersambung

RTC_DS3231 rtc;
TM1637Display display(sevenSegClkPin, sevenSegDioPin);
bool rtcAvailable = false;
DateTime fallbackBootTime = DateTime(F(__DATE__), F(__TIME__));
unsigned long fallbackBootMs = 0;

volatile unsigned long totalCounter = 0;
unsigned long lastCounterSent = 0;

volatile unsigned long lastDebounceTime = 0;
const unsigned long debounceDelay = 300; // ms
volatile bool counterEdgePending = false;
volatile unsigned long counterEdgeUs = 0;
bool counterInputArmed = true;
unsigned long counterHighSinceMs = 0;
unsigned long lastCounterAcceptedMs = 0;
const unsigned long counterConfirmUs = 15000;        // 15ms verifikasi level LOW
const unsigned long counterMinIntervalMs = 300;      // jeda minimum antar count (anti double count)
const unsigned long counterRearmHighStableMs = 120;  // wajib HIGH stabil sebelum re-arm

portMUX_TYPE mux = portMUX_INITIALIZER_UNLOCKED;

#if USE_HIVEMQ_CLOUD
WiFiClientSecure espClient;
#else
WiFiClient espClient;
#endif
PubSubClient client(espClient);

unsigned long lastMqttReconnectAttempt = 0;
unsigned long lastSevenSegUpdateMs = 0;
const unsigned long sevenSegUpdateIntervalMs = 1000;
unsigned long lastSevenSegScrollMs = 0;
const unsigned long sevenSegScrollIntervalMs = 450;
int sevenSegScrollIndex = 0;
String sevenSegLastText = "";
const unsigned long buttonDebounceMs = 60;
const bool counterButtonActiveLow = true;
bool btnCounterLastReading = HIGH;
bool btnCounterStableState = HIGH;
bool btnCounterIdleState = HIGH;
bool btnCounterPressedLatch = false;
unsigned long btnCounterLastChangeMs = 0;
bool btnTargetLastReading = HIGH;
bool btnTargetStableState = HIGH;
bool btnTargetIdleState = HIGH;
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

String getRtcTimestamp();
void applyTargetConfig(const String& message);
void resetTargetTickerOffset();
void handleSerialRtcCalibration();
void printRtcNow();
void syncRtcFromNtpWib();
bool setup_wifi(unsigned long timeoutMs = 15000);
void sevenSegAllOn();
void showSevenSegStatus(int code);
void updateSevenSegmentDisplay();
void showNumberOnSevenSeg(unsigned long value);
void showScrollingNumber(const String& text);
void handleButtons();
void triggerCounterResetFromButton();
void triggerTargetResetFromButton();
DateTime getCurrentDateTimeWib();
void processCounterInput();

struct ShiftInfo {
  const char* name;
  uint8_t durationHours;
  unsigned long elapsedSeconds;
};

ShiftInfo getShiftInfo(const DateTime& now) {
  int hour = now.hour();
  int minute = now.minute();
  int second = now.second();
  unsigned long nowSec = (unsigned long)hour * 3600UL + (unsigned long)minute * 60UL + (unsigned long)second;

  if (hour >= 7 && hour < 16) {
    unsigned long startSec = 7UL * 3600UL;
    return { "S1", 9, nowSec - startSec };
  }

  if (hour >= 16 && hour < 23) {
    unsigned long startSec = 16UL * 3600UL;
    return { "S2", 7, nowSec - startSec };
  }

  // Shift 3 (23:00 - 07:00)
  unsigned long startSec = 23UL * 3600UL;
  unsigned long elapsed = (hour >= 23) ? (nowSec - startSec) : (24UL * 3600UL - startSec + nowSec);
  return { "S3", 8, elapsed };
}

unsigned long calcTargetSaatIni(const ShiftInfo& shift) {
  unsigned long targetPerShift = targetPerHour * (unsigned long)shift.durationHours;
  unsigned long intervalCount = (targetIntervalSeconds > 0) ? (shift.elapsedSeconds / targetIntervalSeconds) : 0;
  unsigned long rawTarget = intervalCount * targetPcsPerInterval;
  if (rawTarget > targetPerShift) rawTarget = targetPerShift;

  if (rawTarget <= targetTickerOffset) return 0;
  return rawTarget - targetTickerOffset;
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
  while (endIdx < (int)json.length() && isDigit(json[endIdx])) {
    hasDigits = true;
    endIdx++;
  }

  if (!hasDigits) return fallbackValue;
  return json.substring(idx, endIdx).toInt();
}

void IRAM_ATTR hitungBarang() {
  const unsigned long nowUs = micros();
  // Catat edge saja di ISR. Validasi pulse dilakukan di loop agar lebih tahan noise.
  if (!counterEdgePending) {
    counterEdgePending = true;
    counterEdgeUs = nowUs;
  }
}

bool setup_wifi(unsigned long timeoutMs) {
  delay(10);
  Serial.print("Menghubungkan ke WiFi: ");
  Serial.println(ssid);
  digitalWrite(pinLedWifi, LOW);

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  const unsigned long startMs = millis();
  int dots = 0;

  while (WiFi.status() != WL_CONNECTED && (millis() - startMs) < timeoutMs) {
    delay(500);
    Serial.print(".");

    // Tampilkan animasi supaya TM1637 tidak terlihat mati saat menunggu WiFi.
    dots = (dots + 1) % 4;
    display.showNumberDecEx(3333, dots == 0 ? 0x00 : 0x40, true, 4, 0);
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi Terhubung!");
    Serial.print("IP ESP32: ");
    Serial.println(WiFi.localIP());
    digitalWrite(pinLedWifi, HIGH);
    showSevenSegStatus(4444);
    return true;
  }

  Serial.println("\nWiFi gagal tersambung dalam batas waktu. Sistem tetap lanjut tanpa WiFi.");
  digitalWrite(pinLedWifi, LOW);
  showSevenSegStatus(4040);
  delay(1000);
  return false;
}

bool reconnectMqtt() {
  if (client.connected()) return true;

  Serial.print("Mencoba koneksi MQTT...");
  String clientId = "ESP32Client-";
  clientId += String((uint32_t)ESP.getEfuseMac(), HEX);

  bool ok = false;
#if USE_HIVEMQ_CLOUD
  ok = client.connect(clientId.c_str(), mqtt_user, mqtt_pass);
#else
  ok = client.connect(clientId.c_str());
#endif

  if (ok) {
    Serial.println(" Berhasil Terhubung ke Broker!");
    client.subscribe(mqtt_topic_command);
    Serial.print("Subscribe ke: ");
    Serial.println(mqtt_topic_command);
    return true;
  }

  Serial.print(" Gagal, status=");
  Serial.println(client.state());
  Serial.print(" Penyebab: ");
  Serial.println(mqttStateText(client.state()));
  printMqttDiagnostics();
  return false;
}

const char* mqttStateText(int state) {
  switch (state) {
    case MQTT_CONNECTION_TIMEOUT:
      return "Timeout - broker tidak merespon (jaringan/DNS/port 8883/TLS).";
    case MQTT_CONNECTION_LOST:
      return "Koneksi terputus.";
    case MQTT_CONNECT_FAILED:
      return "TCP connect gagal ke host broker.";
    case MQTT_DISCONNECTED:
      return "Client belum terkoneksi.";
    case MQTT_CONNECTED:
      return "Terkoneksi.";
    case MQTT_CONNECT_BAD_PROTOCOL:
      return "Versi protokol MQTT tidak cocok.";
    case MQTT_CONNECT_BAD_CLIENT_ID:
      return "Client ID ditolak broker.";
    case MQTT_CONNECT_UNAVAILABLE:
      return "Broker tidak tersedia.";
    case MQTT_CONNECT_BAD_CREDENTIALS:
      return "Username/Password salah.";
    case MQTT_CONNECT_UNAUTHORIZED:
      return "Akses tidak diizinkan (ACL/akun).";
    default:
      return "Status tidak dikenal.";
  }
}

void printMqttDiagnostics() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Diag MQTT: WiFi belum terkoneksi.");
    return;
  }

  Serial.print("Diag MQTT host: ");
  Serial.print(mqtt_server);
  Serial.print(":");
  Serial.println(mqtt_port);

  IPAddress resolvedIp;
  if (!WiFi.hostByName(mqtt_server, resolvedIp)) {
    Serial.println("Diag MQTT: DNS resolve gagal.");
    return;
  }

  Serial.print("Diag MQTT DNS -> ");
  Serial.println(resolvedIp);

#if USE_HIVEMQ_CLOUD
  WiFiClientSecure probeClient;
  probeClient.setInsecure();
  bool tcpOk = probeClient.connect(mqtt_server, mqtt_port, 3000);
#else
  WiFiClient probeClient;
  bool tcpOk = probeClient.connect(mqtt_server, mqtt_port, 3000);
#endif

  if (tcpOk) {
    Serial.println("Diag MQTT: TCP/TLS socket ke broker BERHASIL.");
    probeClient.stop();
  } else {
    Serial.println("Diag MQTT: TCP/TLS socket ke broker GAGAL (kemungkinan internet/port/firewall).");
  }
}

void publishCounterSnapshot() {
  if (!client.connected()) return;

  unsigned long snapshotCounter;
  portENTER_CRITICAL(&mux);
  snapshotCounter = totalCounter;
  portEXIT_CRITICAL(&mux);

  String waktu = getRtcTimestamp();
  String payload = "[{\"waktu\":\"" + waktu + "\",\"counter\":" + String(snapshotCounter) + "}]";

  if (client.publish(mqtt_topic, payload.c_str())) {
    lastCounterSent = snapshotCounter;
    Serial.print("Snapshot counter dikirim: ");
    Serial.println(payload);
  }
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String message;
  for (unsigned int i = 0; i < length; i++) {
    message += (char)payload[i];
  }

  String lowerMessage = message;
  lowerMessage.toLowerCase();

  if (lowerMessage.indexOf("\"action\":\"target_config\"") >= 0) {
    applyTargetConfig(message);
    Serial.println("Konfigurasi target diterima dari dashboard.");
    return;
  }

  if (lowerMessage.indexOf("\"action\":\"target_ticker_reset\"") >= 0) {
    // Abaikan echo pesan reset dari device sendiri agar tidak reset dobel.
    if (lowerMessage.indexOf("\"source\":\"device\"") >= 0) {
      return;
    }

    // Penting: gunakan reset lokal agar setelah reset tampil 0 stabil.
    // Offset dari server bisa berbeda karena jadwal/break dihitung di backend,
    // sedangkan perangkat menghitung dari RTC lokal.
    resetTargetTickerOffset();
    syncedTargetTickerValue = 0;
    syncedTargetTickerAtMs = millis();
    Serial.println("Target saat ini di-reset dari dashboard (pakai offset lokal device).");
    return;
  }

  if (lowerMessage.indexOf("\"action\":\"target_ticker_value\"") >= 0) {
    long nextValue = parseLongField(message, "value", -1);
    if (nextValue >= 0) {
      syncedTargetTickerValue = (unsigned long)nextValue;
      syncedTargetTickerAtMs = millis();
    }
    return;
  }

  if (lowerMessage.indexOf("reset") >= 0) {
    portENTER_CRITICAL(&mux);
    totalCounter = 0;
    portEXIT_CRITICAL(&mux);
    lastCounterSent = 0;
    Serial.println("Counter di-reset ke 0 via MQTT");
    publishCounterSnapshot();
  }
}

void initRtc() {
  Wire.begin(rtcSdaPin, rtcSclPin);

  if (!rtc.begin()) {
    Serial.println("RTC DS3231-PRO tidak ditemukan. Cek wiring SDA/SCL.");
    Serial.println("Lanjut tanpa RTC hardware (fallback waktu internal/NTP).");
    rtcAvailable = false;
    fallbackBootTime = DateTime(F(__DATE__), F(__TIME__));
    fallbackBootMs = millis();
    return;
  }
  rtcAvailable = true;

  if (rtc.lostPower()) {
    Serial.println("RTC kehilangan power, set ke waktu compile.");
    rtc.adjust(DateTime(F(__DATE__), F(__TIME__)));
  }
}

DateTime getCurrentDateTimeWib() {
  if (rtcAvailable) {
    return rtc.now();
  }

  struct tm timeinfo;
  if (getLocalTime(&timeinfo, 10)) {
    return DateTime(
      timeinfo.tm_year + 1900,
      timeinfo.tm_mon + 1,
      timeinfo.tm_mday,
      timeinfo.tm_hour,
      timeinfo.tm_min,
      timeinfo.tm_sec
    );
  }

  const unsigned long elapsedSec = (millis() - fallbackBootMs) / 1000UL;
  return fallbackBootTime + TimeSpan(elapsedSec);
}

void syncRtcFromNtpWib() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Lewati sinkron NTP: WiFi belum terhubung.");
    return;
  }

  Serial.println("Sinkronisasi RTC dari NTP (WIB)...");
  configTime(gmtOffsetSeconds, daylightOffsetSeconds, "pool.ntp.org", "id.pool.ntp.org", "time.google.com");

  struct tm timeinfo;
  bool ok = false;
  for (int i = 0; i < 20; i++) {
    if (getLocalTime(&timeinfo, 500)) {
      ok = true;
      break;
    }
    delay(300);
  }

  if (!ok) {
    Serial.println("NTP tidak tersedia, gunakan waktu RTC saat ini.");
    return;
  }

  DateTime ntpNow = DateTime(
    timeinfo.tm_year + 1900,
    timeinfo.tm_mon + 1,
    timeinfo.tm_mday,
    timeinfo.tm_hour,
    timeinfo.tm_min,
    timeinfo.tm_sec
  );

  fallbackBootTime = ntpNow;
  fallbackBootMs = millis();
  if (rtcAvailable) {
    rtc.adjust(ntpNow);
    Serial.println("RTC berhasil sinkron otomatis dari NTP.");
  } else {
    Serial.println("Sinkron NTP aktif tanpa RTC hardware.");
  }
  printRtcNow();
}

String getRtcTimestamp() {
  DateTime now = getCurrentDateTimeWib();

  char timeBuffer[25];
  snprintf(timeBuffer, sizeof(timeBuffer), "%04u-%02u-%02u %02u:%02u:%02u",
           now.year(), now.month(), now.day(),
           now.hour(), now.minute(), now.second());

  return String(timeBuffer);
}

void printRtcNow() {
  DateTime now = getCurrentDateTimeWib();
  char buf[25];
  snprintf(buf, sizeof(buf), "%04u-%02u-%02u %02u:%02u:%02u",
           now.year(), now.month(), now.day(),
           now.hour(), now.minute(), now.second());
  Serial.print("RTC saat ini (WIB): ");
  Serial.println(buf);
}

void handleSerialRtcCalibration() {
  if (!Serial.available()) return;

  String cmd = Serial.readStringUntil('\n');
  cmd.trim();
  if (cmd.length() == 0) return;

  if (cmd.equalsIgnoreCase("SHOWWIB")) {
    printRtcNow();
    return;
  }

  // Format: SETWIB YYYY-MM-DD HH:MM:SS
  if (cmd.startsWith("SETWIB ")) {
    String value = cmd.substring(7);
    int year, month, day, hour, minute, second;
    int parsed = sscanf(value.c_str(), "%d-%d-%d %d:%d:%d",
                        &year, &month, &day, &hour, &minute, &second);

    bool valid = parsed == 6
      && year >= 2020 && year <= 2099
      && month >= 1 && month <= 12
      && day >= 1 && day <= 31
      && hour >= 0 && hour <= 23
      && minute >= 0 && minute <= 59
      && second >= 0 && second <= 59;

    if (!valid) {
      Serial.println("Format salah. Contoh: SETWIB 2026-06-22 11:30:00");
      return;
    }

    DateTime calibrated = DateTime(year, month, day, hour, minute, second);
    fallbackBootTime = calibrated;
    fallbackBootMs = millis();
    if (rtcAvailable) {
      rtc.adjust(calibrated);
      Serial.println("RTC berhasil dikalibrasi ke WIB.");
    } else {
      Serial.println("Waktu fallback berhasil dikalibrasi (tanpa RTC hardware).");
    }
    printRtcNow();
    return;
  }

  Serial.println("Perintah tidak dikenali.");
  Serial.println("Gunakan:");
  Serial.println("  SHOWWIB");
  Serial.println("  SETWIB YYYY-MM-DD HH:MM:SS");
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
  DateTime now = getCurrentDateTimeWib();
  ShiftInfo shift = getShiftInfo(now);

  unsigned long intervalCount = (targetIntervalSeconds > 0) ? (shift.elapsedSeconds / targetIntervalSeconds) : 0;
  unsigned long targetPerShift = targetPerHour * (unsigned long)shift.durationHours;
  unsigned long rawTarget = intervalCount * targetPcsPerInterval;
  if (rawTarget > targetPerShift) rawTarget = targetPerShift;

  targetTickerOffset = rawTarget;
}

void sevenSegAllOn() {
  uint8_t allOn[] = {0xff, 0xff, 0xff, 0xff};
  display.setSegments(allOn);
}

void showSevenSegStatus(int code) {
  display.setBrightness(7, true);
  display.showNumberDec(code, true, 4, 0);
}

void showNumberOnSevenSeg(unsigned long value) {
  // true = tampilkan leading zero, jadi nilai 0 terlihat sebagai 0000 dan tidak dikira mati.
  display.showNumberDec((int)value, true, 4, 0);
}

void showScrollingNumber(const String& text) {
  if (text != sevenSegLastText) {
    sevenSegLastText = text;
    sevenSegScrollIndex = 0;
    lastSevenSegScrollMs = 0;
  }

  if (millis() - lastSevenSegScrollMs < sevenSegScrollIntervalMs) return;
  lastSevenSegScrollMs = millis();

  String padded = "    " + text + "    ";
  int maxStart = padded.length() - 4;
  if (maxStart < 0) maxStart = 0;
  if (sevenSegScrollIndex > maxStart) sevenSegScrollIndex = 0;

  String window = padded.substring(sevenSegScrollIndex, sevenSegScrollIndex + 4);
  uint8_t segments[4];

  for (int i = 0; i < 4; i++) {
    char c = window[i];
    if (c >= '0' && c <= '9') {
      segments[i] = display.encodeDigit(c - '0');
    } else {
      segments[i] = 0x00;
    }
  }

  display.setSegments(segments);
  sevenSegScrollIndex++;
}

void updateSevenSegmentDisplay() {
  DateTime now = getCurrentDateTimeWib();
  ShiftInfo shift = getShiftInfo(now);

  if (lastShiftName != shift.name) {
    lastShiftName = shift.name;
    targetTickerOffset = 0;
  }

  const unsigned long localTargetSaatIni = calcTargetSaatIni(shift);
  unsigned long targetSaatIni = localTargetSaatIni;
  if (syncedTargetTickerAtMs > 0) {
    const unsigned long syncAgeMs = millis() - syncedTargetTickerAtMs;
    if (syncAgeMs <= syncedTargetTickerTtlMs) {
      // Saat sync segar, ikuti angka server agar sama dengan dashboard.
      targetSaatIni = syncedTargetTickerValue;
    } else {
      // Jika sync telat/hilang, fallback ke lokal agar tidak mentok di 0000.
      targetSaatIni = localTargetSaatIni;
    }
  }
  if (targetSaatIni <= 9999UL) {
    showNumberOnSevenSeg(targetSaatIni);
    sevenSegLastText = "";
    sevenSegScrollIndex = 0;
    return;
  }

  showScrollingNumber(String(targetSaatIni));
}

void triggerCounterResetFromButton() {
  portENTER_CRITICAL(&mux);
  totalCounter = 0;
  portEXIT_CRITICAL(&mux);
  lastCounterSent = 0;
  lastDebounceTime = millis();
  lastCounterAcceptedMs = millis();
  counterInputArmed = true;
  counterHighSinceMs = 0;
  noInterrupts();
  counterEdgePending = false;
  interrupts();

  Serial.println("[BTN] Reset counter aktual ditekan.");
  publishCounterSnapshot();

  if (client.connected()) {
    client.publish(mqtt_topic_command, "{\"action\":\"reset\",\"source\":\"device\"}");
  }
}

void processCounterInput() {
  const bool pinHigh = (digitalRead(pinRelay) == HIGH);

  // Re-arm hanya jika input HIGH stabil beberapa ms (hindari bounce re-close).
  if (!counterInputArmed) {
    if (pinHigh) {
      if (counterHighSinceMs == 0) {
        counterHighSinceMs = millis();
      } else if ((millis() - counterHighSinceMs) >= counterRearmHighStableMs) {
        counterInputArmed = true;
      }
    } else {
      counterHighSinceMs = 0;
    }
  }

  bool pending = false;
  unsigned long edgeUs = 0;
  noInterrupts();
  pending = counterEdgePending;
  edgeUs = counterEdgeUs;
  interrupts();
  if (!pending) return;

  // Tunggu beberapa ms untuk memastikan edge bukan spike/noise singkat.
  if ((micros() - edgeUs) < counterConfirmUs) return;

  const bool stillLow = (digitalRead(pinRelay) == LOW);
  const unsigned long nowMs = millis();
  if (stillLow && counterInputArmed && (nowMs - lastCounterAcceptedMs) >= counterMinIntervalMs) {
    portENTER_CRITICAL(&mux);
    totalCounter++;
    portEXIT_CRITICAL(&mux);
    lastCounterAcceptedMs = nowMs;
    counterInputArmed = false; // 1 cycle = 1 count, tunggu lepas dulu
    counterHighSinceMs = 0;
  }

  noInterrupts();
  counterEdgePending = false;
  interrupts();
}

void triggerTargetResetFromButton() {
  resetTargetTickerOffset();
  syncedTargetTickerValue = 0;
  syncedTargetTickerAtMs = millis();
  Serial.println("[BTN] Reset target saat ini ditekan.");
  lastSevenSegUpdateMs = 0;
  updateSevenSegmentDisplay();

  if (client.connected()) {
    String payload = "{\"action\":\"target_ticker_reset\",\"source\":\"device\",\"targetTickerOffset\":" + String(targetTickerOffset) + "}";
    client.publish(mqtt_topic_command, payload.c_str());
  }
}

void handleButtons() {
  const unsigned long nowMs = millis();

  const bool btnCounterReading = digitalRead(pinBtnResetCounter);
  if (btnCounterReading != btnCounterLastReading) {
    btnCounterLastReading = btnCounterReading;
    btnCounterLastChangeMs = nowMs;
  }
  if ((nowMs - btnCounterLastChangeMs) >= buttonDebounceMs && btnCounterReading != btnCounterStableState) {
    btnCounterStableState = btnCounterReading;
    const bool counterPressed = counterButtonActiveLow
      ? (btnCounterStableState == LOW)
      : (btnCounterStableState == HIGH);
    if (counterPressed && !btnCounterPressedLatch) {
      btnCounterPressedLatch = true;
      triggerCounterResetFromButton();
    } else if (!counterPressed) {
      btnCounterPressedLatch = false;
    }
  }

  const bool btnTargetReading = digitalRead(pinBtnResetTarget);
  if (btnTargetReading != btnTargetLastReading) {
    btnTargetLastReading = btnTargetReading;
    btnTargetLastChangeMs = nowMs;
  }
  if ((nowMs - btnTargetLastChangeMs) >= buttonDebounceMs && btnTargetReading != btnTargetStableState) {
    btnTargetStableState = btnTargetReading;
    const bool targetPressed = (btnTargetStableState != btnTargetIdleState);
    if (targetPressed && !btnTargetPressedLatch) {
      btnTargetPressedLatch = true;
      triggerTargetResetFromButton();
    } else if (!targetPressed) {
      btnTargetPressedLatch = false;
    }
  }
}

void setup() {
  Serial.begin(115200);
  delay(2000);
  Serial.println("\n--- Sistem Smart Counter (Seven Segment + DS3231) Memulai ---");
  pinMode(pinLedPower, OUTPUT);
  pinMode(pinLedWifi, OUTPUT);
  digitalWrite(pinLedPower, HIGH);
  digitalWrite(pinLedWifi, LOW);

  // ============================================================
  // TEST TM1637 PALING AWAL
  // Jika bagian ini tidak muncul, masalahnya wiring/pin/power TM1637,
  // bukan RTC, WiFi, atau MQTT.
  // ============================================================
  display.setBrightness(7, true);
  sevenSegAllOn();
  delay(3000);

  showSevenSegStatus(1111);
  delay(1000);

  // ============================================================
  // RTC
  // ============================================================
  initRtc();
  showSevenSegStatus(2222);
  delay(700);

  printRtcNow();
  Serial.println("Kalibrasi RTC via Serial:");
  Serial.println("  SHOWWIB");
  Serial.println("  SETWIB YYYY-MM-DD HH:MM:SS");

  // ============================================================
  // WiFi: tidak blocking selamanya. Kalau gagal, sistem tetap jalan.
  // ============================================================
  showSevenSegStatus(3333);
  bool wifiOk = setup_wifi(15000);

  if (wifiOk) {
    syncRtcFromNtpWib();
  } else {
    Serial.println("Lewati sinkron NTP karena WiFi belum tersambung.");
  }

#if USE_HIVEMQ_CLOUD
  espClient.setInsecure(); // uji awal HiveMQ; production: pakai CA cert
  client.setBufferSize(512);
#endif
  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(mqttCallback);

  // ============================================================
  // Input counter dan tombol
  // Catatan: pinRelay sekarang GPIO10 supaya GPIO5 bebas untuk TM1637 DIO.
  // Pindahkan kabel sensor/counter dari GPIO5 ke GPIO10.
  // ============================================================
  pinMode(pinRelay, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(pinRelay), hitungBarang, FALLING);

  pinMode(pinBtnResetCounter, INPUT_PULLUP);
  pinMode(pinBtnResetTarget, INPUT_PULLUP);
  delay(10);

  btnCounterIdleState = digitalRead(pinBtnResetCounter);
  btnCounterLastReading = btnCounterIdleState;
  btnCounterStableState = btnCounterIdleState;
  btnCounterPressedLatch = false;

  btnTargetIdleState = digitalRead(pinBtnResetTarget);
  btnTargetLastReading = btnTargetIdleState;
  btnTargetStableState = btnTargetIdleState;
  btnTargetPressedLatch = false;

  Serial.print("[BTN] Idle reset counter=");
  Serial.println(btnCounterIdleState == HIGH ? "HIGH" : "LOW");
  Serial.print("[BTN] Pin reset counter=GPIO");
  Serial.println(pinBtnResetCounter);
  Serial.println("[BTN] Mode reset counter=ACTIVE LOW (tekan ke GND)");
  Serial.print("[BTN] Idle reset target=");
  Serial.println(btnTargetIdleState == HIGH ? "HIGH" : "LOW");

  showSevenSegStatus(5555);
  delay(1200);
  lastSevenSegUpdateMs = 0;
  updateSevenSegmentDisplay();
}

void loop() {
  handleSerialRtcCalibration();
  processCounterInput();
  handleButtons();
  digitalWrite(pinLedWifi, WiFi.status() == WL_CONNECTED ? HIGH : LOW);

  // Coba konek ulang WiFi secara ringan jika sebelumnya gagal/terputus.
  static unsigned long lastWifiReconnectAttempt = 0;
  if (WiFi.status() != WL_CONNECTED && millis() - lastWifiReconnectAttempt > 30000) {
    lastWifiReconnectAttempt = millis();
    Serial.println("WiFi terputus/belum terhubung, coba konek ulang...");
    WiFi.disconnect(false);
    WiFi.begin(ssid, password);
  }

  // Jaga koneksi MQTT non-blocking. MQTT hanya dicoba jika WiFi sudah terhubung.
  if (WiFi.status() == WL_CONNECTED) {
    if (!client.connected()) {
      unsigned long nowMs = millis();
      if (nowMs - lastMqttReconnectAttempt > 5000) {
        lastMqttReconnectAttempt = nowMs;
        reconnectMqtt();
      }
    } else {
      client.loop();
    }
  }

  unsigned long snapshotCounter;
  portENTER_CRITICAL(&mux);
  snapshotCounter = totalCounter;
  portEXIT_CRITICAL(&mux);

  if (snapshotCounter != lastCounterSent && client.connected()) {
    String waktu = getRtcTimestamp();
    String payload = "[{\"waktu\":\"" + waktu + "\",\"counter\":" + String(snapshotCounter) + "}]";

    bool ok = client.publish(mqtt_topic, payload.c_str());

    Serial.println("--------------------------------------------------");
    if (ok) {
      Serial.println("Barang Terdeteksi!");
      Serial.print("Data Terkirim : ");
      Serial.println(payload);
      lastCounterSent = snapshotCounter;
    } else {
      Serial.println("Gagal publish MQTT");
    }
    Serial.println("--------------------------------------------------");
  }

  if (millis() - lastSevenSegUpdateMs >= sevenSegUpdateIntervalMs) {
    lastSevenSegUpdateMs = millis();
    updateSevenSegmentDisplay();
  }
}
