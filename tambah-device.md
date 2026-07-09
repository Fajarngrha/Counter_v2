# Rancangan Skema 1–5 Device IoT ke Satu Dashboard

Dokumen ini menjelaskan alur/flow jika sistem diperluas dari 1 device menjadi 1–5 device IoT pengirim counter ke dashboard yang sama.

## 1) Tujuan

- Semua device mengirim data counter ke server yang sama.
- Dashboard bisa menampilkan:
  - per-device (tiap mesin),
  - total gabungan (opsional).
- Reset/target tetap bisa dikirim per-device.
- Tetap aman saat salah satu device offline (yang lain tetap jalan).

---

## 2) Gambaran Arsitektur

```text
Device-1 ┐
Device-2 ├──> MQTT Broker ──> Backend Node.js ──> Dashboard Web
Device-3 ┤
Device-4 ┤
Device-5 ┘
```

Peran:
- **Device IoT**: kirim telemetry counter.
- **MQTT Broker**: jalur komunikasi publish/subscribe.
- **Backend Node.js**: validasi, simpan state/histori, hitung target.
- **Dashboard**: menampilkan data realtime.

---

## 3) Alur Data (Flow) End-to-End

## A. Device -> Broker

Setiap device publish data counter periodik / event trigger.

Payload minimal:

```json
{
  "deviceId": "line1-mesin1",
  "counter": 123,
  "waktu": "2026-07-09 19:00:00"
}
```

## B. Broker -> Backend

Backend subscribe semua topic device, lalu:
- identifikasi `deviceId`,
- proses offset/reset per device,
- simpan ke state + histori,
- emit update realtime ke frontend.

## C. Backend -> Dashboard

Dashboard menerima data via Socket.IO:
- update kartu per-device,
- update total agregat,
- update status online/offline tiap device.

## D. Dashboard -> Backend -> Device (Command)

Saat operator klik reset/ubah target:
- dashboard kirim API ke backend,
- backend publish command MQTT per-device,
- device terkait terima command dan jalankan.

---

## 4) Skema Topic MQTT (Disarankan)

Gunakan topic per-device, jangan campur semua device dalam satu topic.

- Telemetry:
  - `iot/counter/<deviceId>/increment`
- Command:
  - `iot/counter/<deviceId>/command`
- (Opsional) status/heartbeat:
  - `iot/counter/<deviceId>/status`

Contoh:
- `iot/counter/line1-mesin1/increment`
- `iot/counter/line1-mesin2/increment`

Backend subscribe wildcard:
- `iot/counter/+/increment`
- `iot/counter/+/status` (opsional)

---

## 5) Prinsip Data Model di Backend (Penting)

Saat multi-device, state harus dipisah per `deviceId`.

Minimal simpan:
- `count` per device
- `last_device_counter` per device
- `device_offset` per device
- `target_ticker_offset` per device
- `last_iot_seen` per device
- konfigurasi target per device (jika beda mesin)

Struktur konsep:

```text
devices: {
  "line1-mesin1": { ...state device 1... },
  "line1-mesin2": { ...state device 2... }
}
```

Jangan gunakan satu variabel global counter untuk semua device.

---

## 6) Flow Reset yang Aman di Multi-Device

Reset harus spesifik device:
- reset device A tidak boleh mempengaruhi device B.

Urutan aman:
1. API reset menerima `deviceId`.
2. Backend reset state device tersebut.
3. Backend publish command reset ke topic command device tersebut.
4. Backend broadcast update dashboard.

---

## 7) Tampilan Dashboard (Saran UI)

Untuk 1–5 device, layout yang mudah:

- **Kartu per-device** (nama mesin, counter, target saat ini, status online).
- **Panel total agregat** (total semua counter aktif).
- Filter:
  - semua device
  - 1 device tertentu

Status online dihitung per-device dari `last_iot_seen`.

---

## 8) Strategi Bertahap Implementasi

### Tahap 1 (2 device)
- Ubah topic menjadi per-device.
- Backend parsing `deviceId`.
- Simpan state per-device.

### Tahap 2 (3–5 device)
- Tambah UI kartu multi-device.
- Tambah total agregat + filter device.

### Tahap 3 (stabilisasi)
- Tambah heartbeat/status topic.
- Tambah alarm jika device offline > N detik.

---

## 9) Risiko Umum + Mitigasi

1. **Counter antar device tercampur**
   - Mitigasi: wajib topic per-device + state per-device.

2. **Reset salah device**
   - Mitigasi: semua API command wajib kirim `deviceId`.

3. **Dashboard lambat saat banyak update**
   - Mitigasi: broadcast delta saja, bukan full payload besar.

4. **Device offline tidak terdeteksi**
   - Mitigasi: heartbeat periodik + timeout status.

---

## 10) Kesimpulan

Untuk scale ke 1–5 device, kunci utamanya:
- topic MQTT per-device,
- state backend per-device,
- command reset/target per-device,
- dashboard multi-kartu + agregat.

Jika flow ini diikuti, sistem akan tetap rapi saat jumlah device bertambah tanpa merusak logic existing.
