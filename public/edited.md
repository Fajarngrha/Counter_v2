# Peta Lengkap Kustomisasi Dashboard

Panduan ini memetakan **file, baris, class CSS, dan properti** untuk menyesuaikan **label**, **font-size**, **jarak antar kotak**, dan **ukuran kotak** pada halaman Dashboard IoT Production Counter.

---

## Aturan Umum

| Yang ingin diubah | File utama | File tambahan |
|-------------------|------------|---------------|
| Teks label statis (ditulis manual) | `public/dashboard.html` | — |
| Teks label dinamis (dari data server) | `public/js/dashboard.js` | `services/counterService.js` |
| Font-size, warna, jarak, ukuran kotak | `public/css/style.css` | — |

**Setelah edit:** simpan file → refresh browser (`Ctrl + Shift + R`).

**Struktur alur data:**
```
dashboard.html  →  struktur & label statis
dashboard.js    →  teks/angka yang berubah otomatis
style.css       →  tampilan visual (font, jarak, ukuran)
counterService.js → label dari backend (opsional)
```

---

## 1. Label / Nama Teks

### 1.1 Header Atas

| Tampilan di UI | File | Lokasi |
|----------------|------|--------|
| "IoT Production Counter" | `dashboard.html` | baris ~16 (`<span>` di `.dashboard-title`) |
| Tombol "Riwayat" | `dashboard.html` | baris ~26 |
| Tombol "Keluar" | `dashboard.html` | baris ~34 |
| Judul tab browser | `dashboard.html` | baris ~6 (`<title>`) |

---

### 1.2 Baris Atas — 3 Kotak Kecil (`.status-row`)

| Tampilan di UI | File | Lokasi |
|----------------|------|--------|
| "Waktu Aktual" | `dashboard.html` | baris ~46 (`.card-label`) |
| Angka jam (10.38.34) | `dashboard.js` | `render()` → `el('timeNow')` |
| Tanggal (Jumat, 19 Juni 2026) | `dashboard.js` | `render()` → `el('dateNow')` |
| "Status Shift" | `dashboard.html` | baris ~57 |
| "Shift 1 Sedang Berjalan" | `dashboard.js` | `render()` → `el('shiftLabel')` |
| "07:00 – 16:00 WIB" | `dashboard.js` | `render()` → `el('shiftRange')` |
| Teks label shift (backend) | `counterService.js` | `getDashboardData()` → `shift.label` |
| "Status IoT" | `dashboard.html` | baris ~70 |
| "Online" / "Offline" | `dashboard.js` | `render()` → `el('iotStatus')` |
| Teks sensor / sinyal IoT | `dashboard.js` | `render()` → `el('iotLastSeen')` |

---

### 1.3 Kolom Kiri — Total Barang & Total Hari Ini

| Tampilan di UI | File | Lokasi |
|----------------|------|--------|
| "TOTAL BARANG — Shift 1" | `dashboard.js` | `render()` → `el('counterTitle')` |
| Template judul counter | `dashboard.js` | `` `TOTAL BARANG — ${data.shift?.name}` `` |
| Angka besar counter (0) | `dashboard.js` | `render()` → `counterValueEl` |
| "pcs" | `dashboard.html` | baris ~83 (`.counter-unit`) |
| Tombol "Reset" | `dashboard.html` | baris ~90 |
| "Target Saat Ini" | `dashboard.html` | baris ~93 (`.counter-target-label`) |
| Angka target (13.110) | `dashboard.js` | `updateTargetTickerDisplay()` → `counterTargetValueEl` |
| "Total Hari Ini (Semua Shift)" | `dashboard.html` | baris ~102 |
| Angka total hari ini | `dashboard.js` | `render()` → `el('dailyTotal')` |
| "Termasuk shift yang sedang berjalan." | `dashboard.html` | baris ~104 |

---

### 1.4 Kolom Kanan — Target Produksi & Shift Berikutnya

