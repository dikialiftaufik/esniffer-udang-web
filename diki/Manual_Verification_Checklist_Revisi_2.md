# Checklist Verifikasi Manual — Revisi Pembimbing Putaran 2 (14 Butir)

> **Tujuan:** Panduan uji manual end-to-end untuk memastikan 14 revisi putaran 2 berfungsi sesuai keputusan desain. Dokumen ini digunakan setelah seluruh test otomatis (unit/db/api) lulus.
> **Prasyarat:** `npm run typecheck`, `npx eslint`, `npm run test:unit`, `npm run test:db`, `npm run test:api` — semuanya hijau.
> **Lingkungan:** Browser desktop (Chrome/Firefox/Edge) + mode devtools mobile 360 px + perangkat HP nyata (opsional tapi disarankan untuk butir 5, 14).
> **Cara pakai:** Centang ✅ kolom **Hasil** bila lolos; isi **Catatan** bila ada perilaku aneh/bug. Satu baris = satu skenario uji.

---

## Butir 1. Kelompok Dingin: Chamber / Non-Chamber (PLAIN_FRIDGE)

| # | Skenario Uji | Langkah | Hasil Diharapkan | Hasil | Catatan |
|---|--------------|---------|------------------|-------|---------|
| 1.1 | Wizard: buat batch, step Pengelompokan, pilih **Suhu Dingin (4 ± 1 °C)** → radio **Dalam chamber** & **Langsung di kulkas** muncul | 1. Buka `/batches/new` → isi step Pengadaan & Kondisi → Lanjut ke Pengelompokan<br>2. Pada kartu "Suhu Dingin", periksa radio | Dua radio button: "Dalam chamber" (default) & "Langsung di kulkas"; memilih "Langsung di kulkas" menyembunyikan dropdown chamber | ☐ / ☐ | |
| 1.2 | Wizard: pilih **Langsung di kulkas** → Simpan batch → buka detail → judul grup | 1. Pilih "Langsung di kulkas" → Simpan batch<br>2. Buka halaman detail batch | Judul section grup menampilkan **"Dingin non-chamber (4 ± 1 °C)"** (bukan "Suhu Dingin") | ☐ / ☐ | |
| 1.3 | Wizard: pilih **Dalam chamber** → Simpan → detail | 1. Pilih "Dalam chamber" → Simpan batch<br>2. Buka detail | Judul section menampilkan **"Dingin, chamber (4 ± 1 °C)"** | ☐ / ☐ | |
| 1.4 | Detail batch: Edit grup → ganti mode **chamber ↔ non-chamber** | 1. Buka detail batch yang sudah ada<br>2. Klik **Edit** pada kartu grup dingin<br>3. Ganti radio mode → Simpan | Perubahan tersimpan; judul section berubah sesuai mode baru; notifikasi sukses pojok kanan bawah | ☐ / ☐ | |
| 1.5 | Validasi DB: `PLAIN_FRIDGE` wajib tanpa `chamber_id` | 1. Coba `INSERT` ke `sample_groups` dengan `cold_storage_mode='PLAIN_FRIDGE'` + `chamber_id` terisi | DB menolak (CHECK `sample_groups_plain_fridge_no_chamber`) | ☐ / ☐ | |
| 1.6 | Validasi API sesi: grup `COLD+CHAMBER` tanpa chamber → ditolak | 1. Buat grup `COLD+CHAMBER` tanpa memilih chamber di detail<br>2. Klik **Start Sesi** | Error 422: "Grup dingin mode chamber butuh pemilihan chamber sebelum sesi dimulai" | ☐ / ☐ | |

---

## Butir 2. Foto + Caption di Step Pengelompokan

