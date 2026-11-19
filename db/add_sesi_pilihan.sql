-- Migration: sesi PILIHAN siswa (kelas private online) — fondasi data untuk PR3 (checkout & pembayaran).
-- PRD Bagian 13 (Payment, PaymentSubtesPilihan, Enrollment, EnrollmentSubtes, SesiKelas).
--
-- Siswa boleh memilih total sesi (1 .. 2 x kelas.jumlah_sesi) dan membaginya per subtes. Rumusnya ada di
-- lib/shared/hargaSesi.ts; migrasi ini hanya menyiapkan kolom penampungnya.
--
-- ADITIF SAJA dan AMAN untuk kode lama yang masih berjalan (Preview dan Production memakai SATU database):
--   * hanya ADD COLUMN IF NOT EXISTS dan ADD CONSTRAINT (CHECK) baru — tidak ada tabel dihapus/diubah, tidak ada
--     perubahan tipe, tidak ada penulisan ke data lama;
--   * SEMUA kolom baru NULLABLE dan tanpa nilai bawaan (jadi baris lama tidak disentuh sama sekali; kode lama yang
--     meng-INSERT tanpa kolom ini tetap berhasil dan kolomnya NULL);
--   * semua CHECK meloloskan NULL (bila kolom tidak NULL baru dibatasi), jadi baris lama otomatis lolos;
--   * CHECK HANYA batas BAWAH (>= 1 / >= 0), TANPA batas atas. Batas atas (total sesi maksimal 2 x
--     kelas.jumlah_sesi, sesi tambahan maksimal sebesar jumlah_sesi kelas) ditegakkan APLIKASI lewat
--     hitungHargaSesi (lib/shared/hargaSesi.ts), bukan database: jumlah_sesi tiap kelas berbeda, dan CHECK yang
--     lebih ketat daripada aplikasi bisa membuat fulfill gagal SETELAH siswa membayar (pembayaran sudah masuk);
--   * arti NULL: enrollments.jumlah_sesi_total NULL = pakai kelas.jumlah_sesi; kolom lain NULL = "tidak dicatat".
--
-- Kolom baru:
--   payments               sesi_tambahan, harga_per_sesi_tambahan, biaya_sesi_tambahan, jumlah_sesi_dibeli
--   payment_subtes_pilihan jumlah_sesi
--   enrollments            jumlah_sesi_total, sesi_tambahan
--   enrollment_subtes      kuota_sesi
--   sesi_kelas             subtes_id (FK ke subtes, tanpa ON DELETE CASCADE)
--
-- URUTAN RILIS: (1) jalankan migrasi ini, (2) jalankan db/verify_add_sesi_pilihan.sql satu per satu,
-- (3) BARU deploy kode PR3. Kode PR3 menulis kolom-kolom ini; tanpa migrasi, INSERT/UPDATE-nya gagal.
-- Pembatalan: db/rollback_add_sesi_pilihan.sql (tarik kode PR3 dulu bila sudah dideploy — lihat peringatan di sana).
--
-- CARA MENJALANKAN (SQL Editor Supabase) — JANGAN langsung COMMIT. File ini sengaja TANPA BEGIN/COMMIT;
-- transaksinya Anda yang atur:
--   1. Latihan:  ketik BEGIN;  tempel bagian "MIGRASI" di bawah;  jalankan db/verify_add_sesi_pilihan.sql
--      (kueri satu per satu, di sesi yang sama);  lalu ROLLBACK;  (tidak ada yang tersimpan).
--   2. Sungguhan: ulangi dengan  BEGIN;  MIGRASI;  verifikasi;  COMMIT;  Bila ada yang janggal: ROLLBACK;
--   3. Setelah COMMIT, jalankan verifikasi sekali lagi (sesi baru), TERPISAH.
-- Idempotent-safe: ADD COLUMN IF NOT EXISTS, dan CHECK dicek di pg_constraint (tidak dobel bila dijalankan lagi).
-- Catatan kunci: ADD CONSTRAINT ... CHECK memindai tabel sekali saat dipasang (semua nilai NULL, cepat) dan
-- mengunci tabel sebentar; jalankan di jam sepi bila tabel payments/enrollments besar.

-- ============================== MIGRASI ==============================

