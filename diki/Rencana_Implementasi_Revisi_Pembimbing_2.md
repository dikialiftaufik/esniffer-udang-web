# Rencana implementasi revisi pembimbing (putaran 2)

Dokumen ini merencanakan 14 revisi dari pembimbing untuk web e-sniffer. Setiap butir berisi keputusan desain, kondisi terkini yang terlacak di kode, perubahan per lapisan (DB, API, UI, teks), dan uji penerimaan yang bisa dijalankan. Eksekusi dijalankan per fase: database dulu, lalu lib/API, lalu UI, lalu sinkronisasi dokumen pengguna.

Rencana putaran sebelumnya tidak diubah; dokumen ini melengkapinya, bukan menggantikannya (lihat `diki/Rencana_Implementasi_Revisi_Pembimbing.md`).

## 1. Ringkasan

| # | Revisi | DB | Fase | Kompleksitas |
|---|--------|----|------|--------------|
| 1 | Kelompok dingin: pilihan chamber / non-chamber | Tambah kolom mode penyimpanan | 1 | Rendah |
| 2 | Foto + caption di step pengelompokan wizard | `batch_photos.group_id` nullable | 1, 3 | Sedang |
| 3 | Form edit per section di halaman detail batch | Tidak ada | 2, 3 | Sedang |
| 4 | Hapus dropdown device per section | Tidak ada | 3 | Rendah |
| 5 | Tanggal/jam dari jam device; CSV pecah kolom tanggal dan jam | Tidak ada (header CSV berubah) | 2, 3 | Sedang |
| 6 | `supermarket` sebagai pilihan jenis sumber udang | Enum `source_type` tambah nilai | 1, 3 | Rendah |
| 7 | Cool box min/max menjadi suhu saat di pasar dan saat di lab | Rename dua kolom | 1, 2, 3 | Rendah |
| 8 | Rename "Suhu dalam udang saat tiba" menjadi "Suhu udang sebelum observasi" | Tidak ada | 3 | Rendah |
| 9 | Notifikasi warmup selesai (modal, audio, bell, riwayat, tandai baca) | Tabel `notifications` | 1, 2, 3 | Tinggi |
| 10 | Tabel riwayat dashboard: filter tanggal/jam + preset cepat | Tidak ada | 2, 3 | Sedang |
| 11 | Judul grafik dan pembersihan copywriting | Tidak ada | 3 | Rendah |
| 12 | Struktur wizard tiga langkah: pengadaan, kondisi & dokumentasi, pengelompokan | Tidak ada | 3 | Sedang |
| 13 | Draf form batch baru tersimpan sementara (isi di lab, lanjut di pasar) | Tidak ada | 3 | Sedang |
| 14 | Mobile-first untuk wizard, detail batch, dan dashboard | Tidak ada | 3 | Sedang |

Lima migrasi database, urut fase 1:

1. Enum `source_type` tambah nilai `SUPERMARKET` (butir 6).
2. `sample_groups.cold_storage_mode` (butir 1).
3. Rename `cooler_temp_min_c` menjadi `cooler_temp_market_c`, `cooler_temp_max_c` menjadi `cooler_temp_lab_c` (butir 7).
4. `batch_photos.group_id` nullable (butir 2).
5. Tabel `notifications` (butir 9).

## 2. Per butir

### Butir 1. Kelompok dingin: chamber atau langsung kulkas

**Keputusan.** Tambah kolom `cold_storage_mode` pada `sample_groups` dengan nilai enum `CHAMBER` (udang dalam wadah berisi chamber) atau `PLAIN_FRIDGE` (udang diletakkan langsung di kulkas). Kolom hanya diisi untuk `storage_condition = COLD`; grup ruang memakai nilai default `CHAMBER` tanpa perubahan perilaku.

**Kondisi terkini.** `SampleGroup.chamberId` sudah nullable (`prisma/schema.prisma:280`), tetapi tidak ada penanda eksplisit mode penyimpanan, sehingga data "dingin tanpa chamber" tidak dapat dibedakan dari "chamber belum dipilih". Label grup di `app/batches/new/page.tsx:1028` dan `app/batches/[batchId]/page.tsx:575` menulis "Suhu Dingin (4 ± 1 °C)" tanpa pembeda mode.