| # | Skenario Uji | Langkah | Hasil Diharapkan | Hasil | Catatan |
|---|--------------|---------|------------------|-------|---------|
| 2.1 | Wizard step Pengelompokan: upload foto + caption per grup | 1. Di step Pengelompokan, pilih file JPG/PNG pada kartu grup<br>2. Isi caption (wajib ≤140 char)<br>3. Klik **Simpan batch** | Foto tersimpan; badge **SR/SD** muncul di daftar foto halaman detail di section grup yang benar | ☐ / ☐ | |
| 2.2 | Detail batch: upload foto tambahan ke grup tertentu | 1. Buka detail batch<br>2. Di section grup, klik **Upload** → pilih file + caption → Upload | Foto muncul di section grup yang sama; badge SR/SD terlihat | ☐ / ☐ | |
| 2.3 | API: upload dengan `groupId` salah (bukan milik batch) → 404 | 1. Gunakan API client / curl POST `/api/v1/batches/{id}/photos` dengan `groupId` grup batch lain | Response 404: "Grup tidak ada di batch ini" | ☐ / ☐ | |
| 2.4 | Foto tanpa `groupId` tetap tampil sebagai foto batch (pengadaan) | 1. Upload foto di step Pengadaan (tanpa grup)<br>2. Buka detail | Foto muncul di section **Foto** atas (bukan di section grup) | ☐ / ☐ | |

---

## Butir 3. Form Edit per Section di Halaman Detail

| # | Skenario Uji | Langkah | Hasil Diharapkan | Hasil | Catatan |
|---|--------------|---------|------------------|-------|---------|
| 3.1 | Tombol **Edit** per kartu grup → form modal | 1. Buka detail batch<br>2. Klik **Edit** pada kartu grup SR/SD | Modal terbuka berisi: Suhu udang (°C), Berat sebelum observasi (g), Berat sesudah observasi (g), area foto (opsional) | ☐ / ☐ | |
| 3.2 | Edit suhu → Simpan → nilai update di detail & CSV metadata | 1. Ubah suhu (mis. 6.4 → 7.2)<br>2. Klik **Simpan**<br>3. Muat ulang halaman<br>4. Unduh **Metadata CSV** | Suhu terupdate di detail; CSV metadata kolom `lab_temp_c` mengikuti nilai baru | ☐ / ☐ | |
| 3.3 | Edit berat sesudah < berat sebelum (tanpa catatan) → validasi tolak | 1. Set berat sebelum = 500, berat sesudah = 400<br>2. Simpan | Error validasi: berat sesudah tidak boleh lebih kecil tanpa catatan penolakan | ☐ / ☐ | |
| 3.4 | Batch **terkunci** → Edit ditolak 409 | 1. Kunci batch<br>2. Coba Edit grup | Error 409: "Batch sudah terkunci dan tidak bisa diubah" | ☐ / ☐ | |
| 3.5 | Body kosong (tanpa field) → 422 | 1. Kirim PATCH `/api/v1/groups/{id}` body `{}` | Error 422: "Body harus memuat minimal satu field..." | ☐ / ☐ | |

---

## Butir 4. Hapus Dropdown Device per Section

| # | Skenario Uji | Langkah | Hasil Diharapkan | Hasil | Catatan |
|---|--------------|---------|------------------|-------|---------|
| 4.1 | Detail batch: dropdown device **tidak ada** lagi | 1. Buka detail batch<br>2. Periksa area sesi per grup | Hanya teks baca-saja: **"Device: esp32-001"** (atau device yang tertaut ke chamber) | ☐ / ☐ | |
| 4.2 | Pilih chamber → device otomatis terisi dari pemetaan | 1. Pilih chamber pada sesi baru<br>2. Periksa teks device | Teks device muncul otomatis sesuai chamber yang dipilih | ☐ / ☐ | |
| 4.3 | Sesi dibuat → `deviceId` tertaut otomatis di DB | 1. Start sesi dengan chamber terpilih<br>2. Complete sesi<br>3. Cek DB `measurement_sessions.device_id` | `deviceId` terisi (bukan NULL) | ☐ / ☐ | |

---

