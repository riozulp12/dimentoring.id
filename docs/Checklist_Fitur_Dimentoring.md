# Checklist Testing Fitur Dimentoring.id — Per Role

**Update terakhir:** 18 Oktober 2026
**Cara pakai:** Login/akses sesuai role di tiap bagian, ikuti langkah test, centang kalau hasilnya sesuai "Hasil yang Diharapkan". Kalau ada yang gagal, catat pesan error lengkap (Console + Network tab + terminal) sebelum lapor balik.

---

## A. GUEST (Belum Login)

### Landing Page
- [ ] Navbar urutan: Home - Program - Cek Peluang PTN - Testimonial - Mentor - FAQ
- [ ] Footer: link Program konsisten dengan Navbar, tidak ada link mati/kosong
- [ ] Section Hero: 1 CTA dominan mengarah ke `/assessment`
- [ ] Section Why/USP Beasiswa: card muncul (kalau `konten_info` ada datanya), link "Lihat Semua" ke `/beasiswa-event`
- [ ] Section Program: card clickable, mengarah ke `/program/[kategori]` sesuai isi dropdown Navbar
- [ ] Section Testimonial: tidak ada teks lorem ipsum
- [ ] Section Mentor: foto tidak terpotong
- [ ] Section Leaderboard: tombol merespons saat diklik (boleh placeholder, asal tidak diam)
- [ ] Section Ajakan Tryout: CTA ke `/tryout`
- [ ] Section FAQ: card "Dimentoring cuma online?" tidak menyebut "Banyumas"
- [ ] Section closing (sebelum footer): ada CTA jelas ke `/daftar`
- [ ] Klik logo dari halaman manapun → kembali ke `/`

### Widget Cek Keketatan (popup di landing page)
- [ ] Pilih Jalur → Universitas → Jurusan, klik "Cek Keketatan"
- [ ] Hasil popup: Keketatan (persen+label+warna) MUNCUL BERSAMA Kuota Tahun Berjalan dan Peminat Tahun Lalu
- [ ] Tombol "Coba Cek Peluang Kamu" → `/assessment`
- [ ] Bisa dipakai berkali-kali tanpa batas

### Assessment Prediksi PTN (`/assessment`)
- [ ] Isi 1x (mode Incognito baru) → langsung lihat hasil lengkap
- [ ] Isi 2x → masih lihat hasil lengkap
- [ ] Isi 3x (trial ke-3, cookie sama) → diarahkan ke Register, bukan hasil
- [ ] Isi dengan 1 pilihan PTN → lolos tanpa syarat provinsi
- [ ] Isi dengan 2 pilihan beda provinsi (keduanya di luar provinsi sekolah) → ditolak, pesan jelas
- [ ] Isi dengan Pilihan 1 rumpun Saintek + Pilihan 2 rumpun Soshum → Rekomendasi Jurusan tampil 2 set (masing-masing sesuai rumpun asalnya)
- [ ] Card "Nilai Akhir": label sesuai skala baru (95-100 Sangat Tinggi, 86-94 Tinggi, 76-85 Sedang, 66-75 Rendah, 50-65 Sangat Rendah, ≤49 Perlu Ditingkatkan)
- [ ] Card Hasil Prediksi & Rekomendasi Jurusan: Kuota Tahun Berjalan + Peminat Tahun Lalu tampil
- [ ] Link "Hapus Pilihan 2": ada icon trash, warna merah
- [ ] Note AI: generate teks yang beda tiap assessment (BUKAN selalu fallback statis), coba 5-8x berturut untuk pastikan konsisten berhasil
- [ ] Hasil tamu: tombol "Daftar Sekarang" membawa `?pending_assessment=` → setelah daftar, hasil percobaan ke-1/ke-2 ikut tertaut ke akun

