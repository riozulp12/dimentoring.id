-- Rollback untuk db/add_pendaftaran_ditutup.sql: menghapus kolom kelas.pendaftaran_ditutup.
--
-- PERINGATAN:
--   * DROP COLUMN menghapus nilainya. Jalankan KUERI 1 dulu dan catat kelas mana yang sedang ditutup (bila perlu
--     ditutup ulang lewat cara lain).
--   * Kode aplikasi membaca kolom ini di semua kueri kelas — TARIK/revert kodenya SEBELUM rollback, kalau tidak
--     katalog, detail, checkout, dan payment/create error.
--   * Aman dijalankan dua kali (IF EXISTS). Tanpa BEGIN/COMMIT — Anda yang atur transaksinya.

-- ---- KUERI 1 (pra-cek): kelas yang sedang ditutup ----
SELECT id, nama FROM kelas WHERE pendaftaran_ditutup = true;

-- ============================== ROLLBACK ==============================
ALTER TABLE kelas DROP COLUMN IF EXISTS pendaftaran_ditutup;
