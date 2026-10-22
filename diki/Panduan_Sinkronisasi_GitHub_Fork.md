# Panduan Sinkronisasi GitHub untuk Fork e-Sniffer Udang

> Dokumen ini menjawab satu pertanyaan: *"Saya fork dari `rvansss/esniffer-udang-web` ke
> `dikialiftaufik/esniffer-udang-web`. Sekarang bagaimana cara kerja sama dengan kolaborator lain
> tanpa bentrok?"*
>
> Diperbarui 22 Oktober 2026 (setelah sinkronisasi upstream commit `e39cacb`).

---

## 1. Peta repo: siapa-siapa

| Repo | Peran | URL | Siapa yang boleh push |
|---|---|---|---|
| **upstream** | Repo **kanonik** (sumber kebenaran; tempat fitur besar dan branch jangka panjang) | `https://github.com/rvansss/esniffer-udang-web` | Pemilik upstream (`rvansss`) & kolaborator upstream lewat **PR** |
| **origin** | **Fork kerja** tim Anda | `https://github.com/dikialiftaufik/esniffer-udang-web` | Tim Anda (Anda + kolaborator yang diundang) |

Di komputer ini, kedua remote itu sudah terdaftar:

```powershell
git remote -v
# origin    https://github.com/dikialiftaufik/esniffer-udang-web.git (fetch/push)  -> fork
# upstream  https://github.com/rvansss/esniffer-udang-web.git        (fetch/push)  -> kanonik
```

> **Aturan emas:** jangan pernah `git push upstream main`. Semua perubahan masuk lewat **PR ke
> `upstream/main`**, supaya upstream bisa mereview.

---

## 2. Dua jenis sinkronisasi

### 2.1 Otomatis (sudah jalan di repo ini)

Ada workflow **`.github/workflows/sync-upstream.yml`** di fork:

- berjalan **otomatis tiap 6 jam** (cron menit 23) atau manual lewat tab **Actions → Sync Upstream to
  Fork → Run workflow**;
- cara kerjanya: **rebase** `main` fork di atas `upstream/main`, lalu **push `--force-with-lease`** ke
  `origin/main`;
- commit milik fork **tidak hilang**, hanya ditulis ulang di atas upstream;
- kalau rebase konflik, job **gagal sebelum push** — jadi fork tidak pernah rusak.

**Konsekuensi yang harus Anda tahu:** karena `main` di fork **ditulis ulang** setiap 6 jam, collaborator
yang punya clone lokal harus menyinkronkan salinannya (lihat §3.1). Ini alasan-alasannya sudah
diperbaiki di commit `3a1ae58` ("fix(ci): jangan timpa branch main saat sinkronisasi upstream").

### 2.2 Manual (Anda, saat mau bekerja)

```powershell
git fetch upstream --prune        # ambil perubahan terbaru upstream
git log --oneline HEAD..upstream/main   # apa yang belum ada di sini
```

Kalau ada commit baru, **terapkan di workspace Anda** dengan cara yang sama seperti CI (rebase):

```powershell
git rebase upstream/main           # menaruh commit Anda di atas upstream
# jika konflik:
#   - selesaikan file yang konflik, lalu: git add <file> && git rebase --continue
#   - batalkan: git rebase --abort
npm run typecheck; npm run test:unit; npm run test:db; npm run test:api
git push --force-with-lease origin main
```

`--force-with-lease` aman: push **ditolak** kalau ada yang lain sudah push lebih dulu (mencegah menimpa
commit orang lain tanpa sengaja).

---

## 3. Alur kerja harian yang disarankan (untuk hindari bentrok)

### 3.1 Awal hari (sebelum ngoding)

```powershell
git fetch --all --prune
git checkout main
git rebase upstream/main          # atau: git pull --rebase origin main
git status                        # pastikan bersih sebelum mulai
```

Kalau `main` di fork sudah ditulis ulang oleh CI sejak clone Anda, `git pull --rebase origin main`
memperbarui salinan lokal Anda ke history yang sama — **tanpa itu, push Anda nanti ditolak**.

### 3.2 Bekerja pada fitur (di branch, bukan di `main`)

```powershell
git checkout -b feat/nama-fitur        # contoh: feat/chamber-create-from-web
# ... kerjakan ...
npm run typecheck && npx eslint . && npm run test:unit && npm run test:db && npm run test:api
git add -A && git commit -m "feat(scope): ringkas apa yang berubah"
git push -u origin feat/nama-fitur
```

Aturan yang dipakai di repo ini (lihat `git log`):

1. **Satu commit = satu topik.** Contoh commit yang ada: `fix(ci): jangan timpa branch main saat sinkronisasi upstream`,
   `feat(chambers): tambah fitur buat chamber baru…`.
