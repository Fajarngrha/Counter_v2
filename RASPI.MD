# Deploy Raspberry Pi (Domain Hostinger + HiveMQ Cloud)

Dokumen ini khusus untuk dashboard di project `Counter_v2` (Node.js + Express + Socket.IO + MQTT), dengan skenario:

- ESP32 dipasang di lapangan (internet publik)
- MQTT broker menggunakan **HiveMQ Cloud**
- Server dashboard berada di rumah (Raspberry Pi)
- Dashboard diakses dari domain Hostinger (HTTPS)

Alur produksi:

`ESP32 -> HiveMQ Cloud -> server.js (Raspberry Pi di rumah) -> Dashboard Web (domain Hostinger)`

---

## 1) Komponen yang Dipakai

- **Broker MQTT**: HiveMQ Cloud
- **Dashboard/Backend**: project ini (`server.js`) di Raspberry Pi
- **Database lokal**: `data/db.json`
- **Frontend**: `public/` (served oleh Express)

Endpoint utama:
- `/` login
- `/dashboard`
- `/history`
- API: `/api/dashboard`, `/api/target`, `/api/counter/reset`, dst.

---

## 2) Persiapan Raspberry Pi

## 2.1 Update sistem
```bash
sudo apt update && sudo apt upgrade -y
```

## 2.2 Install Node.js LTS (contoh Node 20)
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

## 2.3 (Opsional) Mosquitto Lokal
Tidak wajib untuk skenario HiveMQ Cloud. Bisa di-skip.

---

## 3) Konfigurasi Domain Hostinger -> Raspberry Rumah

Karena server ada di rumah, domain Hostinger harus mengarah ke IP publik rumah.

### 3.1 Di panel DNS Hostinger
- Buat `A record`:
  - Host: `dashboard` (atau `@` jika root domain)
  - Points to: `<IP_PUBLIC_RUMAH>`
  - TTL: default

Contoh hasil:
- `dashboard.domainanda.com` -> `36.xx.xx.xx`

### 3.2 Jika IP rumah dinamis (sering berubah)
Gunakan salah satu:
- fitur DDNS di router, atau
- script update DNS Hostinger via API (cron), atau
- solusi tunnel (Cloudflare Tunnel/Tailscale Funnel)

### 3.3 Router rumah
Forward port ke Raspberry:
- `80 -> IP_LOCAL_RASPI:80`
- `443 -> IP_LOCAL_RASPI:443`

Pastikan IP lokal Raspberry fixed (DHCP reservation/static).

---

## 4) Deploy Project `Counter_v2` di Raspberry

Misal path deploy:
`/opt/counter/Counter_v2`

```bash
cd /opt/counter/Counter_v2
npm install
cp .env.example .env
```

Isi `.env` agar cocok dengan dashboard Anda:

```env
PORT=3010
SESSION_SECRET=<SECRET_RANDOM_PANJANG>

MQTT_BROKER_URL=mqtts://<YOUR_HIVEMQ_HOST>.s1.eu.hivemq.cloud:8883
MQTT_USERNAME=<HIVEMQ_USERNAME>
MQTT_PASSWORD=<HIVEMQ_PASSWORD>
MQTT_TOPIC=iot/counter/increment
MQTT_COMMAND_TOPIC=iot/counter/command
MQTT_CLIENT_ID=iot-counter-server-prod

ADMIN_USERNAME=admin
ADMIN_PASSWORD=<PASSWORD_LOGIN_DASHBOARD>
```

> `ADMIN_PASSWORD` juga dipakai sebagai password validasi saat edit target.

Jalankan test:
```bash
npm start
```

Jika sukses, log menampilkan:
- `Server berjalan di http://localhost:3010`
- `MQTT Broker: ...`
- `MQTT Topic: iot/counter/increment`

---

## 5) Sesuaikan Firmware ESP32

Karena broker di internet (HiveMQ Cloud), firmware ESP32 harus mode cloud.

Di `counter-with-seven.ino`:

- aktifkan mode HiveMQ Cloud
- isi hostname/port/user/password HiveMQ

