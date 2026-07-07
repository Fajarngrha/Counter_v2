# Deploy Dashboard di Server Linux + Domain Perusahaan (Tanpa Tunnel)

Panduan ini disesuaikan untuk kebutuhan terbaru:

- Dashboard jalan di **server Linux** (Ubuntu/Debian/CentOS sejenis).
- Domain menggunakan **domain perusahaan** (DNS internal perusahaan/provider perusahaan).
- **Tidak menggunakan tunnel** (Cloudflare Tunnel/ngrok tidak dipakai).
- Akses publik langsung via **HTTPS + reverse proxy Nginx**.

---

## 1) Arsitektur yang dipakai

```text
ESP32 -> MQTT Broker -> Backend Dashboard (Linux server:3010)
                                           |
                                           | reverse proxy
                                           v
                                      Nginx :443
                                           |
                                           v
                              https://iot.perusahaan.com
```

Catatan:
- Port aplikasi Node.js tetap internal (`3010`), tidak diekspos langsung ke internet.
- Domain perusahaan diarahkan ke public IP server (A record).

---

## 2) Prasyarat

### Server Linux
- Akses sudo/root.
- Port terbuka:
  - `80/tcp` (HTTP, validasi SSL awal)
  - `443/tcp` (HTTPS)
- Node.js LTS sudah terpasang.
- Nginx terpasang.

### Domain Perusahaan
- Subdomain aktif, contoh: `iot.perusahaan.com`.
- Tim DNS perusahaan bisa membuat/mengubah A record.

### Jaringan
- Jika server di jaringan internal, pastikan NAT/firewall kantor meneruskan port 80/443 ke server ini.

---

## 3) Set DNS domain perusahaan (tanpa tunnel)

Minta tim DNS membuat record:

- `Type`: `A`
- `Host`: `iot` (atau sesuai subdomain)
- `Value`: `<PUBLIC_IP_SERVER>`
- `TTL`: 300 (atau default perusahaan)

Cek propagasi:

```bash
nslookup iot.perusahaan.com
```

Harus resolve ke public IP server Anda.

---

## 4) Deploy aplikasi Node.js

```bash
sudo mkdir -p /opt/iot-counter
sudo chown -R $USER:$USER /opt/iot-counter
cd /opt/iot-counter

# Clone/copy source aplikasi ke folder ini
npm install --production
```

Buat file env production:

```bash
nano /opt/iot-counter/.env
```

Contoh:

```env
PORT=3010
SESSION_SECRET=ISI_DENGAN_STRING_ACAK_PANJANG

MQTT_BROKER_URL=mqtts://xxxx.s1.eu.hivemq.cloud:8883
MQTT_USERNAME=USER_HIVEMQ
MQTT_PASSWORD=PASS_HIVEMQ
MQTT_TOPIC=iot/counter/increment
MQTT_COMMAND_TOPIC=iot/counter/command
MQTT_CLIENT_ID=iot-counter-server-prod

ADMIN_USERNAME=admin
ADMIN_PASSWORD=GANTI_PASSWORD_ADMIN
```

Tes lokal:

```bash
cd /opt/iot-counter
npm start
curl http://localhost:3010/api/session
```

Jika `curl` berhasil, lanjut ke service.

---

## 5) Jadikan aplikasi sebagai service systemd

Buat unit file:

```bash
sudo nano /etc/systemd/system/iot-counter.service
```

Isi:

```ini
[Unit]
Description=IoT Production Counter Dashboard
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/iot-counter
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5
Environment=NODE_ENV=production

# Jika perlu:
# EnvironmentFile=/opt/iot-counter/.env

User=www-data
Group=www-data

[Install]
WantedBy=multi-user.target
```

Aktifkan:

```bash
sudo systemctl daemon-reload
sudo systemctl enable iot-counter
sudo systemctl start iot-counter
sudo systemctl status iot-counter
```

Log aplikasi:

```bash
sudo journalctl -u iot-counter -f
```

---

## 6) Konfigurasi Nginx reverse proxy

Buat site:

```bash
sudo nano /etc/nginx/sites-available/iot-counter
```

Isi:

```nginx
server {
    listen 80;
    server_name iot.perusahaan.com;

    location / {
        proxy_pass http://127.0.0.1:3010;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Socket.IO / websocket
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Aktifkan site:

```bash
sudo ln -s /etc/nginx/sites-available/iot-counter /etc/nginx/sites-enabled/iot-counter
sudo nginx -t
sudo systemctl reload nginx
```

Tes:

```bash
curl -I http://iot.perusahaan.com
```

---

## 7) Aktifkan HTTPS (Certbot Let's Encrypt)

Install certbot:

```bash
sudo apt update
sudo apt install -y certbot python3-certbot-nginx
```

Generate SSL:

```bash
sudo certbot --nginx -d iot.perusahaan.com
```

Tes auto-renew:

```bash
sudo certbot renew --dry-run
```

Setelah sukses, akses:

```text
https://iot.perusahaan.com
```

---

## 8) Firewall server

Jika pakai UFW:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

Pastikan port `3010` **tidak dibuka publik**.

---

## 9) Hardening minimum (wajib)

1. Ganti default password admin dashboard.
2. Jangan commit `.env` ke repository.
3. Gunakan MQTTS untuk broker cloud.
4. Batasi akses SSH (IP allowlist jika memungkinkan).
5. Update rutin OS + dependency Node.js.

---

## 10) Troubleshooting cepat

### Domain tidak bisa dibuka
- Cek A record domain perusahaan.
- Cek NAT/firewall perimeter kantor untuk 80/443.
- Cek service Nginx:
  - `sudo systemctl status nginx`

### HTTPS gagal / sertifikat gagal terbit
- Pastikan domain sudah resolve ke server publik.
- Pastikan port 80 bisa diakses dari internet saat proses certbot.

### Dashboard terbuka tapi data IoT tidak update
- Cek service backend:
  - `sudo journalctl -u iot-counter -f`
- Cek koneksi MQTT broker dan topic.
- Cek apakah ESP publish ke topic yang sama.

### Websocket (realtime) tidak jalan
- Pastikan blok Nginx sudah include:
  - `proxy_set_header Upgrade $http_upgrade;`
  - `proxy_set_header Connection "upgrade";`

---

## 11) Checklist selesai deploy

- [ ] DNS `iot.perusahaan.com` mengarah ke public IP server.
- [ ] Aplikasi lokal jalan di `http://127.0.0.1:3010`.
- [ ] Service `iot-counter` aktif dan auto-start.
- [ ] Nginx reverse proxy aktif dan normal.
- [ ] HTTPS aktif (`https://iot.perusahaan.com`).
- [ ] Backend terhubung ke MQTT broker.
- [ ] Data ESP tampil realtime di dashboard.
- [ ] Password default sudah diganti.

