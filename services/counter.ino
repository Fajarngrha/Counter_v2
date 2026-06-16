#include <WiFi.h>
#include <PubSubClient.h>
#include <ThreeWire.h>
#include <RtcDS1302.h>

// ==========================================
// 1. PENGATURAN WIFI & MQTT
// ==========================================
const char* ssid = "ARRAZKA 2 LANTAI 2";
const char* password = "Razka1109";
const char* mqtt_server = "192.168.0.104";
const int mqtt_port = 1883;

// Samakan dengan MQTT_TOPIC di backend (.env)
const char* mqtt_topic = "iot/counter/increment";
// jika backend kamu masih pakai pabrik/line1/counter, ganti sesuai itu

// ==========================================
// 2. PIN, COUNTER, RTC DS1302
// ==========================================
const int pinRelay = 5;

// DS1302: DAT/IO, CLK/SCLK, RST/CE
ThreeWire myWire(7, 6, 10);
RtcDS1302<ThreeWire> Rtc(myWire);

// Counter dari ISR -> volatile
volatile unsigned long totalCounter = 0;
unsigned long lastCounterSent = 0;

volatile unsigned long lastDebounceTime = 0;
const unsigned long debounceDelay = 300; // ms

// Lock untuk akses variabel shared ISR <-> loop
portMUX_TYPE mux = portMUX_INITIALIZER_UNLOCKED;

WiFiClient espClient;
PubSubClient client(espClient);

unsigned long lastMqttReconnectAttempt = 0;

// ==========================================
// 3. INTERRUPT COUNTER
// ==========================================
void IRAM_ATTR hitungBarang() {
  unsigned long currentTime = millis();
  if ((currentTime - lastDebounceTime) > debounceDelay) {
    totalCounter++;
    lastDebounceTime = currentTime;
  }
}

// ==========================================
// 4. WIFI
// ==========================================
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

// ==========================================
// 5. MQTT
// ==========================================
bool reconnectMqtt() {
  if (client.connected()) return true;

  Serial.print("Mencoba koneksi MQTT...");
  String clientId = "ESP32C3Client-";
  clientId += String((uint32_t)ESP.getEfuseMac(), HEX);

  if (client.connect(clientId.c_str())) {
    Serial.println(" Berhasil Terhubung ke Broker!");
    return true;
  }

  Serial.print(" Gagal, status=");
  Serial.println(client.state());
  return false;
}

// ==========================================
// 6. RTC HELPER
// ==========================================
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

String getRtcTimestamp() {
  RtcDateTime now = Rtc.GetDateTime();

  char timeBuffer[25];
  snprintf(timeBuffer, sizeof(timeBuffer), "%04u-%02u-%02u %02u:%02u:%02u",
           now.Year(), now.Month(), now.Day(),
           now.Hour(), now.Minute(), now.Second());

  return String(timeBuffer);
}

// ==========================================
// 7. SETUP
// ==========================================
void setup() {
  Serial.begin(115200);
  delay(2000);
  Serial.println("\n--- Sistem IoT Counter + RTC DS1302 Memulai ---");

  initRtc();

  setup_wifi();
  client.setServer(mqtt_server, mqtt_port);

  pinMode(pinRelay, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(pinRelay), hitungBarang, FALLING);
}

// ==========================================
// 8. LOOP
// ==========================================
void loop() {
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

  // Ambil snapshot counter secara aman
  unsigned long snapshotCounter;
  portENTER_CRITICAL(&mux);
  snapshotCounter = totalCounter;
  portEXIT_CRITICAL(&mux);

  // Jika ada barang baru terdeteksi
  if (snapshotCounter != lastCounterSent && client.connected()) {
    String waktu = getRtcTimestamp();

    // Format payload sesuai backend:
    // [{"waktu":"2026-06-16 19:01:29","counter":5}]
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
}