| Tampilan di UI | File | Lokasi |
|----------------|------|--------|
| "Target Produksi" | `dashboard.html` | baris ~118 (`<h3>`) |
| "Edit Target" | `dashboard.html` | baris ~121 |
| "✓ Simpan" / "✕ Batal" | `dashboard.html` | baris ~124–125 |
| Form hint edit target | `dashboard.html` | baris ~131–144 |
| "Target / Jam" | `dashboard.html` | baris ~149 |
| "Target / Shift (9h)" | `dashboard.html` | baris ~153 |
| "Laju Saat Ini" | `dashboard.html` | baris ~157 |
| "Proyeksi Akhir Shift" | `dashboard.html` | baris ~161 |
| Angka-angka di grid target | `dashboard.js` | `render()` → `targetPerHour`, `targetPerShift`, dll. |
| "Progress terhadap target shift" | `dashboard.html` | baris ~168 |
| Persen progress (0%) | `dashboard.js` | `render()` → `el('progressPercent')` |
| Skala "0" dan "32.400 pcs" | `dashboard.html` + `dashboard.js` | baris ~175–176, `progressMax` |
| Kotak alert (abu/hijau/merah) | `dashboard.html` | baris ~180–183 (`#alertBox`) |
| Teks alert dinamis | `dashboard.js` | `renderDifferenceIndicator()` |
| "Laju target:" (teks statis) | `dashboard.html` | baris ~185 |
| Nilai "5 pcs / 5 detik" | `dashboard.js` | `render()` → `el('rateLabel')` |
| Label rate (backend) | `counterService.js` | `getDashboardData()` → `target.rateLabel` |
| "Shift Berikutnya" | `dashboard.html` | baris ~189 |
| "Dimulai pukul" | `dashboard.html` | baris ~191 |
| Nama & waktu shift berikutnya | `dashboard.js` | `render()` → `nextShiftName`, `nextShiftStart` |

---

## 2. Font-Size & Warna Teks

Semua di file **`public/css/style.css`**.

### 2.1 Layout & Header

| Area UI | Class CSS | Properti utama | Nilai saat ini |
|---------|-----------|----------------|----------------|
| Judul halaman | `.dashboard-title` | `font-size` | `1.35rem` |
| Ikon judul | `.dashboard-title svg` | `width`, `height` | `24px` |
| Tombol header | `.btn-sm` | `font-size`, `padding` | `0.8rem`, `0.45rem 0.85rem` |

### 2.2 Kotak Umum

| Area UI | Class CSS | Properti utama | Nilai saat ini |
|---------|-----------|----------------|----------------|
| Label kotak (WAKTU AKTUAL, dll.) | `.card-label` | `font-size` | `0.8rem` |
| Label kotak | `.card-label` | `margin-bottom` | `0.75rem` |
| Angka status atas | `.status-value` | `font-size` | `1.75rem` |
| Subteks bawah label | `.status-sub` | `font-size` | `0.85rem` |
| Status Online | `.status-online` | `color` | `var(--success)` hijau |
| Status Offline | `.status-offline` | `color` | `var(--danger)` merah |

### 2.3 Kotak Total Barang (Counter)

| Area UI | Class CSS | Properti utama | Nilai saat ini |
|---------|-----------|----------------|----------------|
| Label "TOTAL BARANG" | `.counter-label` | `font-size` | `0.85rem` |
| **Angka besar biru (0)** | `.counter-value` | `font-size` | **`8rem`** |
| Angka counter pulse | `.counter-value.pulse` | `transform` | `scale(1.05)` |
| Teks "pcs" | `.counter-unit` | `font-size` | `0.9rem` |
| Label "Target Saat Ini" | `.counter-target-label` | `font-size` | `0.65rem` |
| **Angka target hijau** | `.counter-target-value` | `font-size` | `0.85rem` |
| Target capai maksimum | `.counter-target-value--max` | `color` | `var(--accent)` biru |
| Tombol Reset | `.btn-danger`, `.counter-reset-btn` | `font-size` | via `.btn-sm` |

### 2.4 Kotak Total Hari Ini

| Area UI | Class CSS | Properti utama | Nilai saat ini |
|---------|-----------|----------------|----------------|
| Angka total hari ini | `.daily-card .bottom-value` | `font-size` | `2.5rem` |
| Alternatif umum | `.bottom-value` | `font-size`, `color` | `2rem`, `var(--accent)` |

### 2.5 Kotak Target Produksi