-- ---- 1. payments: rincian sesi yang dibeli ----------------------------------
-- harga_per_sesi_tambahan & biaya_sesi_tambahan bertipe sama dengan payments.jumlah (DECIMAL(12,2)).
ALTER TABLE payments ADD COLUMN IF NOT EXISTS sesi_tambahan INTEGER;                      -- sesi di atas kelas.jumlah_sesi
ALTER TABLE payments ADD COLUMN IF NOT EXISTS harga_per_sesi_tambahan NUMERIC(12,2);      -- rupiah per sesi tambahan saat dibeli
ALTER TABLE payments ADD COLUMN IF NOT EXISTS biaya_sesi_tambahan NUMERIC(12,2);         -- total biaya sesi tambahan
ALTER TABLE payments ADD COLUMN IF NOT EXISTS jumlah_sesi_dibeli INTEGER;                 -- total sesi yang dibeli (bisa < jumlah_sesi kelas)

-- ---- 2. payment_subtes_pilihan: sesi per subtes (penampung sebelum webhook) ----
ALTER TABLE payment_subtes_pilihan ADD COLUMN IF NOT EXISTS jumlah_sesi INTEGER;

-- ---- 3. enrollments: total sesi yang berlaku untuk siswa ini -----------------
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS jumlah_sesi_total INTEGER;               -- NULL = pakai kelas.jumlah_sesi
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS sesi_tambahan INTEGER;

-- ---- 4. enrollment_subtes: kuota sesi per subtes ----------------------------
ALTER TABLE enrollment_subtes ADD COLUMN IF NOT EXISTS kuota_sesi INTEGER;

-- ---- 5. sesi_kelas: subtes tempat sesi dilaksanakan -------------------------
-- FK biasa (NO ACTION): subtes tidak bisa dihapus selama masih dirujuk sesi. Sengaja tanpa ON DELETE CASCADE.
ALTER TABLE sesi_kelas ADD COLUMN IF NOT EXISTS subtes_id UUID REFERENCES subtes(id);

-- ---- 6. CHECK (NULL lolos; hanya batas bawah; nama constraint eksplisit) ----
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_jumlah_sesi_dibeli_valid' AND conrelid = 'payments'::regclass) THEN
        ALTER TABLE payments ADD CONSTRAINT payments_jumlah_sesi_dibeli_valid
            CHECK (jumlah_sesi_dibeli IS NULL OR jumlah_sesi_dibeli >= 1);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_sesi_tambahan_valid' AND conrelid = 'payments'::regclass) THEN
        ALTER TABLE payments ADD CONSTRAINT payments_sesi_tambahan_valid
            CHECK (sesi_tambahan IS NULL OR sesi_tambahan >= 0);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_subtes_pilihan_jumlah_sesi_valid' AND conrelid = 'payment_subtes_pilihan'::regclass) THEN
        ALTER TABLE payment_subtes_pilihan ADD CONSTRAINT payment_subtes_pilihan_jumlah_sesi_valid
            CHECK (jumlah_sesi IS NULL OR jumlah_sesi >= 1);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'enrollments_jumlah_sesi_total_valid' AND conrelid = 'enrollments'::regclass) THEN
        ALTER TABLE enrollments ADD CONSTRAINT enrollments_jumlah_sesi_total_valid
            CHECK (jumlah_sesi_total IS NULL OR jumlah_sesi_total >= 1);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'enrollments_sesi_tambahan_valid' AND conrelid = 'enrollments'::regclass) THEN
        ALTER TABLE enrollments ADD CONSTRAINT enrollments_sesi_tambahan_valid
            CHECK (sesi_tambahan IS NULL OR sesi_tambahan >= 0);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'enrollment_subtes_kuota_sesi_valid' AND conrelid = 'enrollment_subtes'::regclass) THEN
        ALTER TABLE enrollment_subtes ADD CONSTRAINT enrollment_subtes_kuota_sesi_valid
            CHECK (kuota_sesi IS NULL OR kuota_sesi >= 1);
    END IF;
END $$;

-- RLS: semua tabel di atas sudah ber-RLS (tidak ada tabel baru); kolom baru mengikuti RLS tabelnya.
-- Tidak ada index baru (belum ada pola query yang membutuhkannya); tambahkan di PR berikutnya bila perlu.

-- ============================== VERIFIKASI ==============================
-- Jalankan db/verify_add_sesi_pilihan.sql (kueri SATU PER SATU).
-- ============================== ROLLBACK ================================
-- Jalankan db/rollback_add_sesi_pilihan.sql.
