# Hasil Testing — Bagian A. GUEST (Belum Login)

**Tanggal testing:** 28 Agustus 2026
**Environment:** `npm run dev` lokal (`http://localhost:3000`), Turbopack, Next.js dev mode
**Metode:** Browser otomatis (in-app browser pane) + verifikasi silang lewat kode sumber, query langsung ke Supabase, dan `curl` untuk isolasi bug di endpoint API

> Catatan metode: Claude in Chrome (yang diminta di prompt awal) tidak berhasil terhubung ke browser nyata di sesi ini (tab selalu reset ke `chrome://newtab`), jadi testing dialihkan ke in-app Browser pane — hasilnya setara karena sama-sama browser Chromium sungguhan, bukan simulasi.

---

## Ringkasan

| Kategori | Lolos | Gagal / Tidak Bisa Diuji |
|---|---|---|
| Landing Page | 11 | 0 |
| Widget Cek Keketatan | 4 | 0 |
| Assessment Prediksi PTN | 9 | 1 |
| Beasiswa & Event | 0 | 3 (data kosong) |
| Program | 2 | 2 |
| Auth | 3 | 1 (+1 bug intermiten) |

---

## ✅ LOLOS

### Landing Page
- Navbar urutan: Home – Program – Cek Peluang PTN – Testimonial – Mentor – FAQ ✓
- Footer: link Program (Konsultasi/TKA/SNBT/Ujian Mandiri/Pendampingan Mahasiswa) konsisten persis dengan dropdown Program di Navbar, semua href valid ✓
- Section Hero: 1 CTA dominan "Cek Peluang Masuk PTN mu" → `/assessment` ✓
- Section Program: semua card mengarah ke `/program/[kategori]` sesuai isi dropdown Navbar ✓
- Section Testimonial: tidak ada teks lorem ipsum ✓
- Section Mentor: foto tidak terpotong — pakai `object-contain` (bukan `object-cover`) di CSS jadi memang didesain untuk tidak pernah crop ✓
- Section Leaderboard: tombol "Lihat Leaderboard" merespons (link sungguhan ke `/daftar`, bukan diam) ✓
- Section Ajakan Tryout: CTA "Mulai Try Out" → `/tryout` ✓
- Section FAQ: card "Dimentoring cuma online?" **tidak** menyebut "Banyumas" — isinya menyebut Yogyakarta ✓
- Section closing (sebelum footer): CTA "Daftar Sekarang" jelas → `/daftar` ✓
- Klik logo (Navbar & Footer) → href `/` di semua tempat ✓

### Widget Cek Keketatan (popup landing page)
- Alur Pilih Jalur (SNBP) → Universitas (ITB) → Jurusan (Teknik Mesin & Dirgantara) → klik "Cek Keketatan" berjalan lancar ✓
- Popup hasil menampilkan **bersamaan**: Keketatan "4,69% - Sedang", Kuota Tahun Berjalan "76", Peminat Tahun Lalu "1.621" ✓
- Tombol "Cek Peluang Kamu" di popup → `/assessment` ✓
- Dicoba ulang 2× berturut-turut dengan kombinasi sama → tidak ada limit, selalu berhasil ✓

### Assessment Prediksi PTN (`/assessment`)
Diuji trial anonim di browser dengan cookie bersih (belum pernah ada cookie `dm_trial_id`/session sebelumnya):
- **Isi ke-1** (1 pilihan, ITB Teknik Mesin) → langsung tampil hasil lengkap (Nilai Akhir 87,20 - Tinggi) ✓
- **Isi ke-2** (2 pilihan beda rumpun & beda provinsi: ITB Tambang [Saintek] + UI Ilmu Hukum [Soshum]) → tetap tampil hasil lengkap untuk keduanya ✓
- **Isi ke-3** → otomatis redirect ke `/daftar?pending_assessment=<id>`, bukan halaman hasil ✓
- Isi dengan 1 pilihan PTN → lolos tanpa syarat provinsi (memang tidak ada validasi provinsi untuk anonim) ✓
- Isi Pilihan 1 rumpun Saintek + Pilihan 2 rumpun Soshum → accordion "Rekomendasi Jurusan" tampil **2 set terpisah** ("Rekomendasi untuk Pilihan 1" = Saintek, "Rekomendasi untuk Pilihan 2" = Soshum), masing-masing sesuai rumpun asalnya ✓
- Card "Nilai Akhir": label sesuai skala baru — nilai 87,20 tampil label "Tinggi" (skala 86-94 = Tinggi) ✓
- Card Hasil Prediksi: Kuota Tahun Berjalan + Peminat Tahun Lalu tampil di tiap pilihan ✓
- Link "Hapus Pilihan 2": ada icon trash (SVG) dan warna merah `#E70A0A` — dikonfirmasi lewat inspeksi CSS ✓
- **Note AI**: diuji **8× total** (2× lewat form browser + 6× lewat pemanggilan API langsung dengan trial ID baru tiap kali) — **8 dari 8 percobaan berhasil generate teks unik/berbeda**, tidak sekali pun jatuh ke teks fallback statis. Fix di commit `17a5399` ("longer timeout + retry") tampak bekerja dengan baik ✓

