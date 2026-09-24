# Panduan Deploy Update ke Server (Data Web Tetap Aman)

Panduan ini untuk **memasang pengembangan terbaru** ke server produksi **tanpa menghapus data web yang sudah terbentuk**.

Target server yang sudah jalan:
- Folder aplikasi: `/opt/iot-counter/Counter_v2`
- Service: `iot-counter`
- Domain: `https://iotsrv.fcc-id.id`

---

## 1) Yang boleh diganti vs yang tidak boleh hilang

### Boleh diganti (kode aplikasi)

Semua file program: `server.js`, `public/`, `services/`, `db/database.js`, `package.json`, dan sejenisnya.

### Tidak boleh ditimpa / dihapus (data runtime)

| File | Isi yang sudah terbentuk di web |
|---|---|
| `data/db.json` | Device, nama mesin, counter, target, riwayat shift, status IoT |
| `data/shift-config.json` | Pengaturan jam shift |
| `data/production-series.json` | Titik grafik produksi per mesin |
| `.env` | MQTT, login admin, session, port |

`public/data/production-series.json` hanya **cadangan dummy** untuk tampilan lokal. File ini boleh ikut ter-update dari Git. Data grafik yang dipakai web produksi ada di `data/production-series.json`.

### Jangan dijalankan di server produksi

```bash
npm run seed:chart
npm run seed:demo
npm run simulate
```

Perintah itu mengisi data palsu dan **bisa menimpa** riwayat/grafik yang sudah ada.

---

## 2) Cara tercepat (disarankan): `deploy-safe.sh`

Skrip ini:

1. Backup data runtime
2. Stop service
3. Ambil kode terbaru dari Git
4. Kembalikan data runtime
5. Install dependency
6. Start service lagi

SSH ke server, lalu:

```bash
cd /opt/iot-counter/Counter_v2
chmod +x deploy-safe.sh
./deploy-safe.sh main
```

Jika branch berbeda:

```bash
./deploy-safe.sh nama-branch
```

Backup otomatis tersimpan di:

```text
~/counter-backup/YYYY-MM-DD_HHMMSS/
```

Isi backup yang dijaga:
- `db.json`
- `shift-config.json`
- `production-series.json`

---

## 3) Cara manual (jika skrip tidak dipakai)

Jalankan **berurutan**. Jangan `git checkout -- data/` dan jangan `git clean -fd` di folder `data/`.

```bash
cd /opt/iot-counter/Counter_v2

# 1) Backup dulu
STAMP=$(date +%F_%H%M%S)
BACKUP=~/counter-backup/$STAMP
mkdir -p "$BACKUP"
cp -a data/db.json data/shift-config.json data/production-series.json "$BACKUP/" 2>/dev/null || true
cp -a .env "$BACKUP/" 2>/dev/null || true
echo "Backup: $BACKUP"

# 2) Stop service
sudo systemctl stop iot-counter

# 3) Update kode
git fetch origin
git pull --rebase origin main

# 4) Kembalikan data produksi (wajib)
cp -a "$BACKUP/db.json" data/db.json
cp -a "$BACKUP/shift-config.json" data/shift-config.json
[ -f "$BACKUP/production-series.json" ] && cp -a "$BACKUP/production-series.json" data/production-series.json
[ -f "$BACKUP/.env" ] && cp -a "$BACKUP/.env" .env

# 5) Jangan sampai file data rusak oleh conflict Git
rg "<<<<<<<|=======|>>>>>>>" data/db.json data/shift-config.json data/production-series.json || true

# 6) Dependency
npm ci --omit=dev || npm install --omit=dev

# 7) Hak tulis folder data
sudo chown -R iot-svr:www-data data
sudo chmod -R 775 data
sudo chmod g+s data

# 8) Start
sudo systemctl start iot-counter
sudo systemctl status iot-counter --no-pager
```

---

## 4) Cek setelah deploy

```bash
sudo systemctl status iot-counter --no-pager
sudo journalctl -u iot-counter -n 80 --no-pager
curl -I http://127.0.0.1:3010/api/session
```

Lalu di browser (hard-refresh **Ctrl+F5**):

- [ ] Login masih bisa
- [ ] Daftar mesin tidak berkurang
- [ ] Counter / target / riwayat shift masih sama
- [ ] Halaman History masih menampilkan pencapaian lama
- [ ] Grafik per mesin masih ada (klik kartu device)
- [ ] ESP/MQTT tetap masuk (status IoT Online setelah ada pulse)

Kalau tampilan aneh karena cache JS lama, hard-refresh sudah cukup. File dashboard sudah memakai cache-bust (`dashboard.js?v=...`).

---

## 5) Jika ada yang salah: rollback data

Service boleh tetap pakai kode baru, tapi data dikembalikan dari backup:

```bash
cd /opt/iot-counter/Counter_v2
sudo systemctl stop iot-counter
ls -lt ~/counter-backup | head
# pilih folder backup terakhir, contoh:
BACKUP=~/counter-backup/2026-09-24_104700
cp -a "$BACKUP/db.json" data/db.json
cp -a "$BACKUP/shift-config.json" data/shift-config.json
cp -a "$BACKUP/production-series.json" data/production-series.json
sudo systemctl start iot-counter
```

Jika ingin rollback **kode** juga:

```bash
cd /opt/iot-counter/Counter_v2
sudo systemctl stop iot-counter
git log --oneline -10
git checkout <commit-lama-yang-stabil>
# lalu restore data lagi dari backup
sudo systemctl start iot-counter
```

---

## 6) Permission (supaya tidak 502 setelah update)

Kalau log muncul `EACCES` pada `data/db.json`:

```bash
cd /opt/iot-counter/Counter_v2
sudo chown -R iot-svr:iot-svr /opt/iot-counter/Counter_v2
sudo chown -R iot-svr:www-data /opt/iot-counter/Counter_v2/data
sudo chmod -R 775 /opt/iot-counter/Counter_v2/data
sudo chmod g+s /opt/iot-counter/Counter_v2/data
sudo systemctl restart iot-counter
```

SOP 502 lengkap: `502.MD`.

---

## 7) Yang berubah di pengembangan terbaru (setelah deploy)

Fitur kode baru yang ikut naik, **tanpa perlu reset data**:

- Grafik halaman utama **per device** (klik kartu mesin)
- Grafik **kumulatif +1** setiap data sensor masuk
- Halaman History per mesin
- Menu rentang grafik: 5 menit / 30 menit / 1 jam / 8 jam

Data lama di `db.json` tetap dipakai. Grafik memakai `data/production-series.json` yang sudah ada; titik baru akan menempel setelah sensor hidup.

---

## 8) Ringkas aturan aman

1. **Backup dulu**, baru `git pull`.
2. Setelah pull, **restore** `data/db.json`, `data/shift-config.json`, `data/production-series.json`, dan `.env`.
3. Jangan jalankan `seed:chart` / `seed:demo` di produksi.
4. Jangan hapus folder `data/`.
5. Hard-refresh browser setelah deploy.