## Butir 5. Tanggal/Jam dari Jam Device; CSV Pecah Kolom

| # | Skenario Uji | Langkah | Hasil Diharapkan | Hasil | Catatan |
|---|--------------|---------|------------------|-------|---------|
| 5.1 | Wizard step Pengadaan: field **Tanggal & Jam Beli** & **Tanggal & Jam Tiba** terisi otomatis jam device | 1. Buka `/batches/new` (browser baru / incognito)<br>2. Periksa kedua input `datetime-local` | Nilai default = waktu sekarang (WIB) dari jam device; format `YYYY-MM-DDTHH:MM` | ☐ / ☐ | |
| 5.2 | Ubah jam device (OS) → buka wizard baru → nilai ikut berubah | 1. Ganti jam sistem +1 jam<br>2. Refresh `/batches/new` | Input waktu bergeser +1 jam | ☐ / ☐ | |
| 5.3 | Isi jam beli di luar 06:00–08:00 WIB → klik **Lanjut** → tertahan + pesan merah | 1. Set jam beli `10:00`<br>2. Klik **Lanjut ke Kondisi & Dokumentasi** | Tombol tidak jalan; pesan error inline merah: "Jam beli harus 06:00–08:00 WIB" | ☐ / ☐ | |
| 5.4 | CSV Metadata ekspor: header **pecah 4 kolom** (bukan 2 kolom UTC) | 1. Buat batch lengkap → Unduh **Metadata CSV**<br>2. Buka di Excel/Notepad | Header: `procured_date`, `procured_time_wib`, `arrived_date`, `arrived_time_wib` (TIDAK ADA `procured_at_utc`, `arrived_at_utc`) | ☐ / ☐ | |
| 5.5 | Nilai CSV WIB = konversi UTC+7 dari DB (bukan copy mentah) | 1. Bandingkan nilai DB `procured_at_utc` vs CSV `procured_date` + `procured_time_wib` | `procured_time_wib` = UTC+7; tanggal konsisten (lewat tengah malam ditangani benar) | ☐ / ☐ | |

---

## Butir 6. Pilihan "Supermarket" pada Jenis Sumber

| # | Skenario Uji | Langkah | Hasil Diharapkan | Hasil | Catatan |
|---|--------------|---------|------------------|-------|---------|
| 6.1 | Wizard: dropdown **Jenis Sumber** punya 3 opsi | 1. Buka `/batches/new` → step Pengadaan<br>2. Periksa dropdown "Jenis sumber" | Opsi: **Pasar**, **Tambak**, **Supermarket** | ☐ / ☐ | |
| 6.2 | Pilih **Supermarket** → Simpan → Detail menampilkan label "Supermarket" | 1. Pilih Supermarket → isi Sumber teks bebas (mis. "Supermarket X")<br>2. Simpan batch<br>3. Buka detail | Badge/label "Supermarket" tampil di section Pengadaan | ☐ / ☐ | |
| 6.3 | CSV Metadata: kolom `source_type` bernilai `supermarket` (lowercase) | 1. Unduh Metadata CSV<br>2. Cek kolom `source_type` | `supermarket` (bukan `SUPERMARKET`) | ☐ / ☐ | |

---

## Butir 7. Cool Box: Suhu di Pasar & di Lab (Bukan Min/Max)

