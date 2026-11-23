-- Verifikasi db/add_pendaftaran_ditutup.sql — HANYA BACA (SELECT saja).
-- JALANKAN SATU PER SATU (SQL Editor hanya menampilkan hasil pernyataan terakhir). Saat latihan
-- (BEGIN ... ROLLBACK) jalankan di sesi yang sama dengan migrasinya.

-- ---- KUERI 1: kolom ada, boolean, NOT NULL, default false. Harapan: 1 baris, status = OK
-- (setelah ROLLBACK migrasi: 0 baris) ----
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default,
    CASE
        WHEN data_type <> 'boolean'            THEN 'TIPE BEDA'
        WHEN is_nullable <> 'NO'               THEN 'NULLABLE (SALAH)'
        WHEN column_default IS DISTINCT FROM 'false' THEN 'DEFAULT BUKAN false'
        ELSE 'OK'
    END AS status
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'kelas' AND column_name = 'pendaftaran_ditutup';

-- ---- KUERI 2: semua kelas lama tetap terbuka. Harapan: ditutup = 0 (sebelum Admin menutup kelas mana pun) ----
SELECT count(*) AS total_kelas, count(*) FILTER (WHERE pendaftaran_ditutup) AS ditutup FROM kelas;
