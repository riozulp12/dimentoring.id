-- Verifikasi db/add_sesi_pilihan.sql — HANYA BACA (SELECT saja, tidak mengubah apa pun).
--
-- JALANKAN SATU PER SATU: SQL Editor Supabase hanya menampilkan hasil pernyataan TERAKHIR yang dijalankan.
-- Blok/pilih satu kueri, jalankan, catat hasilnya, lanjut ke kueri berikutnya. Saat latihan (BEGIN ... ROLLBACK)
-- jalankan semuanya di SESI YANG SAMA dengan migrasinya.
--
-- Pakai kueri 1 dan 6 SEBELUM migrasi juga (untuk dibandingkan), lalu SESUDAH migrasi.
-- Kueri 5 hanya bermakna SEBELUM kode PR3 dideploy (sesudahnya baris baru memang boleh terisi).


-- ---- KUERI 1: jumlah baris per tabel (bandingkan sebelum vs sesudah migrasi: harus SAMA) ----
SELECT 'payments' AS tabel, count(*) AS jumlah_baris FROM payments
UNION ALL SELECT 'payment_subtes_pilihan', count(*) FROM payment_subtes_pilihan
UNION ALL SELECT 'enrollments', count(*) FROM enrollments
UNION ALL SELECT 'enrollment_subtes', count(*) FROM enrollment_subtes
UNION ALL SELECT 'sesi_kelas', count(*) FROM sesi_kelas;


-- ---- KUERI 2: 9 kolom baru ada, tipe benar, NULLABLE, tanpa nilai bawaan. Harapan: 9 baris, semua status = OK ----
-- (Setelah ROLLBACK migrasi: 9 baris, semua status = TIDAK ADA.)
WITH harapan(tabel, kolom, tipe, presisi, skala) AS (
    VALUES
        ('payments',               'sesi_tambahan',           'integer', NULL::int, NULL::int),
        ('payments',               'harga_per_sesi_tambahan', 'numeric', 12,        2),
        ('payments',               'biaya_sesi_tambahan',     'numeric', 12,        2),
        ('payments',               'jumlah_sesi_dibeli',      'integer', NULL,      NULL),
        ('payment_subtes_pilihan', 'jumlah_sesi',             'integer', NULL,      NULL),
        ('enrollments',            'jumlah_sesi_total',       'integer', NULL,      NULL),
        ('enrollments',            'sesi_tambahan',           'integer', NULL,      NULL),
        ('enrollment_subtes',      'kuota_sesi',              'integer', NULL,      NULL),
        ('sesi_kelas',             'subtes_id',               'uuid',    NULL,      NULL)
)
SELECT
    h.tabel,
    h.kolom,
    h.tipe                  AS tipe_harapan,
    c.data_type             AS tipe_aktual,
    c.numeric_precision     AS presisi,
    c.numeric_scale         AS skala,
    c.is_nullable,
    c.column_default,
    CASE
        WHEN c.column_name IS NULL                                                    THEN 'TIDAK ADA'
        WHEN c.data_type <> h.tipe                                                    THEN 'TIPE BEDA'
        WHEN h.presisi IS NOT NULL AND (c.numeric_precision <> h.presisi
                                        OR c.numeric_scale <> h.skala)                THEN 'PRESISI BEDA'
        WHEN c.is_nullable <> 'YES'                                                   THEN 'NOT NULL (SALAH)'
        WHEN c.column_default IS NOT NULL                                             THEN 'ADA NILAI BAWAAN (SALAH)'
        ELSE 'OK'
    END AS status
FROM harapan h
LEFT JOIN information_schema.columns c
       ON c.table_schema = 'public' AND c.table_name = h.tabel AND c.column_name = h.kolom
ORDER BY h.tabel, h.kolom;


-- ---- KUERI 3: kolom baru yang TIDAK nullable atau punya nilai bawaan. Harapan: 0 baris ----
SELECT table_name, column_name, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND ((table_name = 'payments'               AND column_name IN ('sesi_tambahan', 'harga_per_sesi_tambahan', 'biaya_sesi_tambahan', 'jumlah_sesi_dibeli'))
     OR (table_name = 'payment_subtes_pilihan' AND column_name = 'jumlah_sesi')
     OR (table_name = 'enrollments'            AND column_name IN ('jumlah_sesi_total', 'sesi_tambahan'))
     OR (table_name = 'enrollment_subtes'      AND column_name = 'kuota_sesi')
     OR (table_name = 'sesi_kelas'             AND column_name = 'subtes_id'))
   AND (is_nullable <> 'YES' OR column_default IS NOT NULL);


-- ---- KUERI 4: 5 CHECK ada dan tervalidasi, plus FK sesi_kelas.subtes_id. Harapan: 6 baris ----
-- 5 baris contype = 'c' (convalidated = true) dan 1 baris contype = 'f' ke subtes dengan hapus = 'a' (NO ACTION, bukan CASCADE).
SELECT conrelid::regclass AS tabel,
       conname,
       contype,
       convalidated,
       CASE confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'r' THEN 'RESTRICT' WHEN 'd' THEN 'SET DEFAULT' END AS aksi_hapus,
       pg_get_constraintdef(oid) AS definisi
  FROM pg_constraint
 WHERE conname IN ('payments_jumlah_sesi_dibeli_valid', 'payments_sesi_tambahan_valid',
                   'enrollments_jumlah_sesi_total_valid', 'enrollments_sesi_tambahan_valid',
                   'enrollment_subtes_kuota_sesi_valid')
    OR (conrelid = 'sesi_kelas'::regclass AND contype = 'f'
        AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'sesi_kelas'::regclass AND attname = 'subtes_id')])
 ORDER BY 1, 2;


-- ---- KUERI 5: BARIS LAMA YANG BERUBAH = baris yang kolom barunya terisi. Harapan: semua 0 ----
-- Hanya bermakna SEBELUM kode PR3 dideploy. Sesudah PR3 jalan, baris BARU boleh terisi (itu bukan baris lama berubah).
SELECT 'payments' AS tabel, count(*) AS baris_berubah
  FROM payments
 WHERE sesi_tambahan IS NOT NULL OR harga_per_sesi_tambahan IS NOT NULL
    OR biaya_sesi_tambahan IS NOT NULL OR jumlah_sesi_dibeli IS NOT NULL
UNION ALL SELECT 'payment_subtes_pilihan', count(*) FROM payment_subtes_pilihan WHERE jumlah_sesi IS NOT NULL
UNION ALL SELECT 'enrollments', count(*) FROM enrollments WHERE jumlah_sesi_total IS NOT NULL OR sesi_tambahan IS NOT NULL
UNION ALL SELECT 'enrollment_subtes', count(*) FROM enrollment_subtes WHERE kuota_sesi IS NOT NULL
UNION ALL SELECT 'sesi_kelas', count(*) FROM sesi_kelas WHERE subtes_id IS NOT NULL;


-- ---- KUERI 6: jumlah kolom per tabel (sebelum migrasi dulu, lalu sesudah). Selisih harapan: payments +4,
-- payment_subtes_pilihan +1, enrollments +2, enrollment_subtes +1, sesi_kelas +1. ----
SELECT table_name, count(*) AS jumlah_kolom
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name IN ('payments', 'payment_subtes_pilihan', 'enrollments', 'enrollment_subtes', 'sesi_kelas')
 GROUP BY table_name
 ORDER BY table_name;
