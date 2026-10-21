# Panduan Menghubungkan Proyek Anda dengan MCP REA

**REA** (*Reverse Engineer Anything*, [morluto/rea](https://github.com/morluto/rea)) adalah satu MCP
server + CLI + *skill* untuk **membongkar cara kerja aplikasi** (reverse engineering): binary native,
aplikasi JavaScript/Electron, situs web, assembly .NET, APK Android, firmware, file WASM, basis data
SQLite, tangkapan jaringan (HAR/SAZ), bahkan berkas model AI. Tujuannya sederhana: **"lihat fitur di
aplikasi lain, pahami cara kerjanya sampai level biner, lalu bangun versinya sendiri di proyek Anda."**

> panduan ini disusun untuk pemula: setiap perintah disertai penjelasan **apa**, **kenapa**, dan
> **bagaimana memastikan berhasil**. Semua fakta di sini **sudah dijalankan dan diverifikasi** di mesin
> ini (21 Oktober 2026), bukan sekadar kutipan dokumentasi.

---

## 0. Status saat ini di mesin Anda (sudah aktif!)

| Komponen | Nilai | Lokasi |
|---|---|---|
| Node.js | **v24.22.1** (LTS, memenuhi syarat REA ≥24.11) | `nvm` → `C:\nvm4w\nodejs` |
| npm | 11.19.1 | ikut Node |
| REA (CLI global) | 6.7.0 — `rea` siap dipakai tanpa `npx` | `C:\nvm4w\nodejs\node_modules\rea-agents\` |
| MCP REA (terdaftar) | **aktif global** → dipakai **semua proyek** | `C:\Users\Lenovo\.config\opencode\opencode.json` |
| Skill REA | **terpasang global** (v42, 207 tool) | `C:\Users\Lenovo\.agents\skills\reverse-engineer-anything\` |
| Backup config | ada (dibuat otomatis saat setup) | `opencode.json.rea.backup` |
| Bukti fungsi | handshake MCP **OK** — server `rea 6.7.0`, **214 tool**; `opencode mcp list` → `✓ rea connected` | `rea doctor` → `healthy: true` |

Entry yang dipakai di config global OpenCode (lihat §7 kenapa bentuk ini):

```json
"rea": {
  "type": "local",
  "command": [
    "C:\\nvm4w\\nodejs\\node.exe",
    "C:\\nvm4w\\nodejs\\node_modules\\rea-agents\\scripts\\rea.mjs",
    "mcp"
  ],
  "timeout": { "startup": 60000, "catalog": 60000, "execution": 300000 }
}
```

> **Penting untuk pemula:** `npx` berarti "jalankan paket ini dari internet saat dibutuhkan" — koneksi
> pertama perlu internet dan bisa memakan 30–60 detik. Setelah paket ter-cache di `npm cache`, pemanggilan
> berikutnya jauh lebih cepat. Karena opencode punya batas waktu handshake MCP yang ketat (§7), **lebih
> baik arahkan ke launcher absolut** (dipasang global) daripada `npx`/`uvx`.

---

## 1. Apa itu MCP (biar jelas dari nol)

**MCP (Model Context Protocol)** = cara standar memberi "alat" ke AI agent.

```
[Anda]  ←  chat biasa
      │  perintah
      ▼
[OpenCode / Claude Code / Cursor / ...]   ←unner tempat kamu mengetik
      │  daftar alat + argumentos (JSON-RPC over stdio)
      ▼
[MCP server REA]  ← proses lokal yang mengerjakan pekerjaan nyata
      │  hasil + bukti (Evidence)
      ▼
[OpenCode]  ← agent merangkai bukti itu jadi penjelasan / kode
```

Tiga hal yang penting dipahami:

1. **MCP server berjalan di komputer Anda** (proses lokal, stdio). Tidak ada layanan bulatan yang
   menganalisis berkas Anda.
2. **Hasil analisis masuk ke penyedia model** yang Anda pakai (OpenCode → model yang Anda pilih).
   Jadi berkas/strings yang terbaca bisa ikut terkirim ke penyedia model — sesuai kebijakannya.
3. **MCP ≠ skill.** MCP = *alat* (server REA, 214 fungsi). Skill = *petunjuk pakai* (file `SKILL.md`
   yang bilang kapan memakai alat mana, cara membaca buktinya, dan ordering yang benar).

---

## 2. Prasyarat

### 2.1 Node.js & npm (wajib)

REA mensyaratkan **Node.js 22.x ≥ 22.19, 24.x ≥ 24.11, atau 26+**, plus npm.

```powershell
node -v      # harus >= 22.19 / 24.11 / 26
npm -v
```

Di mesin ini semula `v22.12.0` (**belum memenuhi**), lalu dinaikkan:

```powershell
nvm install 24.22.1     # unduh Node 24 LTS
nvm use 24.22.1         # aktifkan
node -v                 # v24.22.1
```

Naiknya versi Node memang memengaruhi proyek lain: setelah ganti, binary native (Prisma Client) perlu
dibuat ulang satu kali:

```powershell
npx prisma generate
```

> Proyek ini (Next.js 16) tetap jalan di Node 24 — `npm run typecheck` dan seluruh suite hijau
> setelah perpindahan.

### 2.2 Mesin analisis (opsional, per target)

REA sudah membawa mesin analisis untuk beberapa format; sebagian besar **tidak perlu diinstalasi**:

| Target | Yang dibutuhkan | Status di mesin ini |
|---|---|---|
| Aplikasi JavaScript/Electron (statis) | Node + npm saja | ✅ langsung jalan |
| Situs web | browser keluarga Chrome | ✅ (Edge/Chrome terpasang) |
| .NET assembly (statis) | — | ✅ |
| SQLite | Node **24.x ≥24.15** atau 26+ | ✅ (24.22.1) |
| APK Android (statis) | **JADX headless + JDK penuh** | ⚠️ belum dipasang |
| Binary native (C/C++/Rust/Go) | **Ghidra** (Linux/macOS, + Windows P0 eksperimental *read-only*) atau **Hopper** (macOS/Linux) atau **IDA** | ⚠️ belum dipasang |
| Firmware | `binwalk`/`unblob` (Linux) | ⚠️ belum ada |
| WASM | WABT 1.0.42 | ⚠️ belum ada |
| .NET/IL2CPP/Godot/Flutter statis | — | ✅ |

`rea doctor` akan memberi tahu persis apa yang kurang dan cara memperbaikinya.

> **Catatan Windows:** Hopper **tidak tersedia di Windows** ( installersnya hanya macOS/Linux). Analisis
> native di Windows baru ada lewat Ghidra *Windows P0* yang masih eksperimental dan hanya *read-only*
> (tidak bisa menamai/annotate fungsi). Untuk analisis native penuh, siapkan mesin Linux/macOS.

---

## 3. Ringkasan 5 menit (kalau ingin cepat)

```powershell
# 1. Pastikan Node memenuhi syarat
node -v                                   # v24.22.1

# 2. Daftarkan REA ke OpenCode + pasang skill (per klien yang dipilih)
npx -y rea-agents@latest setup --client opencode

# 3. Lihat rencananya dulu (tidak mengubah apa pun)
npx -y rea-agents@latest setup --client opencode --dry-run --json

# 4. Terapkan
npx -y rea-agents@latest setup --client opencode --yes --json

# 5. Periksa kesehatan
npx -y rea-agents@latest doctor --client opencode --json

# 6. Restart OpenCode, lalu coba analisis tanpa MCP pun:
npx -y rea-agents@latest analyze-javascript-application "D:/path/ke/aplikasi" --json
```

---

## 4. Tiga cara pemasangan

### 4.1 Cara A — Otomatis (`setup`) ✅ yang dipakai di sini

```powershell
npx -y rea-agents@latest setup
```

Setup bersifat **interaktif**: ia menampilkan daftar klien yang terdeteksi, Anda memilih, lalu ia
**menampilkan rencana perubahan persis** (file mana, baris mana) sebelum menulis. Yang dilakukan:

- menambah entri MCP `rea` ke config klien terpilih,
- memasang skill `reverse-engineer-anything` ke folder skill personal klien itu,
- membuat **backup** config lama (`.rea.backup`),
- **tidak** menyentuh entri lain yang sudah ada di config.

Karena `setup` butuh terminal interaktif, untuk otomatisasi dipakai flag:

```powershell
# rencana (read-only, exit 0, JSON)
npx -y rea-agents@latest setup --client opencode --dry-run --json

# terapkan untuk klien tertentu saja
npx -y rea-agents@latest setup --client opencode --yes --json

# semua klien terdeteksi (hati-hati: affects semua)
npx -y rea-agents@latest setup --all-detected --yes --json
```

Flag penting: `--client <id>` (bisa diulang), `--skill=false` (tanpa skill), `--dry-run`, `--json`,
`--yes`, `--install-hopper` (pasang Hopper, macOS/Linux saja, perlu persetujuan terpisah).

### 4.2 Cara B — Manual (per klien, tanpa `setup`)

Kalau Anda ingin mendaftar sendiri ke klien (mis. tidak boleh memakai `setup`, atau ingin tahu persis isinya),
tambahkan entri berikut.

**OpenCode** — `C:\Users\Lenovo\.config\opencode\opencode.json` (global → semua proyek):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "servers": {
      "rea": {
        "type": "local",
        "command": [
          "C:\\nvm4w\\nodejs\\node.exe",
          "C:\\nvm4w\\nodejs\\node_modules\\rea-agents\\scripts\\rea.mjs",
          "mcp"
        ],
        "timeout": { "startup": 60000, "catalog": 60000, "execution": 300000 }
      }
    }
  }
}
```

Di macOS/Linux, perintahnya tanpa `cmd.exe` dan tanpa path Windows:

```json
"command": ["/usr/local/bin/node", "/usr/local/lib/node_modules/rea-agents/scripts/rea.mjs", "mcp"]
```

> Kenapa `cmd.exe /d /c` di Windows? Program stdio di Windows perlu "shim" `cmd.exe` agar pipe
> stdin/stdout diteruskan utuh ke proses anak. Tanpa itu, MCP sering menampakkan "server tidak merespons".
> Tapi kalau REA sudah dipasang global (`npm install --global rea-agents`), **lebih baik arahkan ke
> `node` + `scripts/rea.mjs`**: tanpa `npx`, tanpa resolusi paket, start lebih cepat (terukur 3,4 dtk
> vs 6,8 dtk lewat `npx`) — dan itu penting karena opencode punya batas handshake MCP hanya 5 detik
> secara bawaan (§7).
>
> Bentuk `timeout` di atas (objek) adalah bentuk **native** yang dipakai opencode versi ini. Bentuk
> angka (`"timeout": 60000`) ditolak runtime dan entry-nya **dibuang diam-diam** (lihat §7).

**Claude Code** (per proyek, tanpa skill):

```powershell
claude mcp add --scope local rea -- npx -y rea-agents@6.7.0 mcp
# Windows:
claude mcp add --scope local rea -- cmd.exe /d /c npx -y rea-agents@6.7.0 mcp
```

**Claude Desktop** → `claude_desktop_config.json`:

```json
{ "mcpServers": { "rea": { "command": "cmd.exe", "args": ["/d","/c","npx","-y","rea-agents@6.7.0","mcp"] } } }
```

**Cursor** → `~/.cursor/mcp.json` (sama seperti di atas, key `mcpServers`).
**VS Code** → `.vscode/mcp.json` (key `servers`).
**Gemini CLI** → `~/.gemini/settings.json` (key `mcpServers`).

> **Ingat aturan Claude Desktop (Windows):** tutup aplikasinya **sepenuhnya** sebelum menjalankan
> `setup`, kalau tidak aplikacji menimpa ulang config dari memori dan registration-nya hilang.

### 4.3 Cara C — CLI tanpa MCP

REA bisa dipakai dari terminal biasa, tanpa agent sama sekali:

```powershell
# analisis statis aplikasi JavaScript/Electron
npx -y rea-agents@latest analyze-javascript-application "D:/apps/contoh" --json

# instalasi global supaya ada perintah `rea`
npm install --global rea-agents
rea --help
rea capabilities        # daftar kemampuan + efek samping
```

---

## 5. Skill: PETUNJUK PAKAI untuk agent

MCP memberi *kemampuan*; skill memberi *cara pakai yang benar*. Tanpa skill, agent tetap bisa memanggil
tool, tetapi bisa salah memakainya (mis. menyimpulkan tanpa bukti).

```powershell
# skill saja (tanpa MCP) — untuk yang sudah punya MCP REA
npx skills add morluto/rea --skill reverse-engineer-anything
```

Tempat skill:

| Lokasi | Cakupan |
|---|---|
| `C:\Users\Lenovo\.agents\skills\reverse-engineer-anything\` | **semua proyek** (dipakai setup di sini) |
| `<proyek>\.agents\skills\reverse-engineer-anything\` | hanya proyek itu |

Isi folder skill: `SKILL.md` (23 KB, alur kerja utama) + `references/` (panduan detail per jenis target).

> Proyek ini punya folder `.agents/skills/` berisi skill lain (code-review, clean-code, git-commit, …).
> Skill REA sengaja dipasang **global** agar bisa dipakai di repo mana pun, termasuk proyek Anda
> yang lain.

---

## 6. "Proyek ini" vs "Proyek lainnya" — tiga lapis

OpenCode membaca config **berlapis**: config **global** (semua proyek) digabung dengan config
**proyek** (`opencode.json` di root repo). Keduanya bisa sama-sama dipakai.

| Lapis | File | Cakupan | Kapan dipakai |
|---|---|---|---|
| **1 — Global** ⭐ | `C:\Users\Lenovo\.config\opencode\opencode.json` | **Semua proyek** | Default; sudah dipakai REA di sini |
| **2 — Proyek** | `<repo>\opencode.json` | Hanya repo itu | Kalau sebuah repo butuh MCP khusus (repo ini punya `github` + `excel`) |
| **3 — Satu proyek saja** | entri lokal di `~/.claude.json` (Claude Code `--scope local`) | Hanya satu folder, tidak ikut ke repo | Kalau REA hanya boleh di satu proyek |

**Yang aktif di repo `esniffer-udang-web` sekarang:** global (pencil, figma, **rea**) + proyek (github,
excel) → **semua 5 server MCP + skill REA tersedia** setelah restart.

Project-level `opencode.json` repo ini **sengaja tidak diubah** — entri REA global sudah cukup, dan
memasukkan entri `npx` ke repo yang di-commit membuat semua clone repo menjalankan REA tanpa sengaja.
Kalau memang mau, tambahkan blok `rea` yang sama persis di `opencode.json` repo ini (JSON-nya portabel,
tidak ada path absolut).

> Catatan keamanan: config **global** berarti REA bisa dipanggil dari mana saja. Kalau lebih suka
> pembatasan, pakai **profil** (Claude Code: `CLAUDE_CONFIG_DIR`) atau registrasi *satu proyek saja* —
> detailnya ada di `docs/installation.md` bagian "Limit REA to one project or agent profile".

---

## 7. Cara memverifikasi (bukan "kira-kira jalan")

```powershell
# 1) kesehatan registration + skill (read-only, tidak mengubah apa pun)
npx -y rea-agents@latest doctor --client opencode --json
npx -y rea-agents@latest doctor --skill --json

# 2) audit penuh (semua klien + mesin analisis)
npx -y rea-agents@latest doctor --json

# 3) buktikan server MCP benar-benar hidup (handshake manual)
'{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"probe","version":"1.0"}}}' |
  npx -y rea-agents@6.7.0 mcp
# hasil yang benar memuat: {"result":{"serverInfo":{"name":"rea","version":"6.7.0"}...}}
```

Hasil di mesin ini: `doctor` → `healthy: true` (untuk scope opencode+skill), handshake → server
`rea 6.7.0`, **214 tool** terdaftar. `environment_healthy: false` **wajar** — itu hanya menandai mesin
analisis native (Ghidra/IDA/JADX/Kuna) yang memang belum dipasang; fitur tanpa mesin analisis tetap
normal.

### 7.1 "MCP Failed" — penyebab, bukti, dan cara memastikan

Di panel OpenCode, server yang gagal start tampil **merah** dengan keterangan `failed: Request timed
out`. Ini **bukan** berarti paketnya rusak — opencode punya **batas handshake MCP hanya 5 detik**
(`timeout` bawaan), dan server yang start lebih lambat akan kalah balapan. Terukur di mesin ini:

| Server | Cara start | Waktu handshake | Hasil |
|---|---|---|---|
| REA | `npx -y rea-agents@6.7.0 mcp` | **6,8 dtk** | ✗ gagal (timeout) |
| REA | `node …\rea-agents\scripts\rea.mjs mcp` (global) | **3,4 dtk** | ✓ |
| excel | `uvx excel-mcp-server stdio …` | **12,1 dtk** | ✗ gagal (timeout) |
| excel | `…\.local\bin\excel-mcp-server.exe stdio …` (tool uv) | **11,4 dtk** | ✓ (dengan timeout dinaikkan) |

Tiga perbaikannya (berurutan dari yang palingatel):

1. **Naikkan anggaran waktu** — di config, per server:
   ```json
   "timeout": { "startup": 60000, "catalog": 60000, "execution": 300000 }
   ```
   `startup` = bolehnya server menjawab handshake; `catalog` = bolehnya katalog tool diambil; `execution` =
   bolehnya satu panggilan tool berjalan. **Perhatikan:** runtime opencode terpasang **menolak**
   `timeout` berbentuk angka (`"timeout": 60000`) — entri lalu dibuang diam-diam dan server **tidak muncul
   sama sekali** di daftar (bukan "failed"). Bentuk objek di atas yang benar.
2. **Pakai launcher absolut, bukan `npx`/`uvx`** — pasang paketnya sekali
   (`npm install --global rea-agents`, `uv tool install excel-mcp-server`), lalu arahkan `command` ke
   executable/launernya. Tidak ada resolusi paket, tidak ada jaringan saat start.
3. **Verifikasi dengan alat, bukan mata**:
   ```powershell
   # status semua server (versi desktop: "connected" / "failed" / "pending")
   & "$env:LOCALAPPDATA\Programs\@opencodedesktop\resources\opencode-cli.exe" mcp list

   # log normalisasi config: látak entri yang DIBUANG karena tidak valid
   Select-String -Path "$env:USERPROFILE\.local\share\opencode\log\opencode.log" `
     -Pattern "configuration normalization diagnostic" | Select-Object -Last 8
   ```
   Kata kunci di log yang penting:
   - `kind=invalid action="skipped malformed recognized value"` → **entri ditolak** (bentuk `timeout`
     salah, atau field tak dikenal) → server tidak akan pernah muncul.
   - `kind=conflict action="retained native value over legacy value"` → **normal**: config punya entri di
     `mcp.servers.<nama>` (native) dan `mcp.<nama>` (legacy); yang native dipakai.
   - `mcp connect failed … status.error="Request timed out"` → server kalah balapan handshake 5 detik.

   > **Catatan:** `opencode mcp list` yang dijalankan dari terminal punya anggaran lebih pendek daripada
   > aplikasinya, jadi server lambat bisa tampil **"pending"** di CLI padahal di aplikasi sudah
   > terhubung. Yang otoritatif adalah panel OpenCode dan log di atas.

---

## 8. Contoh nyata untuk proyek `esniffer-udang-web`

Proyek ini: aplikasi web Next.js (dashboard + pencatatan data udang),ESP32 (MQTT, sensor MQ-137/136/4,
DHT-22), dan aplikasi seluler. REA berguna saat Anda perlu **memahami sistem yang tidak Anda miliki
kode sumbernya**, atau memeriksa artefak milik sendiri.

| Tujuan | Perintah / tool REA | Catatan |
|---|---|---|
| Memahami perilaku aplikasi/website lain | minta agent: *"Pahami cara fitur X bekerja di situs/aplikasi Y, tunjukkan buktinya, lalu bangun versi mirip untuk proyek ini"* | gunakan tool browser (`capture-web-screenshot`, `analyze-web-bundle`, `observe-web-execution`) |
| Membongkar aplikasi Electron/JS | `rea analyze-javascript-application "D:/apps/aplikasi" --json` | tanpa mesin analisis native ✓ |
| Membaca tangkapan jaringan (HAR) | `rea` tool untuk capture HAR/SAZ | cocok untuk menelusuri API aplikasi |
| Menelusuri basis data SQLite | tool SQLite (butuh Node ≥24.15) | Node 24.22.1 ✓ |
| Menelusuri firmware ESP32 | `binwalk` + tool firmware (Linux) | butuh mesin Linux |
| Membandingkan versi aplikasi | `rea compare-application-versions` | selalu dengan bukti |
| Merekam perilaku runtime | `capture-electron-scenario`, `observe-web-session` | butuh aplikasi target terpasang |

Alur yang benar (sesuai skill REA): **buka target → kumpulkan bukti → tanyakan ulang dengan bukti →
baru tulis implementasinya**. Jangan pernah menyimpulkan dariCt dada heuristik; REA sengaja meng wirelessly
*bukti* (Evidence) + *batasan*.

---

## 9. Merantai dengan MCP lain yang sudah terpasang

Repo ini sudah punya **excel** (untuk `exports/`) dan **github**. Alur yang masuk akal:

1. REA menganalisis target → hasil+bukti (Evidence, JSON).
2. Agent merangkum ke CSV/Excel lewat MCP `excel` (folder `exports/`) → tabel perbandingan/audit.
3. GitHub MCP untuk membuat issue/PR berisi ringkasan + tautan bukti.

Jadi "paham fitur di aplikasi lain" bisa berakhir sebagai **laporan CSV + PR** tanpa keluar dari editor.

---

## 10. Keamanan, etika, dan batas penggunaan

- **Analisis berjalan lokal.** Target tidak diunggah ke server REA. Namun **hasil analisis dikirim ke
  penyedia model** yang Anda pakai — perlakukan string/sumber dari target sebagai data, bukan instruksi.
- **Hanya software yang Anda berhak.** REA bathtub untuk riset, pendidikan, interoperabilitas, preservasi
  perangkat lunak, dan analisis atas milik Anda sendiri/berhak Anda periksa. Reverse engineering tanpa
  izin dapat melanggar hukum)).