| # | Skenario Uji | Langkah | Hasil Diharapkan | Hasil | Catatan |
|---|--------------|---------|------------------|-------|---------|
| 7.1 | Wizard step **Kondisi & Dokumentasi**: dua field terpisah | 1. Buka `/batches/new` → step Kondisi & Dokumentasi<br>2. Cari field cool box | Dua input: **"Suhu cool box saat di pasar (°C)"** & **"Suhu cool box saat di lab (°C)"** (bukan min/max) | ☐ / ☐ | |
| 7.2 | Validasi masing-masing 0–4 °C | 1. Isi pasar = 5, lab = 2 → Simpan<br>2. Isi pasar = 2, lab = 5 → Simpan | Kedua kali error: "Suhu cool box harus 0–4 °C" | ☐ / ☐ | |
| 7.3 | Detail batch: tampil dua nilai terpisah | 1. Buka detail batch yang sudah dibuat | Section Pengadaan menampilkan: **"Saat di pasar: x °C"** & **"Saat di lab: y °C"** | ☐ / ☐ | |
| 7.4 | CSV Metadata: header `cooler_temp_market_c`, `cooler_temp_lab_c` (TIDAK ADA min/max) | 1. Unduh Metadata CSV<br>2. Cek header | Header baru ada; `cooler_temp_min_c` & `cooler_temp_max_c` **hilang** | ☐ / ☐ | |

---

## Butir 8. Rename Label: "Suhu Udang Sebelum Observasi"

| # | Skenario Uji | Langkah | Hasil Diharapkan | Hasil | Catatan |
|---|--------------|---------|------------------|-------|---------|
| 8.1 | Wizard step Kondisi & Dokumentasi: label field | 1. Buka step Kondisi & Dokumentasi | Label: **"Suhu udang sebelum observasi (°C)"** (bukan "Suhu dalam udang saat tiba") | ☐ / ☐ | |
| 8.2 | Petunjuk di bawah input | 1. Periksa teks bantuan | **"Ukur dengan termometer tusuk tepat sebelum observasi dimulai."** | ☐ / ☐ | |
| 8.3 | Detail batch: label konsisten | 1. Buka detail batch | Section Kondisi menampilkan label baru | ☐ / ☐ | |

---

## Butir 9. Notifikasi Warmup Selesai (Bell, Modal, Audio, Riwayat)

| # | Skenario Uji | Langkah | Hasil Diharapkan | Hasil | Catatan |
|---|--------------|---------|------------------|-------|---------|
| 9.1 | **Perlu alat nyata** — Jalankan sesi dengan sensor stabil ≥10 menit | 1. Siapkan alat ESP32 + sensor stabil<br>2. Buat batch + grup + sesi H0<br>3. Start sesi (warmup 30 mnt dicentang)<br>4. Tunggu ≥10 menit data stabil | **Modal muncul** otomatis: "Sensor stabil, sesi siap dimulai"<br>**Audio** `Better Call Saul Ringtone.mp3` berbunyi (loop)<br>**Lonceng header** badge merah +1 | ☐ / ☐ | |
| 9.2 | Modal **wajib ditutup manual** (tidak auto-close) | 1. Biarkan modal terbuka 30 detik | Modal tetap terbuka; tidak hilang sendiri | ☐ / ☐ | |
| 9.3 | Tombol **Audio On/Off** di modal berfungsi | 1. Toggle checkbox "Audio lonceng" di modal | Audio berhenti/bunyikan sesuai toggle | ☐ / ☐ | |
| 9.4 | Klik **Tutup** pada modal → modal hilang, badge lonceng berkurang | 1. Klik tombol **Tutup** pada modal | Modal tertutup; badge unread count -1; dropdown riwayat menampilkan item baru dengan titik hijau (belum dibaca) | ☐ / ☐ | |
| 9.5 | Dropdown lonceng: riwayat + **Tandai semua dibaca** | 1. Klik ikon lonceng header<br>2. Klik **Tandai semua dibaca** | Semua item jadi abu-abu (read); badge unread = 0 | ☐ / ☐ | |
| 9.6 | Idempoten: jalankan sesi stabil kedua kali → **hanya 1 notifikasi** per sesi | 1. Complete sesi → buka ulang (INCOMPLETE → Reopen) → Start lagi stabil<br>2. Cek dropdown lonceng | Hanya 1 notifikasi `warmup_stable` untuk `sessionId` itu | ☐ / ☐ | |
| 9.7 | Tanpa interaksi user dulu → audio **tidak autoplay** (kebijakan browser) | 1. Buka halaman baru (incognito) tanpa klik apa-apa<br>2. Tunggu notifikasi trigger | Audio **tidak bunyi** sampai user klik/ketik di halaman (lalu modal muncul + audio bunyi) | ☐ / ☐ | |

