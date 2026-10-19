# Panduan Running Web e-Sniffer untuk Pemula (Pengujian Lokal)

Dokumen ini menjelaskan cara menjalankan web e-Sniffer di laptop sendiri
dari nol: login, mencoba fitur pencatatan dataset, sampai
**menghubungkan alat ESP32 (sensor MQ-137, MQ-136, MQ-4, dan DHT22)** agar
angkanya muncul di dashboard. Ditulis untuk yang belum pernah memakai
PostgreSQL, Mosquitto, Node, maupun Arduino.

Lokasi proyek: `D:\Telkom University\Semester 5-6\Magang STAS-RG\esniffer-udang-web`
Contoh install penulis: PostgreSQL di `D:\Programs\PostgreSQL\18`,
Mosquitto di `D:\Programs\Mosquitto`.

Cara membaca dokumen ini:

| Bagian | Isi | Kapan dipakai |
|---|---|---|
| 1 | Gambaran sistem | sekali baca |
| 2 | Persiapan sekali saja | sekali per laptop |
| 3 | Menyalakan semua program | tiap sesi kerja |
| 4 | **Menghubungkan alat hardware** | sekali + tiap ganti jaringan |
| 5 | Mencoba fitur pencatatan dataset | tiap sesi kerja |
| 6 | Masalah umum + obatnya | saat ada error |
| 7 | Perintah verifikasi | opsional |

---

## 0. Status laptop ini + cara membaca tanda (baca dulu)

Terakhir dicek: 7 Oktober 2026. Tanda di bawah dipakai di seluruh dokumen:

| Tanda | Arti | Yang harus kamu lakukan |
|---|---|---|
| ✅ | Sudah dilakukan di laptop ini | **Jangan diulang.** Jalankan perintah "Cek"-nya saja |
| 🔁 | Aman diulang kapan saja | Boleh dijalankan lagi, tidak merusak |
| ⬜ | Belum / tergantung kebutuhan | Kerjakan bila sampai di langkah itu |
| ⚠️ | Sekali jalan menimpa / menghapus | Baca peringatan dulu, cek kondisi sebelum jalan |

Ringkasan status:

| Bagian | Status | Keterangan |
|---|---|---|
| PostgreSQL service + database `esniffer_dev` | ✅ | service Running; DB terisi (2 device aktif, user admin, readings + batch ada) |
| `.env` + `node_modules` | ✅ | keduanya sudah ada |
| Migrasi + seed | ✅ | `migrate deploy` + `db:seed` sudah jalan |
| `pwfile.txt` (worker, esp32-001, esp32-002) | ✅ | ketiga user sudah ada |
| `esniffer-local.conf` → `0.0.0.0` | ✅ | sudah diubah dari `127.0.0.1` |
| Firewall `Mosquitto 1883` | ✅ | rule ada dan Enabled |
| Service Mosquitto bawaan | ✅ | Stopped + Manual (tidak berebut port) |
| Firmware `.ino` mode lokal | ✅ | HOST/PORT/user/pass + `WiFiClient` + `setCACert` dimatikan sudah terisi |
| Wi-Fi alat (baris 55–56) | ✅ | sudah diisi — ganti hanya bila pindah jaringan |
| Arduino IDE + library + upload | ⬜ | ikuti 4.2 dan 4.7 saat siap flash |

> Kalau panduan ini dibaca di laptop lain, anggap semua ✅ sebagai ⬜
> dan kerjakan dari awal.

---

## 1. Peta besar: apa saja yang harus jalan

Alur data dari sensor sampai dashboard:

```
   [5] ALAT ESP32-S3          (di luar laptop, tersambung Wi-Fi)
        |  sensor MQ-137, MQ-136, MQ-4, DHT22
        |  mengirim pesan MQTT
        v
   [2] MOSQUITTO 1883         (broker pesan, di laptop)
        |
        v
   [4] WORKER                 (penerjemah: validasi + simpan)
        |
        v
   [1] POSTGRESQL             (database)
        |
        v
   [3] WEB npm run dev        (tampilan http://localhost:3000)
```

| # | Program / alat | Cara jalan | Fungsi |
|---|---|---|---|
| 1 | PostgreSQL | otomatis sebagai service | Database |
| 2 | Mosquitto | `.\mosquitto.exe -c ...` | Broker pesan sensor (MQTT) |
| 3 | Web (`npm run dev`) | `npm run dev` | Website di `http://localhost:3000` |
| 4 | Worker (`npm run worker:start`) | `npm run worker:start` | Penghubung sensor → database |
| 5 | Alat ESP32 | upload dari Arduino IDE | Pembaca sensor di lokasi |

Hanya ingin klik-klik form dan export (tanpa sensor)? Cukup **nomor 1 + 3**.
Ingin data sensor nyata masuk? Butuh **nomor 2 + 4 + alat nomor 5**.

Setiap program di laptop dijalankan di **jendela PowerShell sendiri** yang
**tetap terbuka** selama menguji.

---

## 2. Persiapan sekali saja (tidak diulang)

### 2.1 PostgreSQL

Status: ✅ service `postgresql-x64-18` Running; database `esniffer_dev` sudah ada dan terisi.

1. Pastikan service jalan: tekan `Windows + R`, ketik `services.msc`,
   cari `postgresql-x64-18`, status harus `Running` (klik kanan > Start bila belum).
   Cek cepat:
   ```powershell
   Get-Service postgresql-x64-18 | Select-Object Status, StartType
   # Harus: Running. Kalau Stopped → klik Start di services.msc
   ```
2. Buka database `esniffer_dev`:
   - Cara klik: `D:\Programs\PostgreSQL\18\pgAdmin 4\runtime\pgAdmin4.exe`
     (perhatian: bukan folder `bin`, melainkan folder **`runtime`**),
     lalu buat database bernama `esniffer_dev` bila belum ada.
   - Cara perintah:
     ```powershell
     & "D:\Programs\PostgreSQL\18\bin\psql.exe" -h localhost -U postgres -c "CREATE DATABASE esniffer_dev;"
     ```
     Jangan klik 2x `psql.exe` (otomatis tertutup); selalu lewat PowerShell.
     ⚠️ Kalau muncul `already exists`, itu **bukan error** — artinya ✅
     database sudah ada, langsung lanjut. Jangan hapus database lama
     (isinya: device, user, readings, batch).
