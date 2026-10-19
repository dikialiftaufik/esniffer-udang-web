# Logbook Magang STAS-RG - Proyek E-Sniffer Udang Web

Rentang: 27 Agustus - 13 Oktober 2026 | Setiap entri = 1 kalimat deskriptif
setara satu hari kerja penuh (8 jam) + blok "Uji hari ini" berisi
langkah yang bisa dijalankan sekarang untuk membuktikan pekerjaan hari itu benar.
Hari sakit dikosongkan; tugas studi pengganti tersedia di bagian bawah
bila kampus mewajibkan terisi.

---

## Week 1: 27 - 28 Agustus 2026

**Thursday, 27 Agustus 2026**
Kamu melakukan Pekerjaan Apa Hari Ini ?
Menyiapkan workstation (instalasi dan verifikasi Node.js 22, Git, dan VS Code), mengkloning repo, menjalankan `npm ci` dan menyalakan server lokal untuk pertama kali, lalu menghabiskan sisa harinya membaca `package.json` (memahami tiap skrip npm) dan mencatat isi tiap folder utama sebagai peta orientasi.

Uji hari ini:
1. Jalankan `node --version`, `git --version`, `code --version` — ketiganya menampilkan nomor versi.
2. Jalankan `npm run dev`, tunggu `✓ Ready`, buka `http://localhost:3000`.
Lolos bila: halaman login tampil tanpa error merah di terminal.

**Friday, 28 Agustus 2026**
Kamu melakukan Pekerjaan Apa Hari Ini ?
Memasang PostgreSQL 18 dan Mosquitto secara native, membuat user broker beserta file password dan config lokal, mengirim pesan uji coba dan memastikan pesannya diterima kembali, kemudian menulis catatan instalasi langkah-demi-langkah agar bisa diulang bila ganti laptop.

Uji hari ini:
1. Buka `services.msc` — `postgresql-x64-18` berstatus Running.
2. Di satu terminal: `.\mosquitto_sub.exe -h 127.0.0.1 -p 1883 -u worker -P workerpass123 -t "test/halo" -C 1`; di terminal lain kirim pesan yang sama via `mosquitto_pub`.
Lolos bila: pesan yang dikirim muncul di terminal penerima.

## Week 2: 31 Agustus - 04 September 2026

**Monday, 31 Agustus 2026**
Kamu melakukan Pekerjaan Apa Hari Ini ?
Mengonfigurasi seluruh variabel `.env` (DATABASE_URL, kredensial MQTT, secret aplikasi), menjalankan migrasi dan seed, memverifikasi login admin dan dashboard terhadap database live, lalu menutup hari dengan menjalankan suite unit test pertama untuk melihat kondisi awal proyek.

Uji hari ini:
1. Jalankan `npx prisma migrate deploy` → status "semua migration applied".
2. Jalankan `npm run db:seed` → muncul `Users seeded: admin@esniffer.local`.
3. Login `admin@esniffer.local` / `admin123` di browser.
Lolos bila: masuk dashboard Chamber 1 dan 2 tanpa error.

**Tuesday, 01 September 2026**
Kamu melakukan Pekerjaan Apa Hari Ini ?
Mendalami Next.js 16 yang dipakai proyek (App Router, perbedaan Server dan Client Component, Route Handler) melalui eksperimen halaman dan endpoint lokal.

Uji hari ini:
1. Buka `app/page.tsx`, `app/chamber/[chamberId]/page.tsx`, dan satu file `route.ts` — tunjukkan baris `"use client"` dan bedakan komponen server vs client.
2. Buka `http://localhost:3000/api/health/live` di browser.
Lolos bila: bisa menjelaskan kenapa dashboard berupa Client Component dan endpoint health mengembalikan 200.

**Wednesday, 02 September 2026**
Kamu melakukan Pekerjaan Apa Hari Ini ?
Mengoreksi asumsi awal (Prometheus) dengan mempelajari PostgreSQL + Prisma yang sebenarnya dipakai, meliputi pool koneksi, transaksi, dan constraint database.

Uji hari ini:
1. Buka `prisma/schema.prisma` — tunjukkan 3 model inti (`Chamber`, `Device`, `SensorReading`) dan satu relasi di antaranya.
2. Jalankan query `SELECT COUNT(*) FROM sensor_readings;` via psql.
Lolos bila: bisa menjelaskan kenapa Postgres (bukan Prometheus) yang menjadi source of truth.

**Thursday, 03 September 2026**
Kamu melakukan Pekerjaan Apa Hari Ini ?
Mempelajari TypeScript strict pada proyek (tipe angka desimal/pecahan besar dan aturan impor file yang ditulis lengkap dengan ekstensi `.ts`) sambil memperbaiki error `typecheck` kecil.

Uji hari ini:
1. Jalankan `npm run typecheck` — selesai tanpa error.
2. Buka satu file `shared/*.ts` dan tunjukkan satu impor berektensi `.ts`.
Lolos bila: typecheck hijau dan bisa menjelaskan kenapa impor harus pakai `.ts`.

