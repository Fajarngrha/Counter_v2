# Materi LinkedIn — IoT Production Counter

Dokumen ini berisi draft posting, caption carousel, dan hashtag untuk sharing project **IoT Production Counter Dashboard** di LinkedIn.

---

## Ringkasan Project (untuk bio / deskripsi singkat)

**IoT Production Counter** — sistem monitoring produksi real-time untuk manufaktur. Perangkat edge (ESP8266 / ESP32 / ESP32-C3) mendeteksi barang lewat sensor, menampilkan counter di TM1637, lalu mengirim data via **MQTT** ke dashboard web. Backend **Node.js** memproses data per shift, menyimpan histori, dan menampilkan status multi-mesin secara live.

**Stack:** ESP8266 · ESP32 · ESP32-C3 · MQTT (HiveMQ) · Node.js · Express · Socket.IO · HTML/CSS/JS · Raspberry Pi

---

## Posting Utama (Bahasa Indonesia — Recommended)

### Versi Panjang

```
📊 Dari sensor di lantai produksi → langsung ke dashboard supervisor.

Beberapa bulan terakhir saya membangun IoT Production Counter: sistem untuk menghitung barang produksi secara otomatis dan memantau hasilnya secara near real-time dari browser.

🔧 Apa yang sudah jalan?

• Edge device: ESP8266, ESP32, dan ESP32-C3 + display TM1637 + input sensor (relay dry contact)
• Data dikirim lewat MQTT (HiveMQ Cloud, TLS) — cocok untuk site lapangan yang terpisah dari server kantor
• Dashboard web multi-device: tiap mesin punya Device ID unik, counter terpisah, target produksi per mesin
• Auto-save & reset otomatis saat pergantian shift (3 shift: pagi, sore, malam)
• Riwayat produksi per shift + filter tanggal
• Indikator Online/Offline per perangkat IoT
• Deploy di Raspberry Pi + Nginx, siap dipakai di lingkungan produksi

💡 Kenapa MQTT, bukan koneksi langsung ke server?

Karena di manufaktur, mesin sering berada di site berbeda. ESP cukup connect ke broker cloud — backend subscribe topic yang sama. Lebih stabil, lebih scalable, dan lebih mudah ditambah mesin baru tanpa ubah arsitektur.

🎯 Manfaat di lapangan:

→ Supervisor lihat angka produksi live tanpa jalan ke mesin
→ Data shift tersimpan otomatis — tidak hilang saat pergantian shift
→ Satu dashboard untuk banyak mesin (multi-device)
→ Reset counter & target bisa dari dashboard atau tombol fisik di mesin

Ini masih project hands-on saya sendiri — dari wiring, firmware, backend, sampai UI dashboard. Belajar banyak soal IoT edge, protokol MQTT, dan bagaimana sistem kecil bisa langsung berguna di operasional pabrik.

Kalau Anda juga mengerjakan IoT industri, smart factory, atau digitalisasi produksi — saya senang diskusi dan tukar pengalaman. 🙌

#IoT #Industry40 #SmartFactory #MQTT #ESP32 #ESP8266 #NodeJS #Manufacturing #DigitalTransformation #EmbeddedSystems #ProductionMonitoring #CMMS
```

---

### Versi Pendek (lebih cocok untuk engagement cepat)

```
📦 IoT Production Counter — hitung barang otomatis, pantau dari dashboard.

ESP8266/ESP32 kirim data counter via MQTT → Node.js backend → dashboard web real-time.

✅ Multi-device (banyak mesin, satu dashboard)
✅ Auto-save per shift + riwayat produksi
✅ Target produksi per mesin
✅ Online/Offline status per device
✅ Deploy di Raspberry Pi

Project hands-on: firmware + backend + UI — dari lapangan produksi sampai supervisor bisa lihat angka live.

#IoT #MQTT #ESP32 #Manufacturing #Industry40 #NodeJS #SmartFactory
```

---

### Versi Story / Personal (lebih relatable)

```
Dulu cek jumlah produksi = jalan ke mesin, lihat angka manual, catat di kertas.

Sekarang: sensor hitung otomatis → ESP kirim lewat MQTT → angka langsung muncul di dashboard supervisor. Shift berganti? Data tersimpan sendiri, counter reset otomatis.

Saya bangun sistem ini end-to-end:
• Firmware ESP8266 / ESP32 / ESP32-C3
• Broker MQTT cloud (HiveMQ)
• Backend Node.js + Socket.IO
• Dashboard web multi-mesin

Bukan demo di meja kerja — ini dirancang untuk dipakai di lingkungan produksi nyata: banyak mesin, 3 shift, site terpisah dari server.

Belajar terbesar: IoT industri itu bukan soal hardware saja. Yang menentukan = arsitektur data, identitas per device, dan UI yang operator/supervisor benar-benar mau buka setiap hari.

Siapa di sini juga lagi digitalisasi proses produksi? 👇

#IoT #Manufacturing #Industry40 #MQTT #ESP32 #DigitalTransformation
```

---

## Posting Bahasa Inggris (opsional — untuk jangkauan global)