3. Isi file `.env` di root proyek (bukan `.env.local`):
   ```env
   DATABASE_URL="postgresql://postgres:PASSWORD_ANDA@localhost:5432/esniffer_dev"
   AUTH_SECRET="<isi-64-karakter-acak>"
   CURSOR_SIGNING_SECRET="<isi-acak-lain-yang-berbeda>"
   APP_BASE_URL="http://localhost:3000"
   MQTT_URL="mqtt://127.0.0.1:1883"
   MQTT_CLIENT_ID="esniffer-ingest-v1"
   MQTT_USERNAME="worker"
   MQTT_PASSWORD="workerpass123"
   MQTT_CA_FILE=""
   MQTT_CLIENT_CERT_FILE=""
   MQTT_CLIENT_KEY_FILE=""
   WORKER_CONCURRENCY="5"
   WORKER_MAX_QUEUE="500"
   ```
   Ganti `PASSWORD_ANDA` dengan password PostgreSQL Anda.
   Untuk secret acak, jalankan:
   ```powershell
   [Convert]::ToBase64String((1..48 | % {Get-Random -Max 256}))
   ```

### 2.2 Mosquitto (cukup sekali)

Status: ✅ `pwfile.txt` sudah berisi `worker`, `esp32-001`, `esp32-002`;
file `esniffer-local.conf` sudah `0.0.0.0`; service bawaan Stopped + Manual.

1. Cek dulu sebelum menyentuh password (wajib — menghindari timpa):
   ```powershell
   cd "D:\Programs\Mosquitto"
   Test-Path "D:\Programs\Mosquitto\pwfile.txt"
   # True = file SUDAH ada → JANGAN pakai -c lagi (lihat peringatan di bawah)
   Get-Content "D:\Programs\Mosquitto\pwfile.txt" | ForEach-Object { ($_ -split ':')[0] }
   # Harus muncul: worker, esp32-001, esp32-002 → berarti ✅ beres, lewati ke poin 2
   ```
   Buat password hanya bila ada user yang hilang:
   ```powershell
   cd "D:\Programs\Mosquitto"

   # Kalau file pwfile.txt BELUM ada, pakai -c untuk user pertama:
   .\mosquitto_passwd.exe -c "D:\Programs\Mosquitto\pwfile.txt" worker
   # ketik: workerpass123 (2x)

   # Kalau file sudah ada, pakai -b (hanya user itu yang diganti, sisanya aman):
   .\mosquitto_passwd.exe -b "D:\Programs\Mosquitto\pwfile.txt" worker workerpass123
   .\mosquitto_passwd.exe -b "D:\Programs\Mosquitto\pwfile.txt" esp32-001 esniffer1234
   .\mosquitto_passwd.exe -b "D:\Programs\Mosquitto\pwfile.txt" esp32-002 devicepass002
   ```
   > ⚠️ Peringatan timpa: opsi `-c` **menghapus seluruh isi file** lalu membuatnya ulang.
   > Jangan dipakai lagi setelah file berisi beberapa user, nanti user perangkat hilang.
   > Kalau telanjur `-c`, buat ulang ketiga user dengan tiga baris `-b` di atas,
   > lalu restart broker (bagian 3).
   >
   > Setiap ganti password wajib **restart broker** (tutup jendela Mosquitto,
   > jalankan ulang) — kalau tidak, broker masih memakai password lama dan
   > alat gagal `code=4`.
   >
   > Password `esp32-001` di atas **harus sama** dengan baris 68 file firmware
   > (`MQTT_PASSWORD = "esniffer1234"`). Kalau kamu memilih password lain,
   > ubah juga baris 68 firmware agar cocok.

2. Cek isi `D:\Programs\Mosquitto\esniffer-local.conf` (✅ sudah benar di laptop ini):
   ```
   listener 1883 0.0.0.0
   allow_anonymous false
   password_file D:/Programs/Mosquitto/pwfile.txt
   ```
   Cek cepat:
   ```powershell
   Get-Content "D:\Programs\Mosquitto\esniffer-local.conf"
   # Baris 1 harus 0.0.0.0 bila akan memakai alat; 127.0.0.1 hanya untuk main browser
   ```
   Setiap ubah file ini wajib **restart broker**. Kalau lupa restart,
   broker tetap memakai config lama.
   Tips Notepad: saat Save pilih `Save as type: All Files (*.*)`
   agar tidak menjadi `.conf.txt`.

   > `127.0.0.1` artinya broker **hanya melayani laptop sendiri** (paling aman).
   > Kalau akan menyambungkan alat ESP32, ubah menjadi `0.0.0.0` seperti di
   > bagian 2.4. Kalau tidak, alat akan ditolak sebelum sampai ke broker.

3. Matikan service bawaan Windows agar tidak berebut port 1883
   (cukup sekali; butuh PowerShell **as Administrator**).
   Status: ✅ sudah Stopped + Manual. Cek:
   ```powershell
   Get-Service mosquitto | Select-Object Status, StartType
   # Harus: Stopped + Manual. Kalau Running → jalankan dua baris di bawah, lalu restart
   Stop-Service mosquitto
   Set-Service mosquitto -StartupType Manual
   ```
   ⚠️ Aturan bentrok: **jangan jalankan service + instans manual bersamaan.**
   Keduanya berebut port 1883 → error `Only one usage of each socket`.
   Pilih satu: service **atau** jendela manual (panduan ini memakai jendela manual).

### 2.3 Migrasi + seed (cukup sekali, atau tiap ganti database)

Status: ✅ migrasi sudah applied, seed sudah jalan (device + user + assignment ada).

```powershell
cd "D:\Telkom University\Semester 5-6\Magang STAS-RG\esniffer-udang-web"
npx prisma generate
npx prisma migrate deploy
npm run db:seed
```
Berhasil bila muncul `Users seeded: admin@esniffer.local (ADMIN)`.

🔁 `prisma generate` dan `migrate deploy` aman diulang (tidak menimpa data).
`db:seed` memakai upsert (aman diulang), tetapi ⚠️ **jangan jalankan
`test:db`/`test:e2e` untuk "reset"** — test `seed-idempotency` sengaja menimpa
password admin hingga login gagal (lihat tabel masalah). Kalau login gagal
setelah test, minta bantuan teknis untuk reset password, bukan seed ulang.

Seed ini sekaligus mendaftarkan perangkat `esp32-001` di database dan
menugaskannya ke **Chamber 1**, jadi datanya nanti muncul di halaman itu.