### Lead Capture & Atribusi (PRD 7.4.6, BR-38)
- [ ] Bendera `NEXT_PUBLIC_LEAD_CAPTURE_ENABLED` kosong/selain `"true"` → kartu WhatsApp TIDAK tampil di hasil, `POST /api/leads` ditolak 403, halaman Admin `/leads` tetap bisa dibuka & export
- [ ] Bendera `"true"` (redeploy setelah ubah env, karena `NEXT_PUBLIC_*` di-inline saat build) → kartu tampil & kirim nomor berhasil (skenario di bawah)
- [ ] Buka `/?utm_source=ig&utm_campaign=tes` lalu `/assessment` → cookie `dm_attr` ada (DevTools → Application → Cookies, httpOnly)
- [ ] Kunjungan kedua dengan UTM berbeda (`?utm_source=tiktok&utm_campaign=lain`) → isi `dm_attr` TIDAK berubah
- [ ] Submit Assessment → baris `assessments` punya `utm_source`/`utm_campaign` dari cookie
- [ ] Kartu "Mau analisis lengkap…" tampil di hasil tamu; hasil tetap terlihat lengkap tanpa mengisi apa pun
- [ ] Checkbox persetujuan tidak tercentang dari awal; kirim tanpa centang → ditolak (pesan di UI) dan API juga menolak
- [ ] Kirim `0812…` lalu `+62 812…` (nomor sama) → satu baris di `leads`, `jumlah_submit` = 2, `utm_campaign` tetap dari kiriman pertama
- [ ] Kirim lebih dari 5x dalam 1 jam dari browser yang sama → ditolak "Terlalu banyak percobaan"
- [ ] Teks persetujuan di kartu WhatsApp = teks final v1 (menyebut izin orang tua/wali & email penarikan persetujuan); lead baru tersimpan dengan `consent_versi = 'v1'`, baris lama `v1-draf` tidak berubah
- [ ] Tautan "Kebijakan Privasi" di kartu WhatsApp dan di `/daftar` membuka `/kebijakan-privasi` tanpa login (coba di jendela incognito)
- [ ] Daftar akun lewat `/daftar` TANPA query UTM setelah datang dari link UTM → `users.utm_source/utm_campaign` terisi dari cookie

### Beasiswa & Event (`/beasiswa-event`)
- [ ] List tampil, search + filter tipe + filter status berfungsi
- [ ] Card yang closed tetap tampil (redup), tombol daftar nonaktif
- [ ] Klik card → detail (`/beasiswa-event/[id]`), tombol "Daftar Sekarang" buka tab baru

### Program (`/program`)
- [ ] 5 section (Konsultasi/TKA/SNBT/Ujian Mandiri/Pendampingan Mahasiswa), 3 pola desain bergantian
- [ ] "Lihat Semua" → `/program/[kategori]`, filter Tipe Kelas & Tingkat Kelas jalan
- [ ] Detail kelas: tombol "Daftar Sekarang" sesuai aturan `lib/shared/kelasDaftarTarget.ts` (link pendaftaran kelas terisi → ke link itu; kosong → checkout internal hanya kalau env `NEXT_PUBLIC_CHECKOUT_INTERNAL_READY` persis `"true"`, selain itu disabled "Pendaftaran segera dibuka")
- [ ] Guard server: buka `/checkout/[kelasId]` langsung untuk kelas berlink pendaftaran, atau saat flag tidak `"true"` → dialihkan ke detail kelas; `POST /api/payment/create` → 403

### Auth
- [ ] Daftar (Email+Password) → auto-login → redirect `/lengkapi-profil`
- [ ] Isi wizard `/lengkapi-profil` sampai selesai → redirect dashboard sesuai role
- [ ] Login (akun lama) → langsung ke dashboard, TIDAK diminta lengkapi profil ulang
- [ ] Lupa Password → cek `email_simulasi_log` di Supabase, link reset berfungsi
- [ ] Kebijakan Privasi (`/kebijakan-privasi`) bisa diakses tanpa login, link dari Footer/Daftar/Pengaturan berfungsi; tampil "Berlaku sejak: 23 Oktober 2026 · Versi: v1", tanpa banner draf dan tanpa nama brand pihak ketiga

