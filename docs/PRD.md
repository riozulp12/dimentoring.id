# Product Requirement Document (PRD) v3.0
# Dimentoring — Education Journey Mentoring Platform

| | |
|---|---|
| **Produk** | Dimentoring.id — Education Journey Mentoring Platform |
| **Versi Dokumen** | v3.0 — Konsolidasi tunggal (menggabungkan v1.0 + v2.0 + revisi berbasis desain Figma final) |
| **Disusun untuk** | Rio Zulfa Pambudi (Founder & CEO), COO, CTO |
| **Status** | Baseline development — siap dipakai acuan Claude Design (UI/UX) & Claude Code (frontend/backend/database/API/AI/testing/deployment) |

## Riwayat Revisi

- **v1.0**: PRD awal berdasarkan requirement dasar 3 role x 10 fitur.
- **v2.0**: Penambahan Sistem Referral, Gamifikasi, penajaman Assessment per jalur, Tryout Free/Premium + AI Pembuat Soal, strategi Landing Page berbasis analisis kompetitor, strategi UX Product Psychology.
- **v3.0 (dokumen ini)**: Konsolidasi v1+v2 jadi **satu dokumen tunggal** (sebelumnya sebagian requirement Register/Login masih "menumpang" di file v1, sekarang digabung penuh ke satu tempat). Merevisi seluruh dokumen berdasarkan **desain Figma final** yang sudah dibuat: Landing Page, Login, alur Register/Onboarding 3-role (progressive profiling), dan halaman Assessment + Hasil Assessment SNBP. Business Rule Mentor diubah dari "invite-only" menjadi "self-register + approval Admin" sesuai keputusan bisnis terbaru.

---

# BAGIAN 0 — RINGKASAN EKSEKUTIF

Dimentoring bertransformasi dari layanan private mentoring berbasis WhatsApp menjadi platform digital dengan positioning **"Education Journey Mentoring"** — pendampingan siswa SMA/gap year menuju PTN yang berlanjut hingga masa kuliah (beasiswa, internship, event). Dokumen v3.0 ini adalah versi konsolidasi akhir yang menyatukan seluruh iterasi sebelumnya menjadi satu sumber kebenaran (single source of truth), disinkronkan penuh dengan desain Figma yang sudah dibuat tim.

---

# BAGIAN 1 — ANALISIS KRITIS & CATATAN REKONSILIASI DESAIN

Bagian ini merangkum temuan kritis dari v1→v2 (tetap relevan) ditambah temuan baru dari rekonsiliasi terhadap desain Figma final.

### 1.1 Temuan dari Revisi v1→v2 (ringkas)
- Referral & Gamifikasi dasar dipindah ke Fase 1 (bukan cuma "Penyempurnaan Referral" di Fase 2).
- Skor try out dijadikan input opsional tambahan untuk SNBT, bukan wajib.
- AI Pembuat Soal wajib human review sebelum publish, dipindah ke Fase 3.
- Leaderboard granular (kota/provinsi/nasional) butuh data terstruktur, ditahan sampai Fase 3.
- Leaderboard & testimoni wajib pakai alias/nama disamarkan untuk privasi anak.

### 1.2 Temuan Baru dari Rekonsiliasi Desain Figma (v3.0)

| Temuan | Detail | Resolusi |
|---|---|---|
| **BR-2 berubah arah** | Semula "Mentor tidak boleh self-register" (invite-only). Desain "Sign In 1" menampilkan pemilihan role terbuka (Siswa/Mentor) di form publik. | Diselesaikan Rio: Mentor **boleh self-register**, tapi akun baru aktif setelah **approval Admin**. BR-2 direvisi total (lihat Bagian 8). |
| **Urutan onboarding terbalik dari asumsi awal** | PRD lama mengasumsikan: buat akun dulu → baru onboarding. Desain nyata: **profiling dulu (role, kelas/PTN, minat/jurusan, No WA) → baru buat akun (email/password) di langkah terakhir.** | Pola "progressive profiling" ini justru lebih baik secara Product Psychology (Commitment Effect, Endowed Progress — lihat Bagian 10). PRD direvisi mengikuti urutan desain, bukan asumsi lama. |
| **Verifikasi akun bukan OTP manual** | Tidak ada field kode OTP di desain manapun. | Diputuskan: verifikasi via **klik link** (WA sebagai jalur utama, email fallback), bukan input kode — lebih sedikit gesekan, sesuai kanal utama Dimentoring. |
| **Field CV Mentor dihapus, field Subtes Diampu ditambah sebagai step baru** | Draft alur lama (flow 9.9) menyebut CV & Subtes, tapi desain 5-langkah awal tidak memuatnya. | Rio memutuskan: CV dihapus dari requirement. Subtes yang diampu ditambahkan sebagai **step onboarding baru khusus Mentor** (checklist multi-select), sehingga jalur Mentor punya 6 langkah sementara jalur Siswa tetap 5 langkah — progress bar harus dibuat dinamis, bukan fixed. |
| **Input Assessment SNBP lebih sederhana dari spesifikasi awal** | PRD v2 menyebut input SNBP termasuk ranking sekolah, akreditasi sekolah, kuota sekolah, dan nilai TKA. Desain nyata **tidak meminta itu langsung ke siswa** — hanya Nilai Raport (Semester 1-5), Prestasi (opsional), dan Pilihan Universitas+Jurusan (4 pilihan). | Ini justru desain yang lebih baik: data sekolah (ranking, akreditasi, kuota) **diambil otomatis dari entitas `Sekolah`** yang sudah dipilih siswa saat onboarding, bukan diminta manual berulang. Nilai TKA dihapus total dari input SNBP — secara faktual SNBP memang tidak menggunakan skor TKA (itu kekeliruan di draf v2 yang mencampur mekanisme SNBP dengan SNBT). **Dikoreksi di v3.0.** |
| **Output Assessment punya 2 metrik berbeda, bukan 1** | Desain menampilkan **Keketatan (%)** — murni dari rumus kuota/peminat, dan **Peluang (skor + label kualitatif)** — kalkulasi terpisah yang mempertimbangkan profil personal siswa (nilai rapor, prestasi) dibanding keketatan. | Dua metrik ini didokumentasikan sebagai field terpisah di data model & FR (lihat Bagian 7.4 dan 13). |
| **Rekomendasi Paket Tryout belum terlihat eksplisit** | Desain hasil assessment menampilkan Rekomendasi Jurusan dan Rekomendasi Kelas, tapi tidak ada section eksplisit "Rekomendasi Tryout". | Dicatat sebagai gap kecil — direkomendasikan ditambahkan (bisa masuk ke dalam section "Note" yang sudah ada, atau section baru), untuk dikonfirmasi ke Rio/desainer. |

---

# BAGIAN 2 — PRODUCT OVERVIEW

Dimentoring Web Platform adalah rumah digital dari seluruh perjalanan siswa: mengenal Dimentoring → mengukur peluang masuk PTN → belajar terstruktur → berlatih try out → mendapat pendampingan AI dan mentor manusia → tetap terhubung pasca-diterima PTN lewat info beasiswa/internship/event — dengan mesin pertumbuhan organik (referral & gamifikasi) yang melekat di seluruh perjalanan tersebut.

**Diferensiasi vs kompetitor**: Ruangguru & platform sejenis unggul di skala konten dan tools, tapi generik secara personal. Dimentoring bermain di **personalized long-term mentoring** — kombinasi tools (assessment, tryout, gamifikasi) DENGAN pendampingan manusia yang berlanjut sampai kuliah.

---

# BAGIAN 3 — TUJUAN PRODUK

1. Mengubah Dimentoring.id dari landing page menjadi platform operasional penuh untuk siklus siswa dari assessment hingga pasca-PTN.
2. Menjadikan Payment sebagai satu-satunya gerbang akses konten berbayar.
3. Membangun mesin pertumbuhan organik terstruktur (Referral + Gamifikasi).
4. Menyediakan Analytics untuk pengambilan keputusan berbasis data seiring target scale 30 → 500+ siswa.
5. Menjaga kualitas & kredibilitas konten akademik sebagai aset kepercayaan jangka panjang.
6. Membangun fondasi teknis yang bisa diperluas ke fase Ecosystem tanpa dibangun ulang dari nol.
7. **(Baru)** Meminimalkan friksi pendaftaran lewat progressive profiling — siswa/mentor "berinvestasi" menjawab pertanyaan ringan sebelum diminta komitmen membuat akun.

---

# BAGIAN 4 — ANALISIS KOMPETITOR & STRATEGI LANDING PAGE

### 4.1 Ringkasan Analisis Kompetitor

| Platform | Positioning Inti | Kekuatan | Kelemahan / Celah |
|---|---|---|---|
| **Ruangguru** | Digital learning ecosystem skala besar | Rasionalisasi SNBP real-time, Ruanguji tryout gratis+premium, 7 subtes resmi SNBT | Generik/masal, pendampingan personal minim, tidak ada kontinuitas pasca-PTN |
| **Zenius** | Belajar berbasis konsep/nalar | Positioning edukatif kuat | Riwayat operasional tidak stabil |
| **Quipper** | Video learning + distribusi B2B sekolah | Distribusi lewat sekolah kuat | Konten seragam, minim diferensiasi |
| **Habitutor** | Habit-based learning/coaching | Pendekatan pembentukan kebiasaan | Skala kecil |
| **Duolingo** | Konsistensi harian lewat gamifikasi | Streak, XP, maskot konsisten di semua titik interaksi | Model gamifikasi murni untuk skill drilling, bukan ujian tinggi-stakes |
| **Khan Academy** | Mastery-based learning gratis | Struktur misi belajar jelas, sangat dipercaya | Kurang emosional/personal, tanpa pendampingan manusia |
| **Coursera** | Kredensial & outcome-oriented | Social proof kuat, CTA jelas per produk | Model marketplace besar, tidak relevan untuk kedekatan personal |

