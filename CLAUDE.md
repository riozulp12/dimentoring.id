# Dimentoring Web Platform

Education Journey Mentoring Platform — website & platform pembelajaran untuk siswa SMA/gap year persiapan PTN, dengan pendampingan berlanjut pasca-diterima kuliah (beasiswa/internship/event).

## Dokumen Acuan

- **PRD lengkap**: `docs/PRD.md` — baca bagian yang relevan sebelum mengerjakan fitur baru. Jangan asumsikan requirement, cek dulu di dokumen ini.
- **Skema database**: `dimentoring_schema.sql` (lihat lokasi aktual di root/db folder project) — kalau perlu ubah struktur tabel, update juga PRD Bagian 13 (Data Model) supaya dua dokumen ini tidak saling berselisih.

## Tech Stack

- Frontend: Next.js (App Router)
- Database: PostgreSQL — [isi provider final: Supabase/Neon/lainnya]
- Payment Gateway: [isi setelah diputuskan: Midtrans/Xendit]
- WhatsApp Business API: [ditunda sampai ada revenue — lihat catatan Email di bawah]
- Email Service: Resend (free tier) — jalur utama verifikasi & reset password saat ini, pakai domain custom terverifikasi (bukan domain default Resend)

---

## Aturan Wajib — Jangan Pernah Dilanggar

Ini rangkuman business rules paling kritis dari PRD. Detail lengkap & alasan ada di `docs/PRD.md` Bagian 8.

### Auth & Role
- Role user (Student/Mentor/Admin) **TIDAK BOLEH** ditentukan dari input client (parameter URL, dropdown bebas, dsb) — selalu dibaca dari database di server. Ini mencegah privilege escalation.
- Akun Mentor dibuat lewat self-register, tapi **baru aktif setelah di-approve Admin** — jangan buat jalur yang langsung mengaktifkan mentor tanpa approval.
- Akun Admin **hanya** dibuat lewat undangan Admin lain, tidak ada form publik untuk role Admin.
- Satu akun (satu `user_id`) **boleh punya lebih dari satu role aktif sekaligus** (mis. Student + Mentor) lewat tabel `user_roles` — jangan asumsikan satu user = satu role tunggal saat menulis query atau middleware.
- **Verifikasi akun (email/WA) DITUNDA — tidak aktif di Fase 1** (revisi September 2026). Akun langsung `Verified` otomatis saat dibuat, langsung bisa dipakai Payment. Infrastruktur `verification_tokens` tetap ada di skema, jangan dihapus — akan diaktifkan lagi di Fase 2.
- **Mentor dengan status Pending TETAP BISA LOGIN** (ini beda dari sebelumnya) — tampilkan label "On Review" di Navbar, kunci fitur mengajar (Kelas Saya, Siswa Binaan, assignment baru), tapi jangan blokir login sepenuhnya. Approval Admin tetap wajib sebelum fitur mengajar terbuka (BR-2 tidak berubah, cuma akses login-nya).

### Payment
- Status pembayaran **hanya** boleh berubah lewat webhook payment gateway atau override manual Admin dengan log audit — tidak ada jalur lain, termasuk dari sisi client.
- Webhook payment **wajib idempotent** — payment gateway bisa mengirim event yang sama lebih dari sekali, jangan sampai itu memicu akses/reward ganda. Skema sudah punya unique index di `gateway_reference` untuk ini, pastikan logic aplikasi juga cek ini sebelum memproses.

### Tryout
- Timer tryout dihitung **server-side** sebagai source of truth — tampilan di client cuma mengikuti server, tidak boleh ada logic penentu waktu di client yang bisa dimanipulasi devtools/refresh.
- Hasil tryout yang sudah final (`immutable_lock = true`) **tidak boleh diedit** lewat jalur normal — kecuali koreksi teknis Admin dengan log audit penuh.
- Tryout Jalur Mandiri wajib terikat ke satu PTN spesifik (`ptn_terkait` tidak boleh NULL untuk kategori mandiri).
- Navigator soal wajib bisa membedakan minimal 2 status (sudah dikerjakan / belum dikerjakan) dan update real-time tanpa reload.