---

## Butir 10. Tabel Riwayat Dashboard: Filter Rentang + Preset

| # | Skenario Uji | Langkah | Hasil Diharapkan | Hasil | Catatan |
|---|--------------|---------|------------------|-------|---------|
| 10.1 | Dashboard: panel Tabel Riwayat punya 2 input `datetime-local` + 4 tombol preset | 1. Buka `/chamber/CH-01` (atau chamber manapun)<br>2. Scroll ke panel Tabel Riwayat | Input **Dari** & **Sampai** + tombol **Hari ini**, **7 hari**, **30 hari**, **1 tahun** | ☐ / ☐ | |
| 10.2 | Preset **Hari ini** → isi input awal hari 00:00 – sekarang | 1. Klik tombol **Hari ini** | Input `from` = hari ini 00:00; `to` = sekarang (WIB) | ☐ / ☐ | |
| 10.3 | Preset **7 hari** → isi 7 hari lalu 00:00 – sekarang | 1. Klik **7 hari** | Input terisi benar | ☐ / ☐ | |
| 10.4 | **Tanpa alat terhubung** (matikan Mosquitto/worker) → pilih rentang 30 hari → angka tetap muncul dari DB | 1. Stop worker & Mosquitto<br>2. Pilih preset **30 hari** | Tabel menampilkan data historis (bukan kosong) | ☐ / ☐ | |
| 10.5 | Custom range: isi manual `from`/`to` → klik Enter/klik luar → fetch ulang | 1. Isi tanggal awal 2026-09-01, akhir 2026-09-30<br>2. Tekan Tab/klik luar | Tabel refresh dengan data rentang itu | ☐ / ☐ | |
| 10.6 | Petunjuk: **"Data dari riwayat tersimpan; tidak perlu alat terhubung"** terlihat | 1. Periksa teks di atas/bawah tabel | Teks ada dan terbaca | ☐ / ☐ | |

---

## Butir 11. Judul Grafik & Pembersihan Copywriting

| # | Skenario Uji | Langkah | Hasil Diharapkan | Hasil | Catatan |
|---|--------------|---------|------------------|-------|---------|
| 11.1 | Grafik chamber: judul **"Pergerakan Sensor Gas Aktif"** | 1. Buka halaman chamber | Judul di atas grafik = "Pergerakan Sensor Gas Aktif" | ☐ / ☐ | |
| 11.2 | Tidak ada istilah lama di codebase (`grep` tidak ketemu) | 1. Jalankan pencarian: `grep -r "Suhu Dingin" app/ components/`<br>2. `grep -r "observasi" app/ components/` (harus hanya "pengukuran"/"observasi" konsisten) | Hanya istilah baru yang dipakai | ☐ / ☐ | |
| 11.3 | Wizard & detail: label tombol pakai **kata kerja aktif** (mis. "Simpan", "Mulai", "Unggah", "Unduh") | 1. Periksa semua tombol aksi | Tombol bermakna aktif, bukan "OK"/"Submit" generik | ☐ / ☐ | |

---

## Butir 12. Wizard 3 Langkah: Pengadaan → Kondisi & Dokumentasi → Pengelompokan