### 4.2 Peluang Diferensiasi
Tidak ada kompetitor besar yang eksplisit menjanjikan **pendampingan berlanjut pasca-diterima PTN** sebagai value proposition inti — ini celah pasar nyata yang jadi pesan utama Dimentoring.

### 4.3 Struktur Landing Page Final (sesuai desain Figma)

| # | Section | Status Implementasi & Catatan |
|---|---|---|
| 1 | Hero | ✅ Ada. **Masih 2 CTA setara bobot** — direkomendasikan satu CTA dominan (belum diubah di desain terakhir yang dicek). |
| 2 | Value/Stats bar | ✅ 100+ Siswa, 30+ Mentor, 5+ Event, 7+ Program |
| 3 | Prediction (Keketatan) | ✅ Ada, dengan keterangan sumber data snpmb. **Cek disclaimer sudah ada di halaman Assessment itu sendiri** (dikonfirmasi via desain Assessment SNBP) — bagus. |
| 4 | Why (Kenapa Dimentoring) | ✅ 4 kartu termasuk "Berlanjut Sampai Kuliah" — diferensiasi utama sudah eksplisit |
| 5 | Program & Class | ✅ TKA/SNBT/Mandiri/Mahasiswa |
| 6 | Mentor | ✅ Carousel mentor |
| 7 | Testimonial | ⚠️ Masih placeholder Lorem Ipsum — **wajib diganti konten asli sebelum development lanjut** |
| 8 | Leaderboard/Referral teaser | ✅ Poin & leaderboard dengan nama disamarkan |
| 9 | FAQ | ✅ Ada |
| 10 | Statement/Closing | ⚠️ Section "Statement" saat ini lebih seperti tagline penutup, belum ada CTA konversi eksplisit sebelum footer |

---

# BAGIAN 5 — USER ROLES

| Role | Deskripsi | Sub-status / Status Akun |
|---|---|---|
| **Student** | Siswa SMA (10-12) atau gap year hingga alumni PTN | `calon_mahasiswa` vs `mahasiswa/alumni` — menentukan fitur yang tampil |
| **Mentor** | Tutor/mentor kelas. **Register mandiri (self-register) di sistem, langsung bisa login begitu akun dibuat** (Fase 1 — lihat catatan Verifikasi di Bagian 7.0.3). Selama `UserRole.status = Pending`, akun tampil dengan label **"On Review"** di seluruh antarmuka Mentor, dan **belum bisa mengajar/menerima siswa** — cuma bisa lihat dashboard terbatas & lengkapi profil. Begitu Admin approve, label hilang dan fitur mengajar penuh terbuka. | `Pending (On Review)` → `Active` / `Rejected` |
| **Admin** | Tim internal (CEO/COO/CTO/staf ops) — kelola konten, user, keuangan, analytics, dan marketing (leads, dll). Akun Admin **hanya** dibuat lewat undangan Admin lain, tidak lewat form publik. | — |

---

# BAGIAN 6 — FEATURE LIST (MATRIKS LENGKAP)

| Fitur | Student | Mentor | Admin | Fase |
|---|:---:|:---:|:---:|---|
| Register & Login (shared page, progressive profiling) | ✅ | ✅ | ✅ (invite only) | 1 |
| Dashboard (personal/kelas/bisnis) | ✅ | ✅ | ✅ | 1 |
| Assessment Prediksi PTN (SNBP/SNBT/Mandiri) | ✅ | View siswa binaan | Kelola data & bobot | 1 |
| Kelas Bimbingan (per kelas & subtes) | ✅ | ✅ | ✅ | 1 |
| Tryout TKA & SNBT (Free + Premium) | ✅ | Bahas hasil | Kelola bank soal | 1 |
| Payment | ✅ | Lihat honor | Kelola transaksi | 1 |
| Sistem Referral (dasar, kode dientri saat register) | ✅ | ✅ | Kelola & audit | 1 |
| Riwayat Tryout permanen + Export PDF | ✅ | View siswa binaan | — | 1 |
| Approval Mentor Baru | — | — | ✅ | 1 |
| Upgrade Role (Siswa → ajukan jadi Mentor) & Role Switcher | ✅ (pengajuan) | ✅ (hasil, jika disetujui) | Approval sama seperti Mentor baru | 1 |
| AI Mentor (versi terbatas) | ✅ | — | Kelola knowledge base | 1 (opsional) |
| Dashboard Admin (bisnis dasar) | — | — | ✅ | 1 |
| Info Beasiswa/Internship/Event | ✅ | Opsional posting | Kelola & publish | 2 |
| Analytics Dasar | — | Terbatas (siswa binaan) | ✅ | 2 |
| Gamifikasi Referral (poin/badge/leaderboard/redeem) | ✅ | ✅ | Kelola reward & anti-fraud | 2 |
| Gamifikasi Tryout (leaderboard sekolah/teman) | ✅ | — | Kelola | 2 |
| Tryout Jalur Mandiri per PTN | ✅ | ✅ | Kelola bank soal per PTN | 3 |
| Leaderboard granular (nasional/provinsi/kota) | ✅ | — | Kelola | 3 |
| AI Pembuat Soal | — | Review & approve | Kelola & approve | 3 |
| AI Mentor Personal (data-driven) | ✅ | — | Kelola | 3 |
| Predictive Analytics & AI Recommendation Engine | — | — | ✅ | 3 |
| Community & Student Ambassador | ✅ | ✅ | Kelola | 3 |

---

# BAGIAN 7 — DETAILED FEATURE REQUIREMENTS

## 7.0 Register, Login & Onboarding (Progressive Profiling)

**Tujuan:** Meminimalkan friksi pendaftaran dengan pola progressive profiling — user menjawab pertanyaan ringan (Commitment Effect) sebelum diminta komitmen besar (buat akun & password), sesuai desain Figma final.

**Arsitektur Shared Page:** Login dan Register memakai **satu komponen UI** untuk ketiga role. Perbedaan role/tujuan ditentukan backend, bukan pilihan bebas user (lihat detail keamanan di bawah).

### 7.0.1 Login
Form tunggal: Email/Username + Password, opsi "Lupa Password?", tombol "Login dengan Google" (OAuth), link "Belum Punya Akun? Buat Akun Sekarang". Setelah kredensial tervalidasi, backend membaca role dari database (bukan dari input user) dan redirect otomatis: `/dashboard/siswa`, `/dashboard/mentor`, atau `/dashboard/admin`.

### 7.0.2 Register — Alur Progressive Profiling

**Langkah 1 (semua role):** "Kamu mau daftar sebagai apa?" — dropdown pilih Siswa atau Mentor. *(Role Admin tidak muncul di form publik ini — akun Admin dibuat terpisah lewat undangan.)*

**Langkah 2–4/5 (bercabang sesuai role):**

*Jalur Siswa (5 langkah total):*
- Langkah 2: "Sekarang kamu kelas berapa" — pilih Kelas 10 / 11 / 12 / Gap Year
- Langkah 3: "Mapel apa yang paling sulit menurutmu?" — checklist multi-select (Matematika, Bahasa Inggris, Bahasa Indonesia, Kimia, Fisika, Biologi, Sejarah, Ekonomi, Geografi, Lainnya). **Data ini menjadi input tambahan ke Assessment/rekomendasi kelas** — bukan sekadar data profil pasif.
- Langkah 4: "Tulis nomor WhatsApp kamu" — dipakai untuk verifikasi & informasi penting.

*Jalur Mentor (6 langkah total — 1 langkah lebih banyak dari Siswa):*
- Langkah 2: "Kamu kuliah di PTN mana?" — dropdown pilih PTN
- Langkah 3: "Semester berapa dan jurusan apa?" — input angka (semester) + teks (jurusan)
- Langkah 4 **(baru)**: "Subtes apa yang mau kamu ampu?" — checklist multi-select, memakai daftar subtes yang sama dengan struktur di Bagian 7.5 (Literasi B. Indonesia, Literasi B. Inggris, Penalaran Matematika, Penalaran Umum, Pemahaman Bacaan & Menulis, Pengetahuan Kuantitatif, plus mapel TKA seperti Matematika, Fisika, Kimia, Biologi, dst.)
- Langkah 5: "Tulis nomor WhatsApp kamu"

**Langkah Terakhir (konvergen, semua role):** "Nah terakhir..." — Email, Nama Lengkap, Password (single field dengan toggle show/hide, tanpa confirm-password terpisah), **Kode Referral (Opsional)** dengan keterangan "Masukkan kode referral temenmu kalo punya". Ini adalah titik input kode referral yang dipakai sistem Referral (Bagian 7.1) untuk mengaitkan referee ke referrer.

**Catatan implementasi progress bar:** Karena jalur Mentor (6 langkah) dan Siswa (5 langkah) punya jumlah langkah berbeda, komponen progress bar **wajib dibuat dinamis** (jumlah segmen menyesuaikan role yang dipilih di Langkah 1), bukan fixed 5 segmen untuk semua.

### 7.0.3 Verifikasi Akun — **DITUNDA KE FASE 2 (revisi September 2026)**
**Keputusan scope Fase 1: verifikasi akun (email/WA) TIDAK diaktifkan dulu.** Alasan: menghilangkan dependency ke domain custom + setup Resend/WA API yang sempat jadi blocker signifikan, demi mempercepat rilis Fase 1. Akun (Student maupun Mentor) **langsung berstatus `Verified` otomatis saat dibuat**, tanpa proses klik link.

- Field `status_verifikasi_akun` dan tabel `verification_tokens` **tetap ada di skema database** (tidak perlu di-drop) — infrastrukturnya dipertahankan supaya gampang diaktifkan lagi begitu domain email sudah siap, tanpa migrasi ulang.
- Konsekuensi: akun bisa langsung dipakai transaksi Payment begitu dibuat (BR-15 lama soal "akun Unverified tidak bisa Payment" **tidak berlaku dulu** selama Fase 1 — lihat BR-15 revisi di Bagian 8).
- **Fitur Lupa Password tetap butuh email/WA berfungsi** (karena sifatnya beda — itu keamanan akun, bukan syarat aktivasi) — kalau Lupa Password juga mau ditunda, perlu keputusan terpisah, belum termasuk di scope perubahan ini.

