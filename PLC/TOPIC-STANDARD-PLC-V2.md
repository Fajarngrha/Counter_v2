# TOPIC STANDARD PLC V2 (MQTT Naming Convention)

Dokumen ini mendefinisikan standar topic MQTT untuk monitoring multi-line dan multi-mesin.

## 1) Tujuan Standar Topic

- Memudahkan scale dari 1 mesin ke banyak mesin.
- Memisahkan telemetry, event, status, dan command.
- Menghindari bentrok nama topic antar line.

## 2) Format Topic Utama

Format umum:

`factory/<site>/<line>/<machine>/<channel>`

Contoh:

- `factory/plant-a/line01/mch01/telemetry`
- `factory/plant-a/line01/mch01/event`
- `factory/plant-a/line01/mch01/status`
- `factory/plant-a/line01/mch01/command`

## 3) Definisi Channel

- `telemetry`  
  Data periodik proses (counter, state, cycle time, quality).
- `event`  
  Event perubahan penting (reset, alarm on/off, mode change).
- `status`  
  Online/offline, heartbeat, health connectivity.
- `command`  
  Perintah dari server ke collector/device.

## 4) Topic Wildcard untuk Subscriber Dashboard

- Semua mesin pada satu line:
  - `factory/plant-a/line01/+/telemetry`
- Semua channel satu mesin:
  - `factory/plant-a/line01/mch01/+`
- Semua mesin semua line:
  - `factory/plant-a/+/+/telemetry`

## 5) Naming Rules (Wajib)

- Huruf kecil semua.
- Gunakan `-` untuk pemisah kata (`plant-a`, `line-press`).
- Hindari spasi.
- Jangan pakai karakter khusus selain `a-z`, `0-9`, `-`, `/`.
- Machine ID harus konsisten dengan tag dashboard.

## 6) Retain dan QoS Policy

### telemetry
- QoS: `0` (atau `1` bila jaringan sering drop)
- Retain: `false`

### event
- QoS: `1`
- Retain: `false`

### status
- QoS: `1`
- Retain: `true` (agar subscriber baru langsung tahu status terakhir)

### command
- QoS: `1`
- Retain: `false` (kecuali command config yang memang perlu persist)

## 7) Payload Minimal per Channel

### telemetry payload minimal

```json
{
  "ts": "2026-07-02T09:05:00+07:00",
  "machineId": "mch01",
  "state": "RUN",
  "counterTotal": 2048,
  "counterDelta": 2
}
```

### event payload minimal

```json
{
  "ts": "2026-07-02T09:05:10+07:00",
  "machineId": "mch01",
  "eventType": "counter_reset",
  "source": "collector"
}
```

### status payload minimal

```json
{
  "ts": "2026-07-02T09:05:15+07:00",
  "machineId": "mch01",
  "online": true,
  "mqttConnected": true,
  "uptimeSec": 3600
}
```

### command payload minimal

```json
{
  "action": "sync_config",
  "source": "server",
  "requestId": "cmd-001"
}
```

## 8) Mapping ke Sistem Existing (Counter_v2)

Agar kompatibel dengan backend yang sudah ada:

- Tetap support topic existing:
  - `iot/counter/increment`
  - `iot/counter/command`
- Jalankan mode dual publish sementara:
  1. Publish ke topic standar baru (`factory/...`)
  2. Publish ke topic existing (untuk dashboard lama)

Setelah dashboard full migrasi, topic legacy bisa dipensiunkan bertahap.

## 9) Versioning Topic Schema

Tambahkan versi payload di body:

```json
{
  "schemaVersion": "v2.0.0"
}
```

Jika ada perubahan breaking:
- naikkan major version,
- update parser backend,
- jalankan fase parallel parser sementara.

## 10) Contoh Topic Plan untuk 3 Mesin

- `factory/plant-a/line01/mch01/telemetry`
- `factory/plant-a/line01/mch02/telemetry`
- `factory/plant-a/line01/mch03/telemetry`
- `factory/plant-a/line01/mch01/event`
- `factory/plant-a/line01/mch02/event`
- `factory/plant-a/line01/mch03/event`