### Auth
- Daftar (Email+Password) → auto-login → redirect ke `/lengkapi-profil` ✓ (lihat catatan bug intermiten di bagian Gagal)
- Wizard `/lengkapi-profil` (4 langkah: Role → Kelas → Mapel Tersulit → No. WhatsApp) sampai selesai → redirect ke dashboard sesuai role (dicoba role Siswa → berhasil ke `/dashboard/siswa`) ✓
- Login pakai akun yang baru saja dibuat → langsung ke `/dashboard/siswa`, **tidak** diminta mengulang wizard lengkapi-profil ✓
- Kebijakan Privasi (`/kebijakan-privasi`) bisa diakses, link dari Footer & halaman Daftar berfungsi (isinya masih berlabel draft — itu memang disengaja, bukan bug) ✓

---

## ❌ GAGAL / TEMUAN

### 1. 🔴 KRITIS — Registrasi (`POST /api/auth/register`) kadang hang tanpa batas waktu
**Langkah:** Isi form Daftar (email/nama/password) → klik "Daftar".

**Yang terjadi:** Dari beberapa kali percobaan, **2 dari ~5 percobaan** request registrasi tidak pernah mendapat response sama sekali — tombol macet di teks "Memproses..." selamanya, tanpa pesan error dan tanpa cara retry selain reload halaman (yang berarti input hilang).

**Bukti isolasi (dari luar browser, pakai `curl` langsung ke API, bukan lewat UI):**
```
curl -m 15 -d '{...}' http://localhost:3000/api/auth/register
→ timeout, exit code 124, tidak ada response sama sekali

curl -m 60 -d '{...}' http://localhost:3000/api/auth/register
→ HTTP_STATUS:000, TIME:60.007548 (habis 60 detik, tetap tidak ada response)

curl -d '{...}' http://localhost:3000/api/auth/register   (percobaan ke-3)
→ HTTP_STATUS:201, TIME:0.554276 (kali ini sukses cepat)
```
Endpoint lain (`GET /`, `POST /api/auth/login`) tetap responsif normal di saat yang sama, jadi ini bukan server mati total.

**Root cause yang ditemukan:** console browser menunjukkan log Next.js dev server:
```
[Fast Refresh] done in 248806ms   ← 248 detik!
[Fast Refresh] done in 165030ms   ← 165 detik!
```
Saat Turbopack sedang melakukan Fast Refresh/recompile (butuh 165–248 detik di environment ini — jauh di atas normal), semua request API baru ikut tertahan sampai proses itu selesai. Ini kemungkinan besar **masalah performa dev server di mesin ini** (Turbopack/Windows filesystem/antivirus), bukan bug logic di route `register` — kode di dalamnya (`hashPassword`, insert `users`, insert `gamifikasi_profiles`) semuanya sudah selesai dieksekusi dengan sukses (dikonfirmasi lewat query langsung ke tabel `users` & `gamifikasi_profiles` di Supabase saat request masih "hang" di browser) — response-nya saja yang tidak kunjung terkirim balik.

**Tapi ada bug kode nyata yang ikut memperparah:** `app/(auth)/daftar/page.tsx` memanggil `fetch("/api/auth/register", ...)` **tanpa timeout/`AbortController`**. Jadi kalau backend lambat/hang (apa pun sebabnya — termasuk di production kalau suatu saat Supabase lambat), user akan stuck selamanya di "Memproses..." tanpa pesan error dan tanpa opsi retry. Ini pola yang sama kemungkinan juga ada di form Login dan Lengkapi Profil (belum dicek eksplisit).

**Rekomendasi:** tambahkan timeout (misal `AbortSignal.timeout(15000)`) + pesan error yang actionable ("Gagal terhubung, coba lagi") saat fetch gagal/timeout, supaya user tidak macet permanen. Root cause lambatnya dev server sendiri sebaiknya dicek terpisah (kemungkinan bukan masalah kode aplikasi).

---

### 2. 🔴 Lupa Password — halaman tidak ada sama sekali (404)
**Langkah:** Dari `/login`, klik link "Lupa Password?" (`href="/forgot-password"`, di `app/(auth)/login/page.tsx:193`).

**Yang terjadi:** 404 — "This page could not be found."