**Perubahan.**
- DB (sudah dieksekusi, fase 1): enum baru `ColdStorageMode`, kolom `cold_storage_mode` default `CHAMBER`; backfill jujur — baris `COLD` lama tanpa `chamber_id` diisi `PLAIN_FRIDGE` (8 baris di DB dev); CHECK `sample_groups_plain_fridge_no_chamber` (`PLAIN_FRIDGE` wajib tanpa chamber) ditegakkan di DB. CHECK `COLD+CHAMBER wajib chamberId` **sengaja tidak dipasang di DB**: grup dingin dibuat di wizard tanpa chamber lalu ditautkan saat sesi dibuat, jadi `chamber_id` kosong adalah keadaan sah antara wizard dan penugasan — aturan ini ditegakkan di lapisan API (poin berikut), bukan batasan tabel.
- API (sudah dieksekusi, fase 2): payload buat (`POST /batches/[batchId]/groups`) dan ubah (`PATCH /api/v1/groups/[groupId]`) menerima `coldStorageMode`; `PLAIN_FRIDGE` hanya sah untuk grup cold dan wajib tanpa chamber (didukung CHECK DB). Aturan "grup `CHAMBER` berkondisi dingin wajib `chamberId` terisi" ditegakkan di **endpoint sesi** (`POST /groups/[groupId]/sessions`), bukan payload grup: chamber memang dipilih saat memulai sesi di halaman detail (`chSel`), bukan saat grup dibuat di wizard — grup dingin sah berstatus "chamber belum ditugaskan" antara kedua tindakan itu.
- UI: wizard step pengelompokan dan halaman detail menampilkan pilihan "Dalam chamber" / "Langsung di kulkas"; pilihan langsung kulkas menyembunyikan pemilihan chamber.
- Teks: judul grup pada `app/batches/[batchId]/page.tsx:575` menjadi "Dingin non-chamber (4 ± 1 °C)" atau "Dingin, chamber (4 ± 1 °C)" sesuai mode.

**Uji penerimaan.**
- Test DB (sudah hijau, fase 1): grup `COLD` + `PLAIN_FRIDGE` tersimpan tanpa `chamberId`; `PLAIN_FRIDGE` dengan `chamberId` ditolak CHECK; index & unique tabel notifications terkunci.
- Test API (sudah hijau, fase 2): grup `COLD` + `CHAMBER` tanpa `chamberId` ditolak di endpoint sesi (`test/api/dataset-batches.test.ts` test 12d); mode dua arah `plain_fridge ↔ chamber` di `PATCH` grup.
- Uji manual: buat batch dengan satu grup dingin non-chamber, judul section di halaman detail menampilkan mode dengan benar.

**Risiko.** Kriteria ambang stabil notifikasi (butir 9) memakai ambang berbeda per mode penyimpanan; kolom ini menjadi input kriteria tersebut.

### Butir 2. Foto udang di step pengelompokan

**Keputusan.** Foto dengan caption diizinkan pada step pengelompokan, disimpan pada tabel `batch_photos` yang sama dengan foto pengadaan, dibedakan dengan kolom `group_id` nullable. Foto tanpa `group_id` tetap foto batch (pengadaan); foto dengan `group_id` milik grup itu.

**Kondisi terkini.** Foto + caption hanya ada di step pengadaan (`app/batches/new/page.tsx`). `BatchPhoto` terikat `batchId` saja (`prisma/schema.prisma:262`), tanpa tautan grup, sehingga foto per grup belum dapat disimpan.

**Perubahan.**
- DB: `batch_photos.group_id` nullable, foreign key ke `sample_groups.group_id`, indeks `(batch_id, group_id)`.
- API (sudah dieksekusi, fase 2): endpoint upload foto batch menerima `groupId` opsional (divalidasi milik batch yang sama, 404 bila tidak terdaftar); daftar foto kini menyertakan `groupId` (test API 4c hijau).
- UI: step pengelompokan tiap grup memuat area unggah foto dengan caption, identik dengan pola step pengadaan; halaman detail menampilkan foto per grup di section grupnya.

**Uji penerimaan.**
- Test DB dan API: foto dengan `groupId` valid tersimpan dan muncul pada daftar foto grup; foto dengan `groupId` tidak dikenal ditolak.
- Uji manual: unggah foto + caption di step pengelompokan, buka halaman detail, foto tampil di section grup yang benar.

**Risiko.** Ekspor metadata batch memuat `photo_count` per batch (`lib/api/csv.ts:143`); keputusan perlu ditetapkan apakah `photo_count` menghitung semua foto atau foto pengadaan saja. Usulan: `photo_count` tetap jumlah semua foto, ditambah kolom baru `group_photo_count` opsional bila pembimbing meminta perincian.

### Butir 3. Form edit per section di halaman detail batch

**Keputusan.** Tiap section grup di halaman detail batch mendapat tombol "Edit" yang membuka form berisi kolom yang sama dengan step pengelompokan wizard: Suhu udang (°C) (`lab_temp_c`), Berat sampel sebelum observasi (g) (`lab_weight_before_g`), Berat sampel sesudah observasi (g) (`lab_weight_after_g`), dan foto udang untuk dokumentasi (butir 2).

**Kondisi terkini.** Halaman detail batch bersifat baca-saja (`app/batches/[batchId]/page.tsx`). Kolom target sudah ada di tabel `sample_groups` (`prisma/schema.prisma:283-286`), sehingga tidak perlu kolom baru; yang belum ada adalah endpoint pembaruan grup.