### 2.4 Khusus bila akan menyambungkan alat hardware (cukup sekali)

Status: ✅ poin 1–3 sudah beres di laptop ini (conf `0.0.0.0`, firewall Enabled,
password `esp32-001` set). Kerjakan ulang hanya bila ada yang berubah
(ganti password, ganti laptop, rule firewall terhapus).
Lewati bagian ini bila hanya memakai browser tanpa alat.

1. Izinkan broker melayani alat di jaringan. Cek dulu, baru ubah bila perlu:
   ```powershell
   Get-Content "D:\Programs\Mosquitto\esniffer-local.conf"
   # ✅ Baris 1 = "listener 1883 0.0.0.0" → sudah beres, lewati
   # Baris 1 = "listener 1883 127.0.0.1" → ubah ke 0.0.0.0 di bawah
   ```
   Ubah isi `D:\Programs\Mosquitto\esniffer-local.conf` menjadi:
   ```
   listener 1883 0.0.0.0
   allow_anonymous false
   password_file D:/Programs/Mosquitto/pwfile.txt
   ```
   (`0.0.0.0` = dengarkan semua kartu jaringan, bukan hanya `localhost`.)
   ⚠️ Setiap ubah file ini wajib **restart broker** (bagian 3), kalau tidak
   perubahan tidak berlaku.

2. Buka port 1883 di Windows Firewall. Cek dulu agar tidak dobel:
   ```powershell
   Get-NetFirewallRule -DisplayName "Mosquitto 1883" -ErrorAction SilentlyContinue | Select-Object DisplayName, Enabled
   # ✅ Muncul + Enabled=True → sudah beres, lewati New-NetFirewallRule
   ```
   PowerShell **as Administrator** (hanya bila rule belum ada):
   ```powershell
   New-NetFirewallRule -DisplayName "Mosquitto 1883" -Direction Inbound -Protocol TCP -LocalPort 1883 -Action Allow
   ```
   ⚠️ Jangan jalankan `New-NetFirewallRule` berulang kali tanpa cek —
   rule akan **ganda**. Kalau telanjur ganda, hapus yang berlebih lalu buat satu.
   Cek berhasil:
   ```powershell
   netstat -ano | findstr ":1883"     # harus muncul 0.0.0.0:1883, bukan 127.0.0.1:1883
   ```

3. Set password perangkat di broker. Cek dulu user-nya:
   ```powershell
   cd "D:\Programs\Mosquitto"
   Get-Content ".\pwfile.txt" | ForEach-Object { ($_ -split ':')[0] }
   # ✅ Muncul esp32-001 dan password masih cocok dengan firmware → lewati
   # Hanya jalankan baris di bawah bila password diganti / user hilang:
   .\mosquitto_passwd.exe -b "D:\Programs\Mosquitto\pwfile.txt" esp32-001 esniffer1234
   ```
   Passwordnya harus sama dengan baris 68 firmware.
   ⚠️ Ganti password = wajib **restart broker + upload ulang TIDAK perlu**,
   cukup restart broker; tetapi kalau password firmware ikut diganti,
   firmware harus di-upload ulang juga agar cocok.

4. Restart Mosquitto (tutup jendelanya, jalankan ulang seperti bagian 3)
   supaya perubahan config dan password terbaca.

5. Kalau selesai menguji dan tidak lagi memakai alat, kembalikan ke aman:
   ubah `listener` kembali ke `127.0.0.1` lalu restart broker, dan
   ```powershell
   Disable-NetFirewallRule -DisplayName "Mosquitto 1883"
   ```

---

## 3. Menyalakan untuk pengujian (tiap sesi)

**Jendela 1 — Mosquitto** (biarkan terbuka; ⚠️ cukup **satu** instans):
```powershell
cd "D:\Programs\Mosquitto"
.\mosquitto.exe -c "D:\Programs\Mosquitto\esniffer-local.conf" -v
```
Benar bila berakhir `mosquitto version 2.1.2 running`.
Bila error `Only one usage of each socket...` berarti port dipakai
service/instans lain — **jangan jalankan lagi**, melainkan tutup yang lama dulu:
pastikan hanya satu yang jalan (`netstat -ano | findstr ":1883"` cukup satu baris
LISTENING) — ulangi langkah 2.2 poin 3 bila service yang merebut.

**Jendela 2 — Web**:
```powershell
cd "D:\Telkom University\Semester 5-6\Magang STAS-RG\esniffer-udang-web"
npm run dev
```
Tunggu `✓ Ready`, buka `http://localhost:3000`,
login `admin@esniffer.local` / `admin123`.

**Jendela 3 — Worker** (wajib bila butuh data sensor):
```powershell
npm run worker:start
```
Benar bila muncul JSON `Worker daemon starting` → `mqtt_connected` →
`subscription_active`, lalu diam (itu normal, ia menunggu data).

**Alat (nomor 5)** menyala sendiri setelah diberi daya USB/baterai;
cara menyiapkannya ada di bagian 4.

---

## 4. Menghubungkan alat ESP32 dengan sensor (MQ-137, MQ-136, MQ-4, DHT22)

Bagian ini membuat angka sensor asli masuk ke dashboard. Kerjakan berurutan.
Bila kamu belum punya alatnya, tetap baca **4.9** supaya bisa menguji
tanpa hardware.

Setelah bagian ini selesai, alurnya:

```
sensor -> ESP32 -> Wi-Fi -> Mosquitto (laptop) -> Worker -> Database -> Chamber 1
```

### 4.1 Yang harus ada

| Barang | Keterangan |
|---|---|
| Papan ESP32-S3 | mis. ESP32-S3 DevKitC |
| Sensor MQ-137, MQ-136, MQ-4 | butuh pemanas 5 V, lihat peringatan di 4.3 |
| Sensor DHT22 | untuk suhu & kelembapan |
| Kabel jumper | secukupnya |
| Kabel USB **data** | bukan kabel charge-only |
| Display Nextion (opsional) | web tetap jalan tanpa LCD ini |
| Hotspot HP atau Wi-Fi rumah 2.4 GHz | lihat 4.5 |

### 4.2 Pasang Arduino IDE dan librarynya (sekali saja, di laptop)

Status: ⬜ belum terverifikasi dari terminal (cek manual di laptopmu:
Arduino IDE terbuka → board ESP32S3 ada → 4 library terpasang).