| Area UI | Class CSS | Properti utama | Nilai saat ini |
|---------|-----------|----------------|----------------|
| Judul "Target Produksi" | `.target-header h3` | `font-size` | `1rem` |
| Label kecil grid | `.target-item .label` | `font-size` | `0.75rem` |
| Angka grid target | `.target-item .value` | `font-size` | `1.25rem` |
| Angka hijau (target) | `.target-item .value.green` | `color` | `var(--success)` |
| Angka merah (proyeksi rendah) | `.target-item .value.red` | `color` | `var(--danger)` |
| Unit "pcs", "pcs/jam" | `.target-item .value .unit` | `font-size` | `0.9rem` |
| Header progress bar | `.progress-header` | `font-size` | lihat baris ~588 |
| Footer "Laju target" | `.target-footer` | `font-size` | `0.75rem` |
| Teks alert box | `.alert-box` | `font-size` | `0.85rem` |

### 2.6 Responsive (Layar Kecil)

| Breakpoint | Class | Perubahan |
|------------|-------|-----------|
| `max-width: 900px` | `.counter-value` | `font-size: 5rem` |
| `max-width: 900px` | `.dashboard` | `padding: 1rem` |
| `max-width: 500px` | `.counter-value` | `font-size: 4rem` |
| `max-width: 500px` | `.target-grid` | 1 kolom |

Lokasi: `style.css` bagian `/* ========== RESPONSIVE ========== */` (baris ~1010).

---

## 3. Jarak Antar Kotak

| Area UI | Class CSS | Properti | Nilai saat ini | Keterangan |
|---------|-----------|----------|----------------|------------|
| Padding halaman | `.dashboard` | `padding` | `1.5rem 2rem 2rem` | Ruang tepi layar |
| Jarak header → konten | `.dashboard-header` | `margin-bottom` | `1.5rem` | |
| Jarak tombol Riwayat/Keluar | `.header-actions` | `gap` | `0.75rem` | |
| **Jarak 3 kotak atas** | `.status-row` | `gap` | `1rem` | Antar Waktu/Shift/IoT |
| Jarak baris atas → bawah | `.status-row` | `margin-bottom` | `1rem` | |
| **Jarak kolom kiri ↔ kanan** | `.main-row` | `gap` | `1rem` | |
| **Jarak Total Barang ↔ Total Hari Ini** | `.main-col-left` | `gap` | `1rem` | Vertikal |
| **Jarak Target Produksi ↔ Shift Berikutnya** | `.main-col-right` | `gap` | `1rem` | Vertikal |
| Jarak 4 kotak kecil di Target | `.target-grid` | `gap` | `1rem` | |
| Jarak Reset ↔ Target Saat Ini | `.counter-footer` | `gap` | `1rem` | Horizontal |
| Jarak atas footer counter | `.counter-footer` | `margin-top` | `1.25rem` | |
| Jarak progress section | `.progress-section` | `margin-bottom` | lihat CSS |

### Contoh: kotak lebih renggang
```css
.status-row,
.main-row,
.main-col-left,
.main-col-right {
  gap: 1.5rem; /* default 1rem */
}
```

### Contoh: halaman lebih rapat ke tepi
```css
.dashboard {
  padding: 1rem;
}
```

---

## 4. Ukuran Kotak

| Area UI | Class CSS | Properti | Nilai saat ini | Keterangan |
|---------|-----------|----------|----------------|------------|
| Lebar maks halaman | `.dashboard` | `max-width` | `1400px` | |
| Semua kotak (card) | `.card` | `padding` | `1.25rem 1.5rem` | Ruang dalam |
| Semua kotak | `.card` | `border-radius` | `var(--radius)` | Sudut melengkung |
| Proporsi kiri:kanan | `.main-row` | `grid-template-columns` | `1fr 1.2fr` | Kanan sedikit lebih lebar |
| 3 kotak atas | `.status-row` | `grid-template-columns` | `repeat(3, 1fr)` | Sama lebar |
| **Tinggi minimum counter** | `.counter-card` | `min-height` | `320px` | |
| Baris Reset + Target | `.counter-footer` | `max-width` | `420px` | |
| Kotak Target Saat Ini | `.counter-target-box` | `min-width` | `125px` | |
| Kotak Target Saat Ini | `.counter-target-box` | `padding` | `0.75rem 1rem` | |
| Grid 4 angka target | `.target-grid` | `grid-template-columns` | `repeat(2, 1fr)` | 2×2 |
| Item di dalam grid | `.target-item` | `padding` | `0.85rem 1rem` | |
| Tinggi progress bar | `.progress-bar` | `height` | lihat CSS ~596 |
| Target card fleksibel | `.target-card` | `flex` | `1` | Mengisi ruang vertikal |

