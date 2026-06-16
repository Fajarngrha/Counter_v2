# IoT Production Counter Dashboard

Dashboard web untuk memantau jumlah barang produksi secara **near real-time** dari perangkat IoT via **MQTT**, dengan pembagian **3 shift** dan **auto-save + reset** saat pergantian shift.

## Fitur (sesuai PRD)

- Counter utama real-time per shift.
- Status shift aktif + rentang jam.
- Jam digital real-time (WIB / Asia/Jakarta).
- Indikator koneksi IoT (Online/Offline) berbasis `last_iot_seen`.
- Auto-save ke database lokal saat pergantian shift (16:00, 23:00, 07:00 WIB) lalu reset counter ke 0.
- Halaman riwayat produksi + filter rentang tanggal.
- Login sederhana untuk membatasi akses dashboard.

## Teknologi

- Backend: Node.js + Express + Socket.IO + MQTT client
- Frontend: HTML + CSS + JavaScript
- Database lokal: file JSON `data/db.json` (persisten, tanpa dependency native)

## Menjalankan

1) Install dependency:

```bash
cd d:\FCC\Counter
npm install
```

2) Buat file `.env` dari contoh:

```bash
copy .env.example .env
```

3) Pastikan MQTT broker berjalan.

Contoh: Mosquitto (port 1883). Jika broker ada di mesin lain, ubah `MQTT_BROKER_URL` di `.env`.

4) Jalankan server:

```bash
npm start
```

Buka:

- Login: http://localhost:3000/
- Dashboard: http://localhost:3000/dashboard
- Riwayat: http://localhost:3000/history

Demo login:

- username: `admin`
- password: `admin123`

## MQTT Payload

Server subscribe ke:

- `MQTT_TOPIC` (default: `iot/counter/increment`)

Payload yang didukung:

- Angka plain text: `1`
- JSON: `{"count": 1}` (atau `amount` / `value`)

## Simulator IoT (opsional)

Jalankan publisher sederhana (butuh broker MQTT aktif):

```bash
npm run simulate
```

Simulator akan publish `{"count":1}` setiap 1 detik.

## Catatan Edge Case (PRD)

- Jika listrik mati di tengah shift: nilai terakhir tersimpan di `data/db.json`, jadi saat server nyala lagi, counter melanjutkan dari state terakhir (tidak reset kecuali tepat di boundary shift).
- Shift 3 (23:00–07:00): `shift_date` dicatat sebagai tanggal saat shift dimulai (mis. jam 02:00 tanggal 17 tetap masuk shift_date tanggal 16).

