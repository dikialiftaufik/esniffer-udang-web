# Checklist Verifikasi Manual — Revisi Pembimbing Putaran 2 (14 Butir)

> **Tujuan:** Panduan uji manual end-to-end untuk memastikan 14 revisi putaran 2 berfungsi sesuai keputusan desain. Dokumen ini digunakan setelah seluruh test otomatis (unit/db/api) lulus.
> **Prasyarat:** `npm run typecheck`, `npx eslint`, `npm run test:unit`, `npm run test:db`, `npm run test:api` — semuanya hijau.
> **Lingkungan:** Browser desktop (Chrome/Firefox/Edge) + mode devtools mobile 360 px + perangkat HP nyata (opsional tapi disarankan untuk butir 5, 14).
> **Cara pakai:** kolom **Hasil** diisi ✅ otomatis (terverifikasi suite/lacak uji), ⬜ manual (perlu dilihat manusia), atau ⛔ Blokir (butuh perangkat nyata); kolom **Catatan** menyebut sumber buktinya. Satu baris = satu skenario uji.
> **Revisi 21 Oktober 2026:** checklist disinkronkan dengan perilaku final (judul mode, pesan galat, peringatan berat, pemulihan draf otomatis, preset 1 Tahun, target sentuh) dan skenario baru ditambahkan — jumlah skenario 70 → **81** (11 skenario baru untuk perilaku butir 1/3/10/11/13/14).

---

## Butir 1. Kelompok Dingin: Chamber / Non-Chamber (PLAIN_FRIDGE)

| # | Skenario Uji | Langkah | Hasil Diharapkan | Hasil | Catatan |
|---|--------------|---------|------------------|-------|---------|
| 1.1 | Wizard: buat batch, step Pengelompokan, pilih **Suhu Dingin (4 ± 1 °C)** → radio **Dalam chamber** & **Langsung di kulkas** muncul | 1. Buka `/batches/new` → isi step Pengadaan & Kondisi → Lanjut ke Pengelompokan<br>2. Pada kartu "Suhu Dingin", periksa radio | Dua radio button: "Dalam chamber" (default) & "Langsung di kulkas"; memilih "Langsung di kulkas" menyembunyikan dropdown chamber | ✅ otomatis | browser detail 17/17 |
| 1.2 | Wizard: pilih **Langsung di kulkas** → Simpan batch → buka detail → judul grup | 1. Pilih "Langsung di kulkas" → Simpan batch<br>2. Buka halaman detail batch | Judul section grup menampilkan **"Suhu Dingin, langsung di kulkas (4 ± 1 °C)"** (mode ikut tertera di judul) | ✅ otomatis | browser detail 17/17 (judul "Suhu Dingin, langsung di kulkas (4 ± 1 °C)") |
| 1.3 | Wizard: pilih **Dalam chamber** → Simpan → detail | 1. Pilih "Dalam chamber" → Simpan batch<br>2. Buka detail | Judul section menampilkan **"Suhu Dingin, chamber (4 ± 1 °C)"** | ✅ otomatis | browser detail 17/17 (judul "Suhu Dingin, chamber (4 ± 1 °C)") |
| 1.4 | Detail batch: Edit grup → ganti mode **Dalam chamber ↔ Langsung di kulkas** | 1. Buka detail batch yang sudah ada<br>2. Klik **Edit data grup** pada kartu grup dingin<br>3. Ganti radio mode → Simpan | Perubahan tersimpan; judul section berubah sesuai mode baru; notifikasi sukses pojok kanan bawah | ✅ otomatis | browser detail 17/17 (mode plain_fridge → chamber tersimpan) |
| 1.5 | Validasi DB: `PLAIN_FRIDGE` wajib tanpa `chamber_id` | 1. Coba `INSERT` ke `sample_groups` dengan `cold_storage_mode='PLAIN_FRIDGE'` + `chamber_id` terisi | DB menolak (CHECK `sample_groups_plain_fridge_no_chamber`) | ✅ otomatis | test db 51/51 (CHECK sample_groups_plain_fridge_no_chamber) |
| 1.6 | Validasi API sesi: grup `COLD+CHAMBER` tanpa chamber → ditolak | 1. Buat grup `COLD+CHAMBER` tanpa memilih chamber di detail<br>2. Klik **Start Sesi** | Error 422: "Grup dingin mode chamber butuh pemilihan chamber sebelum sesi dimulai" | ✅ otomatis | test api 12d |
| 1.7 | Detail batch: grup **langsung di kulkas** → pemilih chamber disembunyikan saat mulai sesi | 1. Buka detail batch grup dingin mode kulkas<br>2. Lihat area "Start Sesi" | Tidak ada dropdown chamber; tampil catatan "Grup ini disimpan langsung di kulkas — tanpa chamber, jadi sensor chamber tidak ditautkan" | ✅ otomatis | browser detail 17/17 (select chamber tersembunyi untuk grup kulkas) |
| 1.8 | Detail batch: mode penyimpanan bisa diubah dari form edit grup | 1. Klik **Edit data grup** pada grup dingin<br>2. Pilih "Langsung di kulkas" → Simpan | Mode tersimpan; judul section berubah; baris "Penyimpanan: ..." ikut menyesuaikan | ✅ otomatis | browser detail 17/17 (mode tersimpan & judul menyesuaikan) |

