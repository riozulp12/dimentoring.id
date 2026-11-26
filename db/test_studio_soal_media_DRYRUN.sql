-- Skenario uji DRY-RUN untuk db/add_soal_media.sql. Aman dijalankan di database yang
-- SUDAH berisi data asli.
--
--     BEGIN;
--     <isi db/add_soal_media.sql>
--     <isi db/add_soal_media.sql>   -- sekali lagi: bukti idempotent
--     <isi file ini>
--     ROLLBACK;
--
-- Harapan: NOTICE "STUDIO SOAL MEDIA DRY-RUN [v1]: SEMUA SKENARIO LULUS". Satu skenario gagal =
-- RAISE EXCEPTION "DRY-RUN GAGAL [v1]: ...". Semua skenario berjalan di sub-transaksi yang
-- SELALU dibatalkan. Tidak ada berkas Storage yang dibuat. Butuh subtes 'Penalaran Umum' (tps).

CREATE FUNCTION pg_temp.md_cek(p_dapat TEXT, p_harap TEXT, p_pesan TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    IF p_dapat IS DISTINCT FROM p_harap THEN
        RAISE EXCEPTION 'DRY-RUN GAGAL [v1]: % — diharapkan %, dapat %',
            p_pesan, coalesce(p_harap, '<NULL>'), coalesce(p_dapat, '<NULL>');
    END IF;
END $$;

CREATE FUNCTION pg_temp.md_status(p_hasil JSONB, p_harapan TEXT, p_pesan TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    IF p_hasil->>'status' IS DISTINCT FROM p_harapan THEN
        RAISE EXCEPTION 'DRY-RUN GAGAL [v1]: % — diharapkan status %, dapat %', p_pesan, p_harapan, p_hasil;
    END IF;
END $$;

CREATE FUNCTION pg_temp.md_harus_gagal(p_sql TEXT, p_pesan TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    v_gagal BOOLEAN := false;
BEGIN
    BEGIN
        EXECUTE p_sql;
    EXCEPTION WHEN OTHERS THEN
        v_gagal := true;
    END;
    IF NOT v_gagal THEN
        RAISE EXCEPTION 'DRY-RUN GAGAL [v1]: seharusnya ditolak — %', p_pesan;
    END IF;
END $$;

CREATE FUNCTION pg_temp.md_buat_user(p_kode TEXT, p_role TEXT) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO users (nama, email, no_wa, password_hash)
    VALUES ('DRYRUN ' || p_kode,
            'dryrun-media-' || p_kode || '-' || replace(gen_random_uuid()::text, '-', '') || '@example.invalid',
            NULL, 'x')
    RETURNING id INTO v_id;
    INSERT INTO user_roles (user_id, role_type, status) VALUES (v_id, p_role::role_type, 'active');
    RETURN v_id;
END $$;

CREATE FUNCTION pg_temp.md_media(p_id UUID) RETURNS JSONB LANGUAGE sql AS $$
    SELECT jsonb_build_object('id', p_id, 'path', 'dryrun/' || p_id || '.png', 'mime', 'image/png',
                              'ukuran_byte', 100, 'lebar', 10, 'tinggi', 10, 'teks_alternatif', 'uji');
$$;

CREATE FUNCTION pg_temp.md_entri(p_kode TEXT, p_id UUID) RETURNS JSONB LANGUAGE sql AS $$
    SELECT jsonb_build_object('kode', p_kode, 'media_id', p_id, 'alt', 'uji');
$$;

CREATE FUNCTION pg_temp.md_soal(p_subtes UUID, p_kode TEXT, p_gambar JSONB) RETURNS JSONB LANGUAGE sql AS $$
    SELECT jsonb_build_object(
        'subtes_id', p_subtes, 'stimulus_kode', p_kode, 'urutan_dalam_stimulus', CASE WHEN p_kode IS NULL THEN NULL ELSE 1 END,
        'tipe', 'pilihan_ganda', 'redaksi', 'Lihat {{g1}}.',
        'konten', '{"v":1,"opsi":[{"label":"A","teks":"1"},{"label":"B","teks":"2"},{"label":"C","teks":"3"},{"label":"D","teks":"4"},{"label":"E","teks":"5"}]}'::jsonb
                  || jsonb_build_object('gambar', p_gambar),
        'kunci', '{"v":1,"opsi":"C"}'::jsonb, 'pembahasan', 'Dua ditambah satu sama dengan tiga.',
        'sumber_rujukan', 'Buatan sendiri', 'tingkat_kesulitan', 'mudah');
$$;

DO $$
DECLARE
    pu UUID; adm UUID; mentor UUID;
    m1 UUID := gen_random_uuid(); m2 UUID := gen_random_uuid(); m3 UUID := gen_random_uuid();
    r JSONB; batch UUID; s1 UUID; s2 UUID; v2 UUID; manual UUID;
    baris soal_bank%ROWTYPE; isi JSONB; stim JSONB;
BEGIN
  BEGIN
    SELECT id INTO pu FROM subtes WHERE nama = 'Penalaran Umum' AND kategori = 'tps';
    PERFORM pg_temp.md_cek((pu IS NOT NULL)::text, 'true', 'subtes referensi ada');

    -- ---- Struktur ----
    PERFORM pg_temp.md_cek((SELECT string_agg(format('%s=%s/%s', id, public, file_size_limit), ' ' ORDER BY id COLLATE "C")
                            FROM storage.buckets WHERE id IN ('soal-media', 'impor-staging')),
        'impor-staging=f/26214400 soal-media=f/2097152', 'bucket privat dengan batas ukuran');
    PERFORM pg_temp.md_cek((SELECT format('%s/%s', rowsecurity,
                              (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'soal_media'))
                            FROM pg_tables WHERE schemaname = 'public' AND tablename = 'soal_media'),
        't/0', 'soal_media: RLS aktif tanpa policy');
    PERFORM pg_temp.md_cek((SELECT string_agg(format('%s=%s/%s/%s', p.proname,
                              has_function_privilege('anon', p.oid, 'EXECUTE'),
                              has_function_privilege('authenticated', p.oid, 'EXECUTE'),
                              has_function_privilege('service_role', p.oid, 'EXECUTE')), ' ' ORDER BY p.proname COLLATE "C")
                            FROM pg_proc p WHERE p.proname IN ('studio_soal_admin_hapus_media', 'studio_soal_admin_media_yatim',
                              'studio_soal_admin_simpan', 'studio_soal_impor_admin')),
        'studio_soal_admin_hapus_media=f/f/t studio_soal_admin_media_yatim=f/f/t studio_soal_admin_simpan=f/f/t studio_soal_impor_admin=f/f/t',
        'EXECUTE hanya service_role');

    adm := pg_temp.md_buat_user('admin', 'admin');
    mentor := pg_temp.md_buat_user('mentor', 'mentor');

    -- ---- Impor dengan gambar ----
    stim := jsonb_build_object('kode', 'B1', 'subtes_id', pu, 'judul_internal', 'Bacaan B1', 'sumber_rujukan', 'Buatan sendiri',
        'konten', jsonb_build_object('v', 1, 'blok', jsonb_build_array(jsonb_build_object('jenis', 'gambar', 'media_id', m3, 'alt', 'peta'))));

    r := studio_soal_impor_admin(adm, jsonb_build_object('soal', jsonb_build_array(pg_temp.md_soal(pu, NULL, jsonb_build_array(pg_temp.md_entri('g1', m1))))));
    PERFORM pg_temp.md_status(r, 'data_tidak_valid', 'media_id tanpa baris soal_media ditolak');
    r := studio_soal_impor_admin(adm, jsonb_build_object('media', jsonb_build_array(pg_temp.md_media(m1) || '{"mime":"image/gif"}'::jsonb),
        'soal', jsonb_build_array(pg_temp.md_soal(pu, NULL, jsonb_build_array(pg_temp.md_entri('g1', m1))))));
    PERFORM pg_temp.md_status(r, 'data_tidak_valid', 'format gambar di luar daftar ditolak');
    PERFORM pg_temp.md_cek((SELECT count(*)::text FROM soal_media WHERE dibuat_oleh = adm), '0', 'batch gagal tidak menyisakan baris');

    r := studio_soal_impor_admin(adm, jsonb_build_object(
        'media', jsonb_build_array(pg_temp.md_media(m1), pg_temp.md_media(m2), pg_temp.md_media(m3)),
        'stimulus', jsonb_build_array(stim),
        'soal', jsonb_build_array(pg_temp.md_soal(pu, 'B1', jsonb_build_array(pg_temp.md_entri('g1', m1))),
                                  pg_temp.md_soal(pu, NULL, jsonb_build_array(pg_temp.md_entri('g1', m2))))));
    PERFORM pg_temp.md_status(r, 'disimpan', 'impor bergambar');
    batch := (r->>'batch_id')::uuid;
    PERFORM pg_temp.md_cek((SELECT count(*)::text FROM soal_media WHERE impor_batch_id = batch), '3', 'tiga baris media milik batch');
    SELECT id INTO s1 FROM soal_bank WHERE impor_batch_id = batch AND stimulus_id IS NOT NULL;
    SELECT id INTO s2 FROM soal_bank WHERE impor_batch_id = batch AND stimulus_id IS NULL;

    -- Jalur mentor (sumber manual) tidak boleh memakai gambar.
    PERFORM studio_soal_atur_penugasan(adm, mentor, pu, 'tugaskan');
    manual := gen_random_uuid();
    r := studio_soal_simpan_soal(manual, mentor, jsonb_build_object('subtes_id', pu, 'tipe', 'pilihan_ganda', 'redaksi', '{{g1}}',
        'konten', jsonb_build_object('v', 1, 'gambar', jsonb_build_array(pg_temp.md_entri('g1', m1)))));
    PERFORM pg_temp.md_status(r, 'data_tidak_valid', 'soal mentor dengan gambar ditolak');

    -- ---- Simpan draf Admin ----
    SELECT * INTO baris FROM soal_bank WHERE id = s2;
    isi := jsonb_build_object('subtes_id', pu, 'tipe', 'pilihan_ganda', 'stimulus_id', NULL, 'redaksi', 'Perhatikan {{g1}} baik-baik.',
        'konten', baris.konten, 'kunci', baris.kunci, 'pembahasan', baris.pembahasan, 'tingkat_kesulitan', 'sedang');
    PERFORM pg_temp.md_status(studio_soal_admin_simpan(adm, s2, baris.updated_at,
        isi || jsonb_build_object('konten', baris.konten || jsonb_build_object('gambar', jsonb_build_array(pg_temp.md_entri('g1', m1))))),
        'media_asing', 'gambar milik soal lain ditolak');
    PERFORM pg_temp.md_status(studio_soal_admin_simpan(adm, s2, baris.updated_at,
        isi || jsonb_build_object('konten', baris.konten || jsonb_build_object('gambar', jsonb_build_array(pg_temp.md_entri('g1', gen_random_uuid()))))),
        'media_asing', 'gambar tak dikenal ditolak');
    PERFORM pg_temp.md_status(studio_soal_admin_simpan(adm, s2, baris.updated_at, isi), 'disimpan', 'simpan mempertahankan gambar');
    PERFORM pg_temp.md_cek((SELECT konten->'gambar'->0->>'media_id' FROM soal_bank WHERE id = s2), m2::text, 'gambar tetap');

    -- ---- Terbit & versi baru ----
    r := studio_soal_terbitkan_admin(adm, ARRAY[s1, s2], NULL);
    PERFORM pg_temp.md_cek(jsonb_array_length(r->'diterbitkan')::text, '2', 'terbit bergambar');
    r := studio_soal_admin_versi_baru(adm, s2);
    PERFORM pg_temp.md_status(r, 'versi_dibuat', 'versi baru');
    v2 := (r->>'soal_id')::uuid;
    PERFORM pg_temp.md_cek((SELECT konten->'gambar'->0->>'media_id' FROM soal_bank WHERE id = v2), m2::text,
        'versi baru memakai media yang sama');
    PERFORM pg_temp.md_cek((SELECT count(*)::text FROM soal_media WHERE dibuat_oleh = adm), '3', 'berkas tidak digandakan');

    -- ---- Pembersihan ----
    PERFORM pg_temp.md_status(studio_soal_admin_media_yatim(mentor), 'bukan_admin', 'yatim: mentor ditolak');
    PERFORM pg_temp.md_status(studio_soal_admin_hapus_media(mentor, ARRAY[m1]), 'bukan_admin', 'hapus: mentor ditolak');
    PERFORM pg_temp.md_cek((SELECT count(*)::text FROM jsonb_array_elements(studio_soal_admin_media_yatim(adm)->'media') x
                            WHERE (x->>'id')::uuid IN (m1, m2, m3)), '0', 'semua gambar masih dipakai');
    r := studio_soal_admin_hapus_media(adm, ARRAY[m1, m2, m3]);
    PERFORM pg_temp.md_cek(r->>'jumlah', '0', 'gambar terpakai tidak bisa dihapus');

    -- Hapus draf versi baru: gambar masih dipakai versi terbit.
    PERFORM pg_temp.md_status(studio_soal_admin_hapus_draf(adm, v2), 'dihapus', 'hapus draf versi');
    PERFORM pg_temp.md_cek(studio_soal_admin_hapus_media(adm, ARRAY[m2])->>'jumlah', '0', 'media dipakai versi lain dipertahankan');
    -- Arsip tidak melepas gambar.
    PERFORM pg_temp.md_status(studio_soal_admin_arsipkan(adm, s2), 'diarsipkan', 'arsip');
    PERFORM pg_temp.md_cek(studio_soal_admin_hapus_media(adm, ARRAY[m2])->>'jumlah', '0', 'media soal arsip dipertahankan');

    -- Draf bergambar dihapus per batch: gambar soal & bacaannya jadi yatim.
    r := studio_soal_impor_admin(adm, jsonb_build_object(
        'media', jsonb_build_array(pg_temp.md_media(gen_random_uuid())), 'soal', jsonb_build_array(pg_temp.md_soal(pu, NULL, '[]'::jsonb))));
    PERFORM pg_temp.md_status(r, 'disimpan', 'batch dengan satu gambar tak dipakai');
    r := studio_soal_admin_hapus_batch_draf(adm, (r->>'batch_id')::uuid);
    r := studio_soal_admin_media_yatim(adm);
    PERFORM pg_temp.md_cek((SELECT count(*)::text FROM jsonb_array_elements(r->'media') x
                            JOIN soal_media m ON m.id = (x->>'id')::uuid WHERE m.dibuat_oleh = adm), '1', 'satu gambar yatim');
    r := studio_soal_admin_hapus_media(adm, (SELECT array_agg(id) FROM soal_media WHERE dibuat_oleh = adm));
    PERFORM pg_temp.md_cek(format('%s/%s', r->>'jumlah', (SELECT count(*) FROM soal_media WHERE dibuat_oleh = adm)),
        '1/3', 'hanya yang yatim terhapus');

    RAISE EXCEPTION USING ERRCODE = 'SIDR0', MESSAGE = 'dry-run selesai, batalkan semua perubahan';
  EXCEPTION WHEN SQLSTATE 'SIDR0' THEN
    RAISE NOTICE 'STUDIO SOAL MEDIA DRY-RUN [v1]: SEMUA SKENARIO LULUS';
  END;

  IF EXISTS (SELECT 1 FROM users WHERE email LIKE 'dryrun-media-%@example.invalid') THEN
    RAISE EXCEPTION 'DRY-RUN GAGAL [v1]: akun tiruan masih tersisa setelah sub-transaksi dibatalkan';
  END IF;
END $$;
