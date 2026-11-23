-- Migration: "Tutup pendaftaran" per kelas — kartu kelas tetap tampil, tombol daftar dimatikan.
--
-- ADITIF SAJA: satu kolom baru NOT NULL DEFAULT false. Baris lama otomatis false (= perilaku lama persis);
-- tidak ada data yang diubah/dihapus, tidak ada tabel lain disentuh. Postgres 11+ menambah kolom dengan DEFAULT
-- konstan tanpa menulis ulang tabel (cepat).
--
-- Dipakai oleh: Kelola Kelas (saklar Admin), kartu & detail kelas (tombol disabled + lencana), halaman checkout
-- (pesan "ditutup"), dan app/api/payment/create + validate-promo (409). Webhook & fulfillPayment TIDAK membaca
-- kolom ini: pembayaran yang sudah terlanjur dibuat tetap diproses.
--
-- URUTAN RILIS: (1) jalankan migrasi ini, (2) jalankan db/verify_add_pendaftaran_ditutup.sql, (3) BARU merge/deploy
-- kodenya (kode membaca kolom ini di semua kueri kelas; tanpa migrasi, halaman katalog akan error).
-- Pembatalan: db/rollback_add_pendaftaran_ditutup.sql (tarik kodenya dulu).
--
-- CARA MENJALANKAN (SQL Editor Supabase) — file ini TANPA BEGIN/COMMIT; transaksinya Anda yang atur:
--   1. Latihan:  BEGIN;  migrasi di bawah;  verifikasi (kueri satu per satu, sesi yang sama);  ROLLBACK;
--   2. Sungguhan: BEGIN;  migrasi;  verifikasi;  COMMIT;   lalu jalankan verifikasi lagi di sesi baru.

-- ============================== MIGRASI ==============================
ALTER TABLE kelas ADD COLUMN IF NOT EXISTS pendaftaran_ditutup BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN kelas.pendaftaran_ditutup IS
    'true = pendaftaran kelas ditutup Admin: kartu tetap tampil, tombol daftar/checkout/payment-create ditolak. Siswa yang sudah terdaftar tidak terpengaruh.';