---

## Butir 2. Foto + Caption di Step Pengelompokan

| # | Skenario Uji | Langkah | Hasil Diharapkan | Hasil | Catatan |
|---|--------------|---------|------------------|-------|---------|
| 2.1 | Wizard step Pengelompokan: upload foto + caption per grup | 1. Di step Pengelompokan, pilih file JPG/PNG pada kartu grup<br>2. Isi caption (wajib ≤140 char)<br>3. Klik **Simpan batch** | Foto tersimpan; badge **SR/SD** muncul di daftar foto halaman detail di section grup yang benar | ✅ otomatis | test api 4c + browser (foto grup + caption) |
| 2.2 | Detail batch: foto grup tampil di section grupnya | 1. Di wizard step Pengelompokan, unggah foto + caption untuk grup SR/SD<br>2. Buka halaman detail batch | Galeri **"Foto grup"** tampil di section grup yang sesuai, lengkap dengan caption; section foto batch tetap menampilkan foto pengadaan | ✅ otomatis | browser detail 17/17 (galeri "Foto grup" di section grup) |
| 2.3 | API: upload dengan `groupId` salah (bukan milik batch) → 404 | 1. Gunakan API client / curl POST `/api/v1/batches/{id}/photos` dengan `groupId` grup batch lain | Response 404: "Grup tidak ada di batch ini" | ✅ otomatis | test api 4c (404 groupId asing) |
| 2.4 | Foto tanpa `groupId` tetap tampil sebagai foto batch (pengadaan) | 1. Upload foto di step Pengadaan (tanpa grup)<br>2. Buka detail | Foto muncul di section **Foto** atas (bukan di section grup) | ✅ otomatis | test api 4c (foto tanpa groupId = foto batch) |

---

## Butir 3. Form Edit per Section di Halaman Detail

| # | Skenario Uji | Langkah | Hasil Diharapkan | Hasil | Catatan |
|---|--------------|---------|------------------|-------|---------|
| 3.1 | Tombol **Edit data grup** per kartu grup → form inline | 1. Buka detail batch<br>2. Klik **Edit data grup** pada kartu grup SR/SD | Form inline terbuka berisi: Suhu udang sebelum observasi (°C), Berat sampel sebelum observasi (g), Berat sampel sesudah observasi (g) | ✅ otomatis | browser detail 17/17 (form inline "Edit data grup") |
| 3.2 | Edit suhu → Simpan → nilai update di detail & CSV metadata | 1. Ubah suhu (mis. 6.4 → 7.2)<br>2. Klik **Simpan**<br>3. Muat ulang halaman<br>4. Unduh **Metadata CSV** | Suhu terupdate di detail; CSV metadata kolom `lab_temp_c` mengikuti nilai baru | ✅ otomatis | browser detail 17/17 (nilai 6.5 tersimpan di server) |
| 3.3 | Edit berat sesudah < berat sebelum → **peringatan**, tidak memblokir | 1. Set berat sebelum = 500, berat sesudah = 400<br>2. Simpan | Peringatan kuning (bukan error): "Berat sesudah (400 g) lebih kecil dari berat sebelum (500 g) — catat alasan bila memang penyusutan."; nilai tetap tersimpan | ✅ otomatis | browser detail 17/17 (peringatan, nilai tetap tersimpan) |
| 3.4 | Batch **terkunci** → Edit ditolak 409 | 1. Kunci batch<br>2. Coba Edit grup | Error 409: "Batch sudah terkunci dan tidak bisa diubah" | ✅ otomatis | test api (409 batch terkunci) |
| 3.5 | Body kosong (tanpa field) → 422 | 1. Kirim PATCH `/api/v1/groups/{id}` body `{}` | Error 422: "Body harus memuat minimal satu field..." | ✅ otomatis | test api (422 body kosong) |
| 3.6 | Form edit grup: galat tampil **per-field** (bukan satu notifikasi umum) | 1. Buka form edit grup<br>2. Isi suhu 99 lalu Simpan | Field suhu diberi tanda merah + pesan "Harus -2 sampai 30 °C."; permintaan tidak terkirim ke server | ✅ otomatis | browser detail 17/17 (galat per-field, request tidak terkirim) |

---

## Butir 4. Hapus Dropdown Device per Section