---

## B. SISWA

### Dashboard
- [ ] 4 stat card: Target PTN, Kelasmu, Nilai Tryout Tertinggi, Poin Referral — data sesuai akun
- [ ] Empty state rapi untuk akun baru yang datanya masih kosong

### Profil & Pengaturan
- [ ] Edit profil: Nama, No WA, Nama Sekolah (teks bebas), Provinsi, Kelas, Mapel Tersulit — tersimpan & langsung update di Navbar/Sidebar
- [ ] Upload avatar (JPG/PNG/WEBP ≤1MB) berhasil, file bukan gambar/SVG/>1MB ditolak
- [ ] Pengaturan: Ganti Password, toggle Notifikasi, toggle Privasi Leaderboard, Unduh Data (tanpa password_hash), Hapus Akun (request, bukan instant)

### Kelas Saya (`/kelas`)
- [ ] List "Kelas Saya" (grup Sedang Berjalan/Selesai, kartu → `/kelas/[id]`) + "Rekomendasi Kelas" (mapel tersulit + tingkat kelas, fallback kelas katalog lain; kartu → detail jualan `/program/kelas/[id]`)
- [ ] Akun tanpa kelas: teks "Kamu belum ikut kelas apa pun nih…" + daftar kelas katalog; klik kartu → detail jualan (bukan halaman materi)
- [ ] Detail kelas: link Meet, list Materi (cuma `published`), tandai selesai → progress bar update
- [ ] Presensi: setelah mentor menandai sesi, notifikasi bell menyebut "akan terkonfirmasi otomatis dalam 24 jam jika tidak ada respons"; di detail kelas muncul prompt Ya/Tidak + batas jawab (jam WIB)
- [ ] Presensi: jawab "Ya" → angka Progress Kehadiran TIDAK bertambah (sesi menunggu sudah terhitung); jawab "Tidak" → angka berkurang satu dan sesi masuk antrian Admin
- [ ] Presensi: sesi yang lewat 24 jam tanpa jawaban → prompt hilang, tetap terhitung di progress; memaksa PATCH `/api/siswa/sesi` untuk sesi itu → 409 "Batas 24 jam untuk menjawab sudah lewat…"
- [ ] Presensi multi-mentor: riwayat sesi di detail kelas menampilkan "Nama Mentor — Mapel" per sesi (sesi lama tanpa mentor: tanpa label); notifikasi & prompt menyebut mentor + mapel; dua sesi menunggu (beda mentor) → prompt kedua muncul setelah yang pertama dijawab
- [ ] Presensi multi-mentor: total sesi tetap `jumlah_sesi` kelas (mis. 10) walau ditandai bergantian oleh beberapa mentor — bukan 10 per mentor
- [ ] Coba akses kelas yang BUKAN diikuti lewat ganti URL → ditolak

### Referral, Poin & Gamifikasi
- [ ] Kode referral otomatis ada, link bisa di-copy
- [ ] Klik link dari device lain → `referral_click_count` bertambah, kode ke-prefill di form Daftar
- [ ] Setelah ada yang daftar+bayar pakai kode → status referral "Terkonversi", poin REFERRER dan REFEREE dua-duanya bertambah sesuai config persentase
- [ ] Level naik/turun otomatis sesuai `gamifikasi_level_tier`
- [ ] Tukar Poin: cukup vs tidak cukup poin, riwayat penukaran muncul

### Checkout & Pembayaran (kalau `NEXT_PUBLIC_CHECKOUT_INTERNAL_READY="true"`)

Gateway: **Mayar** (Request Payment, API v2). Midtrans tidak dipakai lagi.

