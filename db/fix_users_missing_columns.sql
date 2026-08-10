-- Fix schema drift: tabel `users` di database live belum punya kolom
-- `tingkat_kelas` dan `kode_referral` yang sudah didefinisikan di db/schema.sql.
--
-- Akibatnya: setiap insert lewat app/api/auth/register/route.ts gagal dengan
-- PGRST204 "Could not find the 'kode_referral' column of 'users' in the schema
-- cache" -> ditangkap sebagai error generik "Gagal membuat akun. Coba lagi nanti."
--
-- Jalankan sekali di Supabase Studio > SQL Editor. Aman dijalankan berkali-kali
-- (IF NOT EXISTS).

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS tingkat_kelas tingkat_kelas,
    ADD COLUMN IF NOT EXISTS kode_referral VARCHAR(20) UNIQUE;

-- PostgREST perlu di-reload supaya schema cache-nya update (kalau tidak,
-- error "Could not find column" bisa tetap muncul walau kolom sudah ada).
NOTIFY pgrst, 'reload schema';
