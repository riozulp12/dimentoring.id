-- Migration: tambah jenis "Lainnya" di Info Beasiswa & Event (tabel konten_info, kolom tipe).
-- Jenis disimpan sebagai ENUM Postgres konten_info_tipe (db/schema.sql). Nilai baru: 'lainnya'.
--
-- ADITIF SAJA dan AMAN untuk kode lama (Preview dan Production memakai SATU database):
--   * hanya ALTER TYPE ... ADD VALUE IF NOT EXISTS — tidak ada data diubah/dihapus, tidak ada tabel diubah;
--   * kode lama tidak pernah menulis 'lainnya', dan baris 'lainnya' baru hanya ada setelah Admin membuatnya.
--
-- URUTAN RILIS: (1) jalankan migrasi ini, (2) jalankan db/verify_add_jenis_lainnya.sql, (3) BARU deploy kode.
-- Tanpa migrasi, Admin yang memilih "Lainnya" mendapat error dari database.
-- Pembatalan: db/rollback_add_jenis_lainnya.sql.
--
-- CARA MENJALANKAN (SQL Editor Supabase):
--   PostgreSQL 12+ mengizinkan ADD VALUE di dalam transaksi, TAPI nilai barunya belum boleh DIPAKAI (mis. dalam
--   WHERE/INSERT) sebelum COMMIT — makanya verifikasi untuk latihan hanya membaca pg_enum. Bila Supabase menolak
--   ("ALTER TYPE ... ADD cannot run inside a transaction block"), jalankan pernyataan ALTER di bawah TANPA BEGIN/
--   ROLLBACK (satu pernyataan, langsung tersimpan; aman karena IF NOT EXISTS dan tidak bisa merusak data).

BEGIN;

-- ============================== MIGRASI ==============================
ALTER TYPE konten_info_tipe ADD VALUE IF NOT EXISTS 'lainnya';

-- ============================== VERIFIKASI (di sesi yang sama) ==============================
-- Harapan: 6 baris, 'lainnya' paling akhir; 5 nilai lama tetap ada dengan urutan lama.
SELECT enumsortorder, enumlabel
  FROM pg_enum
 WHERE enumtypid = 'konten_info_tipe'::regtype
 ORDER BY enumsortorder;

-- Latihan: ROLLBACK (tidak ada yang tersimpan). Setelah verifikasi OK, ganti ke COMMIT dan jalankan ulang.
ROLLBACK;  -- ganti ke COMMIT setelah verifikasi
