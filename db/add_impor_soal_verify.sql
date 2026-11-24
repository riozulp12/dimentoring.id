-- Verifikasi db/add_impor_soal.sql — HANYA BACA (SELECT saja, tidak mengubah apa pun).
--
-- JALANKAN SATU PER SATU: SQL Editor Supabase hanya menampilkan hasil pernyataan TERAKHIR.
-- Saat latihan (BEGIN ... ROLLBACK) jalankan di SESI YANG SAMA dengan migrasinya.


-- ---- KUERI 1: tabel soal_impor_batch ada, RLS aktif, 0 policy. Harapan: 1 baris, rowsecurity = true, policy = 0 ----
SELECT t.tablename, t.rowsecurity,
       (SELECT count(*) FROM pg_policies p WHERE p.tablename = t.tablename) AS policy
FROM pg_tables t
WHERE t.schemaname = 'public' AND t.tablename = 'soal_impor_batch';


-- ---- KUERI 2: kolom baru. Harapan: 3 baris (soal_bank.impor_batch_id, soal_stimulus.impor_batch_id, soal_stimulus.sumber) ----
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND ((table_name = 'soal_bank' AND column_name = 'impor_batch_id')
    OR (table_name = 'soal_stimulus' AND column_name IN ('impor_batch_id', 'sumber')))
ORDER BY table_name, column_name;


-- ---- KUERI 3: definisi constraint yang diubah. Harapan: 6 baris; sumber memuat 'buatan_sendiri', peninjau memuat "sumber = 'buatan_sendiri'", aksi memuat terbit_admin_buatan_sendiri ----
SELECT conrelid::regclass AS tabel, conname, pg_get_constraintdef(oid) AS definisi
FROM pg_constraint
WHERE conname IN ('soal_bank_sumber_valid', 'soal_stimulus_sumber_valid',
                  'soal_bank_peninjau_bukan_penulis', 'soal_stimulus_peninjau_bukan_penulis',
                  'soal_tinjauan_log_aksi_valid', 'soal_tinjauan_log_terbit_admin_buatan_sendiri')
ORDER BY conrelid::regclass::text, conname;


-- ---- KUERI 4: fungsi baru + hak EXECUTE. Harapan: 3 baris (studio_soal_impor_admin, studio_soal_impor_aktif, studio_soal_terbitkan_admin), anon = false, authenticated = false, service_role = true ----
SELECT p.proname,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
       has_function_privilege('service_role', p.oid, 'EXECUTE')  AS service_role
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('studio_soal_impor_admin', 'studio_soal_impor_aktif', 'studio_soal_terbitkan_admin')
ORDER BY p.proname;


-- ---- KUERI 5: studio_soal_cek_relasi sudah versi impor. Harapan: 1 baris, memuat_impor = true ----
SELECT proname, prosrc LIKE '%studio_soal_impor_aktif%' AS memuat_impor
FROM pg_proc WHERE proname = 'studio_soal_cek_relasi';


-- ---- KUERI 6: ringkasan batch impor (kosong sebelum dipakai) ----
SELECT b.id, b.nama_berkas, b.jumlah_baris, b.jumlah_ok, b.jumlah_gagal, b.dibuat_pada,
       (SELECT count(*) FROM soal_bank s WHERE s.impor_batch_id = b.id AND s.status = 'draf')         AS draf,
       (SELECT count(*) FROM soal_bank s WHERE s.impor_batch_id = b.id AND s.status = 'terpublikasi') AS terbit
FROM soal_impor_batch b
ORDER BY b.dibuat_pada DESC
LIMIT 20;