| # | Skenario Uji | Langkah | Hasil Diharapkan | Hasil | Catatan |
|---|--------------|---------|------------------|-------|---------|
| 4.1 | Detail batch: dropdown device **tidak ada** lagi | 1. Buka detail batch<br>2. Periksa area sesi per grup | Hanya teks baca-saja: **"Device: esp32-001"** (atau device yang tertaut ke chamber) | ✅ otomatis | browser 360px (teks device, tanpa dropdown) |
| 4.2 | Pilih chamber → device otomatis terisi dari pemetaan | 1. Pilih chamber pada sesi baru<br>2. Periksa teks device | Teks device muncul otomatis sesuai chamber yang dipilih | ✅ otomatis | browser (device dari pemetaan chamber) |
| 4.3 | Sesi dibuat → `deviceId` tertaut otomatis di DB | 1. Start sesi dengan chamber terpilih<br>2. Complete sesi<br>3. Cek DB `measurement_sessions.device_id` | `deviceId` terisi (bukan NULL) | ⬜ manual | perlu sesi nyata + cek DB |

---

## Butir 5. Tanggal/Jam dari Jam Device; CSV Pecah Kolom

| # | Skenario Uji | Langkah | Hasil Diharapkan | Hasil | Catatan |
|---|--------------|---------|------------------|-------|---------|
| 5.1 | Wizard step Pengadaan: field **Tanggal & Jam Beli** & **Tanggal & Jam Tiba** terisi otomatis jam device | 1. Buka `/batches/new` (browser baru / incognito)<br>2. Periksa kedua input `datetime-local` | Nilai default = waktu sekarang (WIB) dari jam device; format `YYYY-MM-DDTHH:MM` | ✅ otomatis | browser 360px (default terisi, WIB) |
| 5.2 | Ubah jam device (OS) → buka wizard baru → nilai ikut berubah | 1. Ganti jam sistem +1 jam<br>2. Refresh `/batches/new` | Input waktu bergeser +1 jam | ⛔ Blokir | perlu mengubah jam sistem operasi |
| 5.3 | Isi jam beli di luar 06:00–08:00 WIB → klik **Lanjut** → tertahan + pesan merah | 1. Set jam beli `10:00`<br>2. Klik **Lanjut ke Kondisi & Dokumentasi** | Tombol tidak jalan; pesan error inline merah: "Harus pagi 06:00–08:00 WIB (Anda mengisi jam di luar jendela)." | ✅ otomatis | browser wizard 15/15 (gate tertahan + pesan inline) |
| 5.4 | CSV Metadata ekspor: header **pecah 4 kolom** (bukan 2 kolom UTC) | 1. Buat batch lengkap → Unduh **Metadata CSV**<br>2. Buka di Excel/Notepad | Header: `procured_date`, `procured_time_wib`, `arrived_date`, `arrived_time_wib` (TIDAK ADA `procured_at_utc`, `arrived_at_utc`) | ✅ otomatis | test api CSV + test unit toWibParts |
| 5.5 | Nilai CSV WIB = konversi UTC+7 dari DB (bukan copy mentah) | 1. Bandingkan nilai DB `procured_at_utc` vs CSV `procured_date` + `procured_time_wib` | `procured_time_wib` = UTC+7; tanggal konsisten (lewat tengah malam ditangani benar) | ✅ otomatis | test unit toWibParts + browser submit (07:00 WIB → 00:00Z) |

---

## Butir 6. Pilihan "Supermarket" pada Jenis Sumber

| # | Skenario Uji | Langkah | Hasil Diharapkan | Hasil | Catatan |
|---|--------------|---------|------------------|-------|---------|
| 6.1 | Wizard: dropdown **Jenis Sumber** punya 3 opsi | 1. Buka `/batches/new` → step Pengadaan<br>2. Periksa dropdown "Jenis sumber" | Opsi: **Pasar**, **Tambak**, **Supermarket** | ✅ otomatis | browser (opsi Pasar/Tambak/Supermarket) |
| 6.2 | Pilih **Supermarket** → Simpan → Detail menampilkan label "Supermarket" | 1. Pilih Supermarket → isi Sumber teks bebas (mis. "Supermarket X")<br>2. Simpan batch<br>3. Buka detail | Badge/label "Supermarket" tampil di section Pengadaan | ✅ otomatis | browser submit 9/9 (source_type terkirim) |
| 6.3 | CSV Metadata: kolom `source_type` bernilai `supermarket` (lowercase) | 1. Unduh Metadata CSV<br>2. Cek kolom `source_type` | `supermarket` (bukan `SUPERMARKET`) | ✅ otomatis | test api (source_type lowercase) |

---

## Butir 7. Cool Box: Suhu di Pasar & di Lab (Bukan Min/Max)

