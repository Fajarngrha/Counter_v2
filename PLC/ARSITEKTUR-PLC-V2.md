# Arsitektur PLC V2 (Non-Intrusive)

Dokumen ini merancang versi V2 agar data mesin produksi dari PLC bisa dimonitor di dashboard tanpa mengganggu program PLC utama yang sudah berjalan.

## 1) Tujuan Sistem

- PLC utama tetap menjalankan logika mesin seperti saat ini (tidak diubah).
- Tambah 1 PLC kecil/mini PLC sebagai pengambil data (collector) dan pengirim ke server.
- Data real-time masuk ke backend/dashboard via MQTT.
- Jika jaringan/server mati, mesin tetap berjalan normal.

## 2) Prinsip Desain Utama

- **Read-only ke PLC utama**: PLC kecil hanya membaca status/proses, tidak menulis kontrol balik.
- **Isolasi listrik**: gunakan isolator optocoupler / signal conditioner untuk sinyal antar panel jika perlu.
- **Fail-safe**: kegagalan PLC kecil, jaringan, broker, atau server tidak boleh menghentikan mesin.
- **Modular**: PLC kecil bisa diganti edge gateway industri di fase berikutnya tanpa ubah dashboard.

## 3) Arsitektur Blok

1. **Layer Mesin (Existing)**  
   PLC utama + I/O mesin + HMI existing.

2. **Layer Akuisisi Data (Baru)**  
   PLC kecil membaca data dari PLC utama melalui salah satu metode:
   - Digital mirror signal (RUN, ALARM, COUNTER pulse, SHIFT start)
   - Modbus read-only (RTU/TCP)
   - Register bridge dari modul komunikasi existing

3. **Layer Komunikasi**  
   PLC kecil kirim data ke MQTT Broker (HiveMQ Cloud atau broker lokal pabrik).

4. **Layer Aplikasi**  
   Backend Node.js menerima data MQTT, proses normalisasi, lalu broadcast ke dashboard.

## 4) Topologi Rekomendasi (Paling Aman)

- **PLC utama**: tetap seperti sekarang.
- **PLC kecil**:
  - Input DI: mirror status mesin (Run, Stop, Alarm, Pulse Counter).
  - Komunikasi Ethernet/WiFi: publish MQTT.
- **MQTT Broker**:
  - Opsi 1: lokal pabrik (latency rendah)
  - Opsi 2: cloud (akses dari luar pabrik)
- **Dashboard server**:
  - subscribe topic mesin
  - simpan histori
  - tampilkan real-time.

## 5) Strategi Integrasi ke PLC Utama

### Opsi A (Disarankan untuk awal): Mirror Sinyal

- Ambil output status dari PLC utama ke input PLC kecil.
- Tidak perlu edit program PLC utama (hanya wiring tambahan terminal output yang sudah ada).
- Cocok untuk start cepat dan risiko rendah.

### Opsi B: Modbus Read-Only

- PLC kecil baca register PLC utama periodik (polling).
- Perlu pastikan PLC utama sudah expose register dan port komunikasi.
- Tetap tidak menulis ke PLC utama.

## 6) Data yang Dikirim ke Server

Payload standar (JSON) per kiriman:

- `machineId`: ID mesin (contoh `MCH-01`)
- `lineId`: ID line produksi
- `ts`: timestamp ISO
- `counterTotal`: total hitungan barang
- `counterDelta`: penambahan sejak kirim terakhir
- `state`: `RUN | STOP | ALARM | IDLE`
- `alarmCode`: kode alarm aktif (jika ada)
- `shift`: `S1 | S2 | S3`
- `cycleTimeMs`: opsional
- `goodCount` / `rejectCount`: opsional

Topic MQTT rekomendasi:

- `factory/line01/mch01/telemetry`
- `factory/line01/mch01/event`
- `factory/line01/mch01/status`

## 7) Mapping ke Dashboard Saat Ini

Agar kompatibel dengan sistem counter yang sudah ada:

- `counterDelta` -> increment counter dashboard
- `counterTotal` -> validasi anti-lost packet
- `state` + `alarmCode` -> status IoT/mesin
- `shift` + `ts` -> histori shift

Jika ingin backward-compatible dengan topic lama:

- publish tambahan ke topic existing `iot/counter/increment` dengan format payload yang sama seperti saat ini.

## 8) Keamanan dan Reliability

- MQTT pakai username/password + TLS (untuk cloud).
- Client ID unik per mesin.
- Retain hanya untuk config/status, bukan semua telemetry.
- QoS:
  - status/event penting: QoS 1
  - telemetry periodik: QoS 0 atau 1 (sesuai kebutuhan)
- Simpan buffer lokal ring buffer di PLC kecil/gateway jika koneksi putus.

## 9) Rencana Implementasi Bertahap

### Fase 1 (Pilot 1 mesin)

- Pasang PLC kecil read-only.
- Kirim `counter`, `state`, `alarm` ke MQTT.
- Dashboard menampilkan real-time + histori.

### Fase 2 (Stabilisasi)

- Tambah health monitoring (`lastSeen`, watchdog, reconnect).
- Tambah validasi data (anti-duplicate, anti-counter-jump).
- SOP maintenance wiring dan backup config.

### Fase 3 (Scale-up multi mesin)

- Standarisasi naming topic per line/mesin.
- Tambah dashboard agregasi OEE dasar (Availability, Performance, Quality).
- Integrasi notifikasi alarm ke WA/Telegram/Email (opsional).

## 10) Checklist Commissioning

- PLC utama tetap jalan normal saat PLC kecil OFF.
- PLC kecil tidak punya jalur write ke PLC utama.
- Data counter di dashboard sama dengan counter aktual mesin.
- Uji putus internet: mesin tetap jalan, data recover saat online.
- Uji power cycle PLC kecil: auto reconnect MQTT sukses.

## 11) Catatan Wiring Panel

- Gunakan terminal block terpisah untuk sinyal mirror.
- Beri label kabel: `RUN_FB`, `ALM_FB`, `CNT_PLS`, `GND_REF`.
- Jika beda ground antar panel, gunakan isolator optik.
- Pisahkan jalur power motor/relay dari jalur sinyal data.

---

## Rekomendasi Final

Untuk kondisi kamu sekarang, jalankan **Opsi A (mirror sinyal)** dulu karena paling cepat dan aman: tidak ubah logic PLC utama, hanya tambah PLC kecil sebagai data collector + MQTT publisher.
