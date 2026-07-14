# Wiring Final ESP32 DevKit (Device ke-2)

Dokumen ini untuk **ESP32 DevKit (ESP32 biasa, bukan ESP32-C3)** sesuai firmware:
- `services/counter-with-seven.ino`
- mode: `#define USE_ESP32_DEVKIT true`

---

## 1) Pin Mapping Final (Sesuai Firmware)

- `pinRelay` (input counter dari relay mesin): **GPIO27**
- `pinBtnResetCounter` (tombol reset counter aktual): **GPIO25**
- `pinBtnResetTarget` (tombol reset target saat ini): **GPIO26**
- `rtcSdaPin` (DS3231 SDA): **GPIO21**
- `rtcSclPin` (DS3231 SCL): **GPIO22**
- `sevenSegClkPin` (TM1637 CLK): **GPIO18**
- `sevenSegDioPin` (TM1637 DIO): **GPIO19**

---

## 2) Wiring TM1637 4-Digit

- TM1637 `VCC` -> ESP32 `3V3` (disarankan)
- TM1637 `GND` -> ESP32 `GND`
- TM1637 `CLK` -> ESP32 `GPIO18`
- TM1637 `DIO` -> ESP32 `GPIO19`

Catatan:
- Jika modul TM1637 kamu stabil di 5V, tetap pastikan level data aman.
- Untuk menghindari gangguan, kabel CLK/DIO dibuat pendek.

---

## 3) Wiring RTC DS3231

- DS3231 `VCC` -> ESP32 `3V3`
- DS3231 `GND` -> ESP32 `GND`
- DS3231 `SDA` -> ESP32 `GPIO21`
- DS3231 `SCL` -> ESP32 `GPIO22`

Catatan:
- Semua ground harus common.
- Jika RTC tidak dipasang, firmware tetap bisa jalan (fallback waktu internal/NTP).

---

## 4) Wiring Tombol Fisik

### A. Tombol Reset Counter Aktual
- Kaki 1 tombol -> `GPIO25`
- Kaki 2 tombol -> `GND`

### B. Tombol Reset Target Saat Ini
- Kaki 1 tombol -> `GPIO26`
- Kaki 2 tombol -> `GND`

Mode firmware: `INPUT_PULLUP` (aktif saat ditekan ke GND / active-low).

---

## 5) Wiring Input Counter dari Relay Mesin (LY2N / dry contact)

Gunakan **dry contact** relay (NO/COM), bukan coil A1/A2.

- ESP32 `GPIO27` -> relay `NO`
- ESP32 `GND` -> relay `COM`

Jangan sambung tegangan coil relay langsung ke GPIO ESP32.

---

## 6) Skema Ringkas

```text
ESP32 DevKit
├─ GPIO18 -> TM1637 CLK
├─ GPIO19 -> TM1637 DIO
├─ GPIO21 -> DS3231 SDA
├─ GPIO22 -> DS3231 SCL
├─ GPIO25 -> Btn Reset Counter -> GND
├─ GPIO26 -> Btn Reset Target  -> GND
├─ GPIO27 -> Relay NO (counter pulse)
└─ GND    -> Relay COM + semua GND modul
```

---

## 7) Checklist Sebelum Upload Firmware

1. Pastikan di firmware:
   - `#define USE_ESP32_DEVKIT true`
2. Board Arduino IDE:
   - pilih board ESP32 DevKit yang sesuai
3. Cek catu daya:
   - ESP32 dan modul stabil, tidak drop
4. Cek common ground:
   - semua GND tersambung
5. Cek relay input:
   - benar di NO/COM (dry contact)

---

## 8) Troubleshooting Cepat

### 7-segment tidak menyala
- Cek VCC/GND TM1637
- Cek pin CLK/DIO (18/19)
- Uji dengan kabel pendek

### Counter naik sendiri / double count
- Pastikan wiring relay dry contact NO/COM benar
- Hindari kabel input counter sejajar kabel power/noise
- Tambah isolasi optocoupler jika noise tinggi

### Tombol reset tidak respons
- Pastikan tombol ke GND (active-low)
- Cek pin 25/26 tidak tertukar

---

## 9) Catatan Integrasi Multi Device

Untuk device ke-2 ini, gunakan `deviceId` berbeda dari device pertama agar data tidak tercampur di dashboard.