**Lingkungan**
- Preview / lokal: akun **sandbox** `web.mayar.io`, `MAYAR_BASE_URL=https://api.mayar.io`, key sandbox.
- Production: akun **production** `web.mayar.id`, `MAYAR_BASE_URL=https://api.mayar.id`, key production.
- Env lain: `PAYMENT_PROVIDER` (kosong = `mayar`), `APP_BASE_URL` (mis. `https://dimentoring.id`; kosong = origin request, untuk Preview).
- Guard kode: Production + `api.mayar.io` ditolak; non-Production + `api.mayar.id` ditolak kecuali `MAYAR_ALLOW_PROD_IN_PREVIEW=true`. "Production" dibaca dari `VERCEL_ENV` (Preview Vercel tetap dianggap non-Production walau `NODE_ENV=production`); di luar Vercel dari `NODE_ENV`.

**Webhook (wajib didaftarkan di dashboard Mayar → Integration → Webhook)**
- Preview: `https://<domain-preview>/api/payment/webhook/mayar` di dashboard **sandbox**.
- Production: `https://dimentoring.id/api/payment/webhook/mayar` di dashboard **production**.
- Keaslian webhook TIDAK dari signature: isi payload tidak dipercaya, server mencari payment lewat `data.productId` → `data.id` → `data.transactionId` (dicocokkan ke `payments.gateway_reference`), lalu **GET status ke API Mayar** pakai key server. Lunas hanya kalau Mayar bilang `paid` DAN nominal transaksi = tagihan. Log `[payment/webhook/mayar] cocok lewat field data.…` menunjukkan field mana yang cocok — catat saat uji sandbox pertama.
- Langkah pasca-lunas gagal → webhook membalas HTTP 500 supaya Mayar mengirim ulang; kiriman ulang melengkapi tanpa data ganda.
- Admin bisa cek ulang manual: `POST /api/admin/payment/recheck` (body kosong = semua yang masih menunggu, atau `{"orderId":"DMT-..."}`). Gagal hanya kalau Mayar menyatakan belum dibayar DAN status `closed`/lewat 24 jam.

**Nominal & biaya**
- Tagihan ke Mayar = harga final setelah promo; potongan Mayar ditanggung Dimentoring.
- `PAYMENT_FEE_BORNE_BY_CUSTOMER=true` saat ini **tidak berpengaruh** (cuma log peringatan): docs Mayar menyatakan pengaturan biaya ditanggung pembeli tidak berlaku untuk Request Payment, dan tarif potongan per channel tidak tersedia lewat API, jadi tidak ada rumus yang bisa dipasang dengan aman. Kalau suatu saat dibutuhkan, rumus harus disepakati dulu dan nominal webhook akan dicek ulang (beda nominal + biaya ditanggung pembeli = dicatat, TIDAK lunas otomatis).
- Jangan buat kode diskon di dashboard Mayar — halaman tagihan Mayar menampilkan "Punya kode diskon?"; kalau dipakai, nominal transaksi tidak cocok dan pembayaran tidak dilunasi otomatis.
- Mayar menolak create dengan email + nominal sama dalam 1 menit (HTTP 429) → siswa melihat "Tunggu 1 menit lalu coba lagi".

**Uji**
- [ ] Checkout kelas, coba Kode Promo valid/invalid/scoping salah/kuota habis
- [ ] "Bayar Sekarang" → diarahkan ke halaman tagihan Mayar (bukan popup) → pilih channel → **Simulasi Pembayaran** (sandbox) → kembali ke `/payment-status/[orderId]`, halaman "Menunggu Konfirmasi" auto-update tanpa refresh manual
- [ ] Status jadi lunas → akses Kelas Saya langsung terbuka
- [ ] Skrip `npx tsx scripts/mayar-sandbox-check.ts` (sandbox saja) untuk cek key/base URL tanpa browser

### Persiapan screenshot Customer Journey Midtrans

> **TIDAK LAGI DIPAKAI** — Dimentoring pindah ke Mayar. Bagian ini disimpan sebagai arsip sampai kode Midtrans dihapus.

