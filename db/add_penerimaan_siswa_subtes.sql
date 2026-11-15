-- Migration: penerimaan siswa PER SUBTES (Tahap A — fondasi data).
--
-- Aturan bisnis (keputusan Rio): untuk subtes yang dipegang >1 mentor aktif
-- pada kelas yang sama (kasus nyata: 1 subtes dipegang 3 mentor), siswa baru
-- dimiliki mentor yang MENERIMA lebih dulu (siapa cepat dia dapat). Subtes
-- dengan 1 mentor aktif otomatis ke mentor itu.
--
-- Yang ditambahkan (SEMUA aditif, nullable / berdefault, tidak mengubah baris lama):
--   enrollment_subtes.id           — kunci tunggal per baris pilihan-subtes siswa,
--                                    supaya satu "penerimaan" bisa dirujuk lewat satu id
--                                    (PK komposit enrollment_id+subtes_id TETAP, tidak diubah).
--   enrollment_subtes.mentor_id    — mentor PENERIMA siswa untuk subtes ini. NULL = belum
--                                    ada penerima (menunggu) ATAU baris lama sebelum fitur ini.
--   enrollment_subtes.diterima_pada — kapan diterima (NULL selama mentor_id NULL).
--
-- TIDAK menyentuh: sesi_kelas (mentor_id di sana = mentor yang MENANDAI sesi, bukan
-- penerima), payments, enrollments, kelas_subtes_mentor.
--
-- CARA MENJALANKAN (SQL Editor Supabase) — JANGAN langsung COMMIT:
--   1. Ketik BEGIN; lalu tempel isi file ini sampai akhir bagian "MIGRASI".
--   2. Jalankan bagian "VERIFIKASI" (SELECT di bawah) dan cek hasilnya.
--   3. Kalau ada yang janggal: ROLLBACK;
--   4. Kalau sesuai: COMMIT;
-- Idempotent-safe (IF NOT EXISTS) — aman dijalankan ulang.

-- ============================== MIGRASI ==============================

-- id per baris: DEFAULT gen_random_uuid() mengisi baris lama dengan nilai unik
-- (tabel kecil — tulis ulang sekali jalan aman). NOT NULL tidak bisa gagal
-- karena semua baris mendapat default.
ALTER TABLE enrollment_subtes ADD COLUMN IF NOT EXISTS id UUID NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS uq_enrollment_subtes_id ON enrollment_subtes(id);

-- Penerima. ON DELETE SET NULL: kalau akun mentor dihapus, siswa kembali
-- "menunggu penerima" (bukan ikut terhapus / bukan menggantung ke user mati).
ALTER TABLE enrollment_subtes ADD COLUMN IF NOT EXISTS mentor_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE enrollment_subtes ADD COLUMN IF NOT EXISTS diterima_pada TIMESTAMPTZ;

-- Dasar daftar "siswa yang saya terima" per mentor, dan daftar "menunggu
-- penerima" (parsial: cuma baris yang belum punya penerima).
CREATE INDEX IF NOT EXISTS idx_enrollment_subtes_mentor ON enrollment_subtes(mentor_id) WHERE mentor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_enrollment_subtes_menunggu ON enrollment_subtes(enrollment_id) WHERE mentor_id IS NULL;

-- Catatan desain: SENGAJA tanpa CHECK "mentor_id NULL <=> diterima_pada NULL".
-- ON DELETE SET NULL mengosongkan mentor_id tapi tidak diterima_pada, sehingga
-- CHECK itu akan menggagalkan penghapusan akun mentor. Konsistensi dijaga oleh
-- fungsi klaim (keduanya diisi dalam SATU UPDATE); diterima_pada yang tertinggal
-- setelah mentor dihapus tidak berbahaya karena penerima ditentukan oleh mentor_id.

-- RLS sudah aktif di tabel ini (db/add_enrollment_subtes.sql). Ditegaskan ulang
-- supaya aman bila file dijalankan di database yang berbeda.
ALTER TABLE enrollment_subtes ENABLE ROW LEVEL SECURITY;

-- ============================== VERIFIKASI ==============================
-- Jalankan SETELAH bagian MIGRASI (masih di dalam transaksi). Harapan:
--   kolom_baru = 3   (id, mentor_id, diterima_pada)
--   baris_tanpa_id = 0
--   baris_sudah_diterima = 0   (belum ada penerima — Tahap A tidak mengisi apa pun)
--
-- SELECT
--   (SELECT count(*) FROM information_schema.columns
--     WHERE table_schema = 'public' AND table_name = 'enrollment_subtes'
--       AND column_name IN ('id', 'mentor_id', 'diterima_pada'))      AS kolom_baru,
--   (SELECT count(*) FROM enrollment_subtes WHERE id IS NULL)          AS baris_tanpa_id,
--   (SELECT count(*) FROM enrollment_subtes WHERE mentor_id IS NOT NULL) AS baris_sudah_diterima;

-- ============================== BACKFILL (OPSIONAL, TAHAP B) ==============================
-- TIDAK dijalankan di Tahap A. Baris lama (siswa yang sudah daftar sebelum fitur
-- ini) punya mentor_id NULL. Untuk subtes dengan tepat 1 mentor, Tahap B bisa
-- mengisinya supaya konsisten dengan aturan "otomatis ke mentor itu":
--
-- UPDATE enrollment_subtes es
-- SET mentor_id = ksm.mentor_id, diterima_pada = now()
-- FROM enrollments e
-- JOIN (
--     SELECT kelas_id, subtes_id, (array_agg(mentor_id))[1] AS mentor_id
--     FROM kelas_subtes_mentor GROUP BY kelas_id, subtes_id HAVING count(*) = 1
-- ) ksm ON ksm.kelas_id = e.kelas_id
-- WHERE es.enrollment_id = e.id AND ksm.subtes_id = es.subtes_id AND es.mentor_id IS NULL;
--
-- (Hitungan di atas belum memfilter mentor non-aktif — sesuaikan dengan user_roles.status
-- = 'active' sebelum dipakai.)

-- ============================== ROLLBACK ==============================
-- Hanya bila migrasi sudah di-COMMIT lalu perlu dibatalkan. Aman: kolom-kolom
-- ini belum dipakai kode lain di Tahap A.
--
-- DROP INDEX IF EXISTS idx_enrollment_subtes_menunggu;
-- DROP INDEX IF EXISTS idx_enrollment_subtes_mentor;
-- ALTER TABLE enrollment_subtes DROP COLUMN IF EXISTS diterima_pada;
-- ALTER TABLE enrollment_subtes DROP COLUMN IF EXISTS mentor_id;
-- DROP INDEX IF EXISTS uq_enrollment_subtes_id;
-- ALTER TABLE enrollment_subtes DROP COLUMN IF EXISTS id;