**Friday, 04 September 2026**
Kamu melakukan Pekerjaan Apa Hari Ini ?
Mempelajari dasar React dari komponen dashboard yang ada (hooks, context, pola Server/Client Component) sebagai bekal sebelum menelusuri kode yang lebih dalam.

Uji hari ini:
1. Buka `components/auth/AuthProvider.tsx` — tunjukkan Context, `useState`, dan `useEffect` di dalamnya.
2. Buka dashboard dan amati angka telemetri berubah sendiri tiap beberapa detik.
Lolos bila: bisa menjelaskan dari mana data polling itu berasal (`useChamberLatest` → endpoint `latest`).

## Week 3: 07 - 11 September 2026

**Monday, 07 September 2026**
Kamu melakukan Pekerjaan Apa Hari Ini ?
Menelusuri kode worker baris per baris (`index.ts`, `pipeline.ts`, `storage.ts`) untuk memahami alur validasi, deduplikasi, dan penyimpanan telemetri, mengintip trafik topik MQTT live pakai `mosquitto_sub`, lalu memeriksa baris-baris `sensor_readings` yang masuk langsung dengan query SQL.

Uji hari ini:
1. Jalankan `mosquitto_sub ... -t "esniffer/v1/devices/+/telemetry" -C 3 -v` saat worker hidup — lihat pesan masuk.
2. Jalankan `SELECT COUNT(*), MAX(measured_at) FROM sensor_readings;` sebelum dan sesudah — bandingkan.
Lolos bila: jumlah baris bertambah dan bisa menjelaskan tahap pipeline yang dilewati pesan.

**Tuesday, 08 September 2026**
Kamu melakukan Pekerjaan Apa Hari Ini ?
Mendalami sistem autentikasi (opaque session, cookie HttpOnly, token CSRF, penguncian akun, peran ADMIN/VIEWER) dengan mencoba langsung endpoint login, session, danlogout memakai curl dan browser.

Uji hari ini:
1. Login salah password 1x → pastikan tetap 401 generik (tidak membocorkan user ada/tidak).
2. Login benar → cek cookie `HttpOnly` + `SameSite=Lax` di devtools; logout → cookie lama jadi 401.
Lolos bila: alur login–sesi–logout–401 terpraktikkan berurutan.

**Wednesday, 09 September 2026**
Kamu melakukan Pekerjaan Apa Hari Ini ?
Mempelajari dokumen SKPL dan technical design beserta PDF protokol pengumpulan dataset, kemudian mengekstrak kebutuhan datanya: batch, berat, suhu, timepoint, baseline, dan format CSV.

Uji hari ini:
1. Buka `docs/esniffer/02-skpl.md` dan `diki/PRD-Dataset-Collection-Protocol-v2.md` — cocokkan 3 kebutuhan (mis. batch, timepoint, CSV) antara keduanya.
2. Sebutkan 4 tahapan protokol (pengadaan, transport, kelompok, akuisisi) tanpa membuka catatan.
Lolos bila: bisa memetakan tiap tahapan protokol ke tabel databasenya.

**Thursday, 10 September 2026**
Kamu melakukan Pekerjaan Apa Hari Ini ?
Menulis PRD fitur pencatatan beserta tabel tiap kolomnya (nama, tipe, contoh isi, aturan validasi, dan tampilan form), lalu mencatat kasus chamber sisa test yang mengotori navigasi dashboard sebagai bahan perbaikan test di kemudian hari.

Uji hari ini:
1. Buka PRD di `diki/` — pilih 1 kolom (mis. `total_weight_g`), tunjukkan tipe, contoh, dan validasinya.
2. Buka header dashboard — pastikan hanya Chamber 1 dan 2 yang tampil.
Lolos bila: tiap kolom PRD punya alasan "kenapa wajib" dan nav bersih dari chamber uji.

**Friday, 11 September 2026**
Kamu melakukan Pekerjaan Apa Hari Ini ?
Menggambar diagram relasi database (ERD dengan simbol standar: kotak untuk data, belah ketupat untuk relasi) dan alur wizard A-D di draw.io, mencocokkannya dengan tahapan protokol, lalu membuat branch `feat/dataset-collection` dan mengeksplorasi skills AI yang dibutuhkan tiap fase sebelum tahap pengkodean.

Uji hari ini:
1. Buka `diki/design/dataset-collection.drawio` — pastikan 2 halaman (User Flow + ERD Chen) terbuka tanpa error.
2. Jalankan `git branch --show-current` dan `git log --oneline -3`.
Lolos bila: diagram terbaca (kotak, belah ketupat, oval atribut) dan branch aktif benar.

## Week 4: 14 - 18 September 2026

**Monday, 14 September 2026**
Kamu melakukan Pekerjaan Apa Hari Ini ?
Menyusun rencana implementasi 8 tahap (database, domain, API, foto, UI, pengaitan data, export, E2E) dan dokumen analisis struktur proyek di folder `diki`, lalu mendiskusikannya dengan pembimbing beserta alur pull request dan cara membaca hasil CI.