1. Unduh dan pasang **Arduino IDE 2.x** dari situs resmi Arduino
   (`arduino.cc` → Software). Buka sekali agar folder sketchbook terbentuk.
2. **Boards Manager** (ikon papan di kiri) → cari `esp32` → pasang
   **esp32 by Espressif Systems** (versi 3.x). Tunggu sampai selesai,
   lalu tutup-tutup IDE sekali agar board terdaftar.
3. **Library Manager** (ikon buku) → pasang empat ini satu per satu,
   pastikan namanya persis:
   - `ArduinoMqttClient` (by Arduino)
   - `ArduinoJson` (by Benoit Blanchon, pilih **versi 7.x**, bukan 6.x —
     kode memakai `JsonDocument` gaya v7)
   - `DHT sensor library` (by Adafruit)
   - `Adafruit Unified Sensor` (by Adafruit, dependensi DHT — biasanya
     ikut terpasang otomatis, pastikan ada)
4. Hubungkan alat dengan kabel USB **data** (bukan kabel charger saja).
   Kalau port tidak muncul, pasang driver USB sesuai chip papan:
   CP210x (Silabs) atau CH34x (WCH). Cek di Device Manager → Ports (COM & LPT).
5. Di Arduino IDE: **Tools → Board → esp32 → ESP32S3 Dev Module**.
   **Tools → Port** → pilih port alat (mis. `COM5`).
   **Tools → USB CDC On Boot → Enabled** (wajib, kalau tidak Serial Monitor kosong).
   Biarkan **Flash Size**, **PSRAM**, **Upload Speed** pada bawaan
   kecuali modulmu meminta lain.

### 4.3 Perkabelan sensor dan LCD (jangan asal cabut-pasang)

Nilai pin ini sudah tertulis di firmware (baris 133–143); samakan kabel dengan tabel.
Artinya: kalau kabel MQ-137 dicolok ke GPIO3, maka baris 133 harus `MQ137_PIN 3`.

| Sensor | Pin di firmware | Baris | Kabel |
|---|---|---|---|
| MQ-137 (amonia NH3) | `MQ137_PIN 3` | 133 | VCC → 5 V, GND → GND, AOUT → GPIO3 |
| MQ-136 (H2S) | `MQ136_PIN 2` | 134 | VCC → 5 V, GND → GND, AOUT → GPIO2 |
| MQ-4 (metana CH4) | `MQ4_PIN 1` | 135 | VCC → 5 V, GND → GND, AOUT → GPIO1 |
| DHT22 (suhu + lembap) | `DHT_PIN 4` | 136 | VCC → 3,3 V, GND → GND, DATA → GPIO4 |
| Nextion TX/RX | `18` / `17` | 142–143 | TX LCD → GPIO18, RX LCD → GPIO17 (disilang), VCC → 5 V, GND → GND |

Cara mendapatkan angkanya: **baca label di modul sensor dan papan ESP32**,
bukan dari internet. `MQ137_PIN 3` artinya kabel sinyal MQ-137 masuk ke pin
berlabel `GPIO3` (atau `IO3`) di papan. Kalau kamu memindah kabel, ubah juga
baris `#define` yang sesuai lalu upload ulang.

Aturan yang tidak boleh dilanggar:

1. **Hanya pin ADC1 (GPIO1–GPIO10).** Pada ESP32-S3, ADC2 mati saat Wi-Fi aktif.
   GPIO1–4 di firmware sudah ADC1, jadi sudah benar.
2. **Tegangan sinyal maksimal 3,3 V.** Modul MQ dipanaskan 5 V dan keluarannya
   bisa mencapai 5 V — pastikan sinyal yang masuk pin ADC tidak lebih dari
   3,3 V (pakai pembagi tegangan bila perlu). Tanyakan ke pembimbing bila ragu.
3. **Jangan tukar TX/RX LCD.** TX LCD harus ke RX ESP32 (GPIO18) dan sebaliknya.
4. **Jangan menyalakan pemanas MQ dari pin 3,3 V.** Pemanas butuh 5 V dan arus
   besar; ambil dari pin 5 V / sumber eksternal, bukan dari pin logika.

> Sensor MQ perlu **pemanasan (burn-in)** beberapa jam sampai 24 jam agar
> bacaannya stabil. Angka yang masih naik-turun di awal itu normal, bukan rusak.
>
> Bila sensor belum datang semua, tidak harus menunggu: set flag `*_ENABLED`
> (bagian 4.4) ke `false` untuk sensor yang belum dipasang, web tetap jalan.

### 4.4 Isi nilai di file firmware (inti bagian ini)

File firmware ada di dalam proyek:

```
D:\Telkom University\Semester 5-6\Magang STAS-RG\esniffer-udang-web\
  esniffer_esp32_nextion\esniffer_esp32_nextion.ino
```

Buka: **Arduino IDE → File → Open** → pilih folder `esniffer_esp32_nextion`.
Nama folder wajib sama dengan nama file; kalau tidak, Arduino menolak membukanya.
Folder ini sudah masuk `.gitignore` karena memuat sandi.

Untuk melompat ke baris tertentu tekan **Ctrl+G**, atau tekan **Ctrl+F** lalu
cari teksnya. Status: ✅ semua baris mode lokal di bawah **sudah terisi**
di filemu — jangan timpa ulang kecuali ganti jaringan/password.
Tabel lengkap yang harus diisi, **termasuk cara mendapatkan isinya**:

| Baris | Nama di kode | Isi dengan | Cara mendapatkan |
|---|---|---|---|
| 48 | `DEVICE_ID` | `esp32-001` (**jangan diubah**) | harus sama dengan user broker (2.4) dan perangkat di database (2.3) |
| 55 | `WIFI_SSID` | nama jaringan Wi-Fi | lihat **4.5** |
| 56 | `WIFI_PASS` | sandi jaringan Wi-Fi | lihat **4.5** |
| 63 | `MQTT_HOST` | IP laptop, mis. `10.66.185.242` | lihat **4.6** |
| 64 | `MQTT_PORT` | `1883` (sudah diisi) | port broker lokal, tidak diubah |
| 67 | `MQTT_USERNAME` | `esp32-001` (sudah diisi) | sama dengan user broker di 2.4 |
| 68 | `MQTT_PASSWORD` | `esniffer1234` (sudah diisi) | sama dengan password broker di 2.4 |
| 200–202 | `MQ137_ENABLED`, `MQ136_ENABLED`, `MQ4_ENABLED` | `true`, ubah ke `false` bila sensor itu tidak dipasang | putuskan sesuai alat yang benar-benar ada |
| 133–136 | `MQ137_PIN`, `MQ136_PIN`, `MQ4_PIN`, `DHT_PIN` | angka pin | lihat **4.3** |