**Perubahan.**
- API (sudah dieksekusi, fase 2): `PATCH /api/v1/groups/[groupId]` dengan body parsial (`labTempC`, `labWeightBeforeG`, `labWeightAfterG`, `coldStorageMode`); ditolak bila batch sudah terkunci (`lockedAt` terisi). Setiap field memakai parser lib yang sama dengan pembuatan grup (test API 12b hijau: 200/422/404/409).
- UI: tombol Edit per section, form modal atau inline dengan validasi identik wizard (rentang suhu, berat sesudah tidak boleh sembarangan lebih kecil dari sebelum tanpa catatan), simpan memakai `apiFetch` dengan pesan error yang sudah dipakai halaman ini.
- Teks: label kolom mengikuti penamaan hasil butir 8, sehingga form edit dan wizard memakai satu sumber teks yang sama.

**Uji penerimaan.**
- Test API: perubahan tersimpan dan terbaca kembali; batch terkunci ditolak 409.
- Uji manual: ubah berat sampel lewat halaman detail, muat ulang halaman, nilai baru tampil dan masuk ekspor metadata CSV.

**Risiko.** Validasi duplikat antara wizard dan endpoint update; solusi: validasi terpusat di `lib/` yang dipakai keduanya, bukan disalin.

### Butir 4. Hapus dropdown device per section

**Keputusan.** Pemilihan device dihapus dari setiap section. Device tertaut otomatis dari chamber yang dipilih (alat sudah pasti `esp-32-001`); kolom device di UI cukup menampilkan "Device: esp-32-001" sebagai teks.

**Kondisi terkini.** Dropdown `devSel` per grup memuat daftar device dari `GET /api/v1/devices` (`app/batches/[batchId]/page.tsx:203-211, 820-828`). Bila chamber terisi, `deviceId` diambil dari pemetaan device ke chamber; bila kosong, sesi tidak punya data sensor.

**Perubahan.**
- UI: hapus state `devSel` dan dropdown; saat chamber dipilih, `deviceId` diisi otomatis dari pemetaan chamber ke device dan ditampilkan sebagai teks baca-saja.
- Tidak ada perubahan DB atau API.

**Uji penerimaan.**
- Uji manual: pilih chamber pada sesi, teks "Device: esp-32-001" muncul tanpa interaksi; data sensor tetap tertaut setelah sesi di-complete.

**Risiko.** Bila suatu saat ada lebih dari satu device per chamber, keputusan ini perlu ditinjau ulang; catat di dokumen ini sebagai asumsi tunggal-alat-per-chamber.

### Butir 5. Tanggal dan jam dari jam device, CSV pecah kolom

**Keputusan.** Input "Tanggal dan jam beli (WIB)" dan "Tanggal dan jam tiba di lab (WIB)" diisi otomatis dari jam device pengguna (peramban), tetap dapat diedit manual. Ekspor CSV memecah setiap timestamp menjadi kolom tanggal dan kolom jam terpisah (tanggal `YYYY-MM-DD`, jam `HH:MM:SS`, zona WIB dikonversi dari UTC yang tersimpan).

**Kondisi terkini.** Kedua input adalah `datetime-local` kosong yang diisi manual (`app/batches/new/page.tsx:785-825`); disimpan sebagai UTC (`procured_at_utc`, `arrived_at_utc`). CSV metadata memuat `procured_at_utc` dan `arrived_at_utc` sebagai satu kolom ISO (`lib/api/csv.ts:129,138`).

**Perubahan.**
- UI: `useState` untuk kedua field diisi `toISOString()` yang dikonversi ke format `datetime-local` saat komponen mount; validasi jendela 06:00-08:00 WIB tetap berlaku atas nilai hasil device, dengan pesan galat yang menjelaskan bahwa jam device dipakai.
- Lib/API (sudah dieksekusi, fase 2): header CSV metadata berubah; `procured_at_utc` menjadi `procured_date` dan `procured_time_wib`, `arrived_at_utc` menjadi `arrived_date` dan `arrived_time_wib`. Sumber nilai tetap kolom UTC di database, konversi zona waktu dilakukan di pembuat CSV (`toWibParts`, bukan di form).
- Teks: petunjuk di bawah input menegaskan jam device dipakai, sehingga jam device harus benar dulu.

**Uji penerimaan.**
- Test unit (sudah hijau, fase 2): konversi UTC ke WIB menghasilkan tanggal dan jam yang benar termasuk kasus lewat tengah malam (`toWibParts`).
- Test API (sudah hijau, fase 2): baris CSV memuat empat kolom pengganti dua kolom lama, lebar baris konsisten.
- Uji manual: buka wizard, kedua field sudah terisi jam sekarang; ubah jam device, isi ulang, nilai berubah.

**Risiko.** Header CSV berubah, sehingga konsumen lama (skrip analisis) perlu disesuaikan; perubahan dicatat di panduan pemula §8 dan di catatan rilis.

