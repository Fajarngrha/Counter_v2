# Sparepart/Kebutuhan PLC Kecil (Versi Hemat)

Estimasi ini untuk arsitektur non-intrusive: PLC utama tetap jalan, PLC kecil hanya baca sinyal dan kirim data ke server/dashboard.

## 1) BOM Utama (Wajib)

| No | Item | Qty | Estimasi Harga Satuan (IDR) | Subtotal (IDR) | Catatan |
|---|---|---:|---:|---:|---|
| 1 | PLC kecil (8DI/6DO minimum, Ethernet jika ada) | 1 | 1.200.000 - 2.500.000 | 1.200.000 - 2.500.000 | Pilih kelas entry-level |
| 2 | Modul komunikasi MQTT gateway (jika PLC tidak support MQTT) | 1 | 450.000 - 1.200.000 | 450.000 - 1.200.000 | Bisa pakai industrial IoT gateway mini |
| 3 | Power supply DIN rail 24VDC 2A | 1 | 180.000 - 350.000 | 180.000 - 350.000 | Untuk PLC + sensor ringan |
| 4 | MCB 1P (2A-6A) | 1 | 45.000 - 120.000 | 45.000 - 120.000 | Proteksi supply panel |
| 5 | Terminal block DIN + end clamp | 1 set | 120.000 - 280.000 | 120.000 - 280.000 | Titik terminasi sinyal |
| 6 | Relay interface/optocoupler isolation module | 2-4 | 45.000 - 120.000 | 90.000 - 480.000 | Isolasi sinyal dari PLC utama |
| 7 | LAN cable Cat6 + konektor RJ45 | 1 set | 35.000 - 120.000 | 35.000 - 120.000 | Jika pakai Ethernet |
| 8 | Box panel kecil + DIN rail | 1 | 250.000 - 700.000 | 250.000 - 700.000 | Menyesuaikan space mesin |
| 9 | Duct kabel + aksesoris (cable tie, ferrule, lug) | 1 lot | 120.000 - 300.000 | 120.000 - 300.000 | Kerapian dan keamanan wiring |
| 10 | Kabel kontrol 0.75 mm / 1.0 mm | 1 lot | 150.000 - 400.000 | 150.000 - 400.000 | Untuk mirror signal |

## 2) Opsi Tambahan (Disarankan)

| No | Item | Qty | Estimasi Harga Satuan (IDR) | Subtotal (IDR) | Catatan |
|---|---|---:|---:|---:|---|
| 1 | UPS mini DIN / DC UPS 24V | 1 | 600.000 - 1.800.000 | 600.000 - 1.800.000 | Menjaga data saat drop listrik |
| 2 | Industrial unmanaged switch 5 port | 1 | 250.000 - 900.000 | 250.000 - 900.000 | Jika banyak device network |
| 3 | Surge protector / SPD panel kecil | 1 | 180.000 - 700.000 | 180.000 - 700.000 | Proteksi lonjakan |
| 4 | Pilot lamp status (power, online, fault) | 3 | 20.000 - 60.000 | 60.000 - 180.000 | Monitoring cepat di panel |
| 5 | Selector maintenance / bypass | 1 | 35.000 - 120.000 | 35.000 - 120.000 | Memudahkan troubleshooting |

## 3) Estimasi Total Budget

- **Paket minimum (wajib saja):** sekitar **2.640.000 - 6.450.000 IDR**
- **Paket disarankan (wajib + tambahan):** sekitar **3.765.000 - 10.150.000 IDR**

## 4) Spesifikasi Minimum PLC Kecil yang Dicari

- DI minimum: 6-8 titik (RUN, STOP, ALARM, pulse counter, mode selector)
- DO minimum: 2-4 titik (opsional untuk status lamp/buzzer)
- Support high-speed input (lebih aman untuk counter pulse cepat)
- Support komunikasi Ethernet/RS485
- Dapat integrasi ke gateway MQTT (native atau via converter)

## 5) Catatan Belanja Agar Tetap Murah Tapi Aman

- Prioritaskan **PLC entry-level + gateway MQTT terpisah** dibanding PLC high-end.
- Untuk tahap awal, cukup baca sinyal inti: `RUN`, `ALARM`, `COUNTER`.
- Hindari item kosmetik panel di fase pilot, fokus ke reliability.
- Gunakan komponen yang mudah dicari lokal agar lead time cepat.

## 6) Catatan

- Harga adalah estimasi pasar Indonesia (kisaran) dan bisa berubah tergantung merek, kota, serta supplier.
- Estimasi belum termasuk jasa panel wiring, programming, dan commissioning.
