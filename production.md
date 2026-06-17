# Panduan Deploy Production — Raspberry Pi

Dokumen ini menjelaskan cara men-deploy **IoT Production Counter Dashboard** ke server **Raspberry Pi** untuk lingkungan produksi pabrik.

## Arsitektur Production

```
ESP32 (sensor) ──WiFi──► MQTT Broker (Mosquitto @ Raspberry Pi)
                              │
                              ▼
                    Backend Node.js (port 3000)
                              │
                              ▼
                    Database lokal (data/db.json)
                              │
                              ▼
              Browser operator (LAN / reverse proxy)
```

Semua komponen inti dapat berjalan di **satu Raspberry Pi**:
- Mosquitto sebagai MQTT broker
- Node.js sebagai backend + dashboard
- Penyimpanan data di folder `data/`

---

## 1) Prasyarat Hardware & OS

| Item | Rekomendasi |
|------|-------------|
| Board | Raspberry Pi 3B+ / 4 / 5 |
| Storage | microSD ≥ 16 GB (32 GB lebih aman) |
| OS | Raspberry Pi OS Lite (64-bit) atau Desktop |
| Jaringan | Ethernet (disarankan) atau WiFi stabil |
| Catatan | Set IP statis agar ESP32 selalu mengarah ke IP yang sama |

### 1.1 Update sistem

```bash
sudo apt update && sudo apt upgrade -y
sudo reboot
```

### 1.2 Set timezone WIB

Dashboard menggunakan timezone **Asia/Jakarta**:

```bash
sudo timedatectl set-timezone Asia/Jakarta
timedatectl
```

### 1.3 Set IP statis (disarankan)

Atur IP statis lewat router DHCP reservation **atau** file `/etc/dhcpcd.conf` / NetworkManager.

Contoh IP yang dipakai dokumentasi ini: `192.168.0.50`

Catat IP Pi — dipakai di sketch ESP32 (`mqtt_server`) dan akses browser.

---

## 2) Install Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

Pastikan versi Node.js **≥ v18**.

---

## 3) Install MQTT Broker (Mosquitto)

```bash
sudo apt install -y mosquitto mosquitto-clients
sudo systemctl enable mosquitto
sudo systemctl start mosquitto
sudo systemctl status mosquitto
```

Uji broker lokal:

```bash
mosquitto_sub -h localhost -t "iot/counter/increment" -v
```

Biarkan terminal terbuka. Di terminal lain:

```bash
mosquitto_pub -h localhost -t "iot/counter/increment" -m '[{"waktu":"2026-06-17 10:00:00","counter":1}]'
```

Jika pesan muncul di `mosquitto_sub`, broker siap.

### 3.1 Izinkan ESP32 dari jaringan LAN (opsional)

Default Mosquitto di Pi biasanya listen di semua interface. Pastikan firewall tidak memblokir port **1883**:

```bash
sudo ufw allow 1883/tcp
sudo ufw allow 3000/tcp
sudo ufw enable
```

> Untuk production lanjutan, pertimbangkan autentikasi MQTT (`/etc/mosquitto/mosquitto.conf` + password file).

---

## 4) Deploy Aplikasi Dashboard

### 4.1 Clone / salin project ke Pi

**Opsi A — Git**

```bash
cd /home/pi
git clone <URL-repo-anda> iot-counter
cd iot-counter
```

**Opsi B — SCP dari laptop Windows**

Di laptop (PowerShell):

```powershell
scp -r D:\FCC\Counter pi@192.168.0.50:/home/pi/iot-counter
```

Di Pi:

```bash
cd /home/pi/iot-counter
```

### 4.2 Install dependency

```bash
npm install --production
```

### 4.3 Buat file `.env` production

```bash
cp .env.example .env
nano .env
```

Isi contoh production:

```env
PORT=3000
SESSION_SECRET=GANTI-DENGAN-STRING-ACAK-PANJANG-MINIMAL-32-KARAKTER
MQTT_BROKER_URL=mqtt://localhost:1883
MQTT_TOPIC=iot/counter/increment
MQTT_CLIENT_ID=iot-counter-server-prod

# Wajib ganti kredensial default
ADMIN_USERNAME=admin_prod
ADMIN_PASSWORD=PasswordKuat123!
```

Generate secret acak:

```bash
openssl rand -hex 32
```

Salin output ke `SESSION_SECRET`.