Contoh:
```cpp
#define USE_HIVEMQ_CLOUD true
const char* mqtt_server = "<YOUR_HIVEMQ_HOST>.s1.eu.hivemq.cloud";
const int mqtt_port = 8883;
const char* mqtt_user = "<HIVEMQ_USERNAME>";
const char* mqtt_pass = "<HIVEMQ_PASSWORD>";
```

Topik harus sama:
- publish data: `iot/counter/increment`
- command: `iot/counter/command`

Jika broker pakai auth, firmware harus connect dengan username/password broker.

---

## 6) Jalankan Sebagai Service (Autostart)

Buat service:
`/etc/systemd/system/counter-dashboard.service`

```ini
[Unit]
Description=IoT Counter Dashboard
After=network-online.target mosquitto.service
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/counter/Counter_v2
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5
Environment=NODE_ENV=production
User=pi

[Install]
WantedBy=multi-user.target
```

Aktifkan:
```bash
sudo systemctl daemon-reload
sudo systemctl enable counter-dashboard
sudo systemctl start counter-dashboard
sudo systemctl status counter-dashboard
```

Log service:
```bash
journalctl -u counter-dashboard -f
```

---

## 7) (Opsional) Reverse Proxy Nginx

Jika ingin akses tanpa `:3010`:

```bash
sudo apt install -y nginx
```

Server block contoh:
```nginx
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:3010;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

---

## 8) Setup HTTPS untuk Domain Hostinger

Install nginx + certbot:
```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

Contoh Nginx untuk domain:
`/etc/nginx/sites-available/counter-dashboard`

```nginx
server {
    listen 80;
    server_name dashboard.domainanda.com;

    location / {
        proxy_pass http://127.0.0.1:3010;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

Aktifkan:
```bash
sudo ln -s /etc/nginx/sites-available/counter-dashboard /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

Pasang SSL:
```bash
sudo certbot --nginx -d dashboard.domainanda.com
```

---

## 9) Tes End-to-End (Sesuai Kode Anda)

1. **Broker aktif**: HiveMQ Cloud reachable
2. **Service dashboard aktif**: `counter-dashboard` running
3. **ESP32 terhubung HiveMQ** dan publish payload:
   ```json
   [{"waktu":"2026-06-26 11:20:00","counter":123}]
   ```
4. Buka dashboard via domain:
   - `https://dashboard.domainanda.com`
   - login via `ADMIN_USERNAME / ADMIN_PASSWORD`
   - cek counter update realtime
5. Test command dari dashboard:
   - reset counter
   - reset target ticker
   - edit target + model + password validasi

---

## 10) Troubleshooting Khusus Skenario Ini

- **Dashboard login loop / Unauthorized**
  - cek `SESSION_SECRET` ada di `.env`
  - cek jam Raspberry benar

- **Target edit gagal**
  - pastikan password popup = `ADMIN_PASSWORD`

- **ESP32 tidak update dashboard**
  - cek topik sama persis `MQTT_TOPIC`
  - cek format payload mengandung `counter`
  - cek serial monitor ESP32 (status MQTT)
  - cek log service dashboard:
    ```bash
    journalctl -u counter-dashboard -f
    ```

- **Command reset tidak sampai ke device**
  - pastikan ESP32 subscribe `iot/counter/command`
  - cek `MQTT_COMMAND_TOPIC` di `.env`
  - pastikan ESP32 dan server pakai credential HiveMQ yang benar

- **Domain tidak bisa diakses dari internet**
  - cek DNS Hostinger sudah resolve ke IP publik rumah
  - cek port forwarding 80/443
  - cek ISP memblokir inbound port

---

## 11) Checklist Go-Live

- [ ] Raspberry IP statis
- [ ] DNS Hostinger mengarah ke IP publik rumah
- [ ] Port forwarding router 80/443 aktif
- [ ] SSL certbot aktif dan auto-renew
- [ ] `.env` produksi HiveMQ terisi benar
- [ ] `counter-dashboard` service aktif (autostart)
- [ ] ESP32 mode HiveMQ Cloud aktif
- [ ] Dashboard realtime + command reset/edit target berfungsi
- [ ] Backup rutin folder project + `data/db.json`

