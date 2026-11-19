-- Rollback untuk db/add_sesi_pilihan.sql: membatalkan PERSIS perubahan migrasi itu (5 constraint dan 9 kolom),
-- tidak menyentuh apa pun yang lain.
--
-- PERINGATAN — baca sebelum menjalankan:
--   * DROP COLUMN MENGHAPUS DATA di kolom-kolom itu. Selama kode PR3 belum dideploy, semua kolom berisi NULL
--     (tidak ada yang hilang). Sesudah PR3 jalan, kolom berisi data pembelian sungguhan — jalankan pra-cek
--     (kueri 1) dan simpan hasilnya dulu.
--   * Kode PR3 membaca/menulis kolom ini. TARIK/revert kode PR3 SEBELUM menjalankan rollback, kalau tidak
--     checkout dan webhook akan error (kolom tidak ada).
--   * Aman dijalankan dua kali (IF EXISTS). Tanpa BEGIN/COMMIT — Anda yang mengatur transaksinya:
--     BEGIN; (rollback di bawah); verifikasi; ROLLBACK (latihan) atau COMMIT (sungguhan).
--
-- Kueri 1 (pra-cek, SATU PER SATU di SQL Editor — hanya hasil statement terakhir yang tampil):

-- ---- KUERI 1: berapa baris yang berisi data di kolom-kolom yang akan dihapus (harus 0 bila PR3 belum jalan) ----
SELECT 'payments' AS tabel, count(*) AS baris_berisi_data
  FROM payments
 WHERE sesi_tambahan IS NOT NULL OR harga_per_sesi_tambahan IS NOT NULL
    OR biaya_sesi_tambahan IS NOT NULL OR jumlah_sesi_dibeli IS NOT NULL
UNION ALL
SELECT 'payment_subtes_pilihan', count(*) FROM payment_subtes_pilihan WHERE jumlah_sesi IS NOT NULL
UNION ALL
SELECT 'enrollments', count(*) FROM enrollments WHERE jumlah_sesi_total IS NOT NULL OR sesi_tambahan IS NOT NULL
UNION ALL
SELECT 'enrollment_subtes', count(*) FROM enrollment_subtes WHERE kuota_sesi IS NOT NULL
UNION ALL
SELECT 'sesi_kelas', count(*) FROM sesi_kelas WHERE subtes_id IS NOT NULL;

-- ============================== ROLLBACK (jalankan setelah pra-cek) ==============================

-- ---- 1. CHECK ----
ALTER TABLE payments          DROP CONSTRAINT IF EXISTS payments_jumlah_sesi_dibeli_valid;
ALTER TABLE payments          DROP CONSTRAINT IF EXISTS payments_sesi_tambahan_valid;
ALTER TABLE enrollments       DROP CONSTRAINT IF EXISTS enrollments_jumlah_sesi_total_valid;
ALTER TABLE enrollments       DROP CONSTRAINT IF EXISTS enrollments_sesi_tambahan_valid;
ALTER TABLE enrollment_subtes DROP CONSTRAINT IF EXISTS enrollment_subtes_kuota_sesi_valid;

-- ---- 2. Kolom (kebalikan urutan migrasi). DROP COLUMN sesi_kelas.subtes_id ikut menghapus FK-nya. ----
ALTER TABLE sesi_kelas             DROP COLUMN IF EXISTS subtes_id;
ALTER TABLE enrollment_subtes      DROP COLUMN IF EXISTS kuota_sesi;
ALTER TABLE enrollments            DROP COLUMN IF EXISTS sesi_tambahan;
ALTER TABLE enrollments            DROP COLUMN IF EXISTS jumlah_sesi_total;
ALTER TABLE payment_subtes_pilihan DROP COLUMN IF EXISTS jumlah_sesi;
ALTER TABLE payments               DROP COLUMN IF EXISTS jumlah_sesi_dibeli;
ALTER TABLE payments               DROP COLUMN IF EXISTS biaya_sesi_tambahan;
ALTER TABLE payments               DROP COLUMN IF EXISTS harga_per_sesi_tambahan;
ALTER TABLE payments               DROP COLUMN IF EXISTS sesi_tambahan;

-- Setelah rollback, db/verify_add_sesi_pilihan.sql kueri 2 harus menampilkan status "TIDAK ADA" untuk 9 kolom
-- dan kueri 3 harus 0 baris.