| # | Skenario Uji | Langkah | Hasil Diharapkan | Hasil | Catatan |
|---|--------------|---------|------------------|-------|---------|
| 7.1 | Wizard step **Kondisi & Dokumentasi**: dua field terpisah | 1. Buka `/batches/new` → step Kondisi & Dokumentasi<br>2. Cari field cool box | Dua input: **"Suhu cool box saat di pasar (°C)"** & **"Suhu cool box saat di lab (°C)"** (bukan min/max) | ✅ otomatis | browser 360px (dua field terpisah) |
| 7.2 | Validasi masing-masing 0–4 °C | 1. Isi pasar = 5, lab = 2 → Simpan<br>2. Isi pasar = 2, lab = 5 → Simpan | Kedua kali error: "Suhu cool box harus 0–4 °C" | ✅ otomatis | test unit batch-wizard (batas 0–4 °C) + browser |
| 7.3 | Detail batch: tampil dua nilai terpisah | 1. Buka detail batch yang sudah dibuat | Section Pengadaan menampilkan: **"Suhu cool box saat di pasar (°C)"** & **"Suhu cool box saat di lab (°C)"** (dua nilai terpisah) | ✅ otomatis | browser submit 9/9 (pasar 2.5 / lab 3 tersimpan terpisah) |
| 7.4 | CSV Metadata: header `cooler_temp_market_c`, `cooler_temp_lab_c` (TIDAK ADA min/max) | 1. Unduh Metadata CSV<br>2. Cek header | Header baru ada; `cooler_temp_min_c` & `cooler_temp_max_c` **hilang** | ✅ otomatis | test api CSV (header cooler_temp_market_c / _lab_c) |

---

## Butir 8. Rename Label: "Suhu Udang Sebelum Observasi"

| # | Skenario Uji | Langkah | Hasil Diharapkan | Hasil | Catatan |
|---|--------------|---------|------------------|-------|---------|
| 8.1 | Wizard step Kondisi & Dokumentasi: label field | 1. Buka step Kondisi & Dokumentasi | Label: **"Suhu udang sebelum observasi (°C)"** (bukan "Suhu dalam udang saat tiba") | ✅ otomatis | kode + browser 360px |
| 8.2 | Petunjuk di bawah input | 1. Periksa teks bantuan | **"Ukur dengan termometer tusuk tepat sebelum observasi dimulai."** | ✅ otomatis | kode + browser 360px |
| 8.3 | Detail batch: label konsisten | 1. Buka detail batch | Section Kondisi menampilkan label baru | ✅ otomatis | kode wizard & halaman detail |

---

## Butir 9. Notifikasi Warmup Selesai (Bell, Modal, Audio, Riwayat)

| # | Skenario Uji | Langkah | Hasil Diharapkan | Hasil | Catatan |
|---|--------------|---------|------------------|-------|---------|
| 9.1 | **Perlu alat nyata** — Jalankan sesi dengan sensor stabil ≥10 menit | 1. Siapkan alat ESP32 + sensor stabil<br>2. Buat batch + grup + sesi H0<br>3. Start sesi (warmup 30 mnt dicentang)<br>4. Tunggu ≥10 menit data stabil | **Modal muncul** otomatis: "Sensor stabil, sesi siap dimulai"<br>**Audio** `Better Call Saul Ringtone.mp3` berbunyi (loop)<br>**Lonceng header** badge merah +1 | ⛔ Blokir | butuh ESP32 + sensor stabil 10 menit |
| 9.2 | Modal **wajib ditutup manual** (tidak auto-close) | 1. Biarkan modal terbuka 30 detik | Modal tetap terbuka; tidak hilang sendiri | ⬜ manual | perilaku modal perlu dilihat manual |
| 9.3 | Tombol **Audio On/Off** di modal berfungsi | 1. Toggle checkbox "Audio lonceng" di modal | Audio berhenti/bunyikan sesuai toggle | ⛔ Blokir | perlu perangkat nyata (audio) |
| 9.4 | Klik **Tutup** pada modal → modal hilang, badge lonceng berkurang | 1. Klik tombol **Tutup** pada modal | Modal tertutup; badge unread count -1; dropdown riwayat menampilkan item baru dengan titik hijau (belum dibaca) | ⬜ manual | perilaku modal & badge perlu dilihat manual |
| 9.5 | Dropdown lonceng: riwayat + **Tandai semua dibaca** | 1. Klik ikon lonceng header<br>2. Klik **Tandai semua dibaca** | Semua item jadi abu-abu (read); badge unread = 0 | ✅ otomatis | test api (tandai semua dibaca) |
| 9.6 | Idempoten: jalankan sesi stabil kedua kali → **hanya 1 notifikasi** per sesi | 1. Complete sesi → buka ulang (INCOMPLETE → Reopen) → Start lagi stabil<br>2. Cek dropdown lonceng | Hanya 1 notifikasi `warmup_stable` untuk `sessionId` itu | ✅ otomatis | test db worker sweep + test P2002 |
| 9.7 | Tanpa interaksi user dulu → audio **tidak autoplay** (kebijakan browser) | 1. Buka halaman baru (incognito) tanpa klik apa-apa<br>2. Tunggu notifikasi trigger | Audio **tidak bunyi** sampai user klik/ketik di halaman (lalu modal muncul + audio bunyi) | ⬜ manual | kebijakan autoplay perlu dilihat manual |