- **Jangan jalankan binary tak dikenal** di mesin penting: REA bisa menjalankan target (runtime capture).
  Untuk target mencurigakan, pakai analisis **statis** saja dan kerjakan di mesin terpisah.
- **Lisensi tool commercial** (Hopper, IDA/Hex-Rays, JEB) terpisah; REA tidak memberi lisensi apa pun.
  Hanya pakai perangkat lunak yang berlisensi sah.
- **Data sensitif**: draf/berkas proyek ini tidak boleh ikut dib copolymer ke target analisis.

---

## 11. Perawatan

```powershell
# perbarui instalasi global
rea update                 # atau: npx -y rea-agents@latest setup

# perbarui registrasi + skill setelah update (pin versi ikut naik)
npx -y rea-agents@latest setup --client opencode --yes --json

# hapus registrasi + skill (data lain tidak disentuh)
rea uninstall
rea uninstall --purge-data     # sekaligus hapus cache/state di ~/.rea
```

> Registrasi MCP di-pin ke versi REA yang memasanginya (`rea-agents@6.7.0` saat ini). Setelah
> `rea update`, jalankan `setup` sekali lagi agar pin ikut naik — kalau tidak, server MCP masih
> menjalankan versi lama.

---

## 12. Troubleshooting

| Gejala | Penyebab | Solusi |
|---|---|---|
| Panel OpenCode: MCP **Failed — Request timed out** | opencode punya batas handshake MCP **5 detik**; server yang start >5 detik kalah | naikkan `timeout` per server (§7.1) + arahkan `command` ke launcher absolut (bukan `npx`/`uvx`) |
| Server **tidak muncul sama sekali** di daftar MCP | entri ditolak parser: `timeout` numerik ditolak, bentuk yang benar objek `{startup, catalog, execution}` | ubah `timeout` ke objek; cek log: `kind=invalid action="skipped malformed recognized value"` |
| `setup`/`rea` gagal: "Node.js version not supported" | Node < 22.19 / < 24.11 | `nvm install 24.22.1` + `nvm use 24.22.1` |
| Tool REA tidak muncul di sesi | klien belum restart, atau konfigurasi belum tersimpan | tutup & buka ulang klien; `doctor --client opencode --json` |
| "server tidak merespons" saat start | pipe stdio tidak diteruskan di Windows | pakai `cmd.exe /d /c npx …` (setup menulis command itu sendiri) |
| `npx` sangat lambat / timeout | paket belum ter-cache & koneksi lambat | jalankan sekali manual `npx -y rea-agents@6.7.0 --help`; atau `npm i -g rea-agents` lalu pakai `rea` |
| "malformed configuration" saat setup | config klien berisi komentar/koma/trailing/BOM | repair file ke JSON polos, ulangi setup |
| Katalog tool terlalu besar untuk model | 214 tool/schema penuh | set `REA_MCP_INPUT_SCHEMA_PROFILE=compact` di `environment` entri MCP; restart klien |
| `capability_unavailable` saat analisis native | Ghidra/Hopper/IDA belum ada | `rea doctor --provider ghidra --json`; pasang Ghidra 12.1.x + JDK 21, set `GHIDRA_INSTALL_DIR` & `JAVA_HOME` |
| Analisis APK gagal | JADX headless + JDK penuh belum ada | set `REA_JADX_MCP_JAR` ke path absolut JAR `jadx-headless-mcp 0.7.1` |
| Error `ps` tidak ditemukan (Linux) | procps belum terpasang | `sudo apt install procps` (Linux saja) |
| Konflik nama: config proyek menimpa global | OpenCode menggabungkan config; entri dengan nama yang sama akan menimpa | gunakan nama server unik, atau andalkan global |