**Verifikasi kode:** tidak ada file route untuk `/forgot-password` atau `/reset-password` sama sekali di folder `app/`, dan tidak ada API route terkait (`grep` untuk "forgot"/"reset password" di seluruh `app/` cuma nemu link mati itu sendiri). Fitur ini sepertinya belum pernah diimplementasikan, padahal linknya sudah live di halaman Login.

**Dampak:** user yang lupa password benar-benar tidak punya jalan keluar dari UI saat ini.

---

### 3. 🟡 Validasi 2 pilihan beda provinsi TIDAK berlaku untuk anonim (berbeda dari checklist)
**Checklist minta:** "Isi dengan 2 pilihan beda provinsi (keduanya di luar provinsi sekolah) → ditolak, pesan jelas."

**Yang terjadi:** Untuk user anonim (belum login), submit dengan 2 pilihan PTN di provinsi berbeda **selalu diterima**, tidak pernah ditolak.

**Ini bukan bug** — sengaja begitu di kode (`app/api/assessment/snbp/route.ts`, BR-29): validasi kecocokan provinsi (BR-28b) memang **hanya berlaku kalau user sudah login** (`if (userId && resolvedPilihan.length === 2)`), karena user anonim belum punya data provinsi sekolah untuk dicocokkan. Item checklist ini sepertinya ditulis dengan asumsi validasi berlaku untuk semua orang termasuk anonim — perlu diklarifikasi apakah checklist perlu diperbarui, atau item ini sebenarnya dimaksudkan untuk role Siswa (bagian B), bukan Guest.

---

### 4. ⚪ Beasiswa & Event — tidak bisa diuji, data kosong
Tabel `konten_info` di database **kosong total (0 baris)**. Akibatnya:
- Section "Perjalananmu Nggak Berhenti Setelah Diterima PTN" di landing page **sengaja disembunyikan** (kode di `components/sections/InfoBeasiswa.tsx` memang hide total kalau item aktif < 3 — ini fallback yang disengaja, bukan bug, sesuai komentar di kode)
- Halaman `/beasiswa-event` menampilkan "Belum ada info beasiswa, internship, atau event saat ini." — search box dan filter (tipe, status) semuanya render dengan benar secara struktural, tapi **tidak bisa diuji fungsinya** karena tidak ada data untuk difilter.

**Rekomendasi:** seed minimal 3-4 baris `konten_info` (campuran Beasiswa/Internship/Event, status buka & tutup) supaya 3 item checklist ini bisa benar-benar diuji.

---

### 5. ⚪ Program — 2 dari 5 kategori tidak tampil (data kosong), dan mode "Lynk.id manual" tidak ada di kode
- Halaman `/program` seharusnya tampil 5 section (Konsultasi/TKA/SNBT/Ujian Mandiri/Pendampingan Mahasiswa) tapi **hanya 3 yang tampil** (Konsultasi, TKA, SNBT). Dikonfirmasi via query Supabase: tabel `kelas` **tidak punya baris sama sekali** untuk kategori `ujian_mandiri` dan `pendampingan_mahasiswa`. Kode sengaja menyembunyikan kategori kosong (komentar di `app/program/page.tsx`: "kategori kosong yang disembunyikan tidak menggeser rotasi template kategori lain") — jadi ini bug data/seeding, bukan bug tampilan. 3 pola desain (Template A/B/C) yang tampil untuk 3 kategori yang ada sudah benar berbeda-beda.
- "Lihat Semua" → `/program/[kategori]` ✓, dan filter Tipe Kelas & Tingkat Kelas **berfungsi dengan benar** (dikonfirmasi: filter "Semi-Private" pada kategori Konsultasi yang isinya cuma 1 kelas "Private" → hasil berubah jadi "Belum ada kelas yang cocok dengan filter ini.") ✓
- **Temuan:** checklist menyebut tombol "Daftar Kelas Ini" harus punya 2 mode tergantung env `NEXT_PUBLIC_PENDAFTARAN_MANUAL` (Payment biasa ATAU redirect Lynk.id). Setelah `grep` menyeluruh di seluruh codebase, **env var ini dan kata "Lynk" sama sekali tidak muncul di kode manapun** — hanya ada di dokumen checklist. Implementasi saat ini cuma py satu mode: belum login → `/login`, sudah login (Siswa) → `/checkout/[kelasId]`. Kemungkinan ini fitur yang direncanakan tapi belum/tidak jadi diimplementasikan — perlu diklarifikasi apakah checklist perlu diperbarui atau fitur ini yang perlu dibangun.

---

## Catatan tambahan
- Beberapa akun uji coba (`test.guest.qa*@example.com`) dan belasan baris `assessments` tersimpan di database Supabase selama sesi testing ini. Beri tahu saya kalau ingin saya bersihkan datanya.
- Tidak ada satu pun error di Console browser (selain warning font-preload & scroll-behavior yang tidak relevan) selama testing bagian Guest ini, di luar isu hang registrasi di atas.