Nilai yang **tidak perlu diubah lagi** karena sudah disetel untuk mode uji lokal
(cek dengan Ctrl+F — kalau masih ada nilai lama, berarti belum tersetel):

| Baris | Isi sekarang (benar) | Nilai lama (salah untuk lokal) | Alasan |
|---|---|---|---|
| 63 | `MQTT_HOST = "10.66.185.242"` | `e-sniffer.stas-rg.com` | uji lokal memakai IP laptop |
| 64 | `MQTT_PORT = 1883` | `8883` | 1883 = tanpa TLS |
| 236 | `WiFiClient tlsClient;` | `WiFiClientSecure tlsClient;` | TLS hanya untuk port 8883 |
| 1041 | `// tlsClient.setCACert(MQTT_ROOT_CA);` | tanpa `//` | sertifikat hanya untuk broker produksi |
| 115 | `NTP_SERVER_1 = "pool.ntp.org"` | — | jam alat; dipakai mengisi waktu ukur |
| 1038 | `analogReadResolution(12);` | — | ADC 12-bit → raw 0–4095 sesuai batas server |
| 1035 | `lcdSerial.begin(9600, ...)` | — | LCD Nextion tetap 9600 baud |

Cek cepat dengan Ctrl+F:

- cari `e-sniffer.stas-rg.com` → **tidak boleh ketemu** (sudah lepas dari produksi).
- cari `WiFiClientSecure tlsClient` → **tidak boleh ketemu** (sudah plaintext).
- cari `setCACert` → hanya boleh ketemu baris 1041 yang diawali `//`.

#### Kenapa tiap nilai harus begitu (agar fungsional, bukan asal isi)

- **`DEVICE_ID` (48)** — menjadi nama topik
  `esniffer/v1/devices/esp32-001/telemetry|status` dan `ack`
  (dibangun di `setup()`, baris 1027–1029). Worker menolak data bila topik
  dan isi `device_id` beda (`TOPIC_MISMATCH`), dan database hanya mengenal
  `esp32-001` (dari seed). Jadi jangan diganti tanpa mendaftarkan perangkat baru.
- **`MQTT_HOST` (63)** — alamat broker. Web lokal memakai broker laptop,
  jadi isinya IP laptop (cara ambil: 4.6). Bukan `localhost`, karena itu
  alamat dari sudut pandang alat, bukan laptop.
- **`MQTT_PORT` (64) + `WiFiClient` (236) + `setCACert` (1041)** — satu paket:
  1883 = tanpa TLS, 8883 = TLS. Kalau port 1883 tapi klien masih
  `WiFiClientSecure`, koneksi gagal.
- **`MQTT_USERNAME`/`MQTT_PASSWORD` (67–68)** — login broker. Harus sama
  dengan `pwfile.txt` (cara set: 2.4). Username harus sama dengan `DEVICE_ID`.
- **`MQx_ENABLED` (200–202)** — saklar sensor. `false` = kolom dikirim sebagai
  `missing` (dashboard kosong, bukan error). `true` padahal sensor tidak
  terpasang = angka ngawur.
- **NTP (115)** — jam alat mengisi `measured_at`. Tanpa NTP, data tersimpan
  sebagai `accepted_unresolved_time` tanpa chamber dan **tidak muncul**
  di halaman Chamber.
- **Payload < 4096 byte** — dicek firmware (baris 728) dan broker. JSON ini
  hanya ~500 byte, jadi aman selama tidak menambah field besar.

Bentuk akhirnya akan seperti ini:

```cpp
// baris 55-56
const char* WIFI_SSID = "mang u'un";
const char* WIFI_PASS = "sandi-wifi-mu";

// baris 63-68
const char* MQTT_HOST = "10.66.185.242";    // LOKAL: IP laptop
const uint16_t MQTT_PORT = 1883;            // LOKAL: port tanpa TLS
const char* MQTT_USERNAME = "esp32-001";    // jangan diubah
const char* MQTT_PASSWORD = "esniffer1234"; // LOKAL: diatur lewat mosquitto_passwd
```

### 4.5 Cara mendapatkan WIFI_SSID (baris 55) dan WIFI_PASS (baris 56)

Ketentuan mutlak: jaringan harus **2.4 GHz**. ESP32 tidak bisa Wi-Fi 5 GHz.
Cek cepat pita jaringan (kanal ≤ 14 = 2.4 GHz, kanal ≥ 36 = 5 GHz):

```powershell
netsh wlan show interfaces
```

Contoh hasil: `SSID : mang u'un`, `Band : 5 GHz` → **tidak bisa dipakai alat**.
Kalau Wi-Fi rumahmu punya dua nama (mis. `NETNOT FAMS` dan `NETNOT FAMS_5G`),
pakai yang **tanpa** akhiran `_5G`.

**Pilihan A — hotspot HP (paling bebas masalah, disarankan)**

1. **Android:** Pengaturan → Hotspot & tethering → Hotspot Wi-Fi → isi
   **Nama hotspot** (itu `WIFI_SSID`) dan **Sandi** (itu `WIFI_PASS`) →
   menu lanjutan → **Band AP** → pilih **2.4 GHz**.
2. **iPhone:** Pengaturan → Hotspot Pribadi → nyalakan
   **Maximize Compatibility** (ini memaksa 2.4 GHz), lalu lihat nama & sandi
   di halaman itu.
3. **Sambungkan laptop ke hotspot itu juga.** Alat dan laptop wajib satu jaringan.

**Pilihan B — memakai Wi-Fi yang sudah tersimpan di laptop**

Nama jaringan yang sedang dipakai laptop:

```powershell
netsh wlan show interfaces
```

Sandi jaringan yang pernah tersimpan di laptop:

```powershell
netsh wlan show profiles
netsh wlan show profile name="mang u'un" key=clear
```

Lihat baris **`Key Content`** (Windows berbahasa Indonesia: **`Isi Kunci`**).
Bila muncul `Access is denied`/`Akses ditolak`, buka PowerShell **as Administrator**.

**Pilihan C — melihat sandi lewat tampilan Windows**