Uji hari ini:
1. Buka implementation plan — tunjukkan 8 tahap dan urutannya.
2. Buka halaman Actions repo di GitHub — tunjukkan 1 run CI dan artinya (hijau/merah).
Lolos bila: bisa menjelaskan kenapa API didahulukan sebelum UI.

**Tuesday, 15 September 2026**
Kamu melakukan Pekerjaan Apa Hari Ini ?
Mempelajari arsitektur test berlapis proyek (unit, db, api, e2e) sambil menjalankan seluruh suite beserta `typecheck` dan `eslint` hingga hijau, lalu mencatat hasilnya sebagai acuan pembanding bila nanti ada yang rusak.

Uji hari ini:
1. Jalankan `npm run typecheck`, `npx eslint .`, `npm run test:unit` berurutan.
2. Catat angka pass/fail tiap suite.
Lolos bila: ketiganya hijau dan angka tercatat untuk perbandingan nanti.

**Wednesday, 16 September 2026**
Kamu melakukan Pekerjaan Apa Hari Ini ?
Menindaklanjuti catatan 10 September dengan memperbaiki test auth agar membersihkan chamber buatannya setiap selesai jalan, menjalankan ulang suite API, dan memastikan navigasi kembali bersih (catatan: tanggal ini penempatan penyeimbang; sesuaikan bila tidak tepat).

Uji hari ini:
1. Jalankan `test/api/auth.test.ts` 2x berurutan.
2. Cek daftar chamber di database — hanya CH-01 dan CH-02.
Lolos bila: tidak ada chamber `Valid ...` baru setelah 2x run.

**Thursday, 17 September 2026**
Kamu melakukan Pekerjaan Apa Hari Ini ?
Meninjau ulang PRD, ERD, dan rencana implementasi untuk finalisasi desain (termasuk format ID sesi unik per batch dan kontrak status API huruf kecil), lalu memverifikasi ulang environment (migrasi, seed, login) agar siap mengoding setelah masa cuti.

Uji hari ini:
1. Buka PRD + ERD + plan — pastikan ketiganya konsisten (nama tabel dan kolom sama).
2. Jalankan `npx prisma migrate deploy` + login admin sekali.
Lolos bila: tidak ada nama yang beda antara 3 dokumen dan login sukses.

**Friday, 18 September 2026**
Sakit (izin) - lihat tugas pengganti di bawah bila wajib diisi.

## Week 5: 21 - 25 September 2026

Sakit 1 minggu (izin Senin-Jumat) - lihat tugas pengganti di bawah bila wajib diisi.

## Week 6: 28 September - 02 Oktober 2026

**Monday, 28 September 2026**
Kamu melakukan Pekerjaan Apa Hari Ini ?
Mendalami pola dashboard yang ada (hook polling `useChamberLatest`, interval refresh, dan grafik Recharts) sebagai bekal membangun halaman form setelah masa cuti.

Uji hari ini:
1. Buka `hooks/useChamberLatest.ts` — tunjukkan interval polling dan backoff-nya.
2. Matikan Mosquitto 1 menit saat dashboard terbuka — amati badge berubah (degraded/stale).
Lolos bila: bisa menjelaskan perbedaan state connection vs freshness.

**Tuesday, 29 September 2026**
Kamu melakukan Pekerjaan Apa Hari Ini ?
Memperbaiki error `params is a promise` (kode pembaca alamat halaman harus menunggu datanya dulu di Next.js 16), kemudian memulai fondasi fitur: gitignore untuk foto upload dan konstanta daftar pasar.

Uji hari ini:
1. Buka halaman `/chamber/CH-01` — tidak ada error params di terminal dev.
2. Jalankan `npm run typecheck`.
Lolos bila: halaman chamber terbuka normal dan typecheck hijau.

**Wednesday, 30 September 2026**
Kamu melakukan Pekerjaan Apa Hari Ini ?
Membuat tiga tabel database (`collection_batches`, `sample_groups`, `measurement_sessions`) beserta skrip perubahan database (migration) dan aturan otomatis penolakan data salah di database, menulis 14 test integritas schema, serta memindahkan URL Prometheus yang masih hardcode ke `.env`.

Uji hari ini:
1. Jalankan `test/db/dataset-schema.test.ts` — harus 14/14.
2. Buka pgAdmin — pastikan 3 tabel baru ada.
3. Coba insert `shrimp_count` 5 via SQL — harus ditolak constraint.
Lolos bila: test 14/14 dan insert invalid mental.

**Thursday, 01 Oktober 2026**
Kamu melakukan Pekerjaan Apa Hari Ini ?
Membuat fungsi-fungsi validasi mandiri yang tidak menyentuh database (format ID, timepoint, cold-chain, susut berat, konversi WIB-UTC) beserta 9 unit test-nya, plus memperbaiki navigasi header yang mati memakai komponen `<Link>`.

