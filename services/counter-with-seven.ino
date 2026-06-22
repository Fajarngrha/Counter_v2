#include <WiFi.h>
#include <PubSubClient.h>
#include <time.h>
#include <TM1637Display.h>
#include <ThreeWire.h>
#include <RtcDS1302.h>

const char* ssid = "ARRAZKA 2 LANTAI 2";
const char* password = "Razka1109";
const char* mqtt_server = "172.20.10.3";
const int mqtt_port = 1883;

const char* mqtt_topic = "iot/counter/increment";
const char* mqtt_topic_command = "iot/counter/command";
const long gmtOffsetSeconds = 7 * 3600; // WIB UTC+7
const int daylightOffsetSeconds = 0;

const int pinRelay = 5;

// Sesuaikan sesuai wiring TM1637 Anda.
// Pastikan tidak bentrok dengan pin sensor/RTC.
const int sevenSegClkPin = 4;
const int sevenSegDioPin = 1;

ThreeWire myWire(7, 6, 10);
RtcDS1302<ThreeWire> Rtc(myWire);
TM1637Display display(sevenSegClkPin, sevenSegDioPin);

volatile unsigned long totalCounter = 0;
unsigned long lastCounterSent = 0;

volatile unsigned long lastDebounceTime = 0;
const unsigned long debounceDelay = 300; // ms

portMUX_TYPE mux = portMUX_INITIALIZER_UNLOCKED;

WiFiClient espClient;
PubSubClient client(espClient);

unsigned long lastMqttReconnectAttempt = 0;
unsigned long lastSevenSegUpdateMs = 0;
const unsigned long sevenSegUpdateIntervalMs = 1000;
unsigned long lastSevenSegScrollMs = 0;
const unsigned long sevenSegScrollIntervalMs = 450;
int sevenSegScrollIndex = 0;
String sevenSegLastText = "";

unsigned long targetPerHour = 1800;
unsigned long targetPcsPerInterval = 5;
unsigned long targetIntervalSeconds = 10;
unsigned long targetTickerOffset = 0;
String lastShiftName = "";

String getRtcTimestamp();
void applyTargetConfig(const String& message);
void resetTargetTickerOffset();
void handleSerialRtcCalibration();
void printRtcNow();
void syncRtcFromNtpWib();
void updateSevenSegmentDisplay();
void showNumberOnSevenSeg(unsigned long value);
void showScrollingNumber(const String& text);

struct ShiftInfo {
  const char* name;
  uint8_t durationHours;
  unsigned long elapsedSeconds;
};

ShiftInfo getShiftInfo(const RtcDateTime& now) {
  int hour = now.Hour();
  int minute = now.Minute();
  int second = now.Second();
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
  unsigned long currentTime = millis();
  if ((currentTime - lastDebounceTime) > debounceDelay) {
    totalCounter++;
    lastDebounceTime = currentTime;
  }
}

void setup_wifi() {
  delay(10);
  Serial.print("Menghubungkan ke WiFi: ");
  Serial.println(ssid);

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nWiFi Terhubung!");
  Serial.print("IP ESP32: ");
  Serial.println(WiFi.localIP());
}

bool reconnectMqtt() {
  if (client.connected()) return true;

  Serial.print("Mencoba koneksi MQTT...");
  String clientId = "ESP32C3Client-";
  clientId += String((uint32_t)ESP.getEfuseMac(), HEX);

  if (client.connect(clientId.c_str())) {
    Serial.println(" Berhasil Terhubung ke Broker!");
    client.subscribe(mqtt_topic_command);
    Serial.print("Subscribe ke: ");
    Serial.println(mqtt_topic_command);
    return true;
  }

  Serial.print(" Gagal, status=");
  Serial.println(client.state());
  return false;
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
    resetTargetTickerOffset();
    Serial.println("Target saat ini di-reset dari dashboard.");
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
  Rtc.Begin();
  Rtc.SetIsWriteProtected(false);

  if (!Rtc.GetIsRunning()) {
    Serial.println("RTC tidak berjalan, menyalakan RTC...");
    Rtc.SetIsRunning(true);
  }

  if (!Rtc.IsDateTimeValid()) {
    Serial.println("Waktu RTC tidak valid, set ke waktu compile.");
    RtcDateTime compiled(__DATE__, __TIME__);
    Rtc.SetDateTime(compiled);
  }
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

  RtcDateTime ntpTime(
    timeinfo.tm_year + 1900,
    timeinfo.tm_mon + 1,
    timeinfo.tm_mday,
    timeinfo.tm_hour,
    timeinfo.tm_min,
    timeinfo.tm_sec
  );

  Rtc.SetDateTime(ntpTime);
  Serial.println("RTC berhasil sinkron otomatis dari NTP.");
  printRtcNow();
}

