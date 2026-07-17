#include <WiFi.h>
#include <PubSubClient.h>
#include <time.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
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
const int lcdSdaPin = 8;
const int lcdSclPin = 9;
const uint32_t lcdI2cClockHz = 50000; // turunkan clock agar lebih stabil pada kabel/noise

// Sesuaikan alamat jika LCD Anda memakai 0x3F.
const uint8_t lcdAddress = 0x27;
const uint8_t lcdCols = 16;
const uint8_t lcdRows = 2;

ThreeWire myWire(7, 6, 10);
RtcDS1302<ThreeWire> Rtc(myWire);
LiquidCrystal_I2C* lcd = nullptr;
uint8_t activeLcdAddress = 0;
int activeLcdSdaPin = lcdSdaPin;
int activeLcdSclPin = lcdSclPin;

volatile unsigned long totalCounter = 0;
unsigned long lastCounterSent = 0;

volatile unsigned long lastDebounceTime = 0;
const unsigned long debounceDelay = 300; // ms

portMUX_TYPE mux = portMUX_INITIALIZER_UNLOCKED;

WiFiClient espClient;
PubSubClient client(espClient);

unsigned long lastMqttReconnectAttempt = 0;
unsigned long lastLcdUpdateMs = 0;
const unsigned long lcdUpdateIntervalMs = 2000; // perlambat refresh LCD agar lebih nyaman dibaca
const unsigned long lcdForceRedrawMs = 8000; // paksa redraw berkala agar tidak "stuck blank"
const unsigned long lcdWatchdogReinitMs = 30000; // reinit jika terlalu lama tidak paint
unsigned long lastLcdPaintMs = 0;
uint8_t lcdErrorCount = 0;
const uint8_t lcdErrorThreshold = 3;

unsigned long targetPerHour = 1800;
unsigned long targetPcsPerInterval = 5;
unsigned long targetIntervalSeconds = 10;
unsigned long targetTickerOffset = 0;
String lastShiftName = "";

String getRtcTimestamp();
void updateLcdDisplay();
void applyTargetConfig(const String& message);
void resetTargetTickerOffset();
void writeLcdLine(uint8_t row, const char* text);
void handleSerialRtcCalibration();
void printRtcNow();
void syncRtcFromNtpWib();
bool isLcdPresent();
void initLcdHardware(bool showBootMessage);
void reinitLcd(const char* reason);
uint8_t detectLcdAddress();

struct ShiftInfo {
  const char* name;
  uint8_t durationHours;
  unsigned long elapsedSeconds;
};

struct I2cPinProfile {
  int sda;
  int scl;
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

void updateLcdDisplay() {
  RtcDateTime now = Rtc.GetDateTime();
  ShiftInfo shift = getShiftInfo(now);

  if (lastShiftName != shift.name) {
    lastShiftName = shift.name;
    targetTickerOffset = 0;
  }

  unsigned long targetSaatIni = calcTargetSaatIni(shift);

  char line1[17];
  snprintf(line1, sizeof(line1), "Jam %02u:%02u  %s",
           now.Hour(), now.Minute(), shift.name);

  char line2[17];
  snprintf(line2, sizeof(line2), "Target:%lu", targetSaatIni);

  static char lastLine1[17] = "";
  static char lastLine2[17] = "";

  const bool forceRedraw = (millis() - lastLcdPaintMs) >= lcdForceRedrawMs;
  if (!forceRedraw && strcmp(lastLine1, line1) == 0 && strcmp(lastLine2, line2) == 0) {
    return;
  }

  if (!isLcdPresent()) {
    lcdErrorCount++;
    Serial.print("LCD I2C tidak terdeteksi (");
    Serial.print(lcdErrorCount);
    Serial.println(").");
    if (lcdErrorCount == 1) {
      Serial.print("Cek wiring/power. Pin aktif SDA=");
      Serial.print(activeLcdSdaPin);
      Serial.print(" SCL=");
      Serial.println(activeLcdSclPin);
    }
    if (lcdErrorCount >= lcdErrorThreshold) {
      reinitLcd("I2C tidak terdeteksi berulang");
    }
    return;
  }

  writeLcdLine(0, line1);
  writeLcdLine(1, line2);
  lastLcdPaintMs = millis();
  lcdErrorCount = 0;

  strncpy(lastLine1, line1, sizeof(lastLine1) - 1);
  lastLine1[sizeof(lastLine1) - 1] = '\0';
  strncpy(lastLine2, line2, sizeof(lastLine2) - 1);
  lastLine2[sizeof(lastLine2) - 1] = '\0';
}

void writeLcdLine(uint8_t row, const char* text) {
  if (lcd == nullptr) return;

  char buf[17];
  memset(buf, ' ', 16);
  buf[16] = '\0';

  size_t len = strlen(text);
  if (len > 16) len = 16;
  memcpy(buf, text, len);

  lcd->setCursor(0, row);
  lcd->print(buf);
}

bool isLcdPresent() {
  if (activeLcdAddress == 0) return false;
  Wire.begin(activeLcdSdaPin, activeLcdSclPin);
  Wire.setClock(lcdI2cClockHz);
  Wire.beginTransmission(activeLcdAddress);
  return Wire.endTransmission() == 0;
}

uint8_t detectLcdAddress() {
  const uint8_t preferred[2] = { lcdAddress, 0x3F };

  for (uint8_t i = 0; i < 2; i++) {
    Wire.beginTransmission(preferred[i]);
    if (Wire.endTransmission() == 0) return preferred[i];
  }

  for (uint8_t addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) return addr;
  }