### 7.0.4 Functional Requirements
- FR-1.1: Login & Register memakai komponen UI yang identik lintas role (shared page architecture).
- FR-1.2: Role ditentukan backend berdasarkan jalur akses (publik = Student; token undangan = Admin) atau pilihan eksplisit di Langkah 1 (Student/Mentor) — **tidak pernah dari parameter yang bisa dimanipulasi client**.
- FR-1.3: Data profiling (kelas, mapel tersulit / PTN, semester, jurusan, subtes diampu) disimpan progresif per langkah — jika user keluar di tengah alur, progres tersimpan (draft) dan bisa dilanjutkan.
- FR-1.4 (DIREVISI): Akun Mentor otomatis berstatus `UserRole.status = Pending` setelah Langkah Terakhir disubmit, **DAN langsung bisa login** ke Dashboard Mentor (tidak diblokir seperti versi sebelumnya). Selama `Pending`: seluruh antarmuka Mentor menampilkan **badge/label "On Review"** yang jelas terlihat (lihat Bagian 12.2), dan fitur mengajar (lihat/kelola Kelas Saya, Siswa Binaan, dapat assignment kelas baru) **dikunci/disabled** sampai Admin approve. Begitu status berubah jadi `Active`, label hilang otomatis dan fitur terbuka tanpa perlu logout/login ulang.
- FR-1.5: Kode Referral (jika diisi) divalidasi sebagai kode aktif milik user lain — jika tidak valid, tampilkan pesan error tapi tidak memblokir pendaftaran (field opsional, kesalahan kode tidak fatal).
- FR-1.6: Onboarding singkat untuk Admin (undangan) tetap terpisah dari alur publik — pakai token undangan unik dari Admin lain.
- FR-1.7: Role-Based Access Control (RBAC) — setiap role melihat menu & fitur sesuai hak akses.

### 7.0.6 Upgrade Role: Siswa → Mentor (Satu Akun, Bukan Daftar Ulang)

**Tujuan:** Mengakomodasi siswa Dimentoring yang sudah diterima PTN (`sub_status = mahasiswa`) dan ingin menjadi Mentor, tanpa memaksa mereka membuat akun baru — menjaga kontinuitas riwayat referral, poin gamifikasi, dan status verifikasi yang sudah ada.



**Functional Requirements:**
- FR-1.8: Akun **tidak dibatasi satu role tunggal** — satu `user_id` dapat memegang lebih dari satu role aktif sekaligus (Student + Mentor), masing-masing dengan status approval independen.
- FR-1.9: Entry point upgrade role **berbeda dari Langkah 1 form register publik** — muncul sebagai menu/prompt di dalam Dashboard Siswa (idealnya otomatis muncul begitu `sub_status` berubah jadi `mahasiswa`, sesuai BR-24), bukan lewat alur pendaftaran dari nol.
- FR-1.10: Form pengajuan Mentor dari akun existing **tidak menanyakan ulang** data yang sudah ada (nama, email, no. WA, status verifikasi) — hanya meminta data spesifik Mentor yang belum tersedia: PTN kuliah, semester, jurusan, Subtes yang Diampu (checklist).
- FR-1.11: Pengajuan tetap melalui **proses approval Admin yang sama** seperti Mentor baru (BR-2) — status `Pending` sampai disetujui. Tidak ada jalur otomatis-aktif hanya karena berasal dari akun siswa lama.
- FR-1.12: Setelah role Mentor disetujui, **Role Switcher** muncul di menu akun (header/settings) — memungkinkan user berpindah antara tampilan Dashboard Siswa dan Dashboard Mentor dalam satu sesi login, tanpa logout/login ulang.
- FR-1.13: Sebelum role Mentor disetujui, akun tetap berfungsi 100% sebagai Siswa seperti biasa — pengajuan yang masih `Pending` tidak mengubah pengalaman Siswa yang sudah berjalan.

**Business Flow:**
```
Siswa (sub_status = mahasiswa) buka Dashboard
   │
   ▼
Muncul prompt "Mau jadi Mentor Dimentoring?"
   │
   ▼
Klik "Ajukan jadi Mentor" → form singkat (PTN, semester, jurusan, subtes diampu)
   │  (nama/email/WA otomatis terisi dari akun existing, tidak ditanya ulang)
   ▼
Submit → MentorProfile baru dibuat untuk user_id yang sama, status "Pending"
   │
   ▼
Admin review & approve (flow sama dengan 9.2/9.9)
   │
   ▼
Role "Mentor" aktif untuk akun ini → Role Switcher muncul di menu akun
   │
   ▼
User bisa toggle: "Mode Siswa" ⇄ "Mode Mentor" (satu login, dua tampilan Dashboard)
```

### 7.0.5 Business Rules Terkait
Lihat BR-1, BR-2, BR-3, BR-15 di Bagian 8.

---

## 7.1 Sistem Referral

**Tujuan:** mengubah kekuatan akuisisi organik/referral (23,1% dari total customer) menjadi mesin pertumbuhan terstruktur dan terukur.

**User Story:**
- Sebagai siswa, saya ingin membagikan kode/link referral ke teman agar keduanya mendapat reward ketika teman saya mendaftar dan membayar program.
- Sebagai mentor, saya ingin mereferensikan siswa dan mendapat insentif tambahan di luar honor mengajar.

**Functional Requirements:**
- FR-R1: Setiap Student & Mentor otomatis memiliki kode referral unik dan link referral begitu akun **terverifikasi** (bukan sekadar submit form).
- FR-R2: **Titik input kode referral ada di Langkah Terakhir alur Register** (field "Kode Referral (Opsional)") — bukan proses terpisah pasca-registrasi.
- FR-R3: Dashboard Referral menampilkan: jumlah klik link, jumlah pendaftaran via referral, jumlah yang sudah konversi (bayar), estimasi reward tertunda, reward yang sudah cair.
- FR-R4: Riwayat Referral: `Terdaftar` → `Dalam Proses` → `Valid/Terkonversi` → `Tidak Valid` (fraud/self-referral).
- FR-R5: Reward hanya cair setelah referee menyelesaikan pembayaran pertama.
- FR-R6: Reward ditentukan Admin (diskon, saldo, atau poin gamifikasi). Besaran referral digambarkan berdasarkan poin dan ditampilkan di gamifikasi referral (tingkatan besaran poin per siswa).
- FR-R7: Riwayat Reward terpisah dari riwayat referral.

**Business Flow:**
```
User terverifikasi → sistem generate kode+link referral otomatis
   │
   ▼
Share link ke calon siswa lain
   │
   ▼
Calon siswa klik link → kode referral pre-fill di Langkah Terakhir form register
   │  (atau diketik manual jika link tidak dipakai)
   ▼
Calon siswa submit Langkah Terakhir → status Referral: "Terdaftar"
   │
   ▼
Calon siswa verifikasi akun + melakukan pembayaran pertama
   │
   ▼
[Webhook Payment sukses] → validasi anti-fraud → status "Terkonversi" → reward cair
```

---

## 7.2 Gamifikasi Referral

**Functional Requirements:**
- FR-G1: Poin Referral — setiap referral valid memberi poin.
- FR-G2: Level — akumulasi poin membuka level (Rookie Referrer → Rising Star → Dimentoring Ambassador).
- FR-G3: Badge & Achievement — milestone spesifik (referral pertama, 5 referral valid, dst.).
- FR-G4: Leaderboard Referral — filter Mingguan / Bulanan / Tahunan.
- FR-G5: Reward & Penukaran Poin — katalog dikelola Admin.

**Business Rule:** Leaderboard default nama panggilan/alias (opt-in nama asli); anggaran reward per periode wajib punya cap.

---

## 7.3 Gamifikasi Tryout

**Functional Requirements:**
- FR-G6: Leaderboard hasil Tryout — Ranking Teman (default) → Sekolah → Kota → Provinsi → Nasional (granularitas luas dibuka bertahap di Fase 3).
- FR-G7: Filter tambahan: kategori ujian, periode.
- FR-G8: Badge: Top Performer, Learning Streak, Consistency Badge.
- FR-G9: Ranking Sekolah/Kota/Provinsi butuh data terstruktur (entitas `Sekolah`, `Kota`).

**Business Rule:** Siswa dapat opt-out dari leaderboard publik kapan saja.

---

## 7.4 Assessment Prediksi Masuk PTN (Direvisi Sesuai Desain Final)

**Tujuan:** entry point akuisisi utama sekaligus tools diagnostik pembeda Dimentoring dari bimbel konten biasa.

### 7.4.1 Struktur Halaman (berlaku untuk SNBP, SNBT, Jalur Mandiri)
Tab selector di bagian atas: **SNBP | SNBT | Jalur Mandiri**. Setiap tab menampilkan disclaimer permanen di atas form/hasil:

> "Disclaimer: Hasil ini adalah estimasi berbasis data keketatan historis (tahun data: [TAHUN]), bukan jaminan kelulusan. Kebijakan kampus & jumlah peminat tahun berjalan bisa berubah."

Ini memenuhi BR-3 dan sudah diimplementasikan di desain — pertahankan pola ini konsisten di ketiga tab.

### 7.4.1b Akses Anonim (Trial Tanpa Login) — **BARU**

**Tujuan:** Assessment jadi hook akuisisi yang bisa langsung dirasakan calon siswa (UX lengkap sampai hasil) sebelum diminta komitmen daftar akun — konsisten dengan prinsip Commitment Effect & Endowed Progress di Bagian 10.

