# Panduan Sistem IoT — Production Counter

Dokumen ini menjelaskan **konsep, arsitektur, dan alur kerja** sistem IoT Production Counter yang Anda bangun: dari sensor di lapangan hingga dashboard monitoring di server.

Dokumen terkait:
- `Simulasi.md` — uji kirim data ke dashboard
- `production.md` — deploy ke Raspberry Pi & IoT lapangan jauh
- `services/counter.ino` — firmware ESP32

---

## 1) Gambaran Sistem

Sistem ini memantau jumlah barang produksi **secara real-time** menggunakan perangkat IoT (ESP32 + sensor) yang mengirim data lewat protokol **MQTT**. Data diproses backend, disimpan per shift, dan ditampilkan di dashboard web.

### 1.1 Tujuan

- Menghitung barang otomatis setiap kali melewati sensor
- Menampilkan total per shift kerja secara live
- Menyimpan historis produksi saat pergantian shift
- Memberi indikator koneksi perangkat IoT (Online/Offline)
- Mendukung instalasi di **lapangan jauh** dari server (via internet)

### 1.2 Komponen Utama

| Layer | Perangkat / Software | Fungsi |
|-------|----------------------|--------|
| **Edge (Lapangan)** | ESP32-C3 + sensor + RTC DS1302 | Deteksi barang, hitung counter, kirim MQTT |
| **Transport** | MQTT Broker | Saluran data antara ESP32 dan server |
| **Backend** | Node.js (Express + Socket.IO) | Subscribe MQTT, logika shift, API |
| **Storage** | `data/db.json` | State counter + riwayat shift |
| **Frontend** | HTML/CSS/JS | Login, dashboard, riwayat |

---

## 2) Arsitektur Data

### 2.1 Mode LAN (satu lokasi / pabrik)

```
ESP32 (WiFi) ──publish──► MQTT Broker (Mosquitto)
                               │
                               ▼ subscribe
                         Backend Node.js
                               │
                    ┌──────────┴──────────┐
                    ▼                     ▼
              data/db.json          Dashboard Web
```

### 2.2 Mode IoT Lapangan Jauh (disarankan jika site terpisah)

```
[Site Lapangan]                    [Internet]              [Server Kantor]

  ESP32 ──publish──►  MQTT Broker Cloud  ◄──subscribe──  Raspberry Pi
  (WiFi / 4G)         (HiveMQ / EMQX)                    (Backend + Dashboard)
```

**Prinsip IoT:**
- ESP32 **tidak** connect langsung ke IP dashboard/server.
- Keduanya connect ke **broker MQTT yang sama** (biasanya di cloud).
- Data mengalir lewat **topic MQTT**, bukan koneksi langsung antar perangkat.

---

## 3) Alur Kerja End-to-End

```
1. Barang melewati sensor
        ↓
2. ESP32 interrupt → totalCounter++
        ↓
3. ESP32 baca waktu dari RTC DS1302
        ↓
4. ESP32 publish JSON ke topic MQTT
        ↓
5. Broker meneruskan pesan ke subscriber (backend)
        ↓
6. Backend parse payload → update counter shift
        ↓
7. Simpan state ke data/db.json
        ↓
8. Socket.IO push ke browser → dashboard update (1–2 detik)
        ↓
9. Saat pergantian shift (07:00 / 16:00 / 23:00 WIB):
      → auto-save riwayat + snapshot target
      → reset counter shift ke 0
```

---

## 4) Perangkat Edge — ESP32

### 4.1 Hardware

| Komponen | Pin / Koneksi | Keterangan |
|----------|---------------|------------|
| Sensor counter | GPIO 5 (`pinRelay`) | Interrupt FALLING, INPUT_PULLUP |
| RTC DS1302 | DAT=7, CLK=6, RST=10 | Waktu pada setiap event |
| Board | ESP32 / ESP32-C3 | Firmware di `services/counter.ino` |

### 4.2 Library Arduino

- `WiFi.h`
- `PubSubClient.h` (MQTT client)
- `Rtc-DS1302` + `ThreeWire`

### 4.3 Logika Counter di ESP32

1. **Interrupt** `hitungBarang()` menambah `totalCounter` dengan debounce 300 ms.
2. Di `loop()`, jika `totalCounter != lastCounterSent` dan MQTT terhubung → publish.
3. Counter disimpan di memori ESP32 — tetap jalan walau MQTT sementara putus.
4. Saat koneksi kembali, nilai terbaru dikirim ulang.

### 4.4 Konfigurasi Jaringan ESP32

```cpp
const char* ssid = "WIFI_LAPANGAN";
const char* password = "PASSWORD_WIFI";
const char* mqtt_server = "HOSTNAME_BROKER";  // IP lokal ATAU cloud
const int mqtt_port = 1883;                   // 8883 untuk MQTTS (cloud)
const char* mqtt_topic = "iot/counter/increment";
```