### Referral & Gamifikasi
- Reward referral hanya cair setelah pembayaran pertama referee terkonfirmasi sukses — bukan sekadar registrasi.
- Sistem wajib mencegah self-referral (referrer dan referee tidak boleh orang/device yang sama).
- Leaderboard (referral maupun tryout) **default menampilkan nama panggilan/alias**, bukan nama asli — nama asli hanya tampil kalau user eksplisit opt-in. Ini prinsip privasi anak, jangan dilonggarkan demi kemudahan development.
- Siswa bisa opt-out dari leaderboard publik kapan saja tanpa kehilangan skor/badge pribadi.
- Anggaran reward gamifikasi per periode wajib punya batas atas (cap) yang dikonfigurasi Admin — jangan buat sistem poin yang bisa ditukar tanpa batas anggaran.

### Assessment
- Setiap hasil Assessment wajib menampilkan disclaimer estimasi + tahun data yang dipakai — jangan pernah tampilkan hasil prediksi tanpa disclaimer ini.
- Dua metrik output **terpisah**: `keketatan_score` (formula publik, sama untuk semua siswa di kombinasi PTN+jurusan yang sama) dan `peluang_score` (personal, mempertimbangkan input siswa) — jangan digabung jadi satu angka.
- Data sekolah (akreditasi, kuota SNBP, ranking) untuk input SNBP diambil otomatis dari tabel `sekolah`, **tidak boleh diminta ulang manual ke siswa**.
- SNBP tidak menggunakan skor TKA sebagai input — jangan tambahkan field ini ke form SNBP.

### AI (Fase lanjutan — belum prioritas Fase 1)
- Soal hasil AI Pembuat Soal **tidak boleh tayang ke siswa** tanpa approval eksplisit Mentor/Admin (`status = 'published'` hanya lewat proses review, bukan default saat generate).
- AI Mentor tidak boleh memberi kepastian hasil seleksi PTN atau menggantikan keputusan mentor manusia untuk hal berisiko tinggi — wajib ada mekanisme eskalasi ke manusia.

### Database & Supabase
- **RLS (Row Level Security) wajib aktif di semua tabel** — sudah dijalankan lewat schema.sql, jangan pernah dimatikan.
- Seluruh API route di Next.js **wajib pakai `service_role` key di sisi server** untuk akses database — bukan `anon` key. `service_role` key **tidak boleh pernah** dikirim/dipakai di kode client-side (browser), karena key ini melewati RLS sepenuhnya dan setara akses penuh ke seluruh database.
- Jangan buat query Supabase langsung dari client component React kecuali tabel itu memang sudah punya RLS policy granular yang eksplisit disetujui — defaultnya semua tabel tertutup total dari `anon` key.

### Privasi Data Anak
- Mayoritas user adalah siswa SMA di bawah 18 tahun. Kumpulkan data seminimal mungkin, jangan buat fitur pemasaran yang menyasar/memanipulasi anak.
- Data lokasi (sekolah, kota, provinsi) untuk leaderboard granular wajib ada consent eksplisit saat onboarding.

---

## Alur Kerja yang Disarankan

1. Baca bagian relevan di `docs/PRD.md` sebelum mulai fitur baru — jangan menebak requirement.
2. Kerjakan satu fitur/bagian per sesi, bukan "buatkan semua sekaligus" — memudahkan review manusia sebelum lanjut ke fitur berikutnya.
3. Untuk kode yang menyentuh Payment, Auth, atau Referral: review manual wajib sebelum merge/deploy, karena berhubungan langsung dengan uang dan keamanan akun.
4. Kalau requirement di PRD terasa ambigu atau kurang jelas untuk diimplementasikan, tanyakan dulu ke pengguna — jangan berasumsi.
5. Setelah fitur selesai & direview, commit ke Git sebelum lanjut ke fitur berikutnya (memudahkan rollback kalau ada masalah di tengah jalan).

## Urutan Prioritas (Fase 1)

Auth (Register/Login/Onboarding + Verifikasi) → Dashboard dasar → Assessment SNBP → Payment → Kelas Bimbingan → Tryout (Free & Premium, TKA+SNBT) → Referral dasar → Approval Mentor.

Detail lengkap tiap fitur ada di `docs/PRD.md` Bagian 7 (Detailed Feature Requirements) dan Bagian 19 (Roadmap).