**Mekanisme:**
- Halaman `/assessment` **bisa diakses tanpa login**, termasuk mengisi form dan submit.
- Setiap browser yang belum login diberi **cookie trial ID** (httpOnly, random, tidak berisi data pribadi) saat pertama kali membuka halaman ini.
- **2 kali pertama** submit assessment (dihitung per trial ID, lintas jalur SNBP/SNBT/Mandiri digabung dalam satu hitungan) → user **langsung lihat hasil lengkap** (seluruh 6 accordion di Bagian 7.4.3), tanpa perlu akun.
- **Submit ke-3 dan seterusnya** (masih dengan trial ID yang sama) → form tetap bisa diisi dan disubmit (tidak diblokir mengisi), TAPI setelah submit, user **diarahkan ke halaman Login/Register** dengan pesan yang jelas (mis. "Hasil assessment kamu sudah siap — masuk dulu buat lihat hasilnya") alih-alih langsung ke halaman hasil.
- **Begitu user login/register setelah submit ke-3+**, assessment yang baru saja diisi otomatis **ditautkan ke akun barunya** (`assessments.user_id` diisi dari NULL menjadi user_id yang login), lalu redirect ke halaman hasil — jadi usaha yang sudah dia lakukan (isi form) tidak hilang percuma, ini justru memperkuat dorongan buat menyelesaikan pendaftaran (loss aversion).
- **Data yang disimpan untuk trial anonim tetap minimal** — cuma data akademik (nilai rapor, prestasi, pilihan PTN), tidak ada nama/email/WA yang diminta di alur ini sama sekali, konsisten dengan prinsip privasi data anak (BR-23) karena belum ada verifikasi identitas siapa pun di titik ini.

**Batasan yang perlu disadari (bukan bug, tapi trade-off sadar):**
- Hitungan 2x ini berbasis cookie — kalau user hapus cookie/pakai mode incognito/ganti browser, hitungannya reset. Ini **diterima sebagai batasan MVP**, bukan dianggap celah yang harus segera ditambal — kalau nanti terbukti disalahgunakan secara signifikan (mis. dipakai bot generate leads palsu), baru pertimbangkan lapisan tambahan seperti rate-limit berbasis IP.

### 7.4.2 Input — SNBP (referensi implementasi, jalur lain mengikuti pola serupa) — **DIREVISI, aturan resmi Kemendikbudristek SNBP 2026**

| Section (accordion) | Field |
|---|---|
| **Nilai Raport** | Nilai Semester 1, 2, 3, 4, 5 (5 semester — semester 6 tidak diminta karena belum final saat pendaftaran SNBP berlangsung) |
| **Prestasi (Opsional)** | Jenis Prestasi (dropdown), Juara Berapa (dropdown), Tingkat Kejuaraan (dropdown) |
| **Pilihan Universitas dan Jurusan** | **Maksimal 2 pilihan** (bukan 4 — koreksi dari desain sebelumnya, lihat aturan di bawah), masing-masing: Universitas (dropdown), Jurusan+Jenjang (dropdown) |

**Perubahan penting dari spesifikasi v2:**
- **Ranking sekolah, akreditasi sekolah, dan kuota sekolah TIDAK diminta langsung ke siswa.** Data ini diambil otomatis dari entitas `Sekolah` yang sudah dipilih siswa saat onboarding (Bagian 7.0.2, Langkah "Kelas") — asumsikan field sekolah nantinya diperluas untuk menangkap `sekolah_id`, bukan hanya nama bebas.
- **Nilai TKA dihapus total dari input SNBP.** Secara faktual, SNBP tidak menggunakan skor TKA sebagai faktor penilaian — ini murni jalur nilai rapor & prestasi. Nilai TKA relevan untuk SNBT, bukan SNBP (koreksi dari kekeliruan di draf v2).

**Aturan Pilihan Prodi (baru, sesuai ketentuan resmi Kemendikbudristek SNBP 2026 — WAJIB divalidasi sistem, bukan cuma disclaimer teks):**
- Siswa memilih **1 atau 2 program studi** (bukan 4). UI wajib menyesuaikan — mulai dari 1 pilihan wajib, opsi "+ Tambah Pilihan Kedua (Opsional)" untuk pilihan kedua, bukan 4 slot tetap seperti desain sebelumnya.
- **Kalau cuma pilih 1 prodi**: bebas pilih PTN di provinsi mana pun se-Indonesia, tidak ada validasi tambahan.
- **Kalau pilih 2 prodi**: **minimal salah satu dari 2 pilihan itu wajib berada di PTN yang provinsinya sama dengan provinsi sekolah asal siswa** (diambil dari `Sekolah.kota_id` → `Kota.provinsi_id`, bukan input manual). Sistem **wajib validasi ini di backend** sebelum submit diterima — kalau kedua pilihan di luar provinsi sekolah asal, tolak submit dengan pesan jelas.
- **Urutan pilihan berpengaruh ke proses seleksi** (Pilihan 1 diprioritaskan dulu, baru Pilihan 2 kalau tidak lolos) — ini sudah konsisten dengan bagaimana Rekomendasi Jurusan/Kelas/Tryout kita rancang berdasarkan urutan, tidak perlu perubahan logika di situ.

### 7.4.3 Output — Hasil Assessment SNBP — **DIREVISI (desain terbaru)**

**Struktur berubah dari versi sebelumnya.** Sekarang: **1 card utama (selalu terbuka, BUKAN accordion)** berisi Nilai Akhir + Hasil Prediksi digabung, diikuti **3 accordion collapsible** di bawahnya.

**Card Utama (selalu terbuka, di atas accordion apa pun):**
- Judul kecil: "Berdasarkan perhitungan, berikut hasil untuk nilai kamu"
- **Nilai Akhir**: label "Nilai Akhir" + angka + label kualitatif (mis. "88,65 (Sedang)") — skala label FR-3.8. **Breakdown Nilai Rata-Rata Rapor dan Nilai Prestasi TIDAK ditampilkan terpisah lagi di UI** (beda dari draf sebelumnya) — cukup angka final. Kedua angka itu **tetap dihitung & disimpan di database** (`assessments.rata_rata_rapor`, `assessments.nilai_prestasi`) untuk keperluan Analytics/audit nanti, cuma tidak ditampilkan ke siswa di halaman ini.
- **Pilihan siswa (1-2, tampilan berdampingan 2 kolom kalau ada 2)**: tiap pilihan menampilkan Jenjang+Jurusan, Universitas, Keketatan (persen+label+warna), Peluang (skor+label+warna) — ini konten yang sebelumnya disebut "Hasil Prediksi", sekarang jadi bagian dari card yang sama, bukan accordion terpisah.
- Maskot muncul sebagai elemen dekoratif di sisi card ini (bukan di disclaimer saja).

**Accordion di bawahnya (3 buah, urutan tetap):**

**1. "Rekomendasi Jurusan"** — alternatif jurusan/universitas dengan keketatan lebih realistis dibanding pilihan awal siswa, format sama (Jenjang + Jurusan, Keketatan, Peluang).

**2. "Rekomendasi Kelas"** — rekomendasi program bimbingan yang relevan (cross-sell natural ke Bagian 7.5).

**3. "Rekomendasi Paket Tryout"** — Menampilkan paket tryout yang relevan dengan hasil assessment siswa:
- Nama paket tryout (mis. "Paket Tryout SNBP Ilmu Kelautan — Undip")
- Kategori (Free/Premium)
- Alasan rekomendasi singkat (mis. "Direkomendasikan karena Keketatan pilihan ini Sedang — latihan tryout membantu memperbesar Peluang")
- CTA "Lihat Paket" / "Mulai Tryout Gratis"

Sumber rekomendasi: hasil pemetaan otomatis antara `jurusan_tujuan` + `ptn_tujuan` (dari Hasil Prediksi & Rekomendasi Jurusan) terhadap katalog `TryOut` yang tersedia di Bagian 7.6 — bukan rekomendasi acak, harus relevan dengan subtes/jalur yang sesuai pilihan siswa.

**4. "Note" — digenerate AI (Gemini), Fase 1**

Catatan interpretatif/motivasional 2-4 kalimat, digenerate sekali oleh Gemini API saat assessment dihitung (bukan digenerate ulang tiap halaman dibuka), disimpan ke database supaya konsisten dan tidak boros API call.

**Prinsip konten (mengikuti pola BR-21 yang sudah ditetapkan untuk AI Mentor):**
- **Tidak boleh memberi kepastian palsu** ("pasti keterima", "dijamin lolos", dsb.) — tetap dalam kerangka estimasi, sejalan disclaimer utama halaman.
- Nada: hangat, mendorong, tapi jujur — sesuai brand voice Dimentoring (approachable tapi kredibel, bukan generik/kaku).
- Referensikan angka spesifik siswa (Nilai Akhir, Keketatan/Peluang pilihannya) supaya terasa personal, bukan template kosong.

**Privasi (WAJIB, ini yang membedakan dari AI Mentor biasa):** prompt yang dikirim ke Gemini **hanya berisi data numerik/kategorikal anonim** (nilai_akhir, nilai_akhir_label, keketatan_score+label, peluang_score+label, nama jurusan+jenjang) — **TIDAK PERNAH** menyertakan nama, email, no. WA, atau identitas siswa apa pun. Ini berlaku untuk assessment anonim maupun yang sudah login, tanpa kecuali.

**Fallback:** kalau panggilan API Gemini gagal/timeout, tampilkan teks default (lihat draf paragraf di catatan internal tim) — **jangan sampai kegagalan API bikin seluruh halaman hasil gagal tampil**, karena section ini pelengkap, bukan inti fitur.

**Transparansi:** tampilkan label kecil "Catatan dibuat otomatis" di bawah teks — konsisten dengan prinsip kejujuran ke pengguna soal apa yang manusia vs AI yang buat.

