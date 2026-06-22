# Deploy Dashboard Raspberry Pi + Domain Hostinger + Cloudflare Tunnel

Panduan ini fokus ke kebutuhan Anda:

- Dashboard jalan di **Raspberry Pi**
- Akses publik pakai **domain Hostinger**
- Tanpa buka port router (tanpa port forwarding) lewat **Cloudflare Tunnel**
- Data ESP tetap bisa dipantau dari internet

---

## 1) Arsitektur yang dipakai

```text
ESP32 -> MQTT Broker -> Backend Dashboard (Raspberry Pi:3010)
                                           |
                                           | localhost
                                           v
                                     cloudflared tunnel
                                           |
                                           v
                                domain Anda (HTTPS internet)
```

Catatan penting:
- **Cloudflare Tunnel hanya expose dashboard web**, bukan MQTT broker.
- Untuk ESP di lokasi jauh, disarankan broker MQTT cloud (seperti HiveMQ). Dashboard membaca data dari broker itu.

---

## 2) Prasyarat

### Di Raspberry Pi
- Raspberry Pi OS sudah update
- Aplikasi Anda sudah bisa jalan lokal (`npm start`)
- Port lokal app: `3010`

### Akun
- Akun **Cloudflare**
- Akun **Hostinger** (domain aktif)

### Domain
- Subdomain yang akan dipakai, contoh: `iot.domainanda.com`

---

## 3) Pastikan dashboard jalan lokal dulu

Di Raspberry Pi:

```bash
cd /home/pi/iot-counter
npm install --production
npm start
```

Tes dari Pi:

```bash
curl http://localhost:3010/api/session
```

Kalau belum jalan lokal, jangan lanjut tunnel dulu.

---

## 4) Hubungkan domain Hostinger ke Cloudflare

Karena pakai Cloudflare Tunnel + custom domain, zona domain harus dikelola Cloudflare.

1. Login Cloudflare -> **Add a Site**
2. Masukkan domain dari Hostinger (mis. `domainanda.com`)
3. Cloudflare memberi 2 nameserver (contoh: `xxxx.ns.cloudflare.com`)
4. Login Hostinger -> Domain -> DNS/Nameserver
5. Ganti nameserver ke nameserver Cloudflare
6. Tunggu propagasi (5 menit sampai 24 jam)

Cek:

```bash
nslookup domainanda.com
```

Harus mengarah ke nameserver Cloudflare.

---

## 5) Install cloudflared di Raspberry Pi

```bash
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb -o cloudflared.deb
sudo dpkg -i cloudflared.deb
cloudflared --version
```

> Jika Pi 32-bit, gunakan paket `armhf` sesuai arsitektur.

---

## 6) Login cloudflared ke akun Cloudflare

```bash
cloudflared tunnel login
```

Perintah ini akan:
- membuka URL otorisasi
- minta pilih zone/domain
- simpan sertifikat kredensial di Pi

---

## 7) Buat tunnel

```bash
cloudflared tunnel create iot-counter-tunnel
```

Simpan output penting:
- `Tunnel UUID`
- lokasi file credentials JSON

---

## 8) Buat file konfigurasi tunnel

Buat file:

```bash
sudo mkdir -p /etc/cloudflared
sudo nano /etc/cloudflared/config.yml
```

Isi contoh:

```yaml
tunnel: <TUNNEL-UUID>
credentials-file: /home/pi/.cloudflared/<TUNNEL-UUID>.json

ingress:
  - hostname: iot.domainanda.com
    service: http://localhost:3010
  - service: http_status:404
```

---

## 9) Buat DNS route di Cloudflare

```bash
cloudflared tunnel route dns iot-counter-tunnel iot.domainanda.com
```

Ini otomatis membuat CNAME ke `*.cfargotunnel.com`.

---

## 10) Jalankan tunnel sebagai service

Install service:

```bash
sudo cloudflared service install
sudo systemctl enable cloudflared
sudo systemctl start cloudflared
sudo systemctl status cloudflared
```

Cek log:

```bash
sudo journalctl -u cloudflared -f
```

---

## 11) Akses dashboard via domain

Buka:

```text
https://iot.domainanda.com
```

Jika sukses:
- login page muncul
- HTTPS aktif
- dashboard realtime tetap jalan

---

## 12) Konfigurasi backend `.env` (umum untuk production)

Contoh aman:

```env
PORT=3010
SESSION_SECRET=ISI_DENGAN_STRING_ACAK_PANJANG

# Jika broker lokal di Pi:
# MQTT_BROKER_URL=mqtt://localhost:1883

# Jika broker cloud (disarankan untuk ESP jauh):
MQTT_BROKER_URL=mqtts://xxxx.s1.eu.hivemq.cloud:8883
MQTT_USERNAME=USER_HIVEMQ
MQTT_PASSWORD=PASS_HIVEMQ

MQTT_TOPIC=iot/counter/increment
MQTT_COMMAND_TOPIC=iot/counter/command
MQTT_CLIENT_ID=iot-counter-server-prod

ADMIN_USERNAME=admin
ADMIN_PASSWORD=GANTI_PASSWORD_ADMIN
```

Setelah ubah `.env`:

```bash
sudo systemctl restart iot-counter
```

---

## 13) ESP supaya data tetap masuk saat server di internet

### Skenario A (disarankan)
- ESP32 publish ke HiveMQ cloud
- Backend Pi subscribe ke HiveMQ cloud
- Dashboard dibuka via Cloudflare Tunnel

Ini paling stabil untuk ESP di lapangan jauh.

### Skenario B (tidak disarankan untuk publik)
- ESP langsung ke broker di Pi via internet publik
- butuh expose port MQTT + hardening tinggi
- risiko keamanan lebih besar

---

## 14) Hardening minimum (wajib)

1. Ganti default password admin dashboard
2. Jangan commit file `.env`
3. Pakai MQTTS untuk koneksi internet
4. Jangan expose port `3010` langsung ke internet
5. Aktifkan Cloudflare Access (opsional tapi sangat direkomendasikan)

---

## 15) Opsional: Tambah Cloudflare Access (login sebelum login)

Di Cloudflare Zero Trust:
1. Access -> Applications -> Add application
2. Pilih Self-hosted
3. Domain: `iot.domainanda.com`
4. Buat policy allow hanya email Anda/tim

Hasilnya: sebelum masuk halaman login dashboard, user harus lolos Access.

---

## 16) Troubleshooting cepat

### Domain tidak bisa dibuka
- Cek nameserver domain sudah Cloudflare
- Cek DNS record `iot.domainanda.com` ada
- Cek service cloudflared aktif

### Tunnel aktif tapi 502/404
- Cek `service: http://localhost:3010` di config.yml
- Pastikan app Node.js benar-benar jalan di port 3010

### Dashboard kebuka tapi data IoT tidak update
- Cek koneksi backend ke MQTT broker (`journalctl -u iot-counter -f`)
- Cek topic ESP dan backend sama
- Cek broker HiveMQ menerima publish

### ESP status MQTT timeout
- Untuk broker cloud pastikan:
  - host benar
  - port `8883`
  - username/password benar
  - TLS client dipakai di ESP (`WiFiClientSecure`)

---

## 17) Checklist selesai deploy

- [ ] Aplikasi lokal di Pi jalan (`http://localhost:3010`)
- [ ] Domain Hostinger sudah pindah nameserver ke Cloudflare
- [ ] Tunnel dibuat dan service `cloudflared` aktif
- [ ] `https://iot.domainanda.com` bisa dibuka dari internet
- [ ] Backend terhubung MQTT broker
- [ ] Data ESP tampil realtime di dashboard
- [ ] Password default sudah diganti

