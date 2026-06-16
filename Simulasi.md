# Panduan Simulasi Pengiriman Data ke Dashboard

Dokumen ini untuk pengujian alur data:

`ESP32 / Simulator -> MQTT Broker -> Backend Node.js -> Database lokal -> Dashboard`

## 1) Prasyarat

- MQTT broker aktif (contoh: Mosquitto) di host yang bisa diakses ESP32 dan backend.
- Project backend sudah terpasang dependency:
  - `npm install`
- File `.env` backend sudah benar:
  - `MQTT_BROKER_URL=mqtt://<ip-broker>:1883`
  - `MQTT_TOPIC=iot/counter/increment` (samakan dengan topic dari ESP32)
- Port backend default: `3000`.

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