### 7.4.4 Functional Requirements
- FR-3.1: Input berbeda per jalur (SNBP: **maksimal 2 pilihan**, lihat 7.4.2; SNBT: 4 pilihan universitas + 4 pilihan jurusan wajib, skor try out internal opsional — **aturan SNBT TIDAK berubah, cuma SNBP**; Jalur Mandiri: pilihan universitas + jurusan per kampus tujuan).
- FR-3.2: Output **dua metrik terpisah**: `keketatan_score` (formula publik, sama untuk semua siswa pada kombinasi PTN+jurusan+jenjang yang sama) dan `peluang_score` (personal, mempertimbangkan Nilai Akhir siswa).
- FR-3.3: Data sekolah (akreditasi, kuota, ranking — khusus SNBP) diambil dari entitas `Sekolah`, bukan input manual siswa.
- FR-3.4: Hasil tersimpan di histori siswa, muncul di Dashboard.
- FR-3.5: Rekomendasi jurusan, kelas, dan **paket tryout** muncul otomatis setelah hasil keluar (lihat section "Rekomendasi Paket Tryout" di 7.4.3).
- FR-3.6: Disclaimer wajib tampil permanen di setiap tab jalur, termasuk tahun data yang dipakai.
- FR-3.7: **Mapping Nilai Prestasi** — konversi Jenis Prestasi/Juara Berapa/Tingkat Kejuaraan jadi satu angka skala 0-100 (sama skalanya dengan nilai rapor, supaya rata-ratanya masuk akal). Tabel awal (PLACEHOLDER, perlu divalidasi tim akademik):

  | Tingkat Kejuaraan | Juara 1 | Juara 2 | Juara 3 | Peserta/Partisipasi |
  |---|---|---|---|---|
  | Internasional | 100 | 95 | 90 | 80 |
  | Nasional | 90 | 85 | 80 | 70 |
  | Provinsi | 80 | 75 | 70 | 60 |
  | Kabupaten/Kota | 70 | 65 | 60 | 50 |

  Kalau siswa isi lebih dari satu prestasi, ambil nilai **tertinggi** saja (bukan dijumlah/dirata-rata semua prestasi).
- FR-3.8 (baru): **Label kualitatif Nilai Akhir** (PLACEHOLDER, perlu divalidasi tim akademik): ≥90 = "Sangat Tinggi", 75-89 = "Tinggi", 60-74 = "Sedang", 45-59 = "Rendah", <45 = "Sangat Rendah".
- FR-3.9 (baru): **Jenjang sebagai pembeda prodi** — kombinasi Universitas+Jurusan+**Jenjang** (S1/D3/D4/dst.) dianggap prodi yang sepenuhnya berbeda, masing-masing punya `kuota_tahun_berjalan` dan `jumlah_peminat_tahun_lalu` sendiri di tabel `ptn_jurusan`. Dropdown "Pilihan Universitas dan Jurusan" di form input (7.4.2) wajib menampilkan jenjang secara eksplisit supaya siswa tidak salah pilih (mis. "S1 Teknologi Informasi" vs "D3 Teknologi Informasi" sebagai opsi terpisah, bukan tergabung).
- FR-3.10 (baru — aturan resmi SNBP 2026): **Validasi jumlah & lokasi pilihan prodi SNBP.** Backend wajib menolak submit kalau: (a) jumlah pilihan SNBP lebih dari 2, atau (b) tepat 2 pilihan dipilih TAPI tidak satu pun berada di provinsi yang sama dengan `Sekolah.kota_id → Kota.provinsi_id` milik siswa. Validasi ini **tidak boleh cuma di frontend** (client bisa dimanipulasi) — wajib dicek ulang di API sebelum data masuk ke `assessment_pilihan`.

### 7.4.5 Widget Cek Keketatan (Landing Page — BARU, terpisah dari Assessment penuh)

**Tujuan:** Hook engagement paling ringan di landing page — user cek keketatan PTN+jurusan pilihan **tanpa isi data personal apa pun** (tidak ada nilai rapor/prestasi), sebelum diarahkan ke `/assessment` untuk pengalaman personal penuh (Peluang, rekomendasi, dst).

**Beda mendasar dari Assessment (Bagian 7.4):**

| | Widget Cek Keketatan | Assessment Penuh |
|---|---|---|
| Input | Jalur + PTN + Jurusan+Jenjang saja | Nilai rapor, prestasi, dst |
| Output | Cuma **Keketatan** (persen+label) | Keketatan **dan** Peluang, + Nilai Akhir, rekomendasi |
| Login/trial | Tidak relevan — bisa dipakai berkali-kali tanpa batas, tidak ada "hasil" yang disimpan | Dibatasi 2x trial gratis (BR-29) |
| Tampilan | Popup/modal di landing page | Halaman penuh `/assessment` |
| Penyimpanan data | **Tidak disimpan ke database sama sekali** — murni lookup real-time dari `ptn_jurusan`, tidak ada assessment record yang dibuat | Tersimpan ke `assessments`/`assessment_pilihan` |

**Functional Requirements:**
- FR-3.11 (baru): Widget di landing page — 3 dropdown berurutan (Jalur → Universitas → Jurusan+Jenjang, dropdown kedua/ketiga terisi setelah yang sebelumnya dipilih), tombol "Cek Keketatan".
- FR-3.12: Submit → panggil endpoint ringan yang cuma hitung `keketatan_score` dari `ptn_jurusan` yang dipilih (formula sama seperti Bagian 7.4, TIDAK butuh data sekolah/personal apa pun) → tampilkan di **popup/modal**, bukan redirect ke halaman baru.
- FR-3.13: Popup berisi: Keketatan (persen+label+warna, pola sama seperti Hasil Assessment), disclaimer singkat (versi ringkas dari BR-4), dan **tombol CTA "Coba Cek Peluang Kamu"** yang mengarah ke `/assessment` (bawa PTN+Jurusan yang tadi dipilih sebagai pre-fill kalau memungkinkan, supaya user tidak perlu pilih ulang).
- FR-3.14: Widget ini **tidak memiliki batasan pemakaian** (beda dari BR-29 Assessment) — karena tidak ada "hasil personal" yang bocor/berharga di sini, cuma data publik keketatan.

---

## 7.5 Kelas Bimbingan Belajar (per Kelas & Subtes)

Struktur konten hierarkis: Kelas → Subtes → Topik → Sesi/Materi. Subtes mengikuti struktur resmi: Tes Potensi Skolastik (Penalaran Umum, Pemahaman Bacaan & Menulis, Pengetahuan & Pemahaman Umum, Pengetahuan Kuantitatif) dan Tes Literasi (Literasi B. Indonesia, Literasi B. Inggris, Penalaran Matematika), plus TKA per mata pelajaran wajib & elektif. Materi berupa video, dokumen, live session terjadwal, kuis latihan. Admin assign mentor ke kelas berdasarkan **Subtes yang Diampu** yang diisi mentor saat onboarding (Bagian 7.0.2).

---

## 7.6 Sistem Tryout (Free & Premium)

Tryout Gratis (soal terbatas, funnel akuisisi) dan Tryout Premium (bank soal lengkap, model kuota per paket) untuk TKA & SNBT di Fase 1; Jalur Mandiri per PTN di Fase 3.

### 7.6.1 Halaman Pengerjaan Tryout — Requirement UI Baru

**Timer Pengerjaan:**
- FR-T1: Waktu pengerjaan ditampilkan permanen (mis. di header/pojok layar), hitung mundur (countdown) sesuai durasi resmi ujian yang disimulasikan — bukan hitung maju.
- FR-T2: Timer dihitung **server-side** sebagai source of truth (BR terkait di Bagian 8/11) — tampilan di client hanya mengikuti/sinkron ke server, tidak bisa dimanipulasi lewat devtools/refresh.
- FR-T3: Saat waktu tersisa mendekati habis (mis. 5 menit terakhir), timer berubah warna (mis. jadi merah) sebagai peringatan visual — tanpa mengganggu konsentrasi siswa secara berlebihan (selaras prinsip kehati-hatian gamifikasi di Bagian 10).
- FR-T4: Waktu habis → sistem otomatis submit jawaban yang sudah terisi (tidak hilang), sesuai jawaban terakhir yang tersimpan.

**Navigator Soal (Nomor Soal Terjawab/Belum):**
- FR-T5: Tersedia panel/grid navigasi nomor soal — **kotak-kotak bernomor** (1, 2, 3, ... N) mengikuti pola umum halaman ujian, biasanya ditempatkan di sidebar (desktop) atau panel yang bisa dibuka (mobile).
- FR-T6: **Perbedaan visual wajib jelas antara status soal**, minimal 2 status berbeda:
  - **Sudah dikerjakan** — kotak terisi warna solid (mis. biru brand primer, sesuai Design System Bagian 12)
  - **Belum dikerjakan** — kotak outline/kosong (background putih/abu muda, border saja)
  - *(Opsional, jika tim ingin lebih detail)* status ketiga: **Soal aktif/sedang dibuka** — kotak dengan highlight berbeda (mis. border tebal) dari dua status di atas.
- FR-T7: Klik kotak nomor soal → langsung lompat ke soal tersebut (navigasi bebas, tidak harus berurutan) — pola standar aplikasi ujian yang sudah familiar bagi siswa (CBT UTBK, dsb).
- FR-T8: Status navigator wajib real-time — begitu siswa memilih jawaban, kotak nomor soal terkait langsung berubah status dari "belum" ke "sudah" tanpa perlu reload halaman.

**Acceptance Criteria tambahan:**
- Timer dan navigator soal wajib tetap terlihat/dapat diakses sepanjang sesi tryout berlangsung (sticky/fixed position), tidak hilang saat scroll.
- Jika koneksi terputus di tengah pengerjaan, progres jawaban (termasuk status navigator) harus tetap tersimpan di server dan bisa dilanjutkan begitu koneksi pulih, tanpa kehilangan waktu tersisa (timer tetap berjalan di server selama terputus, sesuai FR-T2).

---

## 7.7 AI Pembuat Soal

AI menghasilkan soal 3 tingkat kesulitan (Mudah/Sedang/HOTS) dengan jawaban, pembahasan, konsep, estimasi waktu. Orisinalitas wajib (redaksi baru, bukan salinan). Versioning untuk variasi soal antar percobaan. **Wajib human review** sebelum status `Published` — tidak ada soal AI tayang tanpa approval Mentor/Admin. Fase 3.

---

## 7.8 Riwayat Tryout

