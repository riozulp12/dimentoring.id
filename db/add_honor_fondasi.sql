-- Migration: fondasi data honor mentor — Tahap A (PRD 7.5.3, 7.5.5, BR-34,
-- Bagian 13 — SesiKelas, Enrollment). ADITIF saja: kolom baru nullable /
-- ber-default, tidak ada tabel, fungsi, policy, atau data yang diubah.
--
-- Isi:
--   1. sesi_kelas.dibayar_pada / dibayar_batch — penanda honor sesi sudah
--      ditransfer (batch = periode bayar, mis. '2026-10'). NULL = belum.
--   2. enrollments.tanggal_keluar / alasan_keluar — siswa resmi keluar
--      (refund, pindah kelas/mode, dikeluarkan Admin). Siswa keluar tidak
--      dihitung aktif pada sesi SETELAH tanggal_keluar (tier honor grup).
--   3. enrollments.diskon_dari_mentor — true = diskon diberikan mentor, dasar
--      honor = harga yang benar-benar dibayar (bukan kelas.harga).
--   4. Index parsial sesi_kelas(dibayar_batch) untuk rekap per batch.
--
-- UI/API untuk mengisi kolom-kolom ini BELUM dibangun (Tahap B). Sampai itu,
-- kolom diisi lewat SQL Editor — penanda dibayar lewat file tandai-dibayar.sql
-- yang dihasilkan scripts/laporan-honor-v2.ts, dijalankan SETELAH transfer.
--
-- Jalankan di SQL Editor Supabase. Idempotent-safe: aman dijalankan dua kali
-- (ADD COLUMN IF NOT EXISTS, constraint dicek di pg_constraint, CREATE INDEX
-- IF NOT EXISTS). RLS tabel lama tidak disentuh. Uji dulu dengan
-- db/test_honor_fondasi_DRYRUN.sql.

-- ---- 1. Penanda honor dibayar per sesi -------------------------------------
ALTER TABLE sesi_kelas ADD COLUMN IF NOT EXISTS dibayar_pada TIMESTAMPTZ;  -- NULL = honor sesi ini belum ditandai dibayar
ALTER TABLE sesi_kelas ADD COLUMN IF NOT EXISTS dibayar_batch TEXT;        -- periode bayar 'YYYY-MM', mis. '2026-10'

CREATE INDEX IF NOT EXISTS idx_sesi_kelas_dibayar_batch
    ON sesi_kelas(dibayar_batch) WHERE dibayar_pada IS NOT NULL;

-- ---- 2. Keluar pendaftaran & diskon dari mentor ----------------------------
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS tanggal_keluar TIMESTAMPTZ;  -- NULL = tidak (tercatat) keluar
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS alasan_keluar TEXT;
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS diskon_dari_mentor BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'enrollments_alasan_keluar_valid') THEN
        ALTER TABLE enrollments ADD CONSTRAINT enrollments_alasan_keluar_valid
            CHECK (alasan_keluar IS NULL
                   OR alasan_keluar IN ('refund', 'pindah_kelas', 'pindah_mode', 'dikeluarkan_admin', 'lainnya'));
    END IF;
END $$;

-- ---- QUERY VERIFIKASI (opsional, setelah dijalankan) -----------------------
-- SELECT table_name, column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--  WHERE table_schema = 'public'
--    AND ((table_name = 'sesi_kelas' AND column_name IN ('dibayar_pada', 'dibayar_batch'))
--      OR (table_name = 'enrollments' AND column_name IN ('tanggal_keluar', 'alasan_keluar', 'diskon_dari_mentor')));
-- -- harus 5 baris; diskon_dari_mentor: is_nullable = NO, default false
