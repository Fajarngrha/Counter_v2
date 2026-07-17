# Multi-Device Setup (Per-Device)

Dokumen ini jadi acuan awal untuk trial 1-3 device dalam 1 dashboard, lalu scale ke 5-10 device.

## 1) Tujuan

- Tiap device punya identitas unik (`deviceId`).
- Data counter antar device tidak tercampur.
- Reset counter/target hanya berlaku ke device yang dipilih.
- History tersimpan per-device.

## 2) Konvensi MQTT yang dipakai

Gunakan topic per-device:

- Telemetry:
  - `iot/counter/<deviceId>/increment`
- Command:
  - `iot/counter/<deviceId>/command`

Contoh:

- `iot/counter/device-esp32-01/increment`
- `iot/counter/device-esp32-01/command`
- `iot/counter/device-esp32-02/increment`
- `iot/counter/device-esp32-02/command`

## 3) Payload standar

### Device -> Backend (telemetry)

```json
[
  {
    "deviceId": "device-esp32-01",
    "waktu": "2026-07-17 11:00:00",
    "counter": 123
  }
]
```

### Device -> Backend (command/event)

```json
{
  "action": "reset",
  "source": "device",
  "deviceId": "device-esp32-01"
}
```

```json
{
  "action": "target_ticker_reset",
  "source": "device",
  "deviceId": "device-esp32-01",
  "targetTickerOffset": 45
}
```

## 4) Firmware ESP32 yang perlu disesuaikan

Di `ESP/counter-with-seven-esp32.ino`:

- Set `deviceId` unik per board.
- Topic disusun otomatis:
  - `iot/counter/<deviceId>/increment`
  - `iot/counter/<deviceId>/command`

Contoh penamaan device:

- `device-esp32-01`
- `device-esp32-02`
- `device-esp32-03`

## 5) Backend yang sudah disiapkan

Backend sekarang sudah support multi-device:

- State tersimpan per-device (`devices[deviceId]`).
- Dashboard bisa pilih device aktif.
- Reset counter dan reset target ticker bisa per-device.
- History sudah simpan `device_id` dan bisa difilter per device.

Endpoint penting:

- `GET /api/dashboard?deviceId=<id>`
- `POST /api/counter/reset` body `{ "deviceId": "<id>" }`
- `POST /api/target-ticker/reset` body `{ "deviceId": "<id>" }`
- `GET /api/history?...&device=<id|all>`

## 6) Cara rollout trial 1-3 device

1. Upload firmware ke device-1 dengan `deviceId=device-esp32-01`.
2. Nyalakan dan verifikasi device muncul di dashboard.
3. Upload firmware ke device-2 dengan `deviceId=device-esp32-02`.
4. Verifikasi:
   - counter tiap device naik sendiri-sendiri
   - reset device A tidak mempengaruhi device B
   - history bisa difilter per device
5. Lanjut device-3 dengan pola yang sama.

## 7) Checklist validasi cepat

- [ ] Setiap device pakai `deviceId` unik (tidak boleh duplikat).
- [ ] Topic publish telemetry sesuai `.../<deviceId>/increment`.
- [ ] Dashboard menampilkan daftar device.
- [ ] Reset per-device berjalan benar.
- [ ] History menampilkan kolom `Device` dan filter bekerja.

## 8) Catatan scale ke 5-10 device

- Pertahankan format topic dan payload yang sama.
- Tambahkan naming convention tetap:
  - `device-esp32-01` s.d. `device-esp32-10`
- Gunakan jaringan WiFi yang stabil (broker latency rendah).
- Pantau device offline/online dari dashboard saat penambahan unit.