### Butir 6. Pilihan "supermarket" pada jenis sumber udang

**Keputusan.** Enum `source_type` bertambah nilai `SUPERMARKET`. `market_source` (teks bebas nama tempat) tetap seperti sekarang.

**Kondisi terkini.** `CollectionSourceType` berisi `MARKET` dan nilai lain yang ada (`prisma/schema.prisma:238`). UI "Jenis sumber" di `app/batches/new/page.tsx:883`.

**Perubahan.**
- DB (sudah dieksekusi, fase 1): migrasi `ALTER TYPE ... ADD VALUE 'SUPERMARKET'`. API parser `sourceType` menerima `supermarket` (fase 2).
- UI: pilihan "Supermarket" pada dropdown jenis sumber, label tampilan "Supermarket" di halaman detail (`SOURCE_LABEL`).
- CSV: nilai enum masuk tanpa perubahan header.

**Uji penerimaan.**
- Test DB: batch dengan `source_type = SUPERMARKET` tersimpan.
- Uji manual: buat batch supermarket, label tampil di detail dan di CSV metadata.

**Risiko.** Tidak ada; penambahan nilai enum bersifat mundur-sinkron.

### Butir 7. Cool box: dari min/max menjadi saat di pasar dan saat di lab

**Keputusan.** Kolom `cooler_temp_min_c` dan `cooler_temp_max_c` di-rename menjadi `cooler_temp_market_c` (suhu cool box saat di pasar) dan `cooler_temp_lab_c` (suhu cool box saat di lab). Arti kedua kolom berubah dari rentang menjadi dua titik pengukuran di dua lokasi; kolom keduanya menjadi wajib diisi terpisah (dua angka, bukan satu rentang).

**Kondisi terkini.** `coolerTempMinC`/`coolerTempMaxC` (`prisma/schema.prisma:246-247`), label "Suhu cool box min (°C)" dan "Suhu cool box max (°C)" (`app/batches/new/page.tsx:946-952`), tampilan "Suhu cool box min-max (°C)" di detail (`app/batches/[batchId]/page.tsx:552`). Header CSV `cooler_temp_min_c`, `cooler_temp_max_c` (`lib/api/csv.ts:139-140`).

**Perubahan.**
- DB: rename kolom; konversi nilai lama: `min` menjadi `market`, `max` menjadi `lab` (nilai lama adalah rentang di lokasi pembelian, keputusan terbaik yang tersedia; dicatat sebagai asumsi migrasi).
- UI: dua field terpisah "Suhu cool box saat di pasar (°C)" dan "Suhu cool box saat di lab (°C)" di langkah "Kondisi & dokumentasi" (butir 12), validasi 0-4 °C masing-masing; tampilan detail menampilkan dua nilai terpisah.
- CSV (sudah dieksekusi, fase 2): header baru `cooler_temp_market_c`, `cooler_temp_lab_c`.
- Teks: validasi durasi perjalanan (deviasi 3 jam) tetap, dan petunjuk menjelaskan pengukuran dilakukan di dua lokasi.

**Uji penerimaan.**
- Test DB: kedua kolom baru terbaca; nilai lama terkonversi.
- Test API: CSV memuat dua header baru.
- Uji manual: buat batch baru dengan dua suhu terisi, halaman detail menampilkan "Saat di pasar: x °C, Saat di lab: y °C".

**Risiko.** Konversi nilai lama bersifat perkiraan (min/max bukan pengukuran di lokasi); data lama tetap terbaca, interpretasinya dicatat di panduan §8.

### Butir 8. Rename label suhu udang

**Keputusan.** Label "Suhu dalam udang saat tiba (°C)" menjadi "Suhu udang sebelum observasi (°C)" di semua tempat. Kolom database `initial_temp_c` tidak berubah; hanya teks label.

**Kondisi terkini.** Label di `app/batches/new/page.tsx:568` dengan petunjuk "Ukur dengan termometer tusuk saat udang tiba."

**Perubahan.** UI saja: label dan petunjuk; petunjuk menjadi "Ukur dengan termometer tusuk tepat sebelum observasi dimulai."

**Uji penerimaan.** Uji manual: label baru tampil di wizard dan di halaman detail.

**Risiko.** Tidak ada.

### Butir 9. Notifikasi warmup selesai

**Keputusan.** Saat sensor stabil menurut ambang di bawah, sistem membuat notifikasi: popup/modal yang harus ditutup manual, audio pemutaran `assets/Better Call Saul Ringtone.mp3`, ikon bell dengan riwayat dan penanda sudah dibaca. Kriteria stabil dihitung per sesi aktif, per sensor, per kondisi penyimpanan, pada jendela 10 menit terakhir data.

**Kondisi terkini.** Tidak ada tabel notifikasi. Sesi sudah memuat `warmup_done` (flag manual, `lib/api/csv.ts:159`) dan baseline per sensor (`baseline_mq137` dsb.). Data reading tersedia di worker dan di history API. File audio belum ada di repo (`public/assets/` kosong); prasyarat: file `Better Call Saul Ringtone.mp3` diletakkan di `public/assets/`.

**Tabel ambang stabil** (per sensor, per kondisi; nilai menurut pembimbing):

| Sensor | Metrik "stabil" | Suhu ruang (25±2 °C) | Dingin non-chamber (4±1 °C) | Dingin dengan chamber (4±1 °C) |
|--------|-----------------|----------------------|-----------------------------|--------------------------------|
| MQ-137 (NH₃) | Rentang max-min | ≤ ±2% dari rata-rata (≈ ±9 ADC pada 450) | ≤ ±5% (≈ ±22 ADC) | ≤ ±3% (≈ ±14 ADC) |
| | CV (SD/rata-rata) | ≤ 1% | ≤ 3% | ≤ 2% |
| | Tren (drift) | ≤ 1% per 10 menit | ≤ 2% per 10 menit | ≤ 1,5% per 10 menit |
| MQ-136 (H₂S) | Rentang max-min | ≤ ±2% | ≤ ±5% | ≤ ±3% |
| | CV | ≤ 1% | ≤ 3% | ≤ 2% |
| | Tren (drift) | ≤ 1% per 10 menit | ≤ 2% per 10 menit | ≤ 1,5% per 10 menit |
| MQ-4 (CH₄) | Rentang max-min | ≤ ±2% (≈ ±6 ADC pada 280) | ≤ ±5% (≈ ±14 ADC) | ≤ ±3% (≈ ±8 ADC) |
| | CV | ≤ 1% | ≤ 3% | ≤ 2% |
| | Tren (drift) | ≤ 1% per 10 menit | ≤ 2% per 10 menit | ≤ 1,5% per 10 menit |
| DHT22 suhu | Rentang max-min | ≤ ±0,5 °C | ≤ ±1,0 °C (siklus kompresor) | ≤ ±0,5 °C |
| DHT22 RH | Rentang max-min | ≤ ±2% RH | ≤ ±3% RH | ≤ ±2% RH, dan RH < 95% |

Pembacaan tabel: notifikasi hanya dikirim bila semua sensor lolos ketiga metriknya pada jendela yang sama; kondisi dingin memakai kolom sesuai `cold_storage_mode` (butir 1); nilai ambang adalah parameter di `lib/`, bukan hardcode di tempat perhitungan, agar mudah dikalibrasi dengan data alat nyata.

**Perubahan.**
- DB: tabel `notifications` (`id`, `user_id`, `batch_id` nullable, `session_id` nullable, `kind`, `message`, `read_at` nullable, `created_at`), indeks `(user_id, created_at)`.
- Worker: perhitungan stabilitas pada jendela 10 menit terakhir (rentang, CV, regresi linear sederhana untuk drift) per sensor sesi aktif; bila lolos semua ambang, buat notifikasi untuk pengguna yang bertugas (operator sesi), sekali per sesi (penanda: notifikasi sudah ada untuk `session_id` itu, bukan timer).
- API (sudah dieksekusi, fase 2): `GET /api/v1/notifications` (riwayat, paginasi keyset), `GET /api/v1/notifications/unread-count`, `PATCH /api/v1/notifications/[id]/read` (idempoten) dan `PATCH /api/v1/notifications/read-all` — semua berlapis autentikasi per user (test `test/api/notifications.test.ts` hijau 5/5).
- UI: ikon bell di `components/layout/Header.tsx` dengan lencana jumlah belum dibaca, dropdown riwayat, modal notifikasi baru (wajib tombol tutup, tidak auto-close), audio diputar dari `public/assets/Better Call Saul Ringtone.mp3` dengan tombol senyap; pemutaran audio hanya setelah interaksi pengguna pertama pada halaman (kebijakan autoplay peramban) dan dicatat di petunjuk pengguna.
- Teks: pesan notifikasi "Sensor stabil, sesi siap dimulai" (satu kalimat, tanpa kode teknis).

**Uji penerimaan.**
- Test unit: perhitungan rentang/CV/drift pada data sintetis lolos dan tidak lolos ambang (kasus: siklus kompresor di luar ambang, kasus drift).
- Test API (sudah hijau, fase 2): riwayat, unread-count, mark-read, read-all.
- Uji manual dengan alat nyata: jalankan sesi, tunggu stabil, modal muncul, audio berbunyi, bell menampilkan riwayat, penanda terbaca berkurang setelah ditutup/dibaca.

**Risiko.** Kriteria stabil sangat bergantung pada karakter alat nyata; ambang siap di kalibrasi (nilai awal sesuai tabel, parameter terpusat). Notifikasi perlu idempoten: satu sesi hanya menghasilkan satu notifikasi stabil.

### Butir 10. Tabel riwayat dashboard: rentang tanggal/jam + preset cepat

**Keputusan.** Panel "Tabel Riwayat" di dashboard selalu menampilkan angka sensor dari data tersimpan (riwayat database), bukan hanya tick live, sehingga tetap berfungsi tanpa alat terhubung. Menambah filter rentang tanggal/jam (dari, sampai) dan tombol preset cepat: Hari ini, 7 hari, 30 hari, 1 tahun.

**Kondisi terkini.** Panel `components/layout/ExportPanel.tsx:268` memanggil `lib/api/history.ts` yang membaca tabel reading tersimpan; ketika tidak ada koneksi alat, rentang default (beberapa menit terakhir) kosong sehingga angka tidak muncul.

**Perubahan.**
- UI: di atas tabel, dua input `datetime-local` (dari, sampai) dan empat tombol preset; preset mengisi kedua input (Hari ini: awal hari sampai sekarang; dst.). Perubahan filter memicu fetch ulang dengan parameter `from`/`to` ke history API yang sudah ada, memakai debounce.
- Lib/API (sudah dieksekusi, fase 2): batas rentang history API diperluas 31 → 366 hari; limit baris tetap dengan pagination kursor yang sudah ada (test API 4b hijau: `from` 6 bulan lalu mengembalikan baris).
- Teks: judul tabel dan petunjuk "Data dari riwayat tersimpan; tidak perlu alat terhubung".

**Uji penerimaan.**
- Test API: query dengan `from`/`to` jauh ke belakang mengembalikan baris yang ada di database.
- Uji manual: matikan alat, buka dashboard, pilih rentang 30 hari, angka muncul; preset Hari ini mengisi input dengan benar.

**Risiko.** Rentang lebar pada data besar dapat membebani query; mitigasi: pagination kursor dan batas rentang yang jelas di pesan galat.

### Butir 11. Judul grafik dan pembersihan copywriting

**Keputusan.** Judul grafik pada `components/charts/ChartPanel.tsx:249` menjadi "Pergerakan Sensor Gas Aktif". Bersamaan dengan itu, tinjauan teks di seluruh halaman terkait revisi di atas memakai panduan penulisan UX (label tombol kata kerja aktif, satu istilah untuk satu konsep, tanpa jargon teknis yang tidak dijelaskan).

**Perubahan.**
- UI: judul grafik; peninjauan teks pada wizard, detail batch, dan panel ekspor (misal: konsistensi "Suhu dingin" vs "Dingin", "observasi" vs "pengukuran").
- Teks: daftar perubahan dicatat di panduan pemula §8 bila mempengaruhi istilah yang dijelaskan di sana.

**Uji penerimaan.** Uji manual: judul baru tampil; pencarian teks lama di `app/` dan `components/` tidak menemukan sisa istilah yang diganti.

**Risiko.** Tidak ada.

### Butir 12. Struktur wizard tiga langkah: pengadaan, kondisi & dokumentasi, pengelompokan

**Keputusan.** Wizard batch baru dipecah dari dua langkah menjadi tiga. Langkah "Pengadaan" tetap memuat kolom logistik pembelian: tanggal/waktu beli dan tiba di lab (isi dari jam device, butir 5), jenis sumber (butir 6), dan sumber sebagai teks bebas. Langkah baru "Kondisi & dokumentasi" di antara pengadaan dan pengelompokan memindahkan ke dalamnya kolom kondisi udang yang dulu ada di pengadaan: kondisi awal udang, jumlah udang, ukuran, panjang udang, berat total, suhu udang sebelum observasi (butir 8), dua suhu cool box (butir 7), dan unggah foto dokumentasi dengan caption. Label "Sumber pasar" diganti menjadi "Sumber", karena pilihan sumber kini mencakup supermarket (butir 6) dan opsi lain, bukan hanya pasar.

**Kondisi terkini.** Wizard dua langkah `const steps = ['Pengadaan', 'Pengelompokan']` (`app/batches/new/page.tsx:470`), semua kolom pengadaan dalam satu langkah (`app/batches/new/page.tsx:773-1010`), label "Sumber pasar" (`app/batches/new/page.tsx:855`), pemetaan galat ke langkah lewat `stepOf` dua cabang (`app/batches/new/page.tsx:408-412`).

**Perubahan.**
- UI: `steps` menjadi `['Pengadaan', 'Kondisi & dokumentasi', 'Pengelompokan']`; JSX langkah 0 dipotong dua (kolom logistik tetap, kolom kondisi + foto pindah ke langkah 1); tombol "Lanjut" di kedua langkah pertama menuju langkah berikutnya; `stepOf` pada `handleSubmit` bertambah satu cabang untuk kolom langkah baru; indikator "Langkah X dari 2" menjadi "dari 3" (`app/batches/new/page.tsx:713`).
- Teks: "Sumber pasar" menjadi "Sumber" dengan petunjuk "Nama lokasi pembelian, misal: Pasar Induk Kramat Jati, Supermarket X"; tombol "Lanjut ke Pengelompokan" tetap di langkah terakhir sebelum pengelompokan.
- Tidak ada perubahan DB atau API: payload submit (`app/batches/new/page.tsx:419-432`) identik, hanya urutan pengisian yang berubah.

**Uji penerimaan.**
- Test unit: validator per langkah (`validateStepA`, `validateStepC`, kini bertambah satu) memecah galat ke langkah yang benar; submit dari langkah terakhir memuat semua field.
- Uji manual: isi ketiga langkah, navigasi maju mundur mempertahankan semua nilai; galat wajib diisi melompat ke langkah yang tepat; foto unggah di langkah baru muncul di langkah pengelompokan tanpa gangguan.

**Risiko.** Pemecahan `stepOf` dan fokus galat (`focusFirstError`) rawan regresi; mitigasi: perbarui pemetaan langkah dan uji kasus galat lintas langkah.

### Butir 13. Draf form batch baru yang tersimpan sementara

**Keputusan.** Isian form batch baru disimpan otomatis ke `localStorage` dengan debounce, sehingga pengguna yang mulai mengisi di lab dan melanjutkan di pasar tidak perlu mengisi ulang dari awal. Saat membuka halaman batch baru dan ada draf tersimpan, tampilkan banner "Lanjutkan draf dari [tanggal/jam]?" dengan tombol Lanjutkan dan Hapus draf; draf dihapus otomatis setelah batch berhasil dibuat dan oleh tombol Hapus draf.

**Kondisi terkini.** Seluruh state form hidup di `useState` komponen (`app/batches/new/page.tsx:83-152`); memuat ulang halaman atau pindah halaman menghapus isian tanpa jejak.

**Perubahan.**
- Lib: satu modul `lib/batch-draft.ts` dengan `saveDraft`/`loadDraft`/`clearDraft`, kunci versioned (misal `esniffer-batch-draft-v1`) agar perubahan skema di masa depan membuang draf lama dengan aman, bukan membaca bentrok.
- UI: efek komponen menyimpan snapshot field skalar (teks, angka, tanggal/jam, radio, caption foto) dengan debounce beberapa detik; banner pemulihan di atas form. Foto biner TIDAK ikut disimpan (batasan ukuran `localStorage`); bila draf dipulihkan dan ada foto yang belum terkirim, cukup pertahankan caption bila memungkinkan, atau kosongkan dengan pesan "Foto perlu dipilih ulang."
- Teks: banner memuat waktu pembuatan draf dan konsekuensi (foto tidak ikut tersimpan), agar pengguna paham perlu mengambil ulang foto di lokasi.

**Uji penerimaan.**
- Test unit: simpan, muat, dan hapus draf; kunci versi berbeda menghasilkan draf kosong, bukan data bentrok.
- Uji manual: isi separuh form, muat ulang halaman, banner muncul dan tombol Lanjutkan mengembalikan semua nilai skalar; submit sukses menghapus draf; buka wizard lagi, form kosong.

**Risiko.** Draf hanya berlaku di perangkat dan peramban yang sama (`localStorage`); foto biner tidak ikut tersimpan. Keduanya disebut eksplisit di banner, bukan disembunyikan.

### Butir 14. Mobile-first

**Keputusan.** Wizard, halaman detail batch, dan dashboard dirancang untuk layar ponsel dulu, lalu melebar ke tablet dan desktop; alasannya penggunaan lapangan dominan via HP.

**Kondisi terkini.** Form wizard memakai `grid-cols-2` tanpa breakpoint (`app/batches/new/page.tsx:565, 782, 880, 903, 935, 945`), sehingga di layar sempit dua kolom memaksa input menyempit; `inputMode="decimal"`/`"numeric"` sudah ada (`app/batches/new/page.tsx:521, 576, 638, 662, 687`); kartu sudah memakai padding responsif `md:p-6` (`app/batches/new/page.tsx:30`).

**Perubahan.**
- UI: semua `grid-cols-2` pada kelompok field menjadi `grid-cols-1 sm:grid-cols-2`; navigasi langkah dan tombol aksi (Kembali, Lanjut, Simpan) menjadi footer sticky di bawah pada lebar kecil; target sentuh minimal 44 px; input foto mendapat `capture="environment"` agar kamera langsung terbuka di HP; tabel riwayat (butir 10) dan grafik mendapat perlakuan layar sempit (gulir horizontal terkendali untuk tabel, grafik tinggi penuh).
- Tidak ada perubahan DB atau API.

**Uji penerimaan.** Uji manual pada lebar 360 px (peramban HP nyata atau mode devtools): semua field terisi tanpa zoom, footer langkah tidak menutupi input terakhir, foto diambil langsung dari kamera, tabel riwayat terbaca.

**Risiko.** Perubahan className luas dapat menggeser tampilan desktop; mitigasi: breakpoint `sm` (640 px) mempertahankan tampilan tablet dan desktop seperti semula.