Seluruh percobaan tersimpan permanen (immutable setelah submit). Siswa dapat unduh hasil sebagai PDF.

---

## 7.9 Brand Identity — Maskot Penguin

Diimplementasikan konsisten di: Empty state, Loading, Achievement/Badge, **AI Mentor (wajah AI)**, Error page, Reminder, Dashboard, **Onboarding (sudah diimplementasikan — maskot muncul di setiap langkah "Isi Dulu Yups...")**, Congratulations. Maskot memperkuat momen emosional tanpa mengganggu fungsi (tidak menutupi CTA, tidak berlebihan saat konteks serius seperti mengerjakan tryout berwaktu).

---

# BAGIAN 8 — BUSINESS RULES

### Umum
- **BR-1**: Seluruh role wajib login; tidak ada akses konten berbayar tanpa autentikasi.
- **BR-2 (DIREVISI)**: Akun Mentor dibuat via **self-register** (jalur publik, alur Bagian 7.0.2), tapi baru **aktif dan bisa digunakan setelah mendapat approval Admin**. Mentor menerima notifikasi approval via email atau WhatsApp.
- **BR-3**: Akun Admin **hanya** dibuat lewat undangan/approval Admin lain, tidak lewat form publik.
- **BR-15 (direvisi September 2026 — DITUNDA KE FASE 2)**: Verifikasi akun (email/WA) **tidak diaktifkan di Fase 1**. Akun langsung berstatus `Verified` otomatis saat dibuat. Akun boleh langsung melakukan transaksi Payment tanpa syarat verifikasi tambahan selama Fase 1. Infrastruktur (`verification_tokens`, field `status_verifikasi_akun`) tetap dipertahankan di skema untuk diaktifkan kembali di Fase 2.
- **BR-27 (baru, September 2026)**: Akun Mentor dengan `UserRole.status = Pending` **tetap bisa login** ke Dashboard Mentor (tidak diblokir) — tapi seluruh antarmuka wajib menampilkan label **"On Review"** yang jelas, dan fitur mengajar (kelola Kelas, lihat/terima Siswa Binaan, menerima assignment kelas baru dari Admin) **wajib dikunci** sampai status berubah jadi `Active`. Ini beda dari BR-2 (approval tetap wajib) — yang berubah cuma akses login-nya, bukan levelnya.
- **BR-26 (baru)**: Satu akun (satu `user_id`) dapat memegang lebih dari satu role aktif sekaligus (mis. Student + Mentor). Siswa yang sudah berstatus `mahasiswa` dapat mengajukan role Mentor **dari dalam akun existing** (bukan daftar ulang) — pengajuan ini tetap wajib melalui proses approval Admin yang sama seperti Mentor baru (BR-2), tidak ada jalur otomatis-aktif. Sebelum disetujui, role tambahan berstatus `Pending` dan tidak mengubah pengalaman role yang sudah aktif.

### Assessment & Prediksi
- **BR-4**: Setiap hasil Assessment (Keketatan maupun Peluang) wajib menampilkan disclaimer estimasi + tahun data, permanen di setiap tab jalur.
- **BR-5 (direvisi)**: Data input assessment rahasia — hanya terlihat siswa ybs, mentor pembimbing, Admin. **Untuk assessment anonim (belum login, Bagian 7.4.1b)**: hasil hanya bisa diakses lewat trial ID yang sama (cookie di browser yang sama) sampai ditautkan ke akun setelah login — tidak ada cara pihak lain mengakses hasil assessment anonim orang lain.
- **BR-16 (baru)**: Data sekolah (akreditasi, kuota, ranking) untuk perhitungan SNBP **tidak boleh diminta ulang ke siswa** — wajib diambil dari entitas `Sekolah` yang sudah tersimpan di profil siswa.
- **BR-28 (baru — aturan resmi Kemendikbudristek SNBP 2026)**: Siswa hanya boleh memilih **maksimal 2 program studi** untuk SNBP (bukan 4). Kalau memilih 2, **minimal satu wajib berada di PTN dengan provinsi yang sama dengan sekolah asal siswa**. Ini aturan eksternal resmi (bukan keputusan bisnis Dimentoring) — sistem wajib menegakkan ini secara otomatis, dan **PRD/desain harus di-update ulang setiap kali SNPMB mengubah aturan** di tahun-tahun berikutnya (jangan asumsikan aturan ini permanen selamanya).
- **BR-29 (baru)**: Assessment dapat diakses tanpa login, dibatasi **2 kali lihat hasil lengkap per trial ID (cookie)**, lintas jalur digabung (bukan 2x per jalur). Submit ke-3 dan seterusnya tetap bisa mengisi form, tapi hasil digembok di balik Login/Register. Assessment anonim yang belum ditautkan ke akun manapun **tidak dianggap sebagai lead resmi** untuk keperluan Analytics/CRM sampai benar-benar ditautkan ke user_id via login.
- **BR-30 (baru — dipercepat dari Fase 3 ke Fase 1)**: Section "Note" di Hasil Assessment digenerate AI (Gemini API, free tier). Prompt yang dikirim ke Gemini **wajib anonim total** — hanya data numerik/kategorikal (nilai, label, nama jurusan), tidak pernah nama/email/WA siswa. Tidak boleh memberi kepastian palsu soal kelulusan (pola sama dengan BR-21 AI Mentor). Kegagalan API tidak boleh menggagalkan render halaman hasil secara keseluruhan (wajib ada fallback teks statis).

### Kelas & Tryout
- **BR-6**: Akses kelas/tryout premium hanya terbuka setelah status Payment "berhasil" terkonfirmasi via webhook.
- **BR-7**: Mentor hanya mengelola kelas & siswa yang di-assign eksplisit oleh Admin, sesuai Subtes yang Diampu yang didaftarkan saat onboarding.
- **BR-8**: Tryout Jalur Mandiri wajib terikat satu PTN spesifik.
- **BR-9**: Hasil tryout final bersifat immutable, kecuali koreksi teknis Admin dengan log audit penuh.

### Referral & Gamifikasi
- **BR-10**: Reward referral hanya cair setelah Payment referee terkonfirmasi sukses.
- **BR-11**: Sistem wajib mendeteksi & mencegah self-referral (device/nomor HP/email sama antara referrer-referee).
- **BR-12**: Leaderboard (referral maupun tryout) default nama panggilan/alias; nama asli hanya opt-in.
- **BR-13**: Anggaran reward gamifikasi per periode wajib punya batas atas (cap) yang dikonfigurasi Admin.
- **BR-14**: Siswa dapat opt-out dari leaderboard publik kapan saja tanpa kehilangan skor/badge pribadi.

### AI Pembuat Soal
- **BR-17**: Soal AI tidak dapat tayang ke siswa tanpa approval eksplisit Mentor/Admin.
- **BR-18**: Soal AI dilarang mereplikasi teks sumber berhak cipta; hanya menyimpan referensi konsep.

### Payment
- **BR-19**: Perubahan status pembayaran hanya dari payment gateway (webhook) atau override manual Admin dengan log audit.
- **BR-20**: Kebijakan refund ditetapkan terpisah Admin; sistem menyediakan status "Refunded" dengan field alasan.

### AI Mentor
- **BR-21**: AI Mentor tidak memberi kepastian hasil seleksi atau menggantikan keputusan mentor manusia untuk hal berisiko tinggi — wajib eskalasi.
- **BR-22**: Indikasi distress psikologis berat dalam percakapan AI Mentor wajib memicu notifikasi ke Admin/Mentor terkait.

### Data & Privasi
- **BR-23**: Standar perlindungan data anak (mayoritas Student < 18 tahun): data minimal, tidak ada pemasaran manipulatif, visibilitas orang tua/wali direkomendasikan didiskusikan dengan tim legal (UU PDP).
- **BR-24**: Status "Mahasiswa/Alumni" mengubah fitur yang tampil otomatis begitu diverifikasi Admin (Fase 1) atau berbasis data self-report/tryout (Fase 2+).
- **BR-25**: Data lokasi (sekolah, kota, provinsi) untuk leaderboard granular dikumpulkan dengan consent eksplisit saat onboarding; siswa dapat memilih tidak membagikan (konsekuensi: tidak muncul di ranking granular).

---

# BAGIAN 9 — USER FLOWS

## 9.1 Flow: Register & Onboarding — Jalur Siswa
```
Landing Page → klik "Daftar" / "Coba AI Prediksi PTN"
   │
   ▼
Langkah 1: "Kamu mau daftar sebagai apa?" → pilih "Siswa"
   │
   ▼
Langkah 2: Sekarang kamu kelas berapa → pilih 10/11/12/Gap Year
   │
   ▼
Langkah 3: Mapel apa yang paling sulit → checklist multi-select
   │
   ▼
Langkah 4: Tulis nomor WhatsApp kamu
   │
   ▼
Langkah Terakhir: Email, Nama Lengkap, Password, Kode Referral (Opsional) → submit
   │
   ▼
Link verifikasi terkirim ke WA (fallback email)
   │
   ▼
User klik link → akun "Verified" → redirect ke Dashboard Student
   │
   ▼
Prompt: "Coba Assessment Prediksi PTN sekarang?"
```

## 9.2 Flow: Register & Onboarding — Jalur Mentor
```
Landing Page → klik "Daftar"
   │
   ▼
Langkah 1: pilih "Mentor"
   │
   ▼
Langkah 2: Kamu kuliah di PTN mana → pilih PTN
   │
   ▼
Langkah 3: Semester berapa dan jurusan apa → input
   │
   ▼
Langkah 4: Subtes apa yang mau kamu ampu → checklist multi-select
   │
   ▼
Langkah 5: Tulis nomor WhatsApp kamu
   │
   ▼
Langkah Terakhir: Email, Nama Lengkap, Password, Kode Referral (Opsional) → submit
   │
   ▼
Akun berstatus "Pending" (belum bisa login penuh)
   │
   ▼
Link verifikasi terkirim ke WA (fallback email) → user klik → email/WA terverifikasi
   │
   ▼
Admin menerima notifikasi pendaftaran mentor baru → review data (PTN, semester, jurusan, subtes)
   │
   ▼
Admin approve → status "Approved" → notifikasi ke mentor via email/WA
   │
   ▼
Admin assign mentor ke kelas/subtes yang relevan
   │
   ▼
Mentor login penuh ke Dashboard Mentor
```

