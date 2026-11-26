-- Verifikasi db/add_impor_perawatan.sql — HANYA BACA (SELECT saja).
-- JALANKAN SATU PER SATU: SQL Editor Supabase hanya menampilkan hasil pernyataan TERAKHIR.


-- ---- KUERI 1: fungsi baru. Harapan: 6 baris, security_definer = true, anon = false, authenticated = false, service_role = true ----
SELECT p.proname,
       p.prosecdef                                               AS security_definer,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
       has_function_privilege('service_role', p.oid, 'EXECUTE')  AS service_role
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname LIKE 'studio\_soal\_admin\_%' AND p.proname <> 'studio_soal_admin_aktif'
ORDER BY p.proname;


-- ---- KUERI 2: daftar aksi log. Harapan: 2 baris, keduanya memuat ubah_admin & hapus_draf_admin ----
SELECT conname, pg_get_constraintdef(oid) AS definisi
FROM pg_constraint
WHERE conname IN ('soal_tinjauan_log_aksi_valid', 'soal_tinjauan_log_aksi_khusus_admin')
ORDER BY conname;


-- ---- KUERI 3: fungsi trigger sudah versi baru. Harapan: 2 baris, versi_baru = true ----
SELECT proname,
       CASE proname WHEN 'studio_soal_cek_relasi' THEN prosrc LIKE '%menggantikan_id%) IS NOT NULL%'
                    ELSE prosrc LIKE '%studio_soal_impor_aktif%' END AS versi_baru
FROM pg_proc WHERE proname IN ('studio_soal_cek_relasi', 'studio_soal_jaga_penulis_eligible')
ORDER BY proname;
