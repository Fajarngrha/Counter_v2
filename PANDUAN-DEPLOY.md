. Di laptop (sebelum sentuh server)
Commit hanya kode, jangan data/.

cd e:\Downloads\CMMS\Counter\Counter_v2
git add .gitignore deploy-safe.sh db/database.js public/dashboard.html public/js/dashboard.js services/counterService.js services/mqttService.js scripts/resync-device-offset.js
git status
Pastikan tidak ada data/db.json, data/shift-config.json, data/production-series.json.

git commit -m "Perbaiki jam grafik, rentang waktu, dan counter setelah restore"
git push origin main
Jangan git add -A dan jangan npm run seed:chart.

B. Di server (backup dulu)
cd /opt/iot-counter/Counter_v2
STAMP=$(date +%F_%H%M%S)
mkdir -p ~/counter-backup/$STAMP
cp -a data/db.json data/shift-config.json data/production-series.json ~/counter-backup/$STAMP/
echo "Backup: $STAMP"
# cek masih mesin produksi
node -e "const x=require('./data/db.json'); console.log(Object.keys(x.devices||{}).join(', '))"
Harus terlihat device-zndc-..., bukan device-test / fajar.

C. Ambil kode baru, lalu kembalikan data produksi
sudo systemctl stop iot-counter
git stash push -u -m "sebelum-pull-$STAMP" -- data/db.json data/shift-config.json data/production-series.json
git pull --rebase origin main
# WAJIB: kembalikan data produksi (jangan data dari Git)
cp -a ~/counter-backup/$STAMP/db.json data/db.json
cp -a ~/counter-backup/$STAMP/shift-config.json data/shift-config.json
cp -a ~/counter-backup/$STAMP/production-series.json data/production-series.json
node -e "const x=require('./data/db.json'); console.log(Object.keys(x.devices||{}).join(', '))"
Kalau yang muncul device-test, stop. Copy lagi dari ~/counter-backup/$STAMP. Jangan git checkout -- data/ / git restore data/.

D. Permission + start
sudo chown -R iot-svr:www-data /opt/iot-counter/Counter_v2/data
sudo chmod -R 775 /opt/iot-counter/Counter_v2/data
sudo chmod g+s /opt/iot-counter/Counter_v2/data
sudo systemctl start iot-counter
sleep 3
sudo systemctl status iot-counter --no-pager
curl -I http://127.0.0.1:3010/api/session
Kalau EACCES di log:

sudo journalctl -u iot-counter -n 40 --no-pager
Ulangi chown/chmod, lalu sudo systemctl restart iot-counter.

E. Cek web
Hard-refresh (Ctrl+F5):

mesin tetap ZNDEC
counter tidak reset ke data laptop
grafik 5 menit / 8 jam ujung kanannya = jam sekarang
Jangan di server: git add data/, git commit, npm run seed:chart, npm run seed:demo.

Kalau pull gagal (unstaged changes), stash file yang disebut git status, lalu git pull --rebase origin main, lalu tetap cp dari ~/counter-backup/$STAMP.