### 4.4 Pastikan folder data bisa ditulis

```bash
mkdir -p data
chmod 755 data
```

Database otomatis dibuat saat pertama kali server jalan: `data/db.json`.

---

## 5) Jalankan Manual (Uji Awal)

```bash
cd /home/pi/iot-counter
npm start
```

Indikator sukses:

```
Server berjalan di http://localhost:3000
[MQTT] Terhubung ke mqtt://localhost:1883
[MQTT] Subscribe ke topik: iot/counter/increment
```

Akses dari browser (PC di jaringan yang sama):

```
http://192.168.0.50:3000
```

Login dengan `ADMIN_USERNAME` / `ADMIN_PASSWORD` dari `.env`.

---

## 6) Auto-Start dengan systemd (Production)

Agar dashboard nyala otomatis saat Pi boot dan restart jika crash.

### 6.1 Buat service file

```bash
sudo nano /etc/systemd/system/iot-counter.service
```

Isi:

```ini
[Unit]
Description=IoT Production Counter Dashboard
After=network.target mosquitto.service
Wants=mosquitto.service

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/iot-counter
Environment=NODE_ENV=production
ExecStart=/usr/bin/node /home/pi/iot-counter/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

> Sesuaikan `User`, `WorkingDirectory`, dan path `ExecStart` jika project tidak di `/home/pi/iot-counter`.

### 6.2 Aktifkan service

```bash
sudo systemctl daemon-reload
sudo systemctl enable iot-counter
sudo systemctl start iot-counter
sudo systemctl status iot-counter
```

Perintah berguna:

```bash
sudo systemctl restart iot-counter
sudo journalctl -u iot-counter -f
```

---

## 7) Reverse Proxy dengan Nginx (Opsional)

Agar dashboard bisa diakses tanpa `:3000` dan siap ditambah HTTPS.

```bash
sudo apt install -y nginx
sudo nano /etc/nginx/sites-available/iot-counter
```

Isi:

```nginx
server {
    listen 80;
    server_name 192.168.0.50;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Aktifkan:

```bash
sudo ln -s /etc/nginx/sites-available/iot-counter /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

Akses: `http://192.168.0.50`

---

## 8) Konfigurasi ESP32 ke Raspberry Pi

Di sketch `services/counter.ino`, sesuaikan:

```cpp
const char* mqtt_server = "192.168.0.50";  // IP Raspberry Pi
const int mqtt_port = 1883;
const char* mqtt_topic = "iot/counter/increment";  // sama dengan MQTT_TOPIC di .env
```

Payload yang dikirim:

```json
[{"waktu":"2026-06-17 10:00:00","counter":42}]
```

Upload firmware ke ESP32, lalu verifikasi:

1. Serial Monitor menampilkan `Data Terkirim`
2. Log backend: `journalctl -u iot-counter -f`
3. Dashboard counter bertambah dan status IoT **Online**

---

## 9) ESP32 dan Raspberry Pi di Jaringan WiFi Berbeda

MQTT **tidak peduli** ESP32 dan Pi pakai SSID WiFi yang sama. Yang penting: **keduanya bisa saling reach IP/port broker** (1883).

### 9.1 Skenario umum

| Situasi | Bisa connect? | Catatan |
|---------|---------------|---------|
| ESP32 WiFi + Pi **Ethernet**, router yang sama | ✅ Biasanya ya | SSID beda tidak masalah, asal satu subnet (mis. `192.168.0.x`) |
| ESP32 WiFi `Line-A` + Pi WiFi `Line-B`, **router/VLAN sama** | ✅/⚠️ Tergantung router | Harus routing antar-VLAN diaktifkan |
| ESP32 jaringan produksi + Pi jaringan kantor (**subnet berbeda**) | ❌ Default tidak | Perlu routing, VPN, atau broker di cloud |
| ESP32 guest WiFi + Pi LAN produksi | ❌ Sering tidak | Guest network biasanya **AP isolation** |
| ESP32 via internet + Pi di pabrik | ⚠️ Perlu setup khusus | Broker publik/VPN, jangan expose port 1883 mentah ke internet |

### 9.2 Prinsip teknis

```
ESP32 ──publish──► mqtt://<IP-ATAU-HOST-BROKER>:1883
                         ▲
Backend Pi ──subscribe───┘ (bisa localhost jika broker di Pi yang sama)
```

- Di ESP32: `mqtt_server` = **IP/hostname broker**, bukan IP dashboard Node.js (kecuali broker memang di Pi yang sama).
- Di `.env` Pi: `MQTT_BROKER_URL=mqtt://localhost:1883` jika Mosquitto jalan di Pi yang sama.
- **Port 3000** (dashboard) hanya untuk browser operator, **bukan** untuk ESP32.

### 9.3 Solusi jika beda subnet / beda lokasi

**Opsi A — Satu jaringan produksi (disarankan pabrik)**

- ESP32 dan Pi masuk **LAN produksi** yang sama.
- Pi pakai Ethernet, ESP32 pakai WiFi AP produksi — boleh, asal satu subnet.
- Matikan AP isolation di router/AP produksi.

**Opsi B — Broker MQTT terpisah (Pi hanya backend)**

Mosquitto di mesin ketiga yang bisa diakses keduanya:

```env
# .env di Raspberry Pi
MQTT_BROKER_URL=mqtt://192.168.1.10:1883
```

```cpp
// ESP32
const char* mqtt_server = "192.168.1.10";
```

**Opsi C — VPN site-to-site**

Jika ESP32 di site A dan Pi di site B, hubungkan jaringan via WireGuard/OpenVPN, lalu ESP32 publish ke IP VPN Pi/broker.

**Opsi D — MQTT cloud (HiveMQ Cloud, EMQX Cloud, dll.)**

```env
MQTT_BROKER_URL=mqtts://xxxx.s1.eu.hivemq.cloud:8883
```

ESP32 dan Pi keduanya connect ke broker cloud (perlu TLS + username/password). Cocok jika perangkat tidak satu LAN.

### 9.4 Cek konektivitas sebelum deploy

Dari **PC di jaringan ESP32**, ping IP broker:

```bash
ping 192.168.0.50
```

Dari **ESP32**, pantau Serial Monitor — status MQTT `rc` PubSubClient:

| rc | Arti |
|----|------|
| -2 | Broker unreachable (IP salah / beda jaringan / firewall) |
| -4 | Connection timeout (routing/firewall/port 1883 tertutup) |
| 0 | Connected |

Uji publish dari PC lain di jaringan ESP32:

```bash
mosquitto_pub -h 192.168.0.50 -p 1883 -t "iot/counter/increment" \
  -m '[{"waktu":"2026-06-17 10:00:00","counter":99}]'
```

Jika dashboard Pi berubah, jalur jaringan OK.

### 9.5 Firewall Raspberry Pi

Pastikan port **1883** terbuka untuk subnet ESP32:

```bash
sudo ufw allow from 192.168.0.0/24 to any port 1883 proto tcp
```

Ganti `192.168.0.0/24` sesuai subnet produksi Anda.

### 9.6 Rekomendasi praktis pabrik

1. **Satu SSID/LAN produksi** untuk semua perangkat IoT + server Pi.
2. Pi pakai **IP statis**; ESP32 hardcode IP broker itu.
3. Jangan pakai guest WiFi untuk ESP32.
4. Backup plan: simpan counter lokal di ESP32 (RTC/NVS) jika MQTT putus — data dikirim ulang saat online.

---

## 10) Checklist Keamanan Production

- [ ] Ganti `ADMIN_USERNAME` dan `ADMIN_PASSWORD` default
- [ ] Ganti `SESSION_SECRET` dengan string acak panjang
- [ ] Jangan commit file `.env` ke Git
- [ ] Batasi akses dashboard hanya jaringan LAN pabrik
- [ ] Aktifkan firewall (`ufw`) — buka hanya port yang diperlukan
- [ ] Backup rutin folder `data/` (lihat bagian 10)
- [ ] Update OS Pi secara berkala (`apt upgrade`)
- [ ] (Opsional) Tambah autentikasi MQTT di Mosquitto

---

## 11) Backup & Restore Data

Data produksi tersimpan di:

```
/home/pi/iot-counter/data/db.json
```

### Backup manual

```bash
cp /home/pi/iot-counter/data/db.json \
   /home/pi/backup/db-$(date +%Y%m%d-%H%M).json
```

### Backup otomatis harian (cron)

```bash
mkdir -p /home/pi/backup
crontab -e
```

Tambahkan:

```cron
0 2 * * * cp /home/pi/iot-counter/data/db.json /home/pi/backup/db-$(date +\%Y\%m\%d).json
```

### Restore

```bash
sudo systemctl stop iot-counter
cp /home/pi/backup/db-YYYYMMDD.json /home/pi/iot-counter/data/db.json
sudo systemctl start iot-counter
```

---

## 12) Update Aplikasi (Deploy Ulang)

```bash
cd /home/pi/iot-counter
sudo systemctl stop iot-counter

# backup data dulu
cp data/db.json ~/backup/db-before-update.json

# tarik versi terbaru
git pull
npm install --production

sudo systemctl start iot-counter
sudo systemctl status iot-counter
```

---

## 13) Troubleshooting

### Dashboard tidak bisa diakses

```bash
sudo systemctl status iot-counter
sudo journalctl -u iot-counter -n 50
curl http://localhost:3000/api/session
```

Cek firewall dan IP Pi.

### MQTT tidak terhubung

```bash
sudo systemctl status mosquitto
mosquitto_sub -h localhost -t "iot/counter/increment" -v
```

Pastikan `.env`:

```env
MQTT_BROKER_URL=mqtt://localhost:1883
MQTT_TOPIC=iot/counter/increment
```

### ESP32 publish tapi dashboard tidak berubah

- Topic ESP32 harus **identik** dengan `MQTT_TOPIC`
- Format payload harus punya field `counter`
- Cek log: `journalctl -u iot-counter -f`

### Data hilang setelah reboot

- Pastikan file `data/db.json` ada dan writable
- Jangan jalankan `npm start` dari folder lain (working directory harus project root)
- Gunakan systemd service dengan `WorkingDirectory` yang benar

### Port 3000 sudah dipakai

```bash
sudo lsof -i :3000
```

Ubah `PORT` di `.env` atau hentikan proses yang bentrok.

---

## 14) Ringkasan Port & File Penting

| Komponen | Port / Path |
|----------|-------------|
| Dashboard HTTP | `3000` (atau `80` via Nginx) |
| MQTT Mosquitto | `1883` |
| Database | `/home/pi/iot-counter/data/db.json` |
| Environment | `/home/pi/iot-counter/.env` |
| Service | `/etc/systemd/system/iot-counter.service` |
| Log aplikasi | `journalctl -u iot-counter -f` |

---

## 15) IoT Lapangan Jauh via Internet (Konsep Utama)

Jika ESP32 dipasang **jauh dari server** (site lapangan vs server Raspberry Pi di kantor/pabrik), **jangan** mengandalkan IP lokal (`192.168.x.x`). Gunakan **MQTT broker di internet** sebagai jembatan data — ini konsep IoT yang benar.

### 15.1 Arsitektur yang disarankan

```
[Lapangan / Site A]                    [Internet]                 [Server / Site B]
                                                                 
  ESP32 + Sensor                          │                    Raspberry Pi
       │                                  │                         │
       │ WiFi lapangan                    │                         │
       ▼                                  ▼                         ▼
  Publish MQTT ──────────────►  MQTT Broker Cloud  ◄────── Subscribe MQTT
  (outbound)                   (HiveMQ / EMQX / dll)            (outbound)
                                        │
                                        │  pesan masuk
                                        ▼
                                 Backend Node.js
                                 Dashboard + db.json
```

**Kunci konsep:**
- ESP32 **tidak** connect langsung ke Raspberry Pi.
- Keduanya connect **keluar** ke broker cloud yang sama.
- Tidak perlu port forwarding / IP publik di Raspberry Pi.
- Topic MQTT menjadi "saluran data" antar lokasi.

### 15.2 Komponen di lapangan (ESP32)

| Kebutuhan | Keterangan |
|-----------|------------|
| Koneksi internet | WiFi site lapangan, atau router 4G/LTE jika tidak ada fixed broadband |
| Broker address | **Hostname cloud**, bukan IP lokal Pi |
| Port | `8883` (MQTTS/TLS) untuk production |
| Autentikasi | Username + password dari provider broker |
| Payload | `[{"waktu":"...","counter":N}]` (format yang sudah dipakai project) |

Contoh konfigurasi ESP32 (konsep):

```cpp
// Ganti IP lokal dengan hostname broker cloud
const char* mqtt_server = "xxxx.s1.eu.hivemq.cloud";
const int mqtt_port = 8883;  // MQTTS
const char* mqtt_topic = "iot/counter/increment";
const char* mqtt_user = "user-broker-anda";
const char* mqtt_pass = "password-broker-anda";
```

> Untuk TLS di ESP32, gunakan `WiFiClientSecure` + sertifikat CA broker (sesuai library PubSubClient).

### 15.3 Konfigurasi backend Raspberry Pi

Di `.env` server (bukan `localhost`):

```env
MQTT_BROKER_URL=mqtts://xxxx.s1.eu.hivemq.cloud:8883
MQTT_TOPIC=iot/counter/increment
MQTT_CLIENT_ID=iot-counter-server-prod
MQTT_USERNAME=user-broker-anda
MQTT_PASSWORD=password-broker-anda
```

Backend project sudah mendukung `MQTT_USERNAME` dan `MQTT_PASSWORD`.

Restart service:

```bash
sudo systemctl restart iot-counter
journalctl -u iot-counter -f
```

Harus muncul: `[MQTT] Terhubung` dan `Subscribe ke topik`.

### 15.4 Provider MQTT cloud (pilih salah satu)

| Provider | Cocok untuk | Catatan |
|----------|-------------|---------|
| **HiveMQ Cloud** | Pemula, free tier | Setup cepat, TLS bawaan |
| **EMQX Cloud** | Skala menengah | Dashboard monitoring bagus |
| **CloudMQTT** | Proyek kecil | Simple, berbayar murah |
| **Mosquitto sendiri di VPS** | Kontrol penuh | Butuh maintain server + TLS sendiri |

Langkah umum (semua provider):
1. Buat cluster/broker + user/password.
2. Catat **hostname**, **port TLS**, **username**, **password**.
3. Masukkan ke ESP32 dan `.env` Raspberry Pi.
4. Pastikan **topic sama** di kedua sisi.

### 15.5 Keamanan IoT production

- Wajib **MQTTS** (TLS), jangan MQTT plain (`1883`) lewat internet publik.
- Ganti username/password default broker.
- Gunakan topic spesifik per line/site, misalnya:
  - `pabrik/site-a/line1/counter`
- Jangan expose dashboard `:3000` ke internet publik tanpa HTTPS + firewall.
- Dashboard cukup diakses operator via LAN/VPN kantor.

### 15.6 Ketahanan saat internet putus (lapangan)

Sesuai PRD, ESP32 harus punya **buffer lokal**:

1. Counter tetap naik di ESP32 (RTC + memori lokal) walau MQTT putus.
2. Saat internet kembali, ESP32 publish nilai counter terbaru.
3. Backend sudah punya proteksi out-of-order (tidak menurunkan counter).

Pastikan sketch ESP32:
- Tidak reset counter saat WiFi putus sementara.
- Retry publish otomatis saat reconnect.

### 15.7 Alur data lengkap (lapangan → dashboard)

```
1. Barang lewat sensor → ESP32 counter++
2. ESP32 publish ke broker cloud
3. Broker meneruskan ke subscriber (backend Pi)
4. Backend simpan state ke data/db.json
5. Socket.IO push ke browser dashboard
6. Saat pergantian shift → auto-save riwayat + reset counter shift
```

### 15.8 Checklist deploy lapangan jauh

- [ ] Site lapangan punya internet stabil (WiFi/4G)
- [ ] Broker MQTT cloud aktif + kredensial dibuat
- [ ] ESP32 pakai hostname cloud (bukan IP Pi)
- [ ] Raspberry Pi `.env` arah ke broker cloud yang sama
- [ ] Topic identik di ESP32 dan backend
- [ ] Uji publish dari lapangan → dashboard server berubah
- [ ] Uji putus internet → counter ESP tidak hilang → recover saat online
- [ ] Backup `data/db.json` rutin di server

---

## 16) Verifikasi Production Selesai

- [ ] Pi boot → dashboard otomatis online (`systemctl status iot-counter`)
- [ ] Mosquitto aktif (`systemctl status mosquitto`)
- [ ] ESP32 terhubung WiFi + publish ke Pi
- [ ] Dashboard update realtime (counter, status IoT Online)
- [ ] Pergantian shift otomatis save ke riwayat (07:00, 16:00, 23:00 WIB)
- [ ] Halaman riwayat menampilkan data + target
- [ ] Backup `data/db.json` terjadwal

Setelah semua checklist lulus, sistem siap dipakai di lantai produksi.
