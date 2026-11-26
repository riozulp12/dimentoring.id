-- Verifikasi db/add_soal_media.sql — HANYA BACA (SELECT saja).
-- JALANKAN SATU PER SATU: SQL Editor Supabase hanya menampilkan hasil pernyataan TERAKHIR.


-- ---- KUERI 1: bucket. Harapan: 2 baris, public = false, batas 26214400 (impor-staging) & 2097152 (soal-media) ----
SELECT id, public, file_size_limit, allowed_mime_types
FROM storage.buckets WHERE id IN ('soal-media', 'impor-staging') ORDER BY id;


-- ---- KUERI 2: policy Storage. Harapan: TIDAK ADA policy yang memberi anon/authenticated akses ke dua bucket ini.
--      Periksa tiap baris yang muncul: policy tanpa syarat bucket_id juga berlaku untuk bucket baru. ----
SELECT policyname, roles, cmd, qual, with_check
FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
ORDER BY policyname;


-- ---- KUERI 3: tabel soal_media. Harapan: 1 baris, rowsecurity = true, policy = 0 ----
SELECT t.tablename, t.rowsecurity,
       (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = t.tablename) AS policy
FROM pg_tables t WHERE t.schemaname = 'public' AND t.tablename = 'soal_media';


-- ---- KUERI 4: fungsi + hak EXECUTE. Harapan: 6 baris, anon = false, authenticated = false, service_role = true;
--      security_definer = true untuk impor_admin, admin_simpan, media_yatim, hapus_media ----
SELECT p.proname,
       p.prosecdef                                               AS security_definer,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
       has_function_privilege('service_role', p.oid, 'EXECUTE')  AS service_role
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('studio_soal_impor_admin', 'studio_soal_admin_simpan', 'studio_soal_admin_media_yatim',
                    'studio_soal_admin_hapus_media', 'studio_soal_media_ref', 'studio_soal_jaga_media')
ORDER BY p.proname;


-- ---- KUERI 5: trigger penjaga gambar. Harapan: 2 baris ----
SELECT tgname, tgrelid::regclass AS tabel
FROM pg_trigger WHERE tgname LIKE 'trg_studio_soal_jaga_media%' ORDER BY tgname;