2. **Format commit**: `tipe(scope): kalimat singkat` — `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `ci`.
3. **Branch = satu fitur.** Jangan menumpuk beberapa topik dalam satu branch.
4. **Jangan menyentuh branch orang lain.** Kalau memang perlu,``git pull --rebase`` branch itu lebih dulu.
5. **Hanya `main` yang di-rebase otomatis.** Branch fitur tidak disentuh CI (kecuali Anda menjalankan
   workflow dengan centang "Sinkronkan juga seluruh branch upstream").

### 3.3 Setelah selesai → ke upstream lewat PR

```powershell
# di GitHub: Compare & pull request → base: rvansss/esniffer-udang-web, compare: dikialiftaufik/esniffer-udang-web
```

- Tunggu CI hijau di PR (typecheck, eslint, test:unit, test:db, test:api, build, e2e smoke).
- Minta review ke pemilik upstream / pembimbing.
- Setelah di-merge ke `upstream/main`, otomatis masuk ke fork pada sinkronisasi berikutnya.

### 3.4 Memperbarui upstream ke fork (bukan ke upstream)

Kalau upstream sudah punya fitur yang Anda mau adaptasi (bukan-PR):

```powershell
git fetch upstream
git rebase upstream/main            # atau git merge upstream/main
npm run typecheck && npm run test:unit && npm run test:db && npm run test:api
git push --force-with-lease origin main
```

> Kalau Anda memakai `git merge upstream/main` (bukan rebase), commit merge ikut tersimpan dan
> **CI akan me-rebase lagi** — hasilnya tetap benar, tapi history jadi lebih berantakan. Karena itu
> rebase (cara yang sama dengan CI) lebih baik.

---

## 4. Aturan anti-bentrok (ringkas)

| Aturan | Kenapa |
|---|---|
| Jangan `git push upstream main` | Upstream butuh review; push langsung membypass kontrol. |
| Selalu `git pull --rebase` sebelum push | Mencegah "non-fast-forward" dan history jadi berantakan. |
| Kalau harus rewrite history, pakai `--force-with-lease` | Kalau ada yang lain push duluan, push Anda **ditolak** (tidak menimpa commit orang). |
| Jangan rebase branch yang sedang dipakai orang lain | History-nya berubah di bawah kakinya →bentrok di tengah jalan. |
| Satu commit satu topik; satu branch satu fitur | Konflik jauh lebih mudah diselesaikan. |
| Tulis pesan commit yang menjelaskan **kenapa** | Reviewer & versi baru selesai dan paham konteksnya. |
| Simpan file lokal di `.gitignore`; kalau memang harus masuk repo, pakai `git add -f` | `diki/` & `docs/` di-ignore; dokumen deliverable di-`add -f` ( precedent: `diki/Panduan_Fitur_Web_Esniffer.md`). |
| Jangan commit `.env`, kredensial, atau data sampling mentah | `deploy/.env.production.example` & `docker/mosquitto/config/passwords.txt.example` adalah templat, bukan rahasia. |

---

## 5. Kalau bentrok terjadi

### 5.1 Konflik saat rebase (`CONFLICT (content)`)

```powershell
git status                      # lihat file konflik
# buka filenya, pilih gabung manual, lalu:
git add <file>
git rebase --continue           # rebase berikutnya
# batalkan jika salah: git rebase --abort
```

Yang sering muncul saat rebase ke upstream: file yang sama diubah dua pihak (mis. `app/chamber/.../page.tsx`,
`components/layout/Header.tsx`). Aturan praktis: **ambil perubahan upstream sebagai basis**, lalu
terapkan kembali perubahan lokal di atasnya.

### 5.2 Push ditolak (`rejected: non-fast-forward`)

```powershell
git fetch origin
git rebase origin/main          # atau: git pull --rebase origin main
git push --force-with-lease origin main
```

### 5.3 salah push (commit orang lain tertimpa)

```powershell
git reflog                       # cari SHA commit yang tertimpa
git reset --hard <sha>           # kembali ke versi yang benar
git push --force-with-lease origin main
```

> Karena CI memakai `--force-with-lease`, commit yang tertimpa oleh CI **biasanya masih ada** di reflog
> repo (commit lama tidak langsung dihapus GitHub).

---

## 6. Kalau lebih dari satu orang pushing ke fork

Sekarang fork masih "ramai perak": `main` ditulis ulang tiap 6 jam. Kalau nanti ada 2+ orang yang aktif
mengganti `main`, pertimbangkan dua perubahan berikut (keduanya bisa dikerjakan, tinggal diputuskan):

1. **Ganti CI dari rebase ke merge.** File `.github/workflows/sync-upstream.yml` diubah dari
   `git rebase upstream/main` + `--force-with-lease` menjadi `git merge upstream/main` + `git push origin main`.
   Tidak ada history yang ditulis ulang → collaborator tidak perlu `pull --rebase` paksa, dan tidak ada
   commit yang "hilang" karena rebase.
2. **Feature branch sebagai alur utama.** `main` di fork hanya menerima hasil merge dari branch fitur;
   masing-masing orang bekerja di branch sendiri dan membuka PR ke `main` fork.

Sampai keputusan diambil, alur di §3 tetap aman karena:
`fetch → rebase → test → push --force-with-lease`.

---

## 7. Cheat sheet

```powershell
# lihat perubahan upstream yang belum ada di sini
git fetch upstream --prune
git log --oneline HEAD..upstream/main
git diff --stat HEAD...upstream/main

# terapkan di workspace (cara yang sama dengan CI)
git rebase upstream/main
npm run typecheck; npm run test:unit; npm run test:db; npm run test:api
git push --force-with-lease origin main

# everyday
git pull --rebase origin main
git checkout -b feat/nama-fitur
git commit -m "feat(scope): ringkas perubahan"
git push -u origin feat/nama-fitur

# status & kesehatan
git remote -v
git log --oneline --graph --decorate -12
git status
```

---

*Dokumen ini dibuat 22 Oktober 2026, setelah sinkronisasi upstream `e39cacb` (fitur buat chamber +
pasangkan sensor + kredensial Mosquitto) ke fork `dikialiftaufik/esniffer-udang-web`.*