Dipakai saat perlu bukti alur pembayaran di Production (mis. pengajuan aktivasi Midtrans) selagi Midtrans masih **Sandbox**.

**Sebelum mulai**
- Migration `db/add_kelas_tampil_di_katalog.sql` sudah dijalankan.
- Kelas yang dipakai: tampil di katalog, **tanpa** "Link Pendaftaran" (`link_lynkid` kosong), slot masih ada, harga > 0.
- Set env Production `NEXT_PUBLIC_CHECKOUT_INTERNAL_READY` persis `true`, lalu **redeploy** (variabel `NEXT_PUBLIC_*` ikut ter-*build*, jadi mengubah env saja tidak cukup). `MIDTRANS_IS_PRODUCTION` tetap bukan `true` dan key Midtrans tetap key Sandbox.
- Pakai **akun uji Siswa**, bukan akun siswa sungguhan.

**Urutan 7 langkah (screenshot tiap langkah)**
1. Landing page (`/`)
2. Login (`/login`)
3. Dashboard Siswa
4. Menu "Kelas Saya" (`/kelas`) — akun tanpa kelas melihat teks "Kamu belum ikut kelas apa pun nih…" + daftar kelas
5. Klik kartu kelas → detail kelas (`/program/kelas/[id]`), tombol "Daftar Sekarang"
6. Checkout (`/checkout/[id]`)
7. Klik "Bayar Sekarang" → popup Midtrans Snap (Sandbox)

**PERINGATAN — wajib setelah screenshot selesai**
- [ ] **Hapus lagi** `NEXT_PUBLIC_CHECKOUT_INTERNAL_READY` dari env Production dan **redeploy**. Selama flag menyala dengan Midtrans Sandbox, siapa pun bisa "membayar" dengan simulasi dan mendapat kelas **gratis**.
- [ ] Verifikasi sudah tertutup: tombol detail kelas jadi "Pendaftaran segera dibuka" (disabled), `/checkout/[id]` dialihkan, `POST /api/payment/create` → 403.
- [ ] Kalau pembayaran sempat disimulasikan sampai lunas: bersihkan dengan `db/cleanup_enrollment_uji_TEMPLATE.sql` (salin, isi email akun uji, dry-run dulu). Cukup berhenti di popup Snap kalau tidak butuh screenshot halaman sukses.

### Lainnya
- [ ] Beasiswa & Event, Notifikasi bell (badge count, klik tandai dibaca)
- [ ] "Jadi Mentor" di dropdown avatar (cuma muncul kalau belum punya role Mentor aktif/pending)
- [ ] Menu "AI Mentor" TIDAK muncul di sidebar (sengaja disembunyikan)

---

## C. MENTOR

### Dashboard & Status
- [ ] Mentor status Pending: badge "On Review" tampil, fitur mengajar terkunci
- [ ] Mentor status Active: 4 stat card (Kelas Diampu, Siswa Binaan, Rata-rata Progress, Konten AI Menunggu Review) + Progress Siswa Binaan + Kelas Terdaftar + Info Beasiswa