---

## 13. Cheat sheet

```powershell
# —— prasyarat ——
node -v                                   # >= 22.19 / 24.11 / 26
nvm install 24.22.1; nvm use 24.22.1     # Windows + nvm
npx prisma generate                      # kalau proyek pakai Prisma

# —— pemasangan ——
npx -y rea-agents@latest setup --client opencode --dry-run --json   # rencana
npx -y rea-agents@latest setup --client opencode --yes --json       # terapkan
npx skills add morluto/rea --skill reverse-engineer-anything         # skill saja

# —— verifikasi ——
npx -y rea-agents@latest doctor --json
npx -y rea-agents@latest doctor --client opencode --json
npx -y rea-agents@latest doctor --skill --json

# —— pakai ——
npx -y rea-agents@latest analyze-javascript-application "D:/path" --json
npx -y rea-agents@latest capabilities

# —— perawatan ——
rea update
npx -y rea-agents@latest setup --client opencode --yes --json
rea uninstall
```

## 14. Referensi

- Repositori & dokumentasi lengkap: <https://github.com/morluto/rea> · situs: <https://rea.tools/>
- Dokumentasi instalasi & klien: `docs/installation.md`, `docs/client-configuration.md` (di repo REA)
- Kontrak MCP & katalog tool: `docs/mcp-contracts.md`
- Panduan pemula RESMI REA (Bahasa Indonesia): `docs/readme/README_id.md`
- Contoh kasus nyata: <https://rea.tools/showcase/>

---

*Dokumen ini dibuat dan diverifikasi pada 21 Oktober 2026 di mesin Windows dengan Node v24.22.1,
REA 6.7.0, dan OpenCode. Perbarui bila versi REA/Node berubah.*
