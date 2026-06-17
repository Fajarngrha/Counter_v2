#include <WiFi.h>
#include <PubSubClient.h>
#include <ThreeWire.h>
#include <RtcDS1302.h>

const char* ssid = "ARRAZKA 2 LANTAI 2";
const char* password = "Razka1109";
const char* mqtt_server = "192.168.0.104";
const int mqtt_port = 1883;

const char* mqtt_topic = "iot/counter/increment";

const int pinRelay = 5;

ThreeWire myWire(7, 6, 10);
RtcDS1302<ThreeWire> Rtc(myWire);

volatile unsigned long totalCounter = 0;
unsigned long lastCounterSent = 0;

volatile unsigned long lastDebounceTime = 0;
const unsigned long debounceDelay = 300; // ms

portMUX_TYPE mux = portMUX_INITIALIZER_UNLOCKED;

WiFiClient espClient;
PubSubClient client(espClient);

unsigned long lastMqttReconnectAttempt = 0;

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
    return true;
  }

  Serial.print(" Gagal, status=");
  Serial.println(client.state());
  return false;
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

String getRtcTimestamp() {
  RtcDateTime now = Rtc.GetDateTime();

  char timeBuffer[25];
  snprintf(timeBuffer, sizeof(timeBuffer), "%04u-%02u-%02u %02u:%02u:%02u",
           now.Year(), now.Month(), now.Day(),
           now.Hour(), now.Minute(), now.Second());

  return String(timeBuffer);
}

void setup() {
  Serial.begin(115200);
  delay(2000);
  Serial.println("\n--- Sistem Smart Counter Memulai ---");

  initRtc();

  setup_wifi();
  client.setServer(mqtt_server, mqtt_port);

  pinMode(pinRelay, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(pinRelay), hitungBarang, FALLING);
}


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
}