### Kelas Saya & Materi
- [ ] List kelas diampu, detail: edit link Meet
- [ ] Tambah Materi manual (video/dokumen = link, rangkuman = teks) → langsung published
- [ ] Generate Deskripsi Kelas AI (Kelola Kelas, kalau Mentor punya akses) → hasil beda tiap generate
- [ ] Materi & Latihan Soal: list draft (soal+materi AI), Setujui/Tolak berfungsi, status berubah + notifikasi terkirim
- [ ] Presensi: "Tandai Sesi Hari Ini Selesai" menandai sesi berikutnya, info menyebut konfirmasi otomatis 24 jam, progress "Sesi X dari Y" langsung bertambah
- [ ] Presensi: mentor yang SAMA menandai siswa yang sama dua kali di hari kalender WIB yang sama → tombol berubah "Sudah ditandai hari ini"; memaksa POST `/api/mentor/sesi` → 409. Besoknya (≥ 00:00 WIB) bisa lagi
- [ ] Presensi multi-mentor: mentor kedua (kelas_mentor) boleh menandai siswa yang sama di hari yang sama dengan mentor utama; sesi tercatat dengan nama mentor + mapel masing-masing
- [ ] Presensi offline: kelas offline muncul di Kelas Saya untuk mentor offline yang ditugaskan (walau kelas tanpa mentor utama), cuma siswa yang ditugaskan ke dia yang tampil, dan dia bisa menandai sesi; mentor offline lain / mentor tidak terkait → 403
- [ ] Presensi: baris siswa menampilkan "Sesi X dari Y · N ditandai kamu" + "Riwayat sesi" (Nama Mentor — Mapel, "(kamu)" untuk sesi sendiri)
- [ ] Mentor non-utama (kelas_mentor / offline): tombol Edit Link Meet & Tambah Materi tidak tampil (masih khusus mentor utama)
- [ ] Presensi: klik dobel / dua tab bersamaan → cuma satu sesi tertandai dan siswa cuma menerima satu notifikasi
- [ ] Presensi: baris siswa menampilkan jumlah sesi "menunggu konfirmasi siswa" dan "disangkal, ditinjau Admin"

### Studio Soal SNBT (Tahap 1 — PRD 7.7 revisi, BR-37)
*Butir bertanda (DB) sudah bisa dicek sekarang lewat SQL Editor; sisanya menunggu UI (PR 3–6).*
- [ ] (DB) Migrasi `db/add_studio_soal.sql`: dry-run `BEGIN; <migrasi> <db/test_studio_soal_DRYRUN.sql> ROLLBACK;` → NOTICE "SEMUA SKENARIO LULUS"; lalu jalankan sungguhan **dua kali** tanpa error; query verifikasi (a)–(e) di header migrasi sesuai harapan (6 tabel RLS aktif, 0 policy, fungsi `studio_soal_*` tidak bisa dieksekusi anon/authenticated)
- [ ] (DB) UPDATE langsung `soal_bank.status` dari SQL Editor (tanpa fungsi `studio_soal_*`) → ditolak trigger
- [ ] Mentor membuat soal hanya untuk subtes SNBT yang dia ampu (subtes lain / TKA → ditolak); Mentor Pending → fitur terkunci
- [ ] Tiga tipe soal tersimpan & terlihat di pratinjau: pilihan ganda (5 opsi, 1 kunci), majemuk kompleks (2–6 pernyataan, label kolom bisa diganti), isian (1–5 rumpang, jawaban alternatif)
- [ ] Penulis tidak bisa meninjau soalnya sendiri (tombol tidak ada; paksa lewat API → ditolak)
- [ ] Tolak tanpa alasan / alasan < 10 karakter (emoji dihitung per karakter) → ditolak; alasan tampil ke penulis
- [ ] Admin: tombol "Publikasikan sebagai Admin" hanya muncul bila tidak ada mentor lain yang eligible di subtes itu; aksinya tercatat di log
- [ ] Stimulus + soal-soalnya diajukan & ditinjau sebagai satu kesatuan; mentor lain tidak bisa menambah soal ke stimulus orang lain
- [ ] Edit soal terbit → membuat versi baru; versi lama tetap dipakai paket yang sudah terbit sampai versi baru disetujui
- [ ] Paket campuran 3 tipe: hanya terbit bila semua soalnya terbit; paket berisi draf milik sendiri → "menunggu soal" → terbit otomatis saat soal terakhir disetujui, kembali draf bila ada yang ditolak

### Siswa Saya
- [ ] Search + filter kelas berfungsi
- [ ] Detail siswa: HANYA bisa akses siswa binaan sendiri (coba ganti URL manual harus ditolak)