  return 0;
}

void initLcdHardware(bool showBootMessage) {
  const I2cPinProfile profiles[] = {
    { lcdSdaPin, lcdSclPin }, // default dari wiring saat ini
    { 2, 3 },                 // fallback umum ESP32-C3
    { 3, 2 },
    { 0, 1 },
    { 1, 0 },
  };

  uint8_t detected = 0;
  int detectedSda = lcdSdaPin;
  int detectedScl = lcdSclPin;

  for (size_t i = 0; i < (sizeof(profiles) / sizeof(profiles[0])); i++) {
    Wire.begin(profiles[i].sda, profiles[i].scl);
    Wire.setClock(lcdI2cClockHz);
    delay(10);
    detected = detectLcdAddress();
    if (detected != 0) {
      detectedSda = profiles[i].sda;
      detectedScl = profiles[i].scl;
      break;
    }
  }

  if (detected == 0) {
    activeLcdAddress = 0;
    Serial.println("LCD tidak terdeteksi saat init.");
    return;
  }

  activeLcdSdaPin = detectedSda;
  activeLcdSclPin = detectedScl;

  if (lcd == nullptr || detected != activeLcdAddress) {
    if (lcd != nullptr) {
      delete lcd;
      lcd = nullptr;
    }
    lcd = new LiquidCrystal_I2C(detected, lcdCols, lcdRows);
    activeLcdAddress = detected;
    Serial.print("LCD terdeteksi di alamat 0x");
    Serial.println(activeLcdAddress, HEX);
    Serial.print("Pin I2C aktif SDA=");
    Serial.print(activeLcdSdaPin);
    Serial.print(" SCL=");
    Serial.println(activeLcdSclPin);
  }

  lcd->init();
  lcd->backlight();
  lcd->clear();

  if (showBootMessage) {
    char bootLine[17];
    snprintf(bootLine, sizeof(bootLine), "LCD OK 0x%02X", activeLcdAddress);
    writeLcdLine(0, "Smart Counter");
    writeLcdLine(1, bootLine);
    delay(1200);
    lcd->clear();
  }

  lastLcdPaintMs = millis();
  lcdErrorCount = 0;
}

void reinitLcd(const char* reason) {
  Serial.print("Reinit LCD: ");
  Serial.println(reason);
  initLcdHardware(false);
}

void setup() {
  Serial.begin(115200);
  delay(2000);
  Serial.println("\n--- Sistem Smart Counter Memulai ---");

  initRtc();
  printRtcNow();
  Serial.println("Kalibrasi RTC via Serial:");
  Serial.println("  SHOWWIB");
  Serial.println("  SETWIB YYYY-MM-DD HH:MM:SS");

  initLcdHardware(true);

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

  if (millis() - lastLcdUpdateMs >= lcdUpdateIntervalMs) {
    lastLcdUpdateMs = millis();
    updateLcdDisplay();
  }

  if ((millis() - lastLcdPaintMs) >= lcdWatchdogReinitMs) {
    reinitLcd("watchdog timeout");
  }
}