## 9.3 Flow: Login Lintas Role (Shared Page) — DIREVISI September 2026
```
User buka satu halaman Login (sama untuk Student/Mentor/Admin)
   │
   ▼
Isi Email/Username + Password → submit (atau "Login dengan Google")
   │
   ▼
Backend validasi kredensial → ambil role dari database (bukan input user)
   │
   ▼
Redirect otomatis:
   ├── Student → /dashboard/siswa
   ├── Mentor (UserRole.status = Active)  → /dashboard/mentor (fitur mengajar penuh)
   ├── Mentor (UserRole.status = Pending) → /dashboard/mentor (mode "On Review" —
   │      fitur mengajar terkunci, tapi tetap bisa login & lengkapi profil)
   └── Admin → /dashboard/admin
```
*(Catatan: verifikasi email/WA dihapus dari alur ini untuk Fase 1 — lihat Bagian 7.0.3.)*

## 9.4 Flow: Assessment Prediksi PTN (SNBP — referensi implementasi)
```
Dashboard → menu "Assessment Prediksi PTN" → tab "SNBP" (default/aktif)
   │
   ▼
Disclaimer tampil permanen di atas form
   │
   ▼
Isi accordion "Nilai Raport" (Semester 1-5)
   │
   ▼
Isi accordion "Prestasi" (opsional)
   │
   ▼
Isi accordion "Pilihan Universitas dan Jurusan" — pilih 1 prodi (Pilihan 1, wajib), opsional tambah Pilihan 2
   │
   ▼
[Jika isi Pilihan 2] Submit → validasi backend: minimal 1 dari 2 pilihan wajib satu provinsi
dengan sekolah asal siswa (FR-3.10/BR-28) → gagal validasi = tolak submit, tampilkan pesan error
   │
   ▼
Submit (lolos validasi) → sistem ambil data Sekolah (akreditasi/kuota/ranking) otomatis dari profil siswa
   │
   ▼
Sistem hitung Keketatan (formula publik) + Peluang (personal) per pilihan
   │
   ▼
Tampilkan "Nilai Akhir" → "Hasil Prediksi" (1-2 pilihan, Keketatan + Peluang) → "Rekomendasi Jurusan" → "Rekomendasi Kelas" → "Rekomendasi Paket Tryout" → "Note"
   │
   ▼
[Jika belum bayar] → redirect ke Payment untuk akses kelas/tryout yang direkomendasikan
```

## 9.5 Flow Lain (tetap berlaku dari v2, tidak berubah)
Daftar Kelas & Payment, Mengerjakan Tryout, Penukaran Poin Gamifikasi, AI Pembuat Soal dengan Human Review, Admin Kelola Konten Beasiswa/Internship/Event — mengikuti struktur yang sudah didefinisikan di draf sebelumnya, tidak ada perubahan dari revisi desain kali ini.

---

# BAGIAN 10 — UX & STRATEGI RETENSI (Product Psychology)

| Prinsip | Penerapan | Status |
|---|---|---|
| **Commitment Effect** | Progressive profiling di Register (jawab pertanyaan ringan dulu sebelum buat akun) | ✅ Sudah diimplementasikan di desain |
| **Endowed Progress** | Progress bar di setiap langkah onboarding menunjukkan kemajuan | ✅ Sudah ada (perlu dibuat dinamis per jumlah langkah role) |
| **Goal Gradient Effect** | Progress bar menuju target belajar di Dashboard | Berlaku untuk fase berikutnya |
| **Social Proof** | Leaderboard, success story konkret | Sebagian sudah ada di Landing Page |
| **Achievement System** | Badge & level terhubung ke benefit nyata | Fase 2 |
| **Learning Streak** | Reminder dengan batas wajar, tidak guilt-tripping | Fase 2, perlu microcopy hati-hati untuk konteks ujian tinggi-stakes |

Catatan kehati-hatian tetap berlaku: mekanisme gamifikasi dan reminder wajib punya batas, tidak menciptakan kecemasan berlebihan bagi siswa remaja.

---

# BAGIAN 11 — NON-FUNCTIONAL REQUIREMENTS

| Kategori | Requirement |
|---|---|
| Performance | Halaman utama < 3 detik load di 4G. Tryout & leaderboard stabil saat lonjakan serentak. |
| Security | Password hashing, HTTPS, validasi server-side untuk role/timer/poin, rate-limiting login & generate kode referral. **Token verifikasi link punya masa berlaku terbatas.** |
| Scalability | Siap lonjakan musiman; leaderboard pakai caching/materialized view. |
| Availability | Uptime tinggi saat tryout serentak & periode early bird. |
| Compatibility | Mobile-first, responsive. |
| Data Privacy | Kepatuhan UU PDP, khusus data anak. |
| Maintainability | Modular, terdokumentasi — krusial karena developer tunggal (CTO). |
| Localization | Bahasa Indonesia sebagai bahasa utama. |
| Auditability | Perubahan sensitif (payment, reward, hasil tryout, approval soal AI, **approval mentor**) wajib log audit. |

---

# BAGIAN 12 — DESIGN SYSTEM / UI STYLE GUIDELINE

- **Warna primer**: biru indigo tegas (≈ `#0B1BD6`, konfirmasi hex pasti dari Figma).
- **Pola onboarding**: card putih di kanan, ilustrasi maskot + lingkaran dashed biru di kiri, headline besar bergaya tulisan tangan ("Isi Dulu Yups...", "Nah terakhir...") — pola ini konsisten di seluruh 6-11 langkah onboarding, pertahankan di seluruh alur termasuk halaman verifikasi (belum didesain, perlu dibuat menyusul pola yang sama).
- **Komponen form**: input field dengan background abu muda, label di atas field, dropdown dengan chevron icon, checklist grid 2 kolom untuk multi-select (Mapel Tersulit, Subtes Diampu).
- **Komponen baru wajib masuk design system**: Badge/Achievement card, Leaderboard row, Progress bar dinamis (jumlah segmen variabel), Referral share card, Poin/level indicator, Reward catalog card, PDF export button, Assessment result card (Keketatan + Peluang dengan kode warna merah/hijau/biru), Rekomendasi Paket Tryout card, Disclaimer banner dengan maskot (sudah ada polanya di Assessment), **Timer countdown component** (dengan varian warna normal/peringatan), **Navigator Soal grid** (kotak bernomor dengan minimal 2 varian status: terisi solid = sudah dikerjakan, outline kosong = belum dikerjakan).

### 12.2 Komponen Baru: Badge "On Review" (Mentor Pending)

Dipicu oleh BR-27 — tampil di seluruh antarmuka Mentor selama `UserRole.status = Pending`.

**Requirement fungsional untuk desain:**
- **Lokasi**: nempel di dekat nama/avatar Mentor di Navbar (pola sama seperti area akun yang sudah ada) — supaya terlihat tanpa perlu buka menu apa pun, dan konsisten di semua halaman Dashboard Mentor.
- **Visual**: badge kecil warna kuning/amber (bukan merah — ini status menunggu, bukan error/ditolak), teks "On Review" atau "Menunggu Approval".
- **Fitur yang terkunci** (Kelas Saya, Siswa Binaan, dst) tetap **terlihat di sidebar** (bukan disembunyikan total) tapi dalam kondisi disabled dengan tooltip singkat, mis. "Tersedia setelah akun disetujui Admin" — supaya Mentor tahu fitur itu ada dan menunggu, bukan bingung kenapa hilang.
- **Begitu status berubah jadi Active**: badge hilang otomatis di sesi berikutnya (atau real-time kalau arsitekturnya mendukung), fitur terbuka tanpa perlu logout/login ulang.

### 12.1 Komponen Baru: Role Switcher (belum ada preseden desain — spesifikasi awal)

Dipicu oleh fitur Upgrade Role (Bagian 7.0.6) — komponen ini **hanya muncul jika user memiliki lebih dari satu `UserRole` berstatus `Active`** (mis. Student + Mentor). Untuk user dengan satu role aktif, komponen ini tidak ditampilkan sama sekali (bukan ditampilkan tapi disabled).

**Requirement fungsional untuk desain:**
- **Lokasi**: menyatu dengan area akun/profil di header (dekat foto profil & nama, pola serupa dengan avatar+nama yang sudah ada di halaman Tryout — lihat pojok kanan atas), bukan menu tersembunyi yang sulit ditemukan.
- **Trigger**: klik pada nama/avatar user membuka dropdown/panel kecil berisi daftar role aktif (mis. "Mode Siswa", "Mode Mentor") dengan indikator jelas role mana yang sedang aktif saat ini (checkmark atau highlight).
- **Setelah memilih role lain**: redirect ke Dashboard sesuai role yang dipilih (`/dashboard/siswa` atau `/dashboard/mentor`), tanpa perlu logout/login ulang (satu sesi tetap berjalan, sesuai FR-1.12).
- **Role berstatus `Pending`** (misal pengajuan Mentor belum di-approve Admin) **tidak muncul sebagai opsi yang bisa dipilih** di switcher — cukup indikator kecil terpisah (mis. badge "Pengajuan Mentor sedang diproses") di halaman akun, bukan di dalam switcher itu sendiri, supaya switcher tetap berisi role yang benar-benar bisa langsung dipakai.
- **Analogi referensi pola**: mirip switcher workspace/akun yang umum dipakai (Slack, Google Account) — dropdown ringkas, bukan halaman terpisah.

*(Ini spesifikasi fungsional untuk memandu desain, bukan desain visual final — detail visual tetap ranah desainer/Figma, mengikuti Design System yang sudah ada.)*
- **Maskot Penguin**: konsisten di seluruh titik sesuai Bagian 7.9.
- **Konsistensi CTA**: status non-interaktif (Coming Soon/Ditutup/Terkunci/Pending) wajib disabled secara fungsional, bukan cuma visual.

