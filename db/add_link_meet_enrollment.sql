-- Migration: Link Meet PER SISWA untuk kelas PRIVATE.
--
-- Sampai sekarang hanya ada SATU link Meet per kelas (kelas.link_meet) untuk semua
-- siswa. Kelas private butuh satu link per siswa, diisi mentor yang menerima siswa itu.
-- Kelas grup/semi-private tetap memakai link kelas (tidak berubah).
--
-- Yang ditambahkan (SEMUA aditif, nullable, tidak mengubah baris lama):
--   enrollments.link_meet       — link Meet milik SISWA ini (http/https). NULL = belum diisi.
--                                  Dipakai hanya untuk kelas tipe 'private'.
--   enrollments.link_meet_oleh  — siapa yang mengisi. Link hanya BERLAKU selama pengisinya masih
--                                  mentor penerima/pemegang aktif siswa itu. NULL + link terisi =
--                                  diisi Admin (atau akun pengisi sudah dihapus: ON DELETE SET NULL).
--
-- TIDAK menyentuh: payments, kelas.link_meet, enrollment_subtes. Webhook pembayaran
-- (upsert enrollments) hanya menulis kolom yang disebutnya, jadi kolom baru ini
-- tidak tertimpa saat webhook diulang.
--
-- CARA MENJALANKAN (SQL Editor Supabase) — JANGAN langsung COMMIT:
--   1. Ketik BEGIN; lalu tempel bagian "MIGRASI" di bawah.
--   2. Jalankan query "VERIFIKASI" dan cek hasilnya.
--   3. Kalau ada yang janggal: ROLLBACK;
--   4. Kalau sesuai: COMMIT;
-- Idempotent-safe (IF NOT EXISTS) — aman dijalankan ulang.

-- ============================== MIGRASI ==============================

ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS link_meet TEXT;
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS link_meet_oleh UUID REFERENCES users(id) ON DELETE SET NULL;

-- Dasar: kapan link diisi (opsional, informasi Admin) tidak ditambahkan agar migrasi tetap minimal.

-- RLS sudah aktif di tabel enrollments (blok RLS semua tabel di db/schema.sql). Tidak ada policy baru:
-- akses tetap lewat service_role di server saja.

-- ============================== VERIFIKASI ==============================
-- Jalankan SETELAH bagian MIGRASI (masih di dalam transaksi). Harapan:
--   kolom_baru = 2        (link_meet, link_meet_oleh)
--   baris_berlink = 0     (belum ada yang diisi — migrasi tidak mengisi apa pun)
--
-- SELECT
--   (SELECT count(*) FROM information_schema.columns
--     WHERE table_schema = 'public' AND table_name = 'enrollments'
--       AND column_name IN ('link_meet', 'link_meet_oleh'))   AS kolom_baru,
--   (SELECT count(*) FROM enrollments WHERE link_meet IS NOT NULL) AS baris_berlink;

-- ============================== ROLLBACK ==============================
-- Hanya bila migrasi sudah di-COMMIT lalu perlu dibatalkan. Link yang sudah diisi HILANG.
--
-- ALTER TABLE enrollments DROP COLUMN IF EXISTS link_meet_oleh;
-- ALTER TABLE enrollments DROP COLUMN IF EXISTS link_meet;