```
📊 Built an IoT Production Counter — from factory floor sensor to live web dashboard.

Edge devices (ESP8266 / ESP32 / ESP32-C3) detect production pulses, display counts on TM1637, and publish via MQTT to a Node.js backend.

What's working:
✅ Multi-device dashboard (one view, many machines)
✅ Auto-save on shift change (3 shifts)
✅ Per-machine production targets
✅ Online/offline device status
✅ Deployed on Raspberry Pi + Nginx

Key design choice: MQTT over direct server connection — so remote factory sites only need internet + broker access, not VPN to HQ.

End-to-end project: firmware, wiring, backend, and UI.

#IoT #Industry40 #MQTT #ESP32 #NodeJS #SmartFactory #Manufacturing #EmbeddedSystems
```

---

## Ide Carousel (5–7 slide)

Gunakan Canva / PowerPoint / LinkedIn native carousel. Satu poin per slide, font besar, screenshot dashboard jika ada.

| Slide | Judul | Isi |
|-------|-------|-----|
| 1 | **IoT Production Counter** | Monitoring produksi real-time untuk manufaktur |
| 2 | **Masalah** | Hitung manual, data shift tidak terpusat, supervisor harus ke mesin |
| 3 | **Solusi** | Sensor → ESP → MQTT → Dashboard web |
| 4 | **Hardware** | ESP8266 / ESP32 / ESP32-C3 + TM1637 + sensor relay |
| 5 | **Software** | Node.js · MQTT · Socket.IO · Multi-device API |
| 6 | **Fitur** | 3 shift auto-save · Target per mesin · Riwayat · Status online |
| 7 | **CTA** | "Building practical IoT for manufacturing — let's connect" |

**Caption carousel (copy-paste):**

```
Swipe → lihat alur IoT Production Counter dari sensor sampai dashboard 👉

Project ini saya bangun untuk digitalisasi hitung produksi di manufaktur: multi-mesin, multi-shift, data real-time.

Slide 1–7: masalah → arsitektur → stack → fitur.

Kalau tertarik IoT industri atau smart factory, connect ya — saya share pengalaman deploy-nya juga.

#IoT #Industry40 #MQTT #ESP32 #Manufacturing #SmartFactory #NodeJS
```

---

## Bullet Highlights (untuk comment / reply / DM)

Salin jika ada yang tanya detail di komentar:

- **Protokol:** MQTT (topic per device: `iot/counter/<deviceId>/increment`)
- **Broker:** HiveMQ Cloud (TLS port 8883)
- **MCU:** ESP8266 (NodeMCU), ESP32, ESP32-C3
- **Display:** TM1637 4-digit 7-segment
- **Backend:** Node.js + Express + Socket.IO
- **Database:** JSON file (`data/db.json`) — persisten tanpa DB server
- **Shift:** 3 shift WIB, auto-save + reset di boundary 07:00 / 16:00 / 23:00
- **Deploy:** Raspberry Pi + systemd + Nginx reverse proxy
- **Multi-device:** Device ID unik per mesin, history & target terpisah

---

## Hashtag Sets

### Set A — IoT & Industri (utama)
```
#IoT #Industry40 #SmartFactory #Manufacturing #DigitalTransformation #ProductionMonitoring #CMMS #OperationalExcellence
```

### Set B — Teknis
```
#MQTT #ESP32 #ESP8266 #NodeJS #EmbeddedSystems #RaspberryPi #SocketIO #WebDevelopment
```

### Set C — Campuran (max ~10 untuk LinkedIn)
```
#IoT #Industry40 #MQTT #ESP32 #Manufacturing #SmartFactory #NodeJS #DigitalTransformation #EmbeddedSystems #ProductionMonitoring
```

---

## Tips Upload di LinkedIn

1. **Waktu posting:** Selasa–Kamis, 08:00–10:00 atau 17:00–19:00 WIB (audience profesional aktif).
2. **Media:** Upload 1 screenshot dashboard + 1 foto wiring/mesin (jika boleh) — post dengan gambar dapat ~2× engagement.
3. **Hook:** Baris pertama harus menarik (sudah ada di draft di atas). LinkedIn memotong setelah ~2 baris — buat pembuka kuat.
4. **CTA:** Akhiri dengan pertanyaan ("Siapa yang juga mengerjakan IoT di manufaktur?") agar komentar naik.
5. **Jangan:** Jangan tempel terlalu banyak hashtag di body — max 5–10; sisanya bisa di comment pertama.
6. **Comment pertama (opsional):** Tempel hashtag lengkap + link demo/docs jika sudah public.

---

## Comment Pertama (template)

```
🔗 Detail teknis:
• MQTT topic per device
• Multi-device dashboard (ESP8266 / ESP32 / ESP32-C3)
• Auto-save 3 shift + riwayat produksi
• Deploy: Raspberry Pi + Nginx

#IoT #Industry40 #MQTT #ESP32 #ESP8266 #NodeJS #SmartFactory #Manufacturing #DigitalTransformation #EmbeddedSystems #ProductionMonitoring #CMMS #RaspberryPi
```

---

## One-liner (untuk headline / featured section)

- **ID:** Sistem IoT untuk monitoring produksi real-time — ESP + MQTT + dashboard multi-mesin.
- **EN:** Real-time production monitoring with ESP edge devices, MQTT, and a multi-machine web dashboard.

---

## Checklist Sebelum Post

- [ ] Screenshot dashboard (tanpa data sensitif / nama pabrik)
- [ ] Foto hardware (opsional, blur label sensitif)
- [ ] Pilih versi posting (panjang / pendek / story)
- [ ] Siapkan comment pertama dengan hashtag
- [ ] Pastikan tidak expose credential MQTT / IP internal

---

*Terakhir diperbarui: Agustus 2026*