### Honor & Referral
- [ ] Total Honor terhitung benar dari `tipe_kelas` + enrollments lunas (breakdown per kelas akurat)
- [ ] (Tahap pembayaran honor — BELUM dibangun) sesi masuk periode honor berdasarkan WAKTU TERKONFIRMASI (bukan waktu ditandai mentor); pembayaran tanggal 23–28 tiap bulan, cut-off tanggal 22 pukul 23:59 WIB
- [ ] Referral & Poin: sama seperti Siswa (Mentor juga eligible reward dua sisi)

---

## D. ADMIN

### Dashboard & Manajemen
- [ ] Dashboard: 4 stat card + Antrian Approval Mentor (Setujui/Tolak langsung dari sini) + Pendaftaran Terbaru + Konten AI preview
- [ ] Manajemen Mentor: 6 tab (Menunggu/Disetujui/Ditolak/Aktif/Pasif/Calon Mentor) — semua ada badge angka akurat, klik card → detail lengkap
- [ ] Manajemen Siswa: 4 tab (Semua/Aktif/Alumni/Belum Bayar) — badge angka akurat, search jalan bareng filter tab

### Kelola Kelas, Assessment, Konten
- [ ] Kelola Kelas: CRUD lengkap, dropdown Mentor terfilter sesuai Subtes, jadwal multi-slot (tambah/hapus slot), Kategori Program wajib diisi, Deskripsi AI generate, popup detail read-only + tombol Edit/Hapus sejajar, cegah hapus kelas yang masih ada siswa aktif
- [ ] Kelola Assessment: CRUD data PTN (termasuk field Rumpun WAJIB), tolak duplikat kombinasi, Import CSV dengan laporan hasil (berhasil/gagal/duplikat)
- [ ] Sesi Perlu Ditinjau: kolom "Ditandai oleh" menampilkan "Nama Mentor — Mapel" (sesi lama: mentor kelas); Batalkan mengosongkan mentor & mapel sesi itu (butuh migrasi `db/add_sesi_mentor_mapel.sql`)
- [ ] Sesi Perlu Ditinjau (`/sesi-review`): tombol Batalkan nonaktif sampai alasan diisi; Setujui/Batalkan menambah satu baris `sesi_review_log` (admin, keputusan, snapshot sebelum, alasan); dua Admin klik bersamaan → yang kedua dapat "sudah tidak menunggu review" (butuh migrasi `db/add_sesi_review_log.sql` sudah dijalankan)
- [ ] Daftarkan Siswa Manual (halaman Pendaftar, butuh migrasi `db/add_enrollment_manual.sql`): cari siswa nama/email (cuma siswa aktif), metode pembayaran + alasan ≥ 10 karakter wajib, nominal opsional → siswa muncul dengan badge "Manual" + status Lunas, siswa dapat notifikasi "Kamu telah didaftarkan ke kelas X oleh Admin", 10 (sesuai `jumlah_sesi`) baris sesi terbentuk, satu baris `enrollment_manual_log`
- [ ] Daftarkan Siswa Manual: siswa yang sudah terdaftar di kelas itu → 409; kelas penuh → tombol nonaktif dan API → 409 (tidak ada override); klik dobel → cuma satu pendaftaran
- [ ] Daftarkan Siswa Manual: TIDAK ada baris baru di `payments` / Riwayat Transaksi, `kode_promo.jumlah_terpakai` tidak berubah, poin & reward referral siswa/referrer tidak bertambah
- [ ] Daftarkan Siswa Manual kelas paket: wajib pilih 1–3 subtes; kelas offline: wajib pilih mentor tatap muka (aktif, bersedia tatap muka, mengampu mapel), lokasi opsional
- [ ] Daftarkan Siswa Manual: siswa yang masih punya checkout "menunggu" < 24 jam untuk kelas itu → 409 (pesan: tunggu link kedaluwarsa atau batalkan dulu); checkout menunggu > 24 jam / kelas lain → tidak menghalangi; tabel `payments` tidak berubah
- [ ] Daftarkan Siswa Manual & Ubah mentor: akun yang Student + Mentor sekaligus tidak muncul sebagai kandidat mentor untuk dirinya sendiri; memaksa lewat API → 400 "tidak boleh akun siswa itu sendiri"
- [ ] Daftarkan Siswa Manual: alasan berisi emoji dihitung per karakter (5 emoji = 5 karakter → ditolak, 10 emoji → diterima), tidak pernah 500
- [ ] `enrollment_manual_log.snapshot` tidak memuat `lokasi_siswa_lat`/`lokasi_siswa_lng` (cek di SQL Editor setelah mendaftarkan siswa kelas offline dengan lokasi)
- [ ] Manajemen Siswa: daftar siswa tampil (tidak kosong) dan kolom jumlah kelas benar setelah migrasi `db/add_enrollment_manual.sql`
- [ ] Ubah mentor tatap muka (kelas offline, siswa lunas): alasan wajib → mentor baru langsung melihat siswa di Kelas Saya & bisa menandai sesi, mentor lama tidak lagi; satu baris log `tugaskan_mentor`
- [ ] Badge "Manual" juga tampil di Manajemen Siswa → detail → Kelas Diikuti
- [ ] Kelola Konten: Tab Beasiswa/Event CRUD, Tab Review Konten AI (lintas semua mentor/subtes), Tab Katalog Reward CRUD + proses Permintaan Penukaran Poin (Selesai/Tolak, poin dikembalikan kalau ditolak)