1. Tekan `Windows + R`, ketik `ncpa.cpl`, Enter.
2. Klik kanan **Wi-Fi** → **Status** → **Wireless Properties**
   (Properti Nirkabel) → tab **Security** (Keamanan).
3. Centang **Show characters** (Tampilkan karakter) → sandi terlihat.

Catatan penulisan: tulis apa adanya di dalam tanda kutip, huruf besar/kecil
berpengaruh, spasi dan tanda hubung boleh (`mang u'un`, `KOSAN PAK YANTO`).
Hindari sandi beremoji.

> Wi-Fi kampus (`TelU-Connect`, `TelU-Guest`) **jangan dipakai**: alat tidak bisa
> melewati halaman login, dan jaringan kampus biasanya memblokir komunikasi antar
> perangkat.

### 4.6 Cara mendapatkan MQTT_HOST (baris 63)

Ini **alamat IP laptop di jaringan yang sama dengan alat**. Ambil setelah laptop
tersambung ke hotspot/Wi-Fi pilihanmu:

```powershell
Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
  Select-Object IPAddress, InterfaceAlias
```

Contoh: `IPAddress 10.66.185.242`, `InterfaceAlias Wi-Fi 4` → tulis
`const char* MQTT_HOST = "10.66.185.242";`

Buktikan broker sudah terlihat dari alamat itu (harus `True`):

```powershell
Test-NetConnection 10.66.185.242 -Port 1883
```

> **Sangat penting:** IP laptop **berubah** setiap ganti jaringan (pindah hotspot,
> pindah Wi-Fi). Kalau berubah, perbarui baris 63 dan upload ulang firmware.
> ⚠️ Jangan asal menimpa baris 55–56/63/68 "sekalian": setiap upload menimpa
> flash alat — ubah hanya baris yang memang berubah (mis. hanya baris 63 bila
> cuma IP yang berganti), lalu Verify + Upload.
> Itu sebabnya urutan yang benar: **tentukan jaringan dulu → ambil IP → baru flash**.
> Cara termudah: pasang hotspot HP, sambungkan laptop ke hotspot itu, baru jalankan
> perintah di atas.

### 4.7 Upload firmware ke alat dan cek kompilasi

Status: ⬜ lakukan saat siap flash. Upload menimpa flash alat — aman diulang,
tetapi ubah hanya baris yang memang berubah (lihat catatan di 4.6).

1. **Tools → Board → ESP32S3 Dev Module**.
2. **Tools → Port** → pilih port USB alat (mis. `COM5`). Kalau tidak muncul,
   pasang driver USB (CP210x atau CH34x sesuai papan) dan ganti kabel
   (kabel charger tidak membawa data).
3. **Tools → USB CDC On Boot → Enabled**. Ini penyebab paling umum Serial Monitor
   kosong.
4. Biarkan **Flash Size**, **PSRAM**, dan **Upload Speed** pada nilai bawaan
   kecuali modulmu mengharuskan lain.
5. Klik **Verify** (centang) dulu. Lolos bila tidak ada error merah.
   Error umum: `ArduinoJson.h: No such file` = library belum dipasang (4.2);
   `Failed to connect` = salah port atau tombol BOOT belum ditahan.
6. Klik **Upload** (tombol panah kanan). Sambil menunggu, jangan lepas kabel.
7. Buka **Serial Monitor**, baud **115200** (bukan 9600 — 9600 itu untuk LCD,
   bukan untuk USB).

Urutan log yang diharapkan:

```
[WIFI] Connected
[WIFI] IP Address: 10.66.185.xxx
[NTP] Time synchronized
[MQTT] Menyambung ke broker...
[MQTT] Connected
[MQTT] ACK subscription active
[STATUS] connect
[TELEMETRY] QoS1 sent: <boot_id>:0000000001 attempt=1
[ACK] Reading committed. Pending telemetry cleared.
```

Arti baris penting:

- `[NTP] Time synchronized` **wajib muncul**. Jam alat dipakai mengisi waktu ukur.
- `[ACK] Reading committed` artinya data **sudah tersimpan** di database.
- `[TELEMETRY] ... attempt=2` berarti paket diulang karena ACK lambat; itu normal.
- `[ACK] ... status=rejected` artinya data ditolak — lihat tabel 4.9.
- `[ACK] status=duplicate` artinya paket yang sama terkirim ulang dan dikenali
  (normal saat retry, bukan error).
- `[ACK] status=accepted_unresolved_time` artinya NTP gagal (lihat 4.9).

#### Apa yang tampil di dashboard untuk tiap sensor

| Sensor di firmware | Kartu di web | Angka yang tampil | Kosong/`null` artinya |
|---|---|---|---|
| `temperature_c` (DHT22) | Sensor Suhu Lingkungan | °C, mis. 27,1 | DHT gagal baca / kabel DATA lepas |
| `humidity_percent` (DHT22) | Kelembaban Udara | %RH, mis. 78,2 | sama seperti di atas |
| `mq137_raw` | MQ-137 (Amonia) | raw ADC 0–4095 | `MQ137_ENABLED=false` atau pin salah |
| `mq136_raw` | MQ-136 (H2S) | raw ADC 0–4095 | sama seperti di atas |
| `mq4_raw` | MQ-4 (Metana) | raw ADC 0–4095 | sama seperti di atas |

Angka gas adalah **raw ADC, bukan ppm**. Layar Nextion menampilkan ppm
(hasil kalibrasi `R0_*`), tetapi yang dikirim ke web memang raw — jadi kalibrasi
tidak perlu benar agar web berfungsi. Nilai di luar 0–4095 otomatis ditandai
server sebagai `OUT_OF_RANGE`.

### 4.8 Verifikasi berjenjang (kalau sesuatu tidak muncul)

Periksa dari lapis terdekat ke alat, jangan langsung ke web:

```powershell
# 1. Apakah pesan alat benar-benar sampai broker?
cd "D:\Programs\Mosquitto"
.\mosquitto_sub.exe -h 127.0.0.1 -p 1883 -u worker -P workerpass123 -t "esniffer/v1/devices/+/telemetry" -v -C 1

# 2. Apakah worker menyimpannya ke database?
psql "$env:DATABASE_URL" -c "SELECT COUNT(*), MAX(received_at) FROM sensor_readings;"
```

3. Buka web → **Chamber 1**. Dalam ±15 detik header harus **ONLINE** + **Fresh**,
   dan kartu MQ-137/MQ-136/MQ-4 menampilkan angka raw (0–4095).

