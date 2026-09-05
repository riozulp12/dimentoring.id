# Checklist Testing Fitur Dimentoring.id — Per Role

**Update terakhir:** 27 Agustus 2026
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

### Beasiswa & Event (`/beasiswa-event`)
- [ ] List tampil, search + filter tipe + filter status berfungsi
- [ ] Card yang closed tetap tampil (redup), tombol daftar nonaktif
- [ ] Klik card → detail (`/beasiswa-event/[id]`), tombol "Daftar Sekarang" buka tab baru

### Program (`/program`)
- [ ] 5 section (Konsultasi/TKA/SNBT/Ujian Mandiri/Pendampingan Mahasiswa), 3 pola desain bergantian
- [ ] "Lihat Semua" → `/program/[kategori]`, filter Tipe Kelas & Tingkat Kelas jalan
- [ ] Detail kelas: tombol "Daftar Kelas Ini" sesuai mode aktif (Payment biasa ATAU redirect Lynk.id, cek env `NEXT_PUBLIC_PENDAFTARAN_MANUAL`)

### Auth
- [ ] Daftar (Email+Password) → auto-login → redirect `/lengkapi-profil`
- [ ] Isi wizard `/lengkapi-profil` sampai selesai → redirect dashboard sesuai role
- [ ] Login (akun lama) → langsung ke dashboard, TIDAK diminta lengkapi profil ulang
- [ ] Lupa Password → cek `email_simulasi_log` di Supabase, link reset berfungsi
- [ ] Kebijakan Privasi (`/kebijakan-privasi`) bisa diakses, link dari Footer/Daftar/Pengaturan berfungsi

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
- [ ] List "Kelas Saya" + "Rekomendasi Kelas" (sesuai mapel tersulit + tingkat kelas)
- [ ] Detail kelas: link Meet, list Materi (cuma `published`), tandai selesai → progress bar update
- [ ] Coba akses kelas yang BUKAN diikuti lewat ganti URL → ditolak

### Referral, Poin & Gamifikasi
- [ ] Kode referral otomatis ada, link bisa di-copy
- [ ] Klik link dari device lain → `referral_click_count` bertambah, kode ke-prefill di form Daftar
- [ ] Setelah ada yang daftar+bayar pakai kode → status referral "Terkonversi", poin REFERRER dan REFEREE dua-duanya bertambah sesuai config persentase
- [ ] Level naik/turun otomatis sesuai `gamifikasi_level_tier`
- [ ] Tukar Poin: cukup vs tidak cukup poin, riwayat penukaran muncul

### Checkout & Pembayaran (kalau `NEXT_PUBLIC_PENDAFTARAN_MANUAL` nonaktif)
- [ ] Checkout kelas, coba Kode Promo valid/invalid/scoping salah/kuota habis
- [ ] Bayar via Sandbox → halaman "Menunggu Konfirmasi" auto-update tanpa refresh manual
- [ ] Status jadi lunas → akses Kelas Saya langsung terbuka

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

### Siswa Saya
- [ ] Search + filter kelas berfungsi
- [ ] Detail siswa: HANYA bisa akses siswa binaan sendiri (coba ganti URL manual harus ditolak)

### Honor & Referral
- [ ] Total Honor terhitung benar dari `tipe_kelas` + enrollments lunas (breakdown per kelas akurat)
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
- [ ] Kelola Konten: Tab Beasiswa/Event CRUD, Tab Review Konten AI (lintas semua mentor/subtes), Tab Katalog Reward CRUD + proses Permintaan Penukaran Poin (Selesai/Tolak, poin dikembalikan kalau ditolak)

### Kode Promo & Undang Admin
- [ ] Kode Promo: buat dengan scoping kelas tertentu vs semua kelas, label sekolah (cuma catatan, tidak divalidasi sistem), edit/nonaktifkan
- [ ] Undang Admin: generate link, buka di Incognito → daftar → langsung `active` tanpa approval, link yang sudah dipakai/dibatalkan ditolak

### Analytics
- [ ] 4 stat card (Total Pendaftaran, Bulan Ini, Dari Referral, Dari Iklan)
- [ ] Chart Pendaftaran per Sumber, Sales (mulai terisi sesuai transaksi nyata), Pengeluaran (gabungan manual + budget Campaign Iklan)
- [ ] CRUD Campaign Iklan, hitung Leads & CPL otomatis dari `utm_campaign` yang cocok

### Keamanan Lintas Role (WAJIB dicek semua)
- [ ] Akun Siswa coba akses halaman `/admin/*` dan `/mentor/*` manapun → ditolak semua
- [ ] Akun Mentor coba akses data Siswa/Mentor lain via ganti ID di URL → ditolak
- [ ] Semua guard di atas dicek SERVER-SIDE (bukan cuma UI yang disembunyikan)

---

## Cara Melaporkan Bug yang Ditemukan

1. Screenshot tampilan errornya
2. Buka F12 → Console + Network tab, cari request yang gagal (status bukan 200), copy isi Response
3. Cek terminal `npm run dev`, copy pesan error lengkap kalau ada
4. Sebutkan: role yang dipakai, langkah persis sebelum error muncul, dan hasil dari 3 poin di atas