### Kode Promo & Undang Admin
- [ ] Kode Promo: buat dengan scoping kelas tertentu vs semua kelas, label sekolah (cuma catatan, tidak divalidasi sistem), edit/nonaktifkan
- [ ] Undang Admin: generate link, buka di Incognito → daftar → langsung `active` tanpa approval, link yang sudah dipakai/dibatalkan ditolak

### Analytics
- [ ] 4 stat card (Total Pendaftaran, Bulan Ini, Dari Referral, Dari Iklan)
- [ ] Chart Pendaftaran per Sumber, Sales (mulai terisi sesuai transaksi nyata), Pengeluaran (gabungan manual + budget Campaign Iklan)
- [ ] CRUD Campaign Iklan, hitung Leads & CPL otomatis dari `utm_campaign` yang cocok
- [ ] Card campaign menampilkan "Leads WA" (dari tabel `leads`) untuk `utm_campaign_tag` yang cocok

### Leads (`/leads`, PRD 7.4.6)
- [ ] Lead dengan `utm_campaign` benar tampil; filter status/sumber/campaign & cari nomor (`0812…`) atau nama berfungsi
- [ ] Ubah status & catatan tersimpan; perubahan status tercatat di `lead_status_log` (siapa Admin-nya)
- [ ] Tombol "Buka WhatsApp" membuka `wa.me/628…`
- [ ] Export CSV: nomor format `628…`; lead dengan nama `=HYPERLINK(...)` tampil sebagai teks di Excel/Sheets, bukan rumus

### Keamanan Lintas Role (WAJIB dicek semua)
- [ ] Akun Siswa coba akses halaman `/admin/*` dan `/mentor/*` manapun → ditolak semua
- [ ] Akun Mentor coba akses data Siswa/Mentor lain via ganti ID di URL → ditolak
- [ ] Akun Siswa/Mentor buka `/leads` atau panggil `/api/admin/leads` (GET/PATCH/export) → ditolak (403)
- [ ] Semua guard di atas dicek SERVER-SIDE (bukan cuma UI yang disembunyikan)

---

## Cara Melaporkan Bug yang Ditemukan

1. Screenshot tampilan errornya
2. Buka F12 → Console + Network tab, cari request yang gagal (status bukan 200), copy isi Response
3. Cek terminal `npm run dev`, copy pesan error lengkap kalau ada
4. Sebutkan: role yang dipakai, langkah persis sebelum error muncul, dan hasil dari 3 poin di atas
