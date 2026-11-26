-- Rollback untuk db/add_impor_perawatan.sql.
--
-- PERINGATAN:
--   * Revert kode PR (halaman "Bank Soal" + rute /api/admin/studio-soal/bank/*) SEBELUM rollback.
--   * Rollback SENGAJA GAGAL bila sudah ada log aksi baru: daftar aksi lama tidak bisa
--     dipasang. Log audit tidak dihapus oleh file ini; putuskan sendiri nasib barisnya.
--   * Data soal/bacaan/batch tidak disentuh.
--   * Tanpa BEGIN/COMMIT — Anda yang mengatur transaksi. Aman dijalankan dua kali.

-- ---- KUERI 1 (pra-cek, harus 0 agar rollback bisa jalan) ----
SELECT aksi, count(*) AS jumlah FROM soal_tinjauan_log
WHERE aksi IN ('hapus_draf_admin') GROUP BY aksi;

-- ============================== ROLLBACK ==============================
DROP FUNCTION IF EXISTS studio_soal_admin_hapus_batch_draf(UUID, UUID);

ALTER TABLE soal_tinjauan_log DROP CONSTRAINT IF EXISTS soal_tinjauan_log_aksi_khusus_admin;
ALTER TABLE soal_tinjauan_log DROP CONSTRAINT IF EXISTS soal_tinjauan_log_aksi_valid;
ALTER TABLE soal_tinjauan_log ADD CONSTRAINT soal_tinjauan_log_aksi_valid
    CHECK (aksi IN ('ajukan', 'tarik', 'setujui', 'tolak', 'publikasi_admin', 'arsipkan',
                    'publikasi_paket', 'versi_baru', 'terbit_admin_buatan_sendiri'));