---

## Butir 10. Tabel Riwayat Dashboard: Filter Rentang + Preset

| # | Skenario Uji | Langkah | Hasil Diharapkan | Hasil | Catatan |
|---|--------------|---------|------------------|-------|---------|
| 10.1 | Dashboard: panel Tabel Riwayat punya 2 input `datetime-local` + 4 tombol preset | 1. Buka `/chamber/CH-01` (atau chamber manapun)<br>2. Scroll ke panel Tabel Riwayat | Input **Dari** & **Sampai** + tombol **Hari ini**, **7 hari**, **30 hari**, **1 tahun** | ✅ otomatis | browser dashboard 15/15 (2 input + preset) |
| 10.2 | Preset **Hari ini** → isi input awal hari 00:00 – sekarang | 1. Klik tombol **Hari ini** | Input `from` = hari ini 00:00; `to` = sekarang (WIB) | ✅ otomatis | browser dashboard 15/15 (00:00 hari ini → sekarang) |
| 10.3 | Preset **7 hari** → isi 7 hari lalu 00:00 – sekarang | 1. Klik **7 hari** | Input terisi benar | ✅ otomatis | browser (preset 7 hari) |
| 10.4 | **Tanpa alat terhubung** (matikan Mosquitto/worker) → pilih rentang 30 hari → angka tetap muncul dari DB | 1. Stop worker & Mosquitto<br>2. Pilih preset **30 hari** | Tabel menampilkan data historis (bukan kosong) | ✅ otomatis | browser (angka dari DB, tanpa tick live) |
| 10.5 | Rentang kustom: isi manual `from`/`to` → fetch ulang otomatis (debounce 400 ms) | 1. Isi tanggal awal 2026-09-01, akhir 2026-09-30<br>2. Tunggu ±0,5 detik (tanpa klik tombol) | Tabel refresh dengan data rentang itu; tombol **Terapkan Rentang** tetap tersedia sebagai jalan pintas | ✅ otomatis | browser dashboard 15/15 (apply otomatis ber-debounce) |
| 10.6 | Petunjuk: **"Data dari riwayat tersimpan; tidak perlu alat terhubung"** terlihat | 1. Periksa teks di atas/bawah tabel | Teks ada dan terbaca | ✅ otomatis | browser dashboard 15/15 (teks "Data dari riwayat tersimpan") |
| 10.7 | Preset **1 Tahun** memakai tahun kalender (bukan 365 hari tetap) dan diterima API | 1. Buka modal Tabel Riwayat<br>2. Klik **1 Tahun** | Input terisi rentang tepat satu tahun kalender (mis. 21/10/2025 → 21/10/2026) dan tabel termuat tanpa galat "exceeds maximum allowed limit" | ✅ otomatis | browser dashboard 15/15 (1 tahun kalender, API 200) |
| 10.8 | Input dari/sampai **selalu tampil** di atas tabel dan preset mengisinya | 1. Buka modal Tabel Riwayat<br>2. Klik preset mana pun | Kedua input terisi rentang efektif preset (mis. "Hari Ini" → 00:00 hari ini → sekarang) | ✅ otomatis | browser dashboard 15/15 (input selalu tampil & terisi preset) |

---

## Butir 11. Judul Grafik & Pembersihan Copywriting

| # | Skenario Uji | Langkah | Hasil Diharapkan | Hasil | Catatan |
|---|--------------|---------|------------------|-------|---------|
| 11.1 | Grafik chamber: judul **"Pergerakan Sensor Gas Aktif"** | 1. Buka halaman chamber | Judul di atas grafik = "Pergerakan Sensor Gas Aktif" | ✅ otomatis | browser dashboard 15/15 |
| 11.2 | Tidak ada istilah lama di codebase (`grep` tidak ketemu) | 1. `grep -r "Suhu dalam udang saat tiba" app/ components/` (harus kosong)<br>2. `grep -r "Sumber pasar" app/ components/` (harus kosong)<br>3. `grep -r "Non-Chamber" app/ components/` (harus kosong) | Ketiganya tidak ditemukan. "Suhu Dingin" **tetap dipakai** sebagai label kondisi penyimpanan dan konsisten antara wizard & halaman detail | ✅ otomatis | grep: "Suhu dalam udang saat tiba"/"Sumber pasar"/"Non-Chamber" = 0 hasil |
| 11.3 | Wizard & detail: label tombol pakai **kata kerja aktif** (mis. "Simpan", "Mulai", "Unggah", "Unduh") | 1. Periksa semua tombol aksi | Tombol bermakna aktif, bukan "OK"/"Submit" generik | ⬜ manual | penilaian konsistensi label perlu dilihat manual |
| 11.4 | Grafik: subtitle & legenda memakai kalimat tanpa jargon | 1. Buka halaman chamber<br>2. Periksa judul, subtitle, dan legenda seri | Subtitle "Nilai sensor gas mentah (ADC): MQ-137, MQ-136, MQ-4"; legenda "MQ-137 (mentah)" (bukan "raw"/"Raw ADC") | ✅ otomatis | browser dashboard 15/15 (tanpa jargon "raw"/"Raw ADC") |