| # | Skenario Uji | Langkah | Hasil Diharapkan | Hasil | Catatan |
|---|--------------|---------|------------------|-------|---------|
| 12.1 | Indikator step: **"Langkah 1 dari 3" → "Langkah 2 dari 3" → "Langkah 3 dari 3"** | 1. Buka `/batches/new`<br>2. Navigasi ke step 2 & 3 | Indikator benar di header wizard | ☐ / ☐ | |
| 12.2 | **Step 1 (Pengadaan):** hanya logistik beli/tiba, jenis sumber, sumber teks | 1. Periksa field di step 1 | **TIDAK ADA** kondisi udang, ukuran, berat, cool box, foto dokumentasi | ☐ / ☐ | |
| 12.3 | **Step 2 (Kondisi & Dokumentasi):** kondisi awal, jumlah, ukuran, panjang, berat total, suhu sebelum observasi, 2x cool box, foto dokumentasi + caption | 1. Klik **Lanjut ke Kondisi & Dokumentasi**<br>2. Periksa field | Semua field kondisi + 2 cool box + area foto dokumentasi (caption wajib) ada di sini | ☐ / ☐ | |
| 12.4 | **Step 3 (Pengelompokan):** bagi SR/SD, radio chamber/non-chamber, foto per grup + caption | 1. Klik **Lanjut ke Pengelompokan** | Radio "Dalam chamber"/"Langsung di kulkas" per grup; area upload foto per grup | ☐ / ☐ | |
| 12.5 | Label **"Sumber pasar" → "Sumber"** (step 1) | 1. Periksa label di step Pengadaan | Label = "Sumber"; placeholder: "Nama lokasi pembelian, misal: Pasar Induk Kramat Jati, Supermarket X" | ☐ / ☐ | |
| 12.6 | Navigasi **maju-mundur** mempertahankan semua nilai | 1. Isi step 1 → Lanjut → isi step 2 → Lanjut → isi step 3<br>2. Klik **Kembali** ke step 2 → **Kembali** ke step 1 | Semua nilai tersimpan, tidak hilang | ☐ / ☐ | |
| 12.7 | Validasi galat melompat ke step yang tepat | 1. Di step 3, kosongkan field wajib (mis. suhu grup)<br>2. Klik **Simpan batch** | Error inline merah di step 2 (Kondisi); wizard auto-pindah ke step 2 | ☐ / ☐ | |
| 12.8 | Foto di step 2 (dokumentasi) **tidak ganggu** foto step 3 (grup) | 1. Upload foto di step 2<br>2. Lanjut ke step 3 → upload foto grup<br>3. Simpan → buka detail | Foto step 2 muncul di section Foto (atas); foto step 3 muncul di section grup masing-masing | ☐ / ☐ | |

---

## Butir 13. Draf Form Batch (localStorage)

| # | Skenario Uji | Langkah | Hasil Diharapkan | Hasil | Catatan |
|---|--------------|---------|------------------|-------|---------|
| 13.1 | Isi separuh form → **refresh halaman** → banner **"Lanjutkan draf dari [tanggal/jam]?"** | 1. Isi field skalar di step 1 & 2 (jangan upload foto)<br>2. Tekan F5 / Ctrl+R | Banner muncul di atas form dengan timestamp; tombol **Lanjutkan** & **Hapus draf** | ☐ / ☐ | |
| 13.2 | Klik **Lanjutkan** → semua nilai skalar kembali (teks, angka, tanggal, radio) | 1. Klik **Lanjutkan** | Form terisi ulang; radio chamber/non-chamber, jenis sumber, dst. kembali | ☐ / ☐ | |
| 13.3 | **Foto TIDAK ikut tersimpan** (banner mengingatkan) | 1. Periksa banner/area foto | Pesan: "Foto perlu dipilih ulang" atau caption kosong; input file kosong | ☐ / ☐ | |
| 13.4 | **Submit batch sukses** → draf terhapus otomatis | 1. Lengkapi form → Simpan batch<br>2. Buka `/batches/new` lagi | Form kosong; banner draf **tidak muncul** | ☐ / ☐ | |
| 13.5 | Klik **Hapus draf** → draf dihapus, form kosong | 1. Isi form → refresh → banner muncul<br>2. Klik **Hapus draf** | Banner hilang; form kosong | ☐ / ☐ | |
| 13.6 | Versi skema berubah (simulasi: ganti kunci `localStorage` di DevTools) → draf lama dibuang, tidak error | 1. Buka DevTools Application → LocalStorage<br>2. Ganti key `esniffer:batch-draft-v1` → `esniffer:batch-draft-v2`<br>3. Refresh | Form kosong, tidak crash | ☐ / ☐ | |