> Kalau ingin angka sensor ikut muncul di **Unduh CSV Data**, **mulai sesi H0 di
> halaman batch dulu** sebelum menyalakan alat. Baris sensor yang masuk dipautkan
> ke sesi itu; kalau tidak ada sesi, datanya tetap masuk dashboard tetapi tidak
> masuk CSV batch.
>
> Angka gas di dashboard adalah **raw ADC (0–4095)**, bukan ppm. Nilai ppm di layar
> Nextion memakai angka kalibrasi (`R0_MQ137`, dll.) yang tidak dikirim ke web,
> jadi kalibrasi tidak menghalangi pengujian web.

### 4.9 Bila belum ada sensor / hanya ingin uji koneksi

Alat tetap bisa dihubungkan walau sensor belum terpasang:

- Set `MQ137_ENABLED = false` (baris 200) dan/atau `MQ136_ENABLED` (201),
  `MQ4_ENABLED` (202) sesuai sensor yang tidak ada. Firmware tetap mengirim
  kelima kolom sensor, yang tidak dipasang ditandai `missing`, dan di dashboard
  muncul sebagai kosong — bukan error.
- LCD Nextion juga opsional; tanpa LCD, firmware tetap mengirim data ke web.
- Cara lain tanpa alat: jalankan pengirim palsu yang sudah disediakan proyek
  (`test/e2e/simulator.ts`, dipakai oleh `npm run test:e2e`) untuk memastikan
  jalur broker → worker → database sehat lebih dulu.

### 4.10 Tabel masalah khusus hardware

| Gejala di Serial Monitor | Arti | Obat |
|---|---|---|
| `[WIFI] Connection FAILED - berjalan mode offline` | jaringan tidak ketemu / 5 GHz / sandi salah | pastikan 2.4 GHz, periksa baris 55–56 |
| `[MQTT] Menunggu jam NTP...` berulang | jam belum sinkron | pastikan internet/ hotspot punya akses NTP; tunggu 1–2 menit |
| `[MQTT] Connection failed. code=4` | username/password broker salah | ulangi 2.4, restart broker, cek baris 67–68 |
| `[MQTT] Connection failed. code=5` | user ada tapi tidak diizinkan | pastikan user `esp32-001` ada di `pwfile.txt` |
| `[MQTT] Connection failed. code=-2` | alamat/port salah atau diblokir | cek baris 63, `Test-NetConnection`, firewall 2.4 |
| Serial Monitor kosong | USB CDC mati | Tools → USB CDC On Boot → Enabled, upload ulang |
| `status=rejected` + `reason=DEVICE_UNKNOWN` | `DEVICE_ID` tidak ada di database | samakan dengan `esp32-001` atau daftarkan perangkat baru + penugasan chamber |
| `reason=ASSIGNMENT_NOT_FOUND` | belum ditugaskan ke chamber pada waktu itu | jalankan `npm run db:seed`, atau buat penugasan |
| `reason=TOPIC_MISMATCH` | `DEVICE_ID` firmware beda dengan topik | samakan keduanya |
| `reason=SCHEMA_INVALID` | bentuk JSON tidak sesuai | kembalikan kode ke versi asli bila habis diedit |
| `status=accepted_unresolved_time` | NTP gagal → waktu ukur kosong | perbaiki NTP; data ini tidak muncul di halaman Chamber |
| Dashboard ONLINE tapi angka sensor kosong | sensor tidak dipasang / kabel terbalik | cek 4.3 dan flag `*_ENABLED` |
| Dashboard tetap OFFLINE | worker mati, atau alat belum terhubung | cek Jendela 3, cek Serial Monitor |

---

## 5. Mencoba fitur pencatatan dataset

1. Klik avatar kanan atas → **Pencatatan** (atau buka `/batches`).
2. **＋Batch Baru**: isi Tahap A (jam beli 07:00, pasar bebas, 12 ekor,
   485.5 g, suhu 8.2) → Lanjut; Tahap B (±2 jam, cooler 1–4) → Lanjut;
   isi kedua kartu C → Simpan. Coba isi jam 10:00 untuk melihat
   error inline merah menahan tombol Lanjut.
3. Di halaman batch: upload 1 foto JPG, buat sesi H0 (centang warmup →
   Start), complete sesi (centang cleaning), buat + complete H6,
   lalu **Kunci Batch**.
4. Klik **Unduh Metadata** (isian form, selalu ada) dan
   **Unduh CSV Data** (baris sensor; hanya ada bila data sensor masuk
   saat sesi berjalan — lihat catatan di 4.8). Buka keduanya di Excel.

---

## 6. Masalah umum + obatnya

| Gejala | Penyebab | Obat |
|---|---|---|
| `localhost refused to connect` | Belum/tidak ada server jalan | `npm run dev`, tunggu `✓ Ready`, jangan tutup terminalnya |
| Login gagal terus | Salah server: browser membuka salinan lain (`D:\repos\...`, password DB beda) | Matikan server asing, jalankan dev dari folder proyek ini |
| Login gagal setelah `npm run test:db` (hash palsu `custom_secret_...`) | Dulu test `seed-idempotency` meninggalkan hash palsu — sudah diperbaiki: test kini mengembalikan password asli di `after()` | Tidak perlu apa-apa; kalau masih gagal, cek `failedLoginCount`/`lockedUntil` di tabel users (5x gagal = kunci 15 menit) |
| Tampilan aneh (ikon raksasa/menu transparan/label terpotong) | CSS lama di browser/dev cache | Restart `npm run dev` + buka **jendela incognito baru** |
| `Only one usage of each socket (1883)` | Service Mosquitto / instans ganda | `Stop-Service mosquitto` (admin) + set Manual, satu instans manual saja |
| `mosquitto.exe is not recognized` | PowerShell di folder yang salah | `cd "D:\Programs\Mosquitto"` dulu |
| Worker langsung kembali ke prompt tanpa log | Bug lama entry-point Windows | Sudah diperbaiki di kode terbaru (`git pull` bila repo belum update) |
| Nav penuh chamber aneh | Residu test (`Valid ... Chamber`) | Terhapus otomatis tiap `test/api/auth.test.ts` jalan; atau hapus manual chamber tanpa readings |
| Alat tidak bisa menyambung ke broker | `listener` masih `127.0.0.1`, firewall tertutup, atau beda jaringan | kerjakan 2.4; alat & laptop harus satu jaringan |
| Data sensor tidak muncul padahal alat jalan | Worker mati, atau `MQTT_HOST` masih IP lama | Jendela 3 hidup; ulangi 4.6 lalu upload ulang |
| Angka gas `null` di dashboard | sensor tidak terpasang / pin salah | cek 4.3 dan flag `*_ENABLED` (4.9) |
| Kolom CSV Data kosong | tidak ada sesi berjalan saat data masuk | mulai sesi dulu, lalu nyalakan alat (4.8) |

