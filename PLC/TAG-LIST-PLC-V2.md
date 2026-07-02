# TAG LIST PLC V2 (Data Collector)

Dokumen ini adalah daftar tag standar untuk integrasi PLC kecil (collector) ke dashboard monitoring.

## 1) Identitas Mesin (Static Tag)

- `machine.id` : string  
  Contoh: `MCH-01`
- `machine.line` : string  
  Contoh: `LINE-01`
- `machine.process` : string  
  Contoh: `PRESS`
- `machine.plc_main_type` : string  
  Contoh: `Mitsubishi FX5U`
- `machine.collector_type` : string  
  Contoh: `Mini PLC + MQTT Gateway`

## 2) Tag Proses Inti (Wajib)

- `proc.state` : enum (`RUN|STOP|IDLE|ALARM`)
- `proc.counter_total` : uint32
- `proc.counter_delta` : int16
- `proc.good_count` : uint32
- `proc.reject_count` : uint32
- `proc.cycle_time_ms` : uint32
- `proc.shift` : enum (`S1|S2|S3`)
- `proc.timestamp` : string (ISO8601)

## 3) Tag Status Mesin (Wajib)

- `status.run_fb` : bool (feedback mesin running)
- `status.stop_fb` : bool
- `status.alarm_fb` : bool
- `status.manual_mode` : bool
- `status.auto_mode` : bool
- `status.estop_fb` : bool

## 4) Tag Alarm (Minimal)

- `alarm.active` : bool
- `alarm.code` : string  
  Contoh: `ALM-102`
- `alarm.text` : string  
  Contoh: `Low Air Pressure`
- `alarm.since_ts` : string (ISO8601)

## 5) Tag Kesehatan Komunikasi (Wajib)

- `comm.plc_collector_online` : bool
- `comm.mqtt_connected` : bool
- `comm.last_publish_ts` : string (ISO8601)
- `comm.signal_quality` : int (0-100, opsional)
- `comm.reconnect_count` : uint16
- `comm.uptime_sec` : uint32

## 6) Mapping Sinyal Fisik ke Tag (Template)

| Sumber Sinyal | Terminal PLC Collector | Tipe | Tag |
|---|---|---|---|
| RUN feedback PLC utama | DI0 | Digital input | `status.run_fb` |
| STOP feedback PLC utama | DI1 | Digital input | `status.stop_fb` |
| ALARM feedback PLC utama | DI2 | Digital input | `status.alarm_fb` |
| Pulse counter mesin | HSC0 / DI3 | High speed input | `proc.counter_total` |
| Manual selector | DI4 | Digital input | `status.manual_mode` |
| Auto selector | DI5 | Digital input | `status.auto_mode` |

Catatan:
- Gunakan isolator optocoupler jika referensi ground berbeda antar panel.
- Untuk pulse cepat, gunakan high speed counter input (bukan scan biasa).

## 7) Data Type dan Rentang Aman

- Counter total gunakan `uint32` (hindari overflow cepat).
- Delta counter kirim per interval publish (misal 1 detik).
- Jika `counter_delta < 0`, kirim event reset counter.
- Timestamp wajib zona lokal atau UTC konsisten (disarankan ISO8601).

## 8) Aturan Publish ke MQTT

- Publish telemetry periodik: setiap 1 detik.
- Publish event penting (alarm/reset): event-driven langsung kirim.
- Saat startup collector:
  - kirim `status online`,
  - kirim snapshot semua tag inti.

## 9) Validasi Data ke Dashboard

- Dashboard harus validasi:
  - `counter_total` monotonic (kecuali reset event),
  - `proc.state` valid enum,
  - timestamp tidak mundur ekstrem.
- Jika data invalid:
  - tandai sebagai warning,
  - jangan overwrite histori valid sebelumnya.

## 10) Template Payload MQTT (Telemetry)

```json
{
  "machineId": "MCH-01",
  "lineId": "LINE-01",
  "ts": "2026-07-02T09:00:00+07:00",
  "state": "RUN",
  "counterTotal": 125430,
  "counterDelta": 3,
  "goodCount": 125100,
  "rejectCount": 330,
  "cycleTimeMs": 920,
  "shift": "S1",
  "alarm": {
    "active": false,
    "code": ""
  },
  "comm": {
    "collectorOnline": true,
    "mqttConnected": true,
    "uptimeSec": 8640
  }
}
```

## 11) Minimum Acceptance Tag Set (Go-Live)

Wajib tersedia sebelum go-live:
- `proc.state`
- `proc.counter_total`
- `proc.counter_delta`
- `proc.timestamp`
- `comm.mqtt_connected`
- `alarm.active`