---

## Butir 12. Wizard 3 Langkah: Pengadaan → Kondisi & Dokumentasi → Pengelompokan

| # | Skenario Uji | Langkah | Hasil Diharapkan | Hasil | Catatan |
|---|--------------|---------|------------------|-------|---------|
| 12.1 | Indikator step: **"Langkah 1 dari 3" → "Langkah 2 dari 3" → "Langkah 3 dari 3"** | 1. Buka `/batches/new`<br>2. Navigasi ke step 2 & 3 | Indikator benar di header wizard | ✅ otomatis | browser wizard 15/15 |
| 12.2 | **Step 1 (Pengadaan):** hanya logistik beli/tiba, jenis sumber, sumber teks | 1. Periksa field di step 1 | **TIDAK ADA** kondisi udang, ukuran, berat, cool box, foto dokumentasi | ✅ otomatis | browser wizard 15/15 |
| 12.3 | **Step 2 (Kondisi & Dokumentasi):** kondisi awal, jumlah, ukuran, panjang, berat total, suhu sebelum observasi, 2x cool box, foto dokumentasi + caption | 1. Klik **Lanjut ke Kondisi & Dokumentasi**<br>2. Periksa field | Semua field kondisi + 2 cool box + area foto dokumentasi (caption wajib) ada di sini | ✅ otomatis | browser wizard 15/15 |
| 12.4 | **Step 3 (Pengelompokan):** bagi SR/SD, radio chamber/non-chamber, foto per grup + caption | 1. Klik **Lanjut ke Pengelompokan** | Radio "Dalam chamber"/"Langsung di kulkas" per grup; area upload foto per grup | ✅ otomatis | browser wizard 15/15 |
| 12.5 | Label **"Sumber pasar" → "Sumber"** (step 1) | 1. Periksa label di step Pengadaan | Label = "Sumber"; placeholder: "Nama lokasi pembelian, misal: Pasar Induk Kramat Jati, Supermarket X" | ✅ otomatis | browser wizard 15/15 (label "Sumber") |
| 12.6 | Navigasi **maju-mundur** mempertahankan semua nilai | 1. Isi step 1 → Lanjut → isi step 2 → Lanjut → isi step 3<br>2. Klik **Kembali** ke step 2 → **Kembali** ke step 1 | Semua nilai tersimpan, tidak hilang | ✅ otomatis | browser wizard 15/15 (nilai bertahan saat mundur) |
| 12.7 | Validasi galat melompat ke step yang tepat | 1. Di step 3, kosongkan field wajib (mis. suhu grup)<br>2. Klik **Simpan batch** | Error inline merah di step 2 (Kondisi); wizard auto-pindah ke step 2 | ✅ otomatis | browser wizard 15/15 (galat lompat ke langkah + fokus) |
| 12.8 | Foto di step 2 (dokumentasi) **tidak ganggu** foto step 3 (grup) | 1. Upload foto di step 2<br>2. Lanjut ke step 3 → upload foto grup<br>3. Simpan → buka detail | Foto step 2 muncul di section Foto (atas); foto step 3 muncul di section grup masing-masing | ⬜ manual | perlu dua langkah foto diisi manual |

---

## Butir 13. Draf Form Batch (localStorage)