---

## 7. Perintah verifikasi (opsional, untuk yang berani terminal)

```powershell
npm run typecheck   # cek tipe TypeScript
npm run test:unit   # test cepat tanpa database
npm run test:db     # test database (aman untuk password: seed-idempotency mengembalikan hash asli di after())
npm run test:api    # test endpoint HTTP
npm run build       # pastikan produksi bisa di-build
```

Cek langsung isi database bila penasaran:

```powershell
psql "$env:DATABASE_URL" -c "SELECT mqtt_device_id, name, is_active FROM devices;"
psql "$env:DATABASE_URL" -c "SELECT connection_state, connection_evidence, last_seen_at FROM device_statuses;"
psql "$env:DATABASE_URL" -c "SELECT COUNT(*), MAX(received_at) FROM sensor_readings;"
```

---

## 8. Sinkronisasi revisi pembimbing putaran 2 (14 butir) — ringkasan UI yang berubah

Dokumen ini sinkron dengan revisi putaran 2 (14 butir) yang sudah diimplementasikan di kode. Gunakan ini sebagai panduan bila istilah di layar beda dengan catatan lama.

### 8.1 Struktur wizard batch baru: 3 langkah (butir 12)
| Sebelum | Sekarang |
|---|---|
| 2 tahap: Pengadaan → Pengelompokan | 3 tahap: **Pengadaan** → **Kondisi & Dokumentasi** → **Pengelompokan** |
| Langkah 1 memuat semua field logistik + kondisi udang | Langkah 1 (Pengadaan): hanya logistik beli/tiba, jenis sumber (Pasar/Tambak/Supermarket), sumber teks |
| — | Langkah 2 (Kondisi & Dokumentasi): kondisi awal, jumlah, ukuran, panjang, berat total, **suhu udang sebelum observasi** (butir 8), **suhu cool box di pasar & di lab** (butir 7), foto dokumentasi + caption |
| — | Langkah 3 (Pengelompokan): bagi ke SR/SD, pilih **chamber/non-chamber** (butir 1), upload foto per grup + caption (butir 2) |

### 8.2 Istilah & label yang diganti (butir 5, 6, 7, 8, 11)
| Lama | Baru | Alasan |
|---|---|---|
| Tanggal & jam beli/tiba: 1 kolom datetime | **Pecah 2 kolom**: `procured_date` + `procured_time_wib`, `arrived_date` + `arrived_time_wib` | CSV ML-ready, jam device otomatis (butir 5) |
| Jenis sumber: hanya Pasar/Tambak | **Pasar / Tambak / Supermarket** (butir 6) | Variasi asal lebih lengkap |
| Cool box min/max | **Cool box di pasar** / **Cool box di lab** (butir 7) | Dua titik pengukuran nyata |
| "Suhu dalam udang saat tiba" | **"Suhu udang sebelum observasi"** (butir 8) | Lebih tepat: saat masuk chamber, bukan saat tiba lab |
| "Sumber pasar" | **"Sumber"** (butir 12) | Bukan hanya pasar (ada supermarket) |
| "Suhu Dingin (4 ± 1 °C)" | **"Dingin non-chamber (4 ± 1 °C)"** atau **"Dingin, chamber (4 ± 1 °C)"** (butir 1, 11) | Beda mode penyimpanan terlihat di judul grup |

### 8.3 Fitur baru di halaman detail batch
- **Edit per section** (butir 3): tiap kartu grup punya tombol Edit → form modal berisi suhu, berat sebelum/sesudah, foto. Terditolak bila batch sudah terkunci.
- **Foto per grup** (butir 2): upload di step Pengelompokan + di halaman detail, badge SR/SD di daftar foto.
- **Notifikasi lonceng** (butir 9): ikon lonceng header dengan badge unread, dropdown riwayat, modal wajib tutup manual, audio `Better Call Saul Ringtone.mp3` (toggle On/Off). Muncul saat sensor stabil di jendela 10 menit.
- **Filter tabel riwayat** (butir 10): dua input `datetime-local` (dari/sampai) + preset Hari ini / 7 hari / 30 hari / 1 tahun.
- **Judul grafik** (butir 11): "Pergerakan Sensor Gas Aktif" (bukan nama sensor saja).
- **Tombol navigasi step wizard** (butir 14): sticky di bawah mobile, target sentuh ≥44 px.

### 8.4 CSV ekspor yang berubah (butir 5, 7)
Header CSV metadata batch kini memakai:
- `procured_date`, `procured_time_wib`, `arrived_date`, `arrived_time_wib` (UTC+7 konstan)
- `cooler_temp_market_c`, `cooler_temp_lab_c` (ganti `cooler_temp_min_c`, `cooler_temp_max_c`)
- `source_type` nilai: `market` / `farm` / `supermarket` (lowercase)

> ⚠️ Skrip analisis lama / template Excel **perlu disesuaikan** — header dan urutan kolom berubah.

### 8.5 Enam uji manual cepat (bila cuma butuh verifikasi UI)
1. Buka `/batches/new` → isi jam beli `10:00` → **Lanjut** tertahan + pesan merah "jam beli 06:00–08:00".
2. Pilih jenis sumber **Supermarket** → tersimpan dan tampil di daftar batch.
3. Step Pengelompokan: grup dingin → pilih **Langsung di kulkas** → pilihan chamber tersembunyi.
4. Buka halaman detail batch → klik **Edit** di kartu grup → ubah suhu → Simpan → notifikasi sukses pojok kanan bawah.
5. Tabel Riwayat dashboard → pilih preset **7 hari** → angka muncul tanpa alat terhubung.
6. Jalankan sesi dengan alat → tunggu stabil → lonceng berdering + modal muncul → tutup → badge unread hilang.

---

*Terakhir disinkronkan: 19 Oktober 2026 | Kode: branch `main` commit `bc73ad6` (merge fase 4)*