---

# BAGIAN 13 — DATA MODEL (Diperluas & Direvisi)

- **User** — id, nama, email, no_wa, password_hash, **status_verifikasi_akun** (`Unverified`/`Verified` — status akun keseluruhan, terpisah dari status per-role), sub_status (Student: `calon_mahasiswa`/`mahasiswa`), sekolah_id (relasi ke `Sekolah`, khusus Student), kota_id, provinsi_id, nama_panggilan, consent_leaderboard_lokasi, opt_out_leaderboard, **mapel_tersulit** (array, khusus Student), dibuat_pada. *(Field `role` tunggal DIHAPUS dari User — digantikan `UserRole` di bawah, agar satu akun bisa memegang lebih dari satu role.)*
- **UserRole (baru)** — id, user_id, role_type (`Student`/`Mentor`/`Admin`), status (`Active`/`Pending`/`Rejected`), dibuat_pada, **sumber_pengajuan** (`register_publik`/`upgrade_dari_akun_existing`). Satu `user_id` dapat memiliki lebih dari satu baris dengan status `Active` sekaligus — dasar teknis fitur Role Switcher (FR-1.12) tanpa duplikasi akun.
- **Sekolah** — id, nama, kota_id, **akreditasi**, **kuota_snbp**, **ranking_data** (jika tersedia) — sumber data untuk auto-fill input SNBP (BR-16).
- **MentorProfile** — id, user_id, asal_ptn, semester, jurusan, **subtes_diampu** (array, hasil checklist onboarding), kelas_diampu (relasi ke Kelas). *(Status approval kini ada di `UserRole.status`, bukan field terpisah di sini, agar konsisten dengan role lain.)*
- **VerificationToken (baru)** — id, user_id, token, channel (`wa`/`email`), expired_at, used_at.
- **PTNJurusan** — id, nama_universitas, nama_jurusan, kuota_tahun_berjalan, jumlah_peminat_tahun_lalu, jalur (SNBP/SNBT/Mandiri), sumber_data, tahun_data.
- **Assessment** — id, user_id, jalur, input_data (json), ptn_tujuan, jurusan_tujuan, **keketatan_score** (formula publik), **peluang_score** (personal, terpisah dari keketatan), hasil_breakdown, dibuat_pada.
- **Referral** — id, referrer_id, referee_id, kode_referral, status, tanggal_daftar, tanggal_konversi.
- **ReferralReward** — id, referral_id, jenis_reward, nominal_atau_poin, status_pencairan, tanggal.
- **GamifikasiProfile** — id, user_id, total_poin, level, badge_list, streak_counter.
- **TryOutAttempt (diperluas)** — id, user_id, tryout_id, jawaban (json), **status_per_soal** (json/array — mapping nomor soal → `dikerjakan`/`belum`, dipakai untuk render Navigator Soal), skor, waktu_mulai, **waktu_tersisa_server** (source of truth untuk timer, di-update tiap interaksi), waktu_selesai, immutable_lock, pdf_export_url.
- **Kelas, Enrollment, TryOut, Payment, KontenInfo, AIMentorLog, SoalAI, Badge, RewardCatalog** — tetap sesuai definisi v2.0 (tidak berubah pada revisi ini).

---

# BAGIAN 14 — API REQUIREMENTS

| Kategori API | Kebutuhan |
|---|---|
| **Auth & Onboarding API** | Register progresif per langkah (simpan draft), submit final, generate & kirim verification token (WA + email fallback), verify token, login, RBAC middleware, admin approve/reject mentor |
| **Assessment API** | Submit input per jalur, ambil data Sekolah otomatis untuk SNBP, hitung `keketatan_score` & `peluang_score` terpisah, generate rekomendasi |
| **Kelas/Enrollment API** | CRUD kelas, enroll, tracking progres |
| **Tryout API** | Ambil soal (timer server-side), submit jawaban, scoring, generate PDF hasil |
| **Payment API** | Integrasi gateway pihak ketiga, webhook idempotent |
| **Referral & Gamifikasi API** | Generate kode, validasi kode saat register, tracking konversi, hitung poin, leaderboard query dengan caching |
| **AI Mentor API** | Chat completion terhubung knowledge base, eskalasi ke mentor |
| **AI Question Generator API** | Generate soal (LLM), simpan Draft, endpoint approval terpisah |
| **Content API** | CRUD konten Beasiswa/Internship/Event, filter, notifikasi deadline |
| **Analytics API** | Aggregasi data, export CSV/Excel |

**Dependency data kuota & peminat**: SNBP/SNBT ditarik semi-otomatis dari snpmb.id (job tahunan, cek ToS dulu); Jalur Mandiri dikurasi manual per PTN prioritas oleh tim akademik.

---

# BAGIAN 15 — KEAMANAN, MONITORING & LOGGING

- Validasi server-side untuk seluruh aksi bernilai (timer tryout, poin, reward, status payment, **status approval mentor**, **verifikasi token**).
- Rate-limiting di endpoint autentikasi, generate kode referral, dan **request verification link** (cegah spam WA/email).
- Uptime monitoring untuk endpoint kritis (login, payment webhook, tryout submission, verification).
- Log audit untuk seluruh perubahan status sensitif termasuk approval/rejection mentor oleh Admin.

---

# BAGIAN 16 — ANALYTICS

- Analytics bisnis, akademik, marketing (sesuai v2.0).
- **(Baru)** Funnel analytics khusus onboarding: drop-off rate per langkah progressive profiling (mis. berapa persen user berhenti di Langkah 3 sebelum sampai Langkah Terakhir) — penting untuk mengukur efektivitas pola onboarding baru ini.
- Analytics performa referral, kualitas soal AI, keketatan (jurusan/PTN paling banyak dicek).

---

# BAGIAN 17 — SUCCESS METRICS (KPI)

Sesuai v2.0, ditambah:
- **Completion rate alur onboarding** (persentase user yang menyelesaikan seluruh langkah sampai akun terverifikasi) — metrik baru khusus untuk memvalidasi keputusan progressive profiling.
- **Waktu rata-rata dari klik "Daftar" sampai akun terverifikasi**.

---

# BAGIAN 18 — ASSUMPTIONS & DEPENDENCIES

- **(Baru, Agustus 2026)** Verifikasi akun & reset password sementara pakai Email (Resend) sebagai jalur utama, bukan WhatsApp — murni keputusan efisiensi anggaran pra-revenue. Ini **bukan keputusan permanen** — evaluasi ulang begitu campaign menghasilkan revenue, karena WA tetap kanal komunikasi utama Dimentoring secara bisnis dan lebih sesuai kebiasaan siswa.

- Tim tetap 3 orang inti — prioritas fitur non-inti pakai layanan pihak ketiga.
- Data kuota & peminat PTN/jurusan: SNBP/SNBT semi-otomatis dari snpmb.id, Jalur Mandiri manual per PTN prioritas.
- Leaderboard granular (kota/provinsi/nasional) baru bermakna statistik setelah jumlah pengguna cukup besar per wilayah — direkomendasikan aktif penuh di Fase 3.
- **(Baru)** Entitas `Sekolah` harus terisi cukup lengkap (akreditasi, kuota SNBP) untuk sekolah-sekolah asal siswa Dimentoring, agar auto-fill input SNBP berfungsi — ini pekerjaan kurasi data operasional, bukan cuma teknis, dan perlu dimulai sebelum fitur Assessment SNBP live.
- Kepatuhan hukum data anak memerlukan konsultasi lanjutan dengan pihak legal.

---

# BAGIAN 19 — ROADMAP KONSOLIDASI

**Fase 1 (sebelum TKA 2026):** Register/Login/Onboarding (progressive profiling), Dashboard, Assessment Prediksi PTN (SNBP sebagai referensi, SNBT & Mandiri menyusul pola sama), Payment, Kelas Bimbingan, Tryout TKA & SNBT (Free+Premium), Riwayat Tryout+PDF, Referral dasar, Approval Mentor, AI Mentor terbatas (opsional).

**Fase 2 (menjelang SNBP/SNBT):** Info Beasiswa/Internship/Event, Analytics Dasar (termasuk funnel onboarding), Gamifikasi Referral & Tryout versi awal.

**Fase 3 (2027+):** Tryout Jalur Mandiri per PTN, Leaderboard granular penuh, AI Pembuat Soal, AI Mentor Personal, Predictive Analytics, Community & Student Ambassador.

---

# BAGIAN 20 — CATATAN UNTUK CLAUDE DESIGN & CLAUDE CODE

**Untuk Claude Design:** rujuk Bagian 4.3 (landing page), Bagian 7.0 (pola onboarding progresif — pertahankan konsistensi visual maskot & progress bar dinamis), Bagian 7.4 (Assessment — pola accordion + dual metrik Keketatan/Peluang), dan Bagian 12 (design system). Halaman verifikasi (post-submit link) dan halaman SNBT/Mandiri belum didesain — desain baru sebaiknya mengikuti pola visual yang sama dengan SNBP.

**Untuk Claude Code:** rujuk Bagian 13 (Data Model — perhatikan `VerificationToken`, `keketatan_score` vs `peluang_score` sebagai field terpisah), Bagian 14 (API), Bagian 8 (Business Rules — BR-2 dan BR-15 krusial untuk arsitektur auth), dan Bagian 15. Prioritaskan sesuai Bagian 19 — webhook Payment & sistem verifikasi token adalah dependency hampir semua fitur lain.

---

*Dokumen ini adalah PRD v3.0 — konsolidasi tunggal, direkomendasikan direview bersama COO dan CTO sebelum dikunci sebagai baseline final development. Dua gap kecil masih perlu konfirmasi Rio: (1) section "Rekomendasi Paket Tryout" di hasil Assessment, (2) desain halaman verifikasi link yang belum dibuat.*