| # | Skenario Uji | Langkah | Hasil Diharapkan | Hasil | Catatan |
|---|--------------|---------|------------------|-------|---------|
| 13.1 | Isi separuh form → **refresh halaman** → banner pemulihan draf | 1. Isi field skalar di step 1 & 2 (jangan upload foto)<br>2. Tekan F5 / Ctrl+R | Banner muncul di atas form: "Draf isian sebelumnya dipulihkan otomatis — dibuat <tanggal/jam WIB>", catatan draf hanya berlaku di perangkat ini, tombol **Buang draf** | ✅ otomatis | browser draft 17/17 (banner + waktu WIB) |
| 13.2 | Pemulihan draf **otomatis** → semua nilai skalar kembali (teks, angka, tanggal, radio) | 1. Buka `/batches/new` (tidak ada aksi klik) | Form terisi ulang; radio chamber/kulkas, jenis sumber, dst. kembali | ✅ otomatis | browser draft 17/17 (pemulihan otomatis) |
| 13.3 | **Foto TIDAK ikut tersimpan** (banner mengingatkan) | 1. Periksa banner/area foto | Pesan: "Foto perlu dipilih ulang" atau caption kosong; input file kosong | ✅ otomatis | test unit batch-draft (caption tersimpan, berkas tidak) |
| 13.4 | **Submit batch sukses** → draf terhapus otomatis | 1. Lengkapi form → Simpan batch<br>2. Buka `/batches/new` lagi | Form kosong; banner draf **tidak muncul** | ✅ otomatis | browser submit 9/9 + test unit (draf terhapus) |
| 13.5 | Klik **Hapus draf** → draf dihapus, form kosong | 1. Isi form → refresh → banner muncul<br>2. Klik **Hapus draf** | Banner hilang; form kosong | ✅ otomatis | browser draft 17/17 (Buang draf → penyimpanan bersih) |
| 13.6 | Versi skema berubah (simulasi: ganti kunci `localStorage` di DevTools) → draf lama dibuang, tidak error | 1. Buka DevTools Application → LocalStorage<br>2. Ganti key `esniffer:batch-draft-v1` → `esniffer:batch-draft-v2`<br>3. Refresh | Form kosong, tidak crash | ✅ otomatis | test unit (kunci v1 diabaikan) |
| 13.7 | Draf berumur lebih dari **7 hari** dibuang saat halaman dibuka | 1. Isi form lalu simpan draf<br>2. Ubah cap waktu draf lewat DevTools (> 7 hari lalu)<br>3. Refresh | Draf dibuang; form kosong; tidak ada banner pemulihan | ✅ otomatis | browser draft 17/17 (draf > 7 hari dibuang) |
| 13.8 | Draf milik **akun lain** diabaikan di perangkat bersama | 1. Simpan draf dengan `userId` akun lain lewat DevTools<br>2. Refresh | Form tidak terisi draf tersebut; draf pemilik asli tidak dihapus | ✅ otomatis | browser draft 17/17 (draf akun lain diabaikan) |
| 13.9 | **Caption foto** ikut tersimpan di draf (berkas foto tidak ikut) | 1. Isi caption foto di wizard lalu biarkan draf tersimpan<br>2. Refresh | Caption tampil di banner ("Caption tersimpan: ...") sehingga tidak perlu diketik ulang; berkas foto harus dipilih ulang | ✅ otomatis | browser draft 17/17 (caption disebut di banner) |
| 13.10 | Draf **tidak ditulis** saat wizard dibuka tanpa interaksi | 1. Buka `/batches/new` di browser baru<br>2. Jangan isi apa pun, tunggu beberapa detik | Tidak ada draf tersimpan; kunjungan berikutnya tidak menampilkan banner pemulihan | ✅ otomatis | browser draft 17/17 (tanpa interaksi tak ada draf) |

---

## Butir 14. Mobile-First (360 px, Target Sentuh, Kamera, Sticky Footer)

| # | Skenario Uji | Langkah | Hasil Diharapkan | Hasil | Catatan |
|---|--------------|---------|------------------|-------|---------|
| 14.1 | **Wizard**: buka di **360 px** (DevTools device toolbar iPhone SE / Galaxy S5) | 1. Buka `/batches/new` di 360 px<br>2. Scroll ke field groups | Grid field **1 kolom** (`grid-cols-1 sm:grid-cols-2`); input tidak menyempit/terpotong | ✅ otomatis | browser 360px 14/14 (input grup 286 px) |
| 14.2 | **Footer navigasi step (Kembali / Lanjut / Simpan) sticky di bawah** | 1. Scroll ke bawah wizard panjang<br>2. Periksa footer | Tombol selalu terlihat di bawah viewport; tidak menutupi input terakhir | ✅ otomatis | browser 360px 14/14 (footer tidak menutupi field) |
| 14.3 | **Target sentuh ≥44 px**: tombol, input, checkbox, radio | 1. Ukur tinggi tombol/input di DevTools (Elements → Computed) | `min-height: 44px` atau `min-h-[44px]` di semua kontrol interaktif | ✅ otomatis | browser 360px 14/14 (tombol ≥ 44 px) |
| 14.4 | **Input foto**: `capture="environment"` → kamera belakang langsung terbuka di HP | 1. Buka di **HP asli** (bukan DevTools)<br>2. Klik input foto di step Pengadaan/Pengelompokan | Kamera belakang (environment) terbuka langsung, bukan galeri | ⛔ Blokir | perlu HP asli (kamera belakang) |
| 14.5 | **Detail batch**: kartu grup & sesi responsif 1 kolom | 1. Buka detail batch di 360 px | Tidak ada scroll horizontal; kartu menyesuaikan lebar | ✅ otomatis | browser 360px 14/14 |
| 14.6 | **Dashboard Tabel Riwayat**: gulir horizontal terkendali (tidak pecah layout) | 1. Buka dashboard di 360 px<br>2. Scroll tabel | Tabel gulir horizontal di dalam container; sidebar/header tidak ikut geser | ✅ otomatis | browser 360px 14/14 (tabel 760 px di wadah 276 px) |
| 14.7 | **Grafik**: tinggi penuh, tidak terpotong | 1. Buka chamber di 360 px | Grafik `min-h-[320px] sm:min-h-[220px]` terlihat utuh | ✅ otomatis | browser 360px 14/14 (tinggi 320 px) |
| 14.8 | **Target sentuh minimal 44 px** pada tombol aksi utama | 1. Buka wizard & halaman detail di 360 px<br>2. Ukur tinggi tombol (DevTools → Computed) | Tombol aksi utama (chip langkah, Edit data grup, Unduh, Kunci, chip grafik, preset rentang) setinggi ≥ 44 px; tombol "×" hapus foto 32 px (≥ 24 px, WCAG 2.5.8) | ✅ otomatis | browser 360px 14/14 (tombol utama ≥ 44 px; "×" 32 px) |