| Lingkungan | `mqtt_server` | Port |
|------------|---------------|------|
| LAN / Raspberry Pi lokal | `192.168.0.50` | 1883 |
| Lapangan jauh (cloud) | `xxxx.hivemq.cloud` | 8883 (TLS) |

---

## 5) Protokol MQTT

### 5.1 Mengapa MQTT?

MQTT cocok untuk IoT karena:
- Ringan (cocok ESP32)
- Publish/Subscribe — banyak subscriber bisa terima data yang sama
- Mendukung reconnect otomatis
- Bisa lewat internet via broker cloud

### 5.2 Topic

Default project:

```
iot/counter/increment
```

Topic **harus identik** di:
- Sketch ESP32 (`mqtt_topic`)
- Backend `.env` (`MQTT_TOPIC`)

Untuk multi-site, gunakan topic hierarkis:

```
pabrik/site-a/line1/counter
pabrik/site-b/line2/counter
```

### 5.3 Format Payload (standar project)

**Format utama (dari ESP32):**

```json
[{"waktu":"2026-06-17 14:30:05","counter":42}]
```

**Format alternatif (tetap didukung backend):**

```json
{"waktu":"2026-06-17 14:30:05","counter":42}
```

| Field | Tipe | Wajib | Keterangan |
|-------|------|-------|------------|
| `waktu` | string | disarankan | `YYYY-MM-DD HH:MM:SS` dari RTC ESP32 |
| `counter` | integer ≥ 0 | **ya** | Total counter kumulatif dari perangkat |

### 5.4 Cara Backend Memproses Data

File: `services/mqttService.js`

1. Subscribe ke `MQTT_TOPIC`
2. Parse JSON → ambil `counter` dan `waktu`
3. Panggil `applyDeviceCounter(counter, waktu)`
4. Counter shift di server disinkronkan ke nilai `counter` dari ESP32
5. Proteksi out-of-order: nilai tidak diturunkan jika paket lama datang belakangan
6. Broadcast `dashboard:update` via Socket.IO

---

## 6) Backend & Dashboard

### 6.1 Stack

- **Node.js + Express** — HTTP API + halaman statis
- **Socket.IO** — update dashboard real-time
- **MQTT client** — terima data dari broker
- **JSON file DB** — `data/db.json` (tanpa dependency native)

### 6.2 Variabel Lingkungan (`.env`)

```env
PORT=3000
SESSION_SECRET=string-acak-panjang
MQTT_BROKER_URL=mqtt://localhost:1883
MQTT_TOPIC=iot/counter/increment
MQTT_CLIENT_ID=iot-counter-server
MQTT_USERNAME=          # opsional, untuk broker cloud
MQTT_PASSWORD=          # opsional, untuk broker cloud
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
```

### 6.3 Halaman Web

| URL | Fungsi |
|-----|--------|
| `/` | Login |
| `/dashboard` | Counter real-time, target produksi, status shift & IoT |
| `/history` | Riwayat shift + target + pencapaian |

### 6.4 Indikator Online/Offline

- **Online** — pesan MQTT diterima dalam 30 detik terakhir
- **Offline** — tidak ada pesan > 30 detik
- Tampilan `Data sensor: <waktu>` dari field `waktu` payload ESP32

---

## 7) Logika Shift Kerja

Sistem membagi produksi ke **3 shift** (timezone **Asia/Jakarta**):

| Shift | Jam Operasional | Durasi |
|-------|-----------------|--------|
| Shift 1 | 07:00 – 16:00 WIB | 9 jam |
| Shift 2 | 16:00 – 23:00 WIB | 7 jam |
| Shift 3 | 23:00 – 07:00 WIB | 8 jam |

### 7.1 Auto-Save & Reset

Tepat pada **07:00, 16:00, 23:00 WIB**:

1. Simpan total shift ke `shift_history` (termasuk snapshot target produksi)
2. Reset counter tampilan shift ke `0`
3. Shift berikutnya dimulai

### 7.2 Shift 3 Melewati Tengah Malam

`shift_date` untuk Shift 3 = **tanggal saat shift dimulai** (23:00).

Contoh: jam 02:00 tanggal 17 masih masuk shift tanggal 16.

### 7.3 Pemadaman Listrik / Server Mati

- State terakhir tersimpan di `data/db.json`
- Saat server nyala lagi, counter **melanjutkan** dari nilai terakhir
- Tidak reset kecuali tepat di boundary shift

---

## 8) Penyimpanan Data

### 8.1 State Aktif (`current_state`)

Counter shift yang sedang berjalan, total harian, shift aktif, `last_iot_seen`, `last_device_time`.

### 8.2 Riwayat Shift (`shift_history`)

Disimpan otomatis saat pergantian shift:

| Kolom | Keterangan |
|-------|------------|
| `tanggal` | Tanggal produksi |
| `shift` | Shift 1 / 2 / 3 |
| `total_barang` | Total akhir sebelum reset |
| `target_per_hour` | Target saat shift berakhir |
| `target_per_shift` | Target × durasi shift |
| `timestamp_saved` | Waktu penyimpanan |

### 8.3 Backup

Backup rutin file `data/db.json` — lihat `production.md` bagian backup.

---

## 9) Skenario Deploy

### 9.1 Development (laptop)

```
ESP32 / Simulator → Mosquitto localhost → npm start → browser localhost:3000
```

### 9.2 Production lokal (Raspberry Pi)

```
ESP32 (WiFi pabrik) → Mosquitto @ Pi → Backend @ Pi → Dashboard LAN
```

Panduan: `production.md`

### 9.3 Production lapangan jauh (IoT via internet)

```
ESP32 (site jauh, WiFi/4G) → MQTT Cloud ← Raspberry Pi (kantor)
```

- ESP32 dan Pi **tidak perlu satu jaringan**
- Keduanya connect ke **broker cloud** (HiveMQ, EMQX, dll.)
- Wajib **MQTTS (TLS)** + username/password

Panduan detail: `production.md` bagian 15.

---

## 10) Ketahanan & Edge Case

| Skenario | Perilaku Sistem |
|----------|-----------------|
| Internet putus di lapangan | Counter ESP32 tetap naik; publish saat online kembali |
| MQTT putus sementara | ESP32 retry reconnect setiap 5 detik |
| Paket datang terlambat | Backend tidak menurunkan counter |
| Listrik mati di tengah shift | State dilanjutkan dari `db.json` saat server hidup |
| ESP32 reset | Counter ESP mulai dari 0; server sinkron saat data masuk |
| Pergantian shift | Auto-save histori + reset counter shift |

---

## 11) Checklist Integrasi ESP32 Baru

- [ ] Sensor terpasang dan interrupt berfungsi (Serial Monitor)
- [ ] RTC DS1302 menampilkan waktu benar
- [ ] ESP32 terhubung WiFi / internet lapangan
- [ ] `mqtt_server` dan `mqtt_topic` sesuai environment
- [ ] Broker MQTT aktif dan bisa diakses dari lapangan
- [ ] Backend subscribe ke topic yang sama
- [ ] Payload JSON valid (`waktu` + `counter`)
- [ ] Dashboard counter bertambah saat sensor trigger
- [ ] Status IoT menunjukkan **Online**
- [ ] Riwayat shift tersimpan saat pergantian jam shift

---

## 12) Troubleshooting IoT

| Gejala | Kemungkinan Penyebab | Solusi |
|--------|---------------------|--------|
| ESP32 `rc=-2` MQTT | IP/hostname broker salah | Cek `mqtt_server`, pastikan reachable |
| ESP32 `rc=-4` timeout | Firewall / beda jaringan | Buka port 1883 atau pakai broker cloud |
| Dashboard tidak berubah | Topic tidak sama | Samakan `mqtt_topic` ESP32 dan `.env` |
| Parse error di backend | Format JSON salah | Pastikan ada field `counter` |
| Status IoT Offline | Tidak ada pesan masuk | Cek broker, ESP32 publish, backend log |
| Counter loncat aneh | ESP32 reset / publish ganda | Cek debounce sensor & logika counter |

**Cek log backend:**

```bash
journalctl -u iot-counter -f
```

**Uji broker dari PC:**

```bash
mosquitto_sub -h <broker-host> -t "iot/counter/increment" -v
```

---

## 13) Struktur File IoT di Project

```
Counter/
├── services/
│   ├── counter.ino          # Firmware ESP32
│   ├── mqttService.js       # Subscribe & parse MQTT
│   ├── counterService.js    # Logika counter & shift
│   └── shiftService.js      # Definisi 3 shift WIB
├── db/
│   └── database.js          # Penyimpanan db.json
├── data/
│   └── db.json              # Database lokal (runtime)
├── simulators/
│   └── iot-simulator.js     # Simulasi publish MQTT
├── public/                  # Dashboard web
├── .env                     # Konfigurasi MQTT & auth
├── iot.md                   # Dokumen ini
├── Simulasi.md              # Panduan uji data
└── production.md            # Panduan deploy Raspberry Pi
```

---

## 14) Ringkasan Konsep IoT untuk Project Ini

1. **ESP32 = edge device** — mendeteksi dan mengirim data, bukan menampilkan dashboard.
2. **MQTT = saluran data** — menghubungkan lapangan dan server tanpa koneksi langsung.
3. **Broker = titik temu** — bisa lokal (Mosquitto) atau cloud (lapangan jauh).
4. **Backend = otak sistem** — shift, penyimpanan, analitik target.
5. **Dashboard = antarmuka operator** — hanya di server, diakses via browser.

Dengan konsep ini, sistem Anda siap untuk skala **satu line produksi** maupun **beberapa site lapangan** yang terhubung lewat internet.