---

## Butir 14. Mobile-First (360 px, Target Sentuh, Kamera, Sticky Footer)

| # | Skenario Uji | Langkah | Hasil Diharapkan | Hasil | Catatan |
|---|--------------|---------|------------------|-------|---------|
| 14.1 | **Wizard**: buka di **360 px** (DevTools device toolbar iPhone SE / Galaxy S5) | 1. Buka `/batches/new` di 360 px<br>2. Scroll ke field groups | Grid field **1 kolom** (`grid-cols-1 sm:grid-cols-2`); input tidak menyempit/terpotong | ☐ / ☐ | |
| 14.2 | **Footer navigasi step (Kembali / Lanjut / Simpan) sticky di bawah** | 1. Scroll ke bawah wizard panjang<br>2. Periksa footer | Tombol selalu terlihat di bawah viewport; tidak menutupi input terakhir | ☐ / ☐ | |
| 14.3 | **Target sentuh ≥44 px**: tombol, input, checkbox, radio | 1. Ukur tinggi tombol/input di DevTools (Elements → Computed) | `min-height: 44px` atau `min-h-[44px]` di semua kontrol interaktif | ☐ / ☐ | |
| 14.4 | **Input foto**: `capture="environment"` → kamera belakang langsung terbuka di HP | 1. Buka di **HP asli** (bukan DevTools)<br>2. Klik input foto di step Pengadaan/Pengelompokan | Kamera belakang (environment) terbuka langsung, bukan galeri | ☐ / ☐ | |
| 14.5 | **Detail batch**: kartu grup & sesi responsif 1 kolom | 1. Buka detail batch di 360 px | Tidak ada scroll horizontal; kartu menyesuaikan lebar | ☐ / ☐ | |
| 14.6 | **Dashboard Tabel Riwayat**: gulir horizontal terkendali (tidak pecah layout) | 1. Buka dashboard di 360 px<br>2. Scroll tabel | Tabel gulir horizontal di dalam container; sidebar/header tidak ikut geser | ☐ / ☐ | |
| 14.7 | **Grafik**: tinggi penuh, tidak terpotong | 1. Buka chamber di 360 px | Grafik `min-h-[320px] sm:min-h-[220px]` terlihat utuh | ☐ / ☐ | |

---

## Ringkasan Hasil Keseluruhan

| Butir | Total Skenario | Lolos | Gagal | Blokir | Catatan |
|-------|----------------|-------|-------|--------|---------|
| 1. Chamber/Non-chamber | 6 |   |   |   | |
| 2. Foto + Caption Grup | 4 |   |   |   | |
| 3. Edit per Section | 5 |   |   |   | |
| 4. Hapus Dropdown Device | 3 |   |   |   | |
| 5. Jam Device + CSV Pecah | 5 |   |   |   | |
| 6. Supermarket | 3 |   |   |   | |
| 7. Cool Box Pasar/Lab | 4 |   |   |   | |
| 8. Label Suhu Sebelum Obs | 3 |   |   |   | |
| 9. Notifikasi Warmup | 7 |   |   |   | |
| 10. Filter Riwayat + Preset | 6 |   |   |   | |
| 11. Judul Grafik + Copywriting | 3 |   |   |   | |
| 12. Wizard 3 Langkah | 8 |   |   |   | |
| 13. Draf localStorage | 6 |   |   |   | |
| 14. Mobile-First | 7 |   |   |   | |
| **TOTAL** | **75** |   |   |   | |

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
*Versi: 19 Oktober 2026 | Kode: `main` commit `cfdb3c5` (merge fase 5)*