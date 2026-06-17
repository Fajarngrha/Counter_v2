# Panduan Simulasi Pengiriman Data ke Dashboard

Dokumen ini untuk pengujian alur data:

`ESP32 / Simulator -> MQTT Broker -> Backend Node.js -> Database lokal -> Dashboard`

## 1) Prasyarat

Sebelum menjalankan simulasi, pastikan semua komponen di bawah ini sudah siap. Urutan disusun dari perangkat lunak, jaringan, broker MQTT, backend, hingga ESP32.

### 1.1 Perangkat Lunak di Laptop/PC (Backend + Dashboard)

| Komponen | Versi minimum | Cara cek |
|----------|---------------|----------|
| **Node.js** | v18 atau lebih baru | `node -v` di PowerShell/CMD |
| **npm** | ikut Node.js | `npm -v` |
| **Browser** | Chrome, Edge, atau Firefox terbaru | untuk membuka dashboard |

Instalasi dependency project (sekali saja, di folder `d:\FCC\Counter`):

```powershell
cd d:\FCC\Counter
npm install
```

Setelah selesai, folder `node_modules` harus ada dan tidak ada error saat install.

### 1.2 MQTT Broker (Mosquitto)

Backend dan ESP32 **harus** bisa terhubung ke broker yang sama.

**Opsi A — Broker di laptop yang sama dengan backend (uji lokal)**

