-- Migration: kelas.kapasitas menjadi OPSIONAL (boleh NULL).
--
-- Arti baru (lib/shared/kapasitasKelas.ts):
--   * Kelas PRIVATE-online dengan saklar "Siswa memilih jadwal" + tepat 1 subtes: kapasitas dihitung
--     OTOMATIS = jumlah slot jadwal x mentor aktif pemegang subtes. Kolom ini kosong = ikut otomatis;
--     terisi = batas manual (yang LEBIH KECIL antara manual dan otomatis yang berlaku).
--   * Kelas lain: kosong = TIDAK TERBATAS; terisi = jumlah siswa maksimal (aturan lama).
--
-- Yang berubah (satu-satunya): constraint NOT NULL pada kelas.kapasitas dilepas. Data lama TIDAK diubah
-- (semua baris tetap berangka). Fungsi daftar_siswa_manual (db/add_enrollment_manual.sql) memakai
-- `v_lunas >= v_kelas.kapasitas`; dengan NULL perbandingan itu bernilai NULL (bukan true) sehingga
-- kelas tanpa kapasitas tidak pernah dianggap penuh — perilaku yang diinginkan.
--
-- URUTAN RILIS: jalankan migrasi ini SEBELUM deploy kode. Kode baru menulis NULL saat Admin
-- mengosongkan kolom Kapasitas; tanpa migrasi, simpan kelas dengan kapasitas kosong gagal (23502).
--
-- CARA MENJALANKAN (SQL Editor Supabase) — JANGAN langsung COMMIT:
--   1. Ketik BEGIN; lalu tempel bagian "MIGRASI".
--   2. Jalankan query "VERIFIKASI" dan cek hasilnya.
--   3. Kalau ada yang janggal: ROLLBACK;  4. Kalau sesuai: COMMIT;
-- Idempotent-safe: DROP NOT NULL pada kolom yang sudah nullable tidak error.

-- ============================== MIGRASI ==============================
ALTER TABLE kelas ALTER COLUMN kapasitas DROP NOT NULL;

-- ============================== VERIFIKASI ==============================
-- Harapan: is_nullable = 'YES', dan jumlah_kapasitas_null = 0 (migrasi tidak mengisi NULL).
--
-- SELECT
--   (SELECT is_nullable FROM information_schema.columns
--     WHERE table_schema = 'public' AND table_name = 'kelas' AND column_name = 'kapasitas') AS is_nullable,
--   (SELECT count(*) FROM kelas WHERE kapasitas IS NULL)                                   AS jumlah_kapasitas_null;

-- ============================== ROLLBACK ==============================
-- Hanya bila perlu mengembalikan. SET NOT NULL GAGAL selama masih ada kelas berkapasitas kosong, jadi isi dulu
-- (pilih angka yang masuk akal per kelas), mis.:
--   UPDATE kelas SET kapasitas = 10 WHERE kapasitas IS NULL;   -- sesuaikan angkanya
--   ALTER TABLE kelas ALTER COLUMN kapasitas SET NOT NULL;