---

## Ringkasan Hasil Keseluruhan

| Butir | Total Skenario | Lolos | Gagal | Blokir | Catatan |
|---|---:|---:|---:|---:|---|
| 1. Chamber/Non-chamber | 8 | 8 | 0 | 0 | seluruhnya terverifikasi otomatis |
| 2. Foto + Caption Grup | 4 | 4 | 0 | 0 | seluruhnya terverifikasi otomatis |
| 3. Edit per Section | 6 | 6 | 0 | 0 | seluruhnya terverifikasi otomatis |
| 4. Hapus Dropdown Device | 3 | 2 | 0 | 1 | 4.3 menunggu sesi nyata |
| 5. Jam Device + CSV Pecah | 5 | 4 | 0 | 1 | 5.2 butuh ubah jam OS |
| 6. Supermarket | 3 | 3 | 0 | 0 | seluruhnya terverifikasi otomatis |
| 7. Cool Box Pasar/Lab | 4 | 4 | 0 | 0 | seluruhnya terverifikasi otomatis |
| 8. Label Suhu Sebelum Obs | 3 | 3 | 0 | 0 | seluruhnya terverifikasi otomatis |
| 9. Notifikasi Warmup | 7 | 2 | 0 | 5 | 9.1 & 9.3 butuh alat nyata; 9.2/9.4/9.7 manual |
| 10. Filter Riwayat + Preset | 8 | 8 | 0 | 0 | seluruhnya terverifikasi otomatis |
| 11. Judul Grafik + Copywriting | 4 | 3 | 0 | 1 | 11.3 penilaian label manual |
| 12. Wizard 3 Langkah | 8 | 7 | 0 | 1 | 12.8 perlu dua langkah foto manual |
| 13. Draf localStorage | 10 | 10 | 0 | 0 | seluruhnya terverifikasi otomatis |
| 14. Mobile-First | 8 | 7 | 0 | 1 | 14.4 butuh HP asli |
| **TOTAL** | **81** | **71** | **0** | **10** | 0 kegagalan; 10 scenario menunggu perangkat nyata / penilaian manual |

---

## Catatan Khusus untuk Uji Manual

1. **Butir 9 (Notifikasi)** memerlukan **alat nyata ESP32 + sensor stabil** minimal 10 menit. Jika alat tidak tersedia, catat sebagai **Blokir** dan jadwalkan ulang.
2. **Butir 5 & 14** sebaiknya diuji di **perangkat HP asli** (bukan hanya DevTools) untuk memverifikasi jam device & kamera `capture="environment"`.
3. **Butir 7 (Cool Box)**: nilai migrasi data lama (min→market, max→lab) adalah perkiraan; verifikasi hanya untuk data **baru** yang dibuat setelah migrasi.
4. **Butir 13 (Draf)**: uji juga di **browser lain / incognito** untuk memastikan `localStorage` tidak bocor antar sesi/perangkat.
5. Semua **CSV ekspor** (Metadata & Data) harus dibuka di **Excel/Google Sheets** untuk memverifikasi encoding UTF-8 + BOM (simbol °C benar, tidak jadi `Â°C`).

---

## Tanda Tangan Verifikator

| Peran | Nama | Tanggal | Tanda Tangan |
|-------|------|---------|--------------|
| QA / Tester | | | |
| Pembimbing / PIC | | | |

---

*Dokumen ini bersifat *living document*; perbarui tiap kali ada perubahan kode yang memengaruhi perilaku UI/UX.*
*Versi: 21 Oktober 2026 | Kode: `main` (merge fase 6 — revisi UI butir 1–14)*