Uji hari ini:
1. Jalankan `test/dataset.test.ts` — harus 11/11 (9 awal + cutoff + sequences).
2. Klik tab Chamber 1 → Chamber 2 di header — pindah tanpa reload penuh.
Lolos bila: test hijau dan navigasi terasa instan (client-side).

**Friday, 02 Oktober 2026**
Kamu melakukan Pekerjaan Apa Hari Ini ?
Membangun seluruh API batches/groups/sessions/lock dan upload foto banyak file sekaligus (termasuk ID sesi unik per batch agar dua batch sehari tak bertabrakan), semuanya tercakup 22 test API (kasus berhasil maupun kasus gagal seperti data tidak valid, data duplikat, dan akses ditolak ikut diuji).

Uji hari ini:
1. Jalankan `test/api/dataset-batches.test.ts` (14) + `test/api/dataset-photos.test.ts` (8).
2. Buat 1 batch via UI lalu cek `batch_id` otomatisnya di database.
Lolos bila: 22/22 hijau dan ID ter-generate `BT-YYYYMMDD-NN`.

## Week 7: 05 - 09 Oktober 2026

**Monday, 05 Oktober 2026**
Kamu melakukan Pekerjaan Apa Hari Ini ?
Membuat halaman daftar batch, wizard 3 langkah bervalidasi inline lengkap dengan field foto (tambah bertahap, pratinjau, dan hapus per foto), halaman detail batch (pilihan chamber/device agar data tertaut, daftar sesi, upload foto, kunci batch, dan tombol unduh), serta memindahkan tombol Pencatatan ke menu profil dropdown, menampilkan jadwal timepoint dengan grup suhu ruang di urutan pertama, dan merapikan tampilan form dan menu.

Uji hari ini:
1. Buka `/batches/new`, isi jam beli 10:00 → klik Lanjut → error inline merah muncul dan tertahan di tahap A.
2. Sebelum menekan Simpan, pilih 2 foto bertahap → kedua pratinjau tetap tampil (tidak saling menimpa) dan bisa dihapus satu per satu; sesudah Simpan, pilih 2 foto di halaman detail → keduanya tampil sebagai pratinjau sebelum diunggah.
3. Klik avatar → menu berisi Pencatatan + Keluar terpisah divider.
Lolos bila: ketiga perilaku teramati sesuai deskripsi.

**Tuesday, 06 Oktober 2026**
Kamu melakukan Pekerjaan Apa Hari Ini ?
Menyelesaikan pengaitan otomatis baris sensor ke sesi, endpoint buka-ulang sesi `incomplete` beserta pemisahan sesi berjalan/riwayat dan pilihan chamber/device di UI, export CSV data dan metadata, uji alur end-to-end, perbaikan CI dan bug worker di Windows, penggabungan branch yang bertabrakan, pembukaan pull request, dokumentasi panduan, serta debugging login dan broker.

Uji hari ini:
1. Di detail batch: pilih chamber+device → Start sesi H0 → Complete (tanpa data masuk) → sesi pindah ke Riwayat berstatus `incomplete` → klik Ulangi → kembali `open`.
2. Unduh Metadata → kolom form terisi; Unduh CSV Data → `is_baseline` true/false benar.
3. Jalankan `npm run test:api` → 75/75; buka tab Pull requests → PR #1 berstatus merged/able-to-merge.
Lolos bila: siklus ulang sesi, isi kedua CSV, test hijau, dan PR tercatat.

**Wednesday, 07 Oktober 2026**
Kamu melakukan Pekerjaan Apa Hari Ini ?
Memperketat aturan protokol transportasi di tiga lapis (validasi formulir, API, dan constraint database) beserta normalisasi dua batch pengembangan yang terlanjur dibuat dengan aturan sebelumnya agar bisa diperbarui kembali, memperbaiki pemilihan tanggal WIB pada nomor urut batch serta menghitung baseline sesi secara otomatis dari data sensor yang tertaut, membangun alur penghapusan batch dan foto dengan dialog konfirmasi disusul notifikasi sukses pada seluruh aksi perubahan data, menyempurnakan formulir pencatatan lewat sinkronisasi antar langkah, tombol isi data tes, pratinjau foto sebelum unggah, tautan lompat, dan peningkatan kontras petunjuk, lalu menutup hari dengan mengunci waktu pengujian pada dua tes unit yang semula bergantung pada jam serta memeriksa ulang seluruh suite hingga hijau.

Uji hari ini:
1. Jalankan `npm run typecheck`, `npm run lint`, `npm run test:unit`, `npm run test:db`, dan `npm run test:api` — semuanya selesai tanpa error, dengan hasil `test:unit` 75/75, `test:db` 37/37, dan `test:api` 75/75.
2. Buka `/batches/new`, klik `Isi otomatis (data tes)` → field Pengadaan, Transportasi, dan Kelompok langsung terisi; ubah jam berangkat agar mendahului jam beli lalu klik Lanjut → pesan rentang merah muncul dan langkah tertahan.
3. Di daftar batch, centang dua batch lalu klik `Hapus (2)` → dialog konfirmasi muncul; setelah dikonfirmasi, notifikasi sukses tampil di pojok kanan bawah, sama seperti setelah batch dikunci.
4. Pada detail batch yang belum terkunci, pilih dua foto → keduanya tampil sebagai pratinjau dengan tombol hapus dan tombol `Upload (2)` menyala; setelah diunggah, notifikasi sukses tampil dan daftar foto bertambah.
Lolos bila: seluruh pemeriksaan hijau, langkah yang melanggar urutan waktu tertahan, penghapusan serta penguncian meminta konfirmasi lalu mengumumkan hasilnya, dan foto tampil sebagai pratinjau sebelum tersimpan.

**Thursday, 08 Oktober 2026**
Kamu melakukan Pekerjaan Apa Hari Ini ?
Melakukan bimbingan dengan dosen akademik untuk mereview fitur pencatatan dataset yang telah dibangun serta mencatat sepuluh masukan perbaikan formulir sebagai bahan revisi berikutnya.

Masukan dosen akademik:
1. Kolom ukuran diubah ke integer (bilangan bulat).
2. Kondisi awal disederhanakan menjadi 2 pilihan.
3. Setiap foto diberi caption (input teks).
4. Section transport dihapus.
5. Cool box dipindah ke pengadaan.
6. Kolom berangkat dihapus.
7. Suhu cukup dicatat di pengadaan dan kelompok.
8. Ditambahkan foto udang sebelum diobservasi.
9. Ditambahkan kolom ukuran.
10. Label berat di lab diganti menjadi sebelum dan sesudah diobservasi.

Uji hari ini:
1. Buka `/batches/new` — tunjukkan tiap field yang disebut masukan (kolom ukuran, kondisi awal, section transport, cool box, kolom berangkat, field suhu, upload foto, label berat lab).
2. Cocokkan kesepuluh masukan dengan field di formulir — tiap masukan harus tertuju ke field atau section yang jelas.
Lolos bila: seluruh masukan tercatat dan tiap masukan terpetakan ke bagian formulir yang akan direvisi.

**Friday, 09 Oktober 2026**
Kamu melakukan Pekerjaan Apa Hari Ini ?
Menerapkan kesebelas masukan dosen pembimbing pada branch `revisi-pembimbing`, meliputi ukuran otomatis dan kolom panjang, kondisi awal dua pilihan, caption foto, penghapusan section transport beserta kolom berangkat dan suhu transport, pemecahan berat lab, pengelompokan daftar per pasar, dan penulisan ulang teks antarmuka, disertai migrasi database, pembaruan test, dokumentasi pendukung, serta push branch ke remote.

Uji hari ini:
1. Jalankan `git branch --show-current` → `revisi-pembimbing`; `git log --oneline` → deretan commit revisi; `git status` bersih untuk file terlacak.
2. Jalankan `npm run typecheck`, `npx eslint` pada file yang diubah, `npm run test:unit`, `test:db`, `test:api` — semuanya hijau dengan hasil 75/75, 36/36, dan 79/79.
3. Buka `/batches/new` → wizard tinggal 2 tahap (Pengadaan, Pengelompokan); isi sampai Simpan → batch tersimpan; buka daftar → batch terkelompok per pasar beserta tanggal; buka detail → caption foto tersimpan dan notifikasi sukses tampil.
Lolos bila: branch memuat seluruh revisi, seluruh pemeriksaan hijau, dan alur catat–daftar–detail teramati sesuai perilaku baru.

---

## Tugas studi pengganti hari sakit (hanya bila kampus mewajibkan terisi)

> Enam hari kerja tercatat sakit: Jumat 18 September + Senin-Jumat 21-25 September
> (bila dihitung 7 hari, sesuaikan hari ketujuh dengan surat keterangan sakit).
> Tugas di bawah adalah studi literatur pengganti setara sehari kerja penuh,
> bukan klaim pengerjaan teknis repo.

- Jumat, 18 September 2026 (pengganti): Menyusun resume paper E-sniffer beserta daftar istilah sensor (MQ-137, MQ-136, MQ-4, DHT-22) dan cara kerja electronic nose.
  Bukti: file resume + glosarium tersimpan dan bisa ditunjukkan.
- Senin, 21 September 2026 (pengganti): Mengikuti tutorial resmi Next.js App Router (routing, layout, pengambilan data) sambil menulis catatan penerapannya di proyek.
  Bukti: file catatan tutorial per bagian.
- Selasa, 22 September 2026 (pengganti): Mempelajari dasar PostgreSQL (pembuatan tabel, constraint, join, transaksi) disertai latihan query di database lokal.
  Bukti: riwayat query latihan + tangkapan hasilnya.
- Rabu, 23 September 2026 (pengganti): Mempelajari TypeScript (tipe strict, generics) dan konsep publish-subscribe MQTT untuk IoT, diringkas menjadi satu catatan.
  Bukti: file ringkasan satu catatan.
- Kamis, 24 September 2026 (pengganti): Mempelajari React hooks dan Tailwind (state, effect, context, utility-first styling) disertai contoh komponen latihan.
  Bukti: contoh komponen yang bisa dirender.
- Jumat, 25 September 2026 (pengganti): Merangkum PRD dan ERD fitur dataset menjadi ringkasan eksekutif dua halaman sebagai bekal kembali bekerja.
  Bukti: dokumen ringkasan dua halaman.

---

## Addendum: Senin, 12 Oktober 2026 (di luar rentang judul lama)

> Catatan kejujuran: pekerjaan di bawah terjadi pada 12 Oktober 2026
> (terbukti dari tanggal commit git). Pada 13 Oktober judul dokumen
> diperluas hingga 13 Oktober sehingga addendum ini kini di dalam rentang.
> Entri lama tidak diubah.

**Monday, 12 Oktober 2026**
Kamu melakukan Pekerjaan Apa Hari Ini ?
Menggabungkan branch `revisi-pembimbing` ke `main`, menampilkan seluruh isian formulir di halaman detail batch pada section Data Pencatatan beserta perapihan keterbacaannya, lalu membangun branch `realtime-ingest` berisi pencatatan nasib tiap pesan ingest ke tabel baru beserta endpoint kesehatannya, mode riwayat eksplisit saat alat offline, pengukuran laju kirim alat, dorongan data SSE tiap 0,5 detik ke kartu dan grafik, peringatan alat tanpa pasangan chamber, serta badge watermark dan hitungan antrean di tabel riwayat, semuanya terverifikasi suite hijau dan ter-push ke remote.

Uji hari ini:
1. Jalankan `git log --oneline -3 main` → `be55d08`, `843c091`, `b1b94ad`; `git log --oneline realtime-ingest --not main` → 6 commit (`26ebe7b`, `c616474`, `6c76ae2`, `d19b9c7`, `fecf65a`, `dd16233`).
2. Jalankan `npm run typecheck`, `npx eslint`, `test/*.test.ts`, `test/db/*.test.ts`, `test/api/*.test.ts` berurutan.
Lolos bila: seluruh pemeriksaan hijau dengan hasil unit 83/83, db 36/36, dan api 87/87.
3. Buka `/api/v1/ingest/health?hours=24` di browser → JSON berisi `devices`, `unknownSenders`, `totals`, dan `rateLast10m` per alat; buka halaman chamber → request `stream` bertipe event-stream menyala; buka Tabel Riwayat → badge `Watermark #N` tampil.
Lolos bila: ketiga tampilan teramati tanpa angka palsu.
4. Tertunda menunggu alat nyata: bukti p95 tick tampil <0,5 detik, demo cabut-alat untuk mode riwayat, dan uji beban 2 Hz — ketiganya dicatat sebagai belum terbukti, bukan diklaim lolos.
5. Susulan 12 Oktober (commit `2e48785`, `a430730`, merge `cfae483`): pin grafik otomatis lepas saat tick baru masuk agar status kembali Live sendiri, test kompatibilitas payload firmware ESP32-S3 dikunci, dan branch `firmware-compat` digabung ke `main` lalu push.

---

## Addendum: Selasa, 13 Oktober 2026

**Tuesday, 13 Oktober 2026**
Kamu melakukan Pekerjaan Apa Hari Ini ?
Mereview struktur proyek dan menemukan sisa endpoint Prometheus mati yang mengembalikan angka nol palsu, lalu membangun branch `chore/cleanup-legacy` untuk menghapus endpoint dan helper tersebut beserta shim tak terpakai, merapikan folder kosong dan output graph, serta memvisualkan seluruh proyek dengan skill graphify menjadi graf interaktif 865 node dan 55 komunitas yang di antaranya mengisolasi sisa Prometheus sebagai komunitas mati tersendiri, semuanya terverifikasi build produksi hijau dan ter-push ke remote.

Uji hari ini:
1. Jalankan `grep -r "api/sensor\|fetchPrometheus" --include="*.ts" app test deploy lib` → nol hasil sebelum hapus; sesudah hapus jalankan `npm run typecheck`, `npx eslint`, `npm run build -- --webpack`, suite unit 84/84 dan api 87/87.
Lolos bila: seluruh pemeriksaan hijau dan `git log --oneline chore/cleanup-legacy --not main` menampilkan `f40cdb3` dan `a167830`.
2. Buka `graphify-out/graph.html` di browser → graf interaktif tampil; buka `GRAPH_REPORT.md` → 55 komunitas berlabel dan endpoint Prometheus mati tercatat di komunitas "Dead Prometheus Endpoint".
Lolos bila: keduanya terbuka dan angka node/edge terbaca (865/2554).
3. Dicatat belum selesai: branch `chore/cleanup-legacy` belum di-merge ke `main` (menunggu keputusan karena berisi penghapusan), dan tiga pengujian alat nyata dari addendum 12 Oktober tetap tertunda.

---

## Addendum: Rabu, 14 Oktober 2026

**Wednesday, 14 Oktober 2026**
Kamu melakukan Pekerjaan Apa Hari Ini ?
Menghapus teks protokol di halaman batch, menambahkan rentang grafik 30 detik dan 1 menit sebelum 15 menit beserta sinkronisasi export CSV-nya, mempercepat polling data sensor menjadi 0,5 detik (SSE sebagai primer dan polling melambat 5 detik saat SSE hidup agar status koneksi tetap segar), mendiagnosis dashboard offline sebagai cache basi plus alat yang memang berhenti sejam sebelum perubahan web (bukan akibat kode web), membangun broker Mosquitto lokal di Docker beserta user `worker` dan `esp32-001` (termasuk memperbaiki file password yang berisi komentar, password yang salah ketik, dan izin file 0600), menambahkan flag mode non-TLS, retry NTP berkala, guard SSID placeholder, log diagnostik WiFi, dan peringatan rail sensor pada firmware ESP32, lalu meng-commit semuanya ke `main` dan menghapus backup password basi.

Uji hari ini:
1. Jalankan `git log --oneline -4 main` → `b6532a9`, `784217a`, `fab84b5`, `0e8bd06`; `npx tsc --noEmit` dan `npx eslint` pada file yang diubah → bersih.
2. Jalankan `docker ps` → `mosquitto-lokal` berstatus `Up`; `docker logs --tail=8 mosquitto-lokal` → baris `Opening ipv4 listen socket on port 1883` tanpa `Unable to open`/`terminating`.
3. Buka halaman chamber dengan `?range=30s` → tombol `30s|1m` tampil sebelum `15m` (bila tidak tampil: hard refresh `Ctrl+Shift+R` dengan Disable cache dicentang).
4. Buka Serial Monitor ESP32 → harus `[WIFI] CONNECTED ip=...`, `[NTP] SYNCED`, `[MQTT] CONNECTED`, `telemetry QoS1 SENT`, `[ACK] status=accepted`; bila muncul `WARN: semua MQ=0` → perbaiki kabel daya sensor dulu.
Lolos bila: keempat pemeriksaan teramati, dan kredensial asli tidak ada yang ter-commit (cek `git show --stat HEAD` hanya berisi placeholder).

---

## Addendum: Kamis, 15 Oktober 2026

**Thursday, 15 Oktober 2026**
Kamu melakukan Pekerjaan Apa Hari Ini ?
Membuat dokumen SKPL E-Sniffer Udang (`docs/esniffer/SKPL-E-Sniffer-Udang.md`) meniru kerangka dokumen SKPL STAS-RG (sampul, Daftar Perubahan, Daftar Isi, bab 1.1 sampai 2.8.5) dengan isi dari kode teraplikasi: 26 FR + 8 NFR yang tiap klaimnya merujuk path berkas, 2 peran tanpa registrasi mandiri, 13 skenario, diagram kelas dan ERD mermaid dari 14 model Prisma; lalu merevisinya bertahap: humanizer, penyesuaian struktur kalimat ke dokumen sumber, penyederhanaan bahasa awam, penghapusan titik dua dan `--`, pengetatan register akademis, serta best practice panduan SKPL (hilangkan kata tak terukur, subbab 2.7.3 tingkat Esensial/Kondisional/Opsional, tabel ketertelusuran skenario ke FR, dan 12 entri glosarium baru seperti lock, caption, deviasi, dan backfill yang semuanya terverifikasi di kode).

Uji hari ini:
1. Buka `docs/esniffer/SKPL-E-Sniffer-Udang.md` → sampul, Daftar Perubahan, Daftar Isi, 26 FR, 8 NFR, 13 skenario, dan 2 diagram mermaid semuanya ada.
2. Jalankan `grep -c "FR-"` pada file → tiap kode unik; `grep "FR-VIS-006"` → nol hasil (tak ada acuan yatim).
3. Cari `—`, `–`, ` -- `, dan kata kasual (`Isinya`, `tak `, `bisa `, `HP`, `ber-caption`, `membeku`) → nol hasil di luar blok kode.
Lolos bila: struktur kerangka sumber utuh, tiap angka/fakta tertelusur ke kode, dan bahasa sudah register akademis.

---

## Addendum: Jumat, 16 Oktober 2026 (di luar rentang judul lama)

> Judul dokumen diperluas hingga 16 Oktober 2026 mengikuti pola addendum sebelumnya. Entri lama tidak diubah.

**Friday, 16 Oktober 2026**
Kamu melakukan Pekerjaan Apa Hari Ini ?
Melaksanakan rapat dengan dosen dan mencatat sebelas revisi pengembangan web e-sniffer untuk dikerjakan berikutnya: tambah SD chamber dan non-chamber, tambah form pengelompokan per tahap di setiap batch, hapus dropdown device, tambah multi-stepper baru di form batch yang dipisah dari pasar, ubah input jam beli/tanggal menjadi tombol yang mengambil dari device, tambah pilihan supermarket pada jenis sumber, tambah foto dokumentasi pengelompokan, ganti penamaan coolbox di pasar dan di lab, rename suhu sebelum observasi, tampilkan notifikasi saat sensor sudah stabil, dan pisahkan kolom jam dan tanggal di excel.