## 3. Urutan eksekusi dan prasyarat

| Fase | Isi | Prasyarat |
|------|-----|-----------|
| 1 | Lima migrasi DB (berurutan, satu commit per migrasi) | Tidak ada |
| 2 | Lib/API: CSV pecah kolom (butir 5, 7), endpoint update grup (butir 3), filter riwayat (butir 10), notifikasi (butir 9) | Fase 1 |

**Hasil eksekusi fase 2** (branch `feat/revisi2-fase2-lib-api`, 6 commit, merged ke `main`): CSV pecah kolom + rename header cooler (`7de27ae`), parser `supermarket` (`4c658f6`), `PATCH /groups/[groupId]` + `coldStorageMode` + validasi sesi cold-chamber (`f6cb197`), foto `groupId` (`6ec1163`), rentang history 366 hari (`ffc72c0`), 4 endpoint notifikasi (`9b4b486`). Suite hijau: unit 84/84, db 47/47, api 99/99. Perhitungan stabilitas worker + UI notifikasi tetap di fase 4 ("end-to-end").

**Hasil eksekusi fase 3** (branch `feat/revisi2-fase3-ui`, 13 commit, merged ke `main`; butir 1–4, 5–8, 10–14 lapisan UI): wizard tiga langkah (`79d0568`), waktu otomatis dari jam device (`9816529`), pilihan supermarket (`b681edc`), dua suhu cool box pasar/lab (`f58a359`), label suhu sebelum observasi (`15253b9`), pilihan chamber/kulkas grup dingin + judul grup detail (`a9bd359`), foto per grup pakai `PhotosBlock` + badge SR/SD di detail (`1f63aba`), form edit grup di halaman detail (`6a33980`), dropdown device dihapus (`fc4468c`), draf `localStorage` + test unit 6/6 (`e8bf8f6`), judul grafik Sensor Gas Aktif + konsistensi kata observasi (`e76c156`), filter rentang tabel riwayat preset+kustom (`961782f`), grid mobile-first + footer sticky + kamera langsung (`c0a5e5a`). Suite hijau: unit 90/90, db 47/47, api 99/99. Uji manual menyusul di perangkat (butir 14: target sentuh, kamera; butir 5: jam device).
| 3 | UI: butir 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14 | Fase 2 |
| 4 | Notifikasi end-to-end (modal, bell, audio) | Fase 3, file mp3 di `public/assets/` |

**Hasil eksekusi fase 4** (branch `feat/revisi2-fase4-notifikasi`, 3 commit, merged ke `main`): ambang stabilitas sensor di `lib/stability.ts` + test unit 13/13 (`9910fa5`), worker sweep `warmup_stable` di `worker/stability.ts` + test DB 3/3 (`e236af3`), UI lonceng `NotificationBell.tsx` + `Header.tsx` integrate (`ecaabe3`). Suite akhir semua hijau: typecheck ✓, eslint 0 error, unit 103/103, db 50/50, api 99/99.
| 5 | Sinkronisasi dokumen: panduan pemula §8, logbook dengan blok uji yang bisa dijalankan | Fase 4 |
| 5 | Sinkronisasi dokumen: panduan pemula §8, logbook dengan blok uji yang bisa dijalankan | Fase 4 |

Verifikasi kelima fase: `npm run typecheck`, `npx eslint`, `npm run test:unit`, `npm run test:db`, `npm run test:api` (db dan api dijalankan serial), dan uji manual sesuai butir. Setelah `prisma migrate deploy` atau `prisma generate`, restart `npm run dev`.

## 4. Risiko lintas butir

- **Header CSV berubah dua kali** (butir 5 dan 7): konsumen lama (skrip analisis, template Excel) perlu disesuaikan; dicatat di panduan §8 dan di catatan rilis.
- **Butir 1 mengikat butir 9**: ambang stabil dingin bergantung pada `cold_storage_mode`; migrasi mode harus lebih dulu dari aktivasi perhitungan notifikasi.
- **Nilai migrasi butir 7 bersifat perkiraan** (min/max lama menjadi pasar/lab); data lama tetap terbaca, asumsi dicatat di panduan.
- **Kriteria stabil butir 9 adalah angka awal** yang menunggu kalibrasi dengan data alat nyata; parameter terpusat di `lib/` agar perubahan ambang tidak menyentuh logika.
- **Butir 12 mengubah urutan form** tempat field butir 5, 7, dan 8 berada; pengerjaan butir 5, 7, dan 8 harus mengikuti struktur tiga langkah hasil butir 12, bukan struktur lama.
- **Butir 13 memakai `localStorage`**, sehingga draf tidak pindah antarperangkat dan foto biner tidak ikut tersimpan; keduanya diekspos di banner draf, bukan disembunyikan.
- **Butir 14 menyentuh banyak className** di halaman utama; risiko regresi tampilan desktop diatasi dengan breakpoint `sm` dan uji di 360 px.
