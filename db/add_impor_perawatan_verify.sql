-- Verifikasi db/add_impor_perawatan.sql — HANYA BACA (SELECT saja).
-- JALANKAN SATU PER SATU: SQL Editor Supabase hanya menampilkan hasil pernyataan TERAKHIR.


-- ---- KUERI 1: fungsi baru. Harapan: 1 baris, security_definer = true, anon = false, authenticated = false, service_role = true ----
SELECT p.proname,
       p.prosecdef                                               AS security_definer,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
       has_function_privilege('service_role', p.oid, 'EXECUTE')  AS service_role
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname LIKE 'studio\_soal\_admin\_%' AND p.proname <> 'studio_soal_admin_aktif'
ORDER BY p.proname;


-- ---- KUERI 2: daftar aksi log. Harapan: 2 baris, keduanya memuat hapus_draf_admin ----
SELECT conname, pg_get_constraintdef(oid) AS definisi
FROM pg_constraint
WHERE conname IN ('soal_tinjauan_log_aksi_valid', 'soal_tinjauan_log_aksi_khusus_admin')
ORDER BY conname;