String getRtcTimestamp() {
  RtcDateTime now = Rtc.GetDateTime();

  char timeBuffer[25];
  snprintf(timeBuffer, sizeof(timeBuffer), "%04u-%02u-%02u %02u:%02u:%02u",
           now.Year(), now.Month(), now.Day(),
           now.Hour(), now.Minute(), now.Second());

  return String(timeBuffer);
}

void printRtcNow() {
  RtcDateTime now = Rtc.GetDateTime();
  char buf[25];
  snprintf(buf, sizeof(buf), "%04u-%02u-%02u %02u:%02u:%02u",
           now.Year(), now.Month(), now.Day(),
           now.Hour(), now.Minute(), now.Second());
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

    RtcDateTime manual(year, month, day, hour, minute, second);
    Rtc.SetDateTime(manual);
    Serial.println("RTC berhasil dikalibrasi ke WIB.");
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

  if (nextPerHour > 0) targetPerHour = (unsigned long)nextPerHour;
  if (nextPcs > 0) targetPcsPerInterval = (unsigned long)nextPcs;
  if (nextSec > 0) targetIntervalSeconds = (unsigned long)nextSec;
}

void resetTargetTickerOffset() {
  RtcDateTime now = Rtc.GetDateTime();
  ShiftInfo shift = getShiftInfo(now);

  unsigned long intervalCount = (targetIntervalSeconds > 0) ? (shift.elapsedSeconds / targetIntervalSeconds) : 0;
  unsigned long targetPerShift = targetPerHour * (unsigned long)shift.durationHours;
  unsigned long rawTarget = intervalCount * targetPcsPerInterval;
  if (rawTarget > targetPerShift) rawTarget = targetPerShift;

  targetTickerOffset = rawTarget;
}

void showNumberOnSevenSeg(unsigned long value) {
  display.showNumberDec((int)value, false, 4, 0);
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
  RtcDateTime now = Rtc.GetDateTime();
  ShiftInfo shift = getShiftInfo(now);

  if (lastShiftName != shift.name) {
    lastShiftName = shift.name;
    targetTickerOffset = 0;
  }

  unsigned long targetSaatIni = calcTargetSaatIni(shift);
  if (targetSaatIni <= 9999UL) {
    showNumberOnSevenSeg(targetSaatIni);
    sevenSegLastText = "";
    sevenSegScrollIndex = 0;
    return;
  }

  showScrollingNumber(String(targetSaatIni));
}

void setup() {
  Serial.begin(115200);
  delay(2000);
  Serial.println("\n--- Sistem Smart Counter (Seven Segment) Memulai ---");

  initRtc();
  printRtcNow();
  Serial.println("Kalibrasi RTC via Serial:");
  Serial.println("  SHOWWIB");
  Serial.println("  SETWIB YYYY-MM-DD HH:MM:SS");

  display.setBrightness(0x0f, true);
  display.showNumberDec(8888, false, 4, 0);
  delay(700);
  display.clear();

  setup_wifi();
  syncRtcFromNtpWib();

  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(mqttCallback);

  pinMode(pinRelay, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(pinRelay), hitungBarang, FALLING);
}

void loop() {
  handleSerialRtcCalibration();

  // Jaga koneksi MQTT non-blocking
  if (!client.connected()) {
    unsigned long nowMs = millis();
    if (nowMs - lastMqttReconnectAttempt > 5000) {
      lastMqttReconnectAttempt = nowMs;
      reconnectMqtt();
    }
  } else {
    client.loop();
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