1. Install [Mosquitto](https://mosquitto.org/download/) untuk Windows.
2. Jalankan layanan Mosquitto (Services → *Mosquitto Broker* → Start), atau dari CMD:

   ```powershell
   net start mosquitto
   ```

3. Port default: **1883** (tanpa TLS untuk simulasi).
4. Di `.env` backend gunakan:

   ```env
   MQTT_BROKER_URL=mqtt://localhost:1883
   ```

**Opsi B — Broker di mesin lain di jaringan LAN**

1. Catat **IP address** mesin broker (contoh: `192.168.0.104`).
2. Pastikan firewall mengizinkan port **1883** masuk.
3. Di `.env` backend:

   ```env
   MQTT_BROKER_URL=mqtt://192.168.0.104:1883
   ```

**Verifikasi broker hidup (opsional)**

Jika terpasang `mosquitto_sub` di PATH:

```powershell
mosquitto_sub -h localhost -t "iot/counter/increment" -v
```

Biarkan terminal ini terbuka; nanti pesan dari simulator/ESP32 akan muncul di sini jika broker dan topic benar.

### 1.3 Konfigurasi File `.env` Backend

Buat file `.env` dari contoh (jika belum ada):

```powershell
copy .env.example .env
```

Isi minimal yang harus disesuaikan:

| Variabel | Contoh | Keterangan |
|----------|--------|------------|
| `PORT` | `3000` | Port web dashboard |
| `SESSION_SECRET` | string acak panjang | untuk session login |
| `MQTT_BROKER_URL` | `mqtt://192.168.0.104:1883` | **IP broker**, bukan IP ESP32 |
| `MQTT_TOPIC` | `iot/counter/increment` | **Harus sama** dengan `mqtt_topic` di sketch ESP32 |
| `MQTT_CLIENT_ID` | `iot-counter-server` | ID unik client backend di broker |

Contoh `.env` lengkap:

```env
PORT=3000
SESSION_SECRET=ubah-ini-jadi-string-acak-panjang
MQTT_BROKER_URL=mqtt://192.168.0.104:1883
MQTT_TOPIC=iot/counter/increment
MQTT_CLIENT_ID=iot-counter-server
```

Login default (bisa diubah lewat env jika nanti ditambahkan):

- Username: `admin`
- Password: `admin123`

### 1.4 Jaringan (WiFi / LAN)

Semua perangkat harus berada di **jaringan yang sama** (atau routing yang mengizinkan akses ke broker):

```
┌─────────────┐     WiFi/LAN      ┌──────────────┐
│   ESP32     │ ────────────────► │ MQTT Broker  │
│  (sensor)   │    port 1883      │ (mis. laptop)│
└─────────────┘                   └──────┬───────┘
                                         │
┌─────────────┐     subscribe            │
│  Backend    │ ◄────────────────────────┘
│  Node.js    │     mqtt://<IP-broker>:1883
│  :3000      │
└──────┬──────┘
       │ Socket.IO / HTTP
       ▼
┌─────────────┐
│  Browser    │  http://localhost:3000
│  Dashboard  │
└─────────────┘
```

Checklist jaringan:

- [ ] ESP32 terhubung WiFi (SSID & password benar di `services/counter.ino` atau sketch Anda).
- [ ] `mqtt_server` di ESP32 = **IP laptop/server tempat Mosquitto berjalan** (contoh: `192.168.0.104`), bukan `localhost`.
- [ ] Laptop bisa `ping` IP ESP32 (opsional, untuk debug).
- [ ] Port **3000** tidak dipakai aplikasi lain (backend dashboard).
- [ ] Port **1883** terbuka di mesin broker.

### 1.5 Keselarasan Topic & Format Payload

**Topic MQTT** harus identik di tiga tempat:

| Lokasi | Variabel / konstanta |
|--------|----------------------|
| Backend `.env` | `MQTT_TOPIC` |
| Sketch ESP32 | `mqtt_topic` |
| Simulator | membaca `MQTT_TOPIC` dari `.env` |

Nilai yang disarankan untuk simulasi ini: `iot/counter/increment`

**Format payload** yang diterima backend:

```json
[{"waktu":"2026-06-16 19:01:29","counter":5}]
```

Atau tanpa array (tetap didukung):

```json
{"waktu":"2026-06-16 19:01:29","counter":5}
```

| Field | Tipe | Wajib | Keterangan |
|-------|------|-------|------------|
| `waktu` | string | disarankan | Format `YYYY-MM-DD HH:MM:SS` dari RTC ESP32 |
| `counter` | angka bulat ≥ 0 | **ya** | Total counter dari perangkat; backend menyinkronkan nilai ini |

### 1.6 Prasyarat ESP32 (jika uji dengan hardware)

| Item | Detail |
|------|--------|
| **Board** | ESP32 / ESP32-C3 (sesuai sketch) |
| **Arduino IDE** | 2.x dengan board package ESP32 terpasang |
| **Library** | `PubSubClient`, `Rtc-DS1302` (+ `ThreeWire` dari paket yang sama) |
| **Hardware** | Sensor pada pin yang dikonfigurasi (`pinRelay`), RTC DS1302 pada pin 7/6/10 |
| **Serial Monitor** | Baud **115200** untuk melihat log `Data Terkirim` |

Sketch referensi project: `services/counter.ino`

Sebelum upload, pastikan di bagian atas sketch:

```cpp
const char* mqtt_server = "192.168.0.104";  // IP broker
const char* mqtt_topic = "iot/counter/increment";  // sama dengan MQTT_TOPIC di .env
```

### 1.7 Folder & Izin Penyimpanan Data

Backend menulis state ke:

- `d:\FCC\Counter\data\db.json`

Pastikan:

- [ ] Folder `data/` boleh dibuat/ditulis oleh proses Node.js (otomatis saat pertama jalan).
- [ ] File `data/db.json` tidak dibuka di editor lain saat server berjalan (hindari konflik tulis).

### 1.8 Ringkasan Cek Cepat Sebelum Simulasi

Jalankan perintah ini di PowerShell dari folder project:

```powershell
node -v
npm -v
Test-Path .env
Test-Path node_modules
```

Semua harus OK. Lalu pastikan:

1. Mosquitto / broker MQTT **running**.
2. File `.env` sudah berisi `MQTT_BROKER_URL` dan `MQTT_TOPIC` yang benar.
3. Topic ESP32 = topic di `.env`.
4. ESP32 (jika dipakai) sudah upload firmware dan Serial Monitor menunjukkan WiFi + MQTT terhubung.

## 2) Jalankan Backend Dashboard

Di folder project `d:\FCC\Counter`:

```powershell
npm start
```

Indikator berhasil:

- Muncul log `Server berjalan di http://localhost:3000`
- Muncul log MQTT `Terhubung` dan `Subscribe ke topik`

## 3) Login Dashboard

- Buka `http://localhost:3000`
- Login:
  - Username: `admin`
  - Password: `admin123`
- Masuk ke halaman dashboard.

## 4) Simulasi Data (tanpa ESP32)

Jalankan simulator bawaan:

```powershell
npm run simulate
```

Simulator akan publish data format:

```json
[{"waktu":"YYYY-MM-DD HH:MM:SS","counter":N}]
```

Expected di dashboard:

- Angka `TOTAL BARANG` bertambah.
- `Status IoT` menjadi `Online`.
- Bagian status menampilkan `Data sensor: <waktu>`.

## 5) Simulasi Data (dengan ESP32 asli)

Pastikan sketch ESP32:

- Topic publish sama dengan backend.
- Payload yang dikirim:

```json
[{"waktu":"2026-06-16 19:01:29","counter":5}]
```

Upload sketch, lalu trigger sensor beberapa kali.

Expected:

- Serial Monitor ESP32 menampilkan `Data Terkirim`.
- Backend menerima pesan MQTT tanpa error parse.
- Dashboard update realtime (1-2 detik).

## 6) Verifikasi Data Tersimpan

Data lokal backend disimpan di:

- `data/db.json`

Cek:

- `current_state.count` berubah sesuai counter terbaru.
- `current_state.last_device_time` terisi waktu dari payload ESP32.
- Saat pergantian shift, nilai akhir masuk `shift_history`.

## 7) Uji Skenario Putus Jaringan

### Skenario A - Broker dimatikan sementara

1. Jalankan sistem normal (data sudah mengalir).
2. Matikan MQTT broker.
3. Lihat:
   - ESP32 akan gagal publish / reconnect.
   - Dashboard `Status IoT` akan berubah `Offline` setelah jeda.
4. Nyalakan broker kembali.
5. Pastikan data kembali mengalir.

### Skenario B - WiFi ESP32 diputus

1. Putuskan koneksi WiFi AP.
2. Lihat ESP32 mencoba reconnect.
3. Sambungkan lagi WiFi.
4. Pastikan publish lanjut dan dashboard update lagi.

## 8) Uji Pergantian Shift (Auto Save + Reset)

Waktu reset otomatis:

- 07:00 WIB
- 16:00 WIB
- 23:00 WIB

Yang diverifikasi:

- Tepat boundary shift, counter shift di-reset ke `0`.
- Nilai shift sebelumnya masuk ke `shift_history`.
- Halaman `/history` menampilkan data yang tersimpan.

## 9) Checklist Lulus Simulasi

- [ ] Backend dan MQTT terkoneksi normal.
- [ ] Data dari simulator/ESP32 tampil realtime di dashboard.
- [ ] `last_device_time` mengikuti nilai `waktu` dari payload.
- [ ] Riwayat shift tersimpan saat boundary shift.
- [ ] Sistem recover setelah putus koneksi.

## 10) Troubleshooting Cepat

- **Dashboard tidak berubah**
  - Cek topic publish ESP32 sama persis dengan `MQTT_TOPIC`.
  - Cek backend log error parse payload.
- **Status IoT selalu Offline**
  - Pastikan pesan MQTT benar-benar masuk ke backend.
  - Pastikan format payload ada field `counter`.
- **Data tidak tersimpan**
  - Cek izin tulis folder `data/`.
  - Cek file `data/db.json` terbentuk.