Uji hari ini:
1. Buka daftar sebelas revisi di atas — tiap butir tertuju ke bagian web yang jelas (form batch, pengelompokan, device, excel).
2. Cocokkan tiap butir dengan halaman atau komponen yang akan diubah — tidak ada butir yang ambigu pemiliknya.
Lolos bila: seluruh revisi tercatat lengkap dan tiap butir terpetakan ke area pengerjaan berikutnya.

---

## Addendum: Sabtu, 17 Oktober 2026 (di luar rentang judul lama)

> Judul dokumen diperluas hingga 19 Oktober 2026 mengikuti pola addendum sebelumnya. Entri lama tidak diubah.

**Saturday, 17 Oktober 2026**
Kamu melakukan Pekerjaan Apa Hari Ini ?
Mengerjakan **Fase 2 (Lib/API)** dari rencana revisi putaran 2: menulis ulang CSV exporter (pecah kolom WIB + rename header cooler), menambahkan parser `supermarket`, membangun `PATCH /groups/[groupId]` dengan validasi parsial + `coldStorageMode` + validasi sesi cold-chamber, endpoint foto `groupId` opsional, memperluas rentang history API ke 366 hari, dan 4 endpoint notifikasi (list, unread-count, mark-read, read-all) beserta test API 5/5.

Uji hari ini:
1. Jalankan `npm run typecheck`, `npx eslint`, `npm run test:unit`, `npm run test:db`, `npm run test:api` — semuanya hijau (unit 84/84, db 47/47, api 99/99).
2. Commit atomik per butir: `7de27ae` (CSV), `4c658f6` (supermarket), `f6cb197` (PATCH grup), `6ec1163` (foto groupId), `ffc72c0` (history 366 hari), `9b4b486` (notif API).
3. Push tiap commit ke remote, merge `--no-ff` ke `main` setelah suite hijau.
Lolos bila: 6 commit Fase 2 ter-push & ter-merge, seluruh suite hijau.

---

## Addendum: Minggu, 18 Oktober 2026

**Sunday, 18 Oktober 2026**
Kamu melakukan Pekerjaan Apa Hari Ini ?
Mengerjakan **Fase 3 (UI)** 13 commit untuk 14 butir lapisan UI: wizard 3 langkah (`79d0568`), waktu otomatis dari jam device (`9816529`), pilihan supermarket (`b681edc`), dua suhu cool box pasar/lab (`f58a359`), label suhu sebelum observasi (`15253b9`), pilihan chamber/kulkas grup dingin + judul grup detail (`a9bd359`), foto per grup via `PhotosBlock` + badge SR/SD di detail (`1f63aba`), form edit grup di detail (`6a33980`), hapus dropdown device (`fc4468c`), draf `localStorage` + test unit 6/6 (`e8bf8f6`), judul grafik Sensor Gas Aktif + konsistensi kata (`e76c156`), filter rentang riwayat preset+kustom (`961782f`), grid mobile-first + footer sticky + kamera langsung (`c0a5e5a`).

Uji hari ini:
1. Jalankan suite penuh — unit 90/90, db 47/47, api 99/99.
2. 13 commit atomik di-push ke remote, merge `--no-ff` ke `main` (`f9ec426`).
3. Verifikasi manual butir 14 (target sentuh, kamera) & butir 5 (jam device) tertunda di perangkat.
Lolos bila: 13 commit Fase 3 ter-merge, suite hijau, dokumen rencana ter-update.

---

## Addendum: Senin, 19 Oktober 2026

**Monday, 19 Oktober 2026**
Kamu melakukan Pekerjaan Apa Hari Ini ?
Mengerjakan **Fase 4 (Notifikasi end-to-end)**: modul ambang stabilitas `lib/stability.ts` (rentang, CV, drift 10 menit per sensor & kondisi) + test unit 13/13 (`9910fa5`), worker sweep `warmup_stable` di `worker/stability.ts` terintegrasi timer 60 detik + test DB 3/3 (`e236af3`), UI `NotificationBell.tsx` (lonceng header, dropdown riwayat, modal wajib tutup, audio `Better Call Saul Ringtone.mp3` + toggle) + integrasi `Header.tsx` (`ecaabe3`).

Uji hari ini:
1. Suite akhir hijau: typecheck ✓, eslint 0 error, unit 103/103, db 50/50, api 99/99.
2. 3 commit atomik di-push, merge `--no-ff` ke `main` (`bc73ad6`).
3. **Fase 5 (Sinkronisasi dokumen)**: update `Panduan_Running_Web_Untuk_Pemula.md` (tambah §8), `Panduan_Fitur_Pencatatan_Untuk_Pemula.md` (§8.6 revisi 14 butir), `Logbook_Magang_27Agu-13Okt2026.md` (addendum 17–19 Okt).
4. Commit Fase 5, push ke remote, merge `--no-ff` ke `main`.
Lolos bila: 5 fase revisi putaran 2 selesai, seluruh suite hijau, dokumentasi sinkron dengan UI.
