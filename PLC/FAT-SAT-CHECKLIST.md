# FAT-SAT CHECKLIST PLC V2

Checklist ini dipakai saat test di workshop (FAT) dan saat commissioning di site (SAT).

## 1) Informasi Proyek

- Project: ________________________
- Site/Plant: ________________________
- Line: ________________________
- Machine ID: ________________________
- Tanggal FAT: ________________________
- Tanggal SAT: ________________________
- PIC Automation: ________________________
- PIC IT/Server: ________________________

---

## 2) FAT (Factory Acceptance Test)

### A. Pemeriksaan Wiring dan Panel

- [ ] Wiring PLC kecil sesuai drawing terbaru.
- [ ] Common ground sudah benar.
- [ ] Isolator signal terpasang (jika dibutuhkan).
- [ ] Label terminal lengkap (`RUN_FB`, `ALM_FB`, `CNT_PLS`, dll).
- [ ] Tegangan power supply stabil sesuai spesifikasi.

### B. Pemeriksaan Fungsional PLC Collector

- [ ] PLC collector boot normal tanpa fault.
- [ ] Pembacaan `RUN/STOP/ALARM` sesuai simulasi input.
- [ ] Counter pulse terbaca akurat (uji 100 pulse).
- [ ] Event reset counter terdeteksi benar.
- [ ] Tidak ada write command ke PLC utama (read-only terverifikasi).

### C. Pemeriksaan MQTT

- [ ] Collector terkoneksi ke broker.
- [ ] Topic publish sesuai standar naming V2.
- [ ] Payload JSON valid (tidak corrupt).
- [ ] QoS sesuai desain.
- [ ] Reconnect otomatis berhasil saat broker diputus sementara.

### D. Pemeriksaan Backend dan Dashboard

- [ ] Backend menerima data telemetry.
- [ ] Nilai counter dashboard sama dengan collector.
- [ ] Status machine (`RUN/STOP/ALARM`) tampil benar.
- [ ] Timestamp data benar (timezone konsisten).
- [ ] Histori tersimpan dan bisa ditarik ulang.

### E. FAT Result

- [ ] FAT Pass
- [ ] FAT Pass with Punch List
- [ ] FAT Fail

Catatan FAT:  
________________________________________________________  
________________________________________________________

---

## 3) SAT (Site Acceptance Test)

### A. Pemeriksaan Instalasi Site

- [ ] Panel dan grounding sesuai standar site.
- [ ] Noise dari motor/relay tidak mengganggu sinyal.
- [ ] Jaringan site (LAN/WiFi) stabil.
- [ ] Firewall/ACL broker sudah dibuka sesuai kebutuhan.

### B. Uji Operasional Nyata

- [ ] Data realtime muncul saat mesin produksi berjalan.
- [ ] Counter sinkron minimal 30 menit operasi.
- [ ] Alarm aktual mesin muncul di dashboard.
- [ ] Pergantian shift terekam benar.
- [ ] Restart PLC collector tidak mengganggu PLC utama.

### C. Uji Gangguan (Failover Test)

- [ ] Putus internet: mesin tetap normal.
- [ ] Setelah internet kembali: collector auto reconnect.
- [ ] Putus broker: collector retry tanpa hang.
- [ ] Power cycle collector: sistem recover otomatis.
- [ ] Tidak ada data loncat ekstrim setelah reconnect.

### D. Uji Integritas Data

- [ ] Tidak ada duplikasi event reset.
- [ ] Delta counter tidak negatif tanpa event reset.
- [ ] Tidak ada gap timestamp signifikan (> target SLA).
- [ ] Data harian sesuai laporan produksi manual sampling.

### E. SAT Result

- [ ] SAT Pass
- [ ] SAT Pass with Punch List
- [ ] SAT Fail

Catatan SAT:  
________________________________________________________  
________________________________________________________

---

## 4) Punch List Template

| No | Temuan | Severity | PIC | Target Tanggal | Status |
|---|---|---|---|---|---|
| 1 |  | High/Med/Low |  |  | Open/Close |
| 2 |  | High/Med/Low |  |  | Open/Close |
| 3 |  | High/Med/Low |  |  | Open/Close |

---

## 5) Dokumen Serah Terima

- [ ] Backup program PLC collector.
- [ ] Backup konfigurasi MQTT/broker.
- [ ] As-built wiring terbaru.
- [ ] Daftar topic final dan payload schema.
- [ ] SOP troubleshooting level operator.
- [ ] Kontak support dan jalur eskalasi.

---

## 6) Sign-Off

Automation Engineer: ____________________  Tanggal: __________  
IT/Server Engineer: _____________________  Tanggal: __________  
Production Representative: ______________  Tanggal: __________  
Project Manager: ________________________  Tanggal: __________