### Contoh: perbesar kotak counter
```css
.counter-card {
  min-height: 380px;
  padding: 2rem; /* tambah jika perlu */
}
```

### Contoh: perlebar kolom kiri
```css
.main-row {
  grid-template-columns: 1.3fr 1fr;
}
```

### Contoh: perkecil kotak Target Saat Ini
```css
.counter-target-box {
  min-width: 100px;
  padding: 0.5rem 0.75rem;
}
```

---

## 5. Diagram Layout Dashboard

```
┌─────────────────────────────────────────────────────────────┐
│  HEADER (.dashboard-header)                                 │
│  IoT Production Counter          [Riwayat] [Keluar]         │
├─────────────────────────────────────────────────────────────┤
│  STATUS ROW (.status-row) — gap: 1rem                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                 │
│  │Waktu     │  │Status    │  │Status IoT│                 │
│  │Aktual    │  │Shift     │  │          │                 │
│  └──────────┘  └──────────┘  └──────────┘                 │
├─────────────────────────────────────────────────────────────┤
│  MAIN ROW (.main-row) — 1fr : 1.2fr                         │
│  ┌─────────────────┐  ┌──────────────────────────────┐     │
│  │ MAIN COL LEFT   │  │ MAIN COL RIGHT               │     │
│  │ (.main-col-left)│  │ (.main-col-right)            │     │
│  │                 │  │                              │     │
│  │ COUNTER CARD    │  │ TARGET CARD                  │     │
│  │ (.counter-card) │  │ (.target-card)               │     │
│  │  - counter-value│  │  - target-grid               │     │
│  │  - counter-footer│ │  - progress-section          │     │
│  │                 │  │  - alert-box                 │     │
│  │ DAILY CARD      │  │ NEXT SHIFT CARD              │     │
│  └─────────────────┘  └──────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. Referensi Cepat per File

### `public/dashboard.html`
- Struktur HTML semua kotak
- Label teks statis
- ID elemen untuk diisi JavaScript

### `public/js/dashboard.js`
- `render()` — update semua angka & label dinamis
- `updateTargetTickerDisplay()` — angka Target Saat Ini
- `renderDifferenceIndicator()` — teks kotak alert
- `initTargetConfig()` — form edit target

### `public/css/style.css`
- Bagian `/* ========== DASHBOARD LAYOUT ========== */` (baris ~211)
- Class `.counter-*` — kotak Total Barang & Target Saat Ini
- Class `.target-*` — kotak Target Produksi
- Bagian `/* ========== RESPONSIVE ========== */` (baris ~1010)

### `services/counterService.js`
- `getDashboardData()` — data shift, target, analytics dari server

---

## 7. Contoh Perubahan Umum

| Keinginan | File | Yang diubah |
|-----------|------|-------------|
| Ganti "Target Saat Ini" → "Target Running" | `dashboard.html` | baris ~93 |
| Perbesar angka counter biru | `style.css` | `.counter-value` → `font-size` |
| Perkecil angka target hijau | `style.css` | `.counter-target-value` → `font-size` |
| Kotak lebih renggang | `style.css` | `gap` di `.status-row`, `.main-row`, `.main-col-*` |
| Kolom kiri lebih lebar | `style.css` | `.main-row` → `grid-template-columns` |
| Hapus kotak alert | `dashboard.html` + `dashboard.js` | `#alertBox` + `renderDifferenceIndicator()` |
| Hapus keterangan rate di target box | `dashboard.html` + `dashboard.js` | `#counterTargetRate`, `#counterTargetMax` |
| Ubah "TOTAL BARANG" | `dashboard.js` | template di `counterTitle` |
| Ubah label shift otomatis | `counterService.js` | `shift.label` |

---

## 8. Variabel Warna Global

Warna tema didefinisikan di bagian atas `style.css` (`:root`):

| Variabel | Penggunaan umum |
|----------|-----------------|
| `--accent` | Angka counter biru, highlight |
| `--success` | Target hijau, Online |
| `--danger` | Offline, Reset, alert merah |
| `--warning` | Progress kuning |
| `--text-primary` | Teks utama |
| `--text-secondary` | Teks sekunder |
| `--text-muted` | Label kecil |
| `--bg-card` | Background kotak |
| `--border` | Garis tepi kotak |

Ubah variabel ini untuk mengganti warna di seluruh dashboard sekaligus.

---

*Terakhir diperbarui sesuai struktur project Counter_v2.*
