-- Skenario uji DRY-RUN untuk db/add_impor_perawatan.sql. Aman dijalankan di database
-- yang SUDAH berisi data asli.
--
--     BEGIN;
--     <isi db/add_impor_perawatan.sql>
--     <isi db/add_impor_perawatan.sql>   -- sekali lagi: bukti idempotent
--     <isi file ini>
--     ROLLBACK;
--
-- Harapan: NOTICE "STUDIO SOAL PERAWATAN DRY-RUN [v1]: SEMUA SKENARIO LULUS". Satu skenario gagal =
-- RAISE EXCEPTION "DRY-RUN GAGAL [v1]: ...". Semua skenario berjalan di sub-transaksi yang
-- SELALU dibatalkan; akun tiruan memakai email acak di domain .invalid.
-- Butuh subtes 'Penalaran Umum' (tps).

CREATE FUNCTION pg_temp.ip_cek(p_dapat TEXT, p_harap TEXT, p_pesan TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    IF p_dapat IS DISTINCT FROM p_harap THEN
        RAISE EXCEPTION 'DRY-RUN GAGAL [v1]: % — diharapkan %, dapat %',
            p_pesan, coalesce(p_harap, '<NULL>'), coalesce(p_dapat, '<NULL>');
    END IF;
END $$;

CREATE FUNCTION pg_temp.ip_status(p_hasil JSONB, p_harapan TEXT, p_pesan TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    IF p_hasil->>'status' IS DISTINCT FROM p_harapan THEN
        RAISE EXCEPTION 'DRY-RUN GAGAL [v1]: % — diharapkan status %, dapat %', p_pesan, p_harapan, p_hasil;
    END IF;
END $$;

CREATE FUNCTION pg_temp.ip_harus_gagal(p_sql TEXT, p_pesan TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
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

CREATE FUNCTION pg_temp.ip_buat_user(p_kode TEXT, p_role TEXT) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO users (nama, email, no_wa, password_hash)
    VALUES ('DRYRUN ' || p_kode,
            'dryrun-rawat-' || p_kode || '-' || replace(gen_random_uuid()::text, '-', '') || '@example.invalid',
            NULL, 'x')
    RETURNING id INTO v_id;
    INSERT INTO user_roles (user_id, role_type, status) VALUES (v_id, p_role::role_type, 'active');
    RETURN v_id;
END $$;

CREATE FUNCTION pg_temp.ip_soal(p_subtes UUID, p_kode TEXT, p_urutan INT) RETURNS JSONB LANGUAGE sql AS $$
    SELECT jsonb_build_object(
        'subtes_id', p_subtes, 'stimulus_kode', p_kode, 'urutan_dalam_stimulus', p_urutan, 'tipe', 'pilihan_ganda',
        'redaksi', 'Berapakah \(2+3\)?',
        'konten', '{"v":1,"opsi":[{"label":"A","teks":"3"},{"label":"B","teks":"4"},{"label":"C","teks":"5"},{"label":"D","teks":"6"},{"label":"E","teks":"7"}]}'::jsonb,
        'kunci', '{"v":1,"opsi":"C"}'::jsonb,
        'pembahasan', 'Dua ditambah tiga sama dengan lima.',
        'sumber_rujukan', 'Buatan sendiri', 'tingkat_kesulitan', 'mudah');
$$;

CREATE FUNCTION pg_temp.ip_bacaan(p_subtes UUID, p_kode TEXT) RETURNS JSONB LANGUAGE sql AS $$
    SELECT jsonb_build_object(
        'kode', p_kode, 'subtes_id', p_subtes, 'judul_internal', 'Bacaan ' || p_kode,
        'konten', '{"v":1,"blok":[{"jenis":"teks","teks":"Bacaan uji coba."}]}'::jsonb,
        'sumber_rujukan', 'Buatan sendiri');
$$;

DO $$
DECLARE
    pu UUID;
    adm UUID; siswa UUID; mentor UUID;
    r JSONB;
    batch UUID; batch2 UUID;
    s_terbit UUID;
BEGIN
  BEGIN
    SELECT id INTO pu FROM subtes WHERE nama = 'Penalaran Umum' AND kategori = 'tps';
    PERFORM pg_temp.ip_cek((pu IS NOT NULL)::text, 'true', 'subtes referensi ada');

    PERFORM pg_temp.ip_cek((SELECT format('%s/%s/%s/%s', p.prosecdef,
                              has_function_privilege('anon', p.oid, 'EXECUTE'),
                              has_function_privilege('authenticated', p.oid, 'EXECUTE'),
                              has_function_privilege('service_role', p.oid, 'EXECUTE'))
                            FROM pg_proc p WHERE p.proname = 'studio_soal_admin_hapus_batch_draf'),
        't/f/f/t', 'hapus batch: SECURITY DEFINER, EXECUTE hanya service_role');

    adm := pg_temp.ip_buat_user('admin', 'admin');
    siswa := pg_temp.ip_buat_user('siswa', 'student');
    mentor := pg_temp.ip_buat_user('mentor', 'mentor');

    -- Batch: bacaan B1 (2 soal), bacaan B2 (1 soal), 1 soal mandiri, bacaan B3 tanpa soal.
    r := studio_soal_impor_admin(adm, jsonb_build_object(
        'stimulus', jsonb_build_array(pg_temp.ip_bacaan(pu, 'B1'), pg_temp.ip_bacaan(pu, 'B2'), pg_temp.ip_bacaan(pu, 'B3')),
        'soal', jsonb_build_array(pg_temp.ip_soal(pu, 'B1', 1), pg_temp.ip_soal(pu, 'B1', 2),
                                  pg_temp.ip_soal(pu, 'B2', 1), pg_temp.ip_soal(pu, NULL, NULL))));
    PERFORM pg_temp.ip_status(r, 'disimpan', 'impor batch uji');
    batch := (r->>'batch_id')::uuid;
    r := studio_soal_impor_admin(adm, jsonb_build_object('soal', jsonb_build_array(pg_temp.ip_soal(pu, NULL, NULL))));
    batch2 := (r->>'batch_id')::uuid;

    -- Terbitkan satu soal B1 (bacaan B1 ikut terbit).
    SELECT s.id INTO s_terbit FROM soal_bank s JOIN soal_stimulus t ON t.id = s.stimulus_id
    WHERE s.impor_batch_id = batch AND t.judul_internal = 'Bacaan B1' AND s.urutan_dalam_stimulus = 1;
    r := studio_soal_terbitkan_admin(adm, ARRAY[s_terbit], NULL);
    PERFORM pg_temp.ip_cek(jsonb_array_length(r->'diterbitkan')::text, '1', 'satu soal terbit');

    PERFORM pg_temp.ip_status(studio_soal_admin_hapus_batch_draf(siswa, batch), 'bukan_admin', 'siswa ditolak');
    PERFORM pg_temp.ip_status(studio_soal_admin_hapus_batch_draf(mentor, batch), 'bukan_admin', 'mentor ditolak');
    PERFORM pg_temp.ip_status(studio_soal_admin_hapus_batch_draf(NULL, batch), 'input_tidak_valid', 'admin NULL');
    PERFORM pg_temp.ip_status(studio_soal_admin_hapus_batch_draf(adm, gen_random_uuid()), 'tidak_ditemukan', 'batch acak');
    PERFORM pg_temp.ip_cek((SELECT count(*)::text FROM soal_bank WHERE impor_batch_id = batch), '4', 'penolakan tidak menghapus apa pun');

    r := studio_soal_admin_hapus_batch_draf(adm, batch);
    PERFORM pg_temp.ip_status(r, 'dihapus', 'hapus draf batch');
    PERFORM pg_temp.ip_cek(format('%s/%s/%s', r->>'jumlah_soal', r->>'jumlah_bacaan', r->>'dipertahankan'),
        '3/2/1', 'hanya draf: 3 soal + bacaan B2 & B3; soal terbit dipertahankan');
    PERFORM pg_temp.ip_cek((SELECT string_agg(status, ',') FROM soal_bank WHERE impor_batch_id = batch), 'terpublikasi', 'sisa = soal terbit');
    PERFORM pg_temp.ip_cek((SELECT string_agg(judul_internal || ':' || status, ',') FROM soal_stimulus WHERE impor_batch_id = batch),
        'Bacaan B1:terpublikasi', 'bacaan terbit dipertahankan');
    PERFORM pg_temp.ip_cek((SELECT count(*)::text FROM soal_bank WHERE impor_batch_id = batch2), '1', 'batch lain tidak tersentuh');
    PERFORM pg_temp.ip_cek((SELECT count(*)::text FROM soal_tinjauan_log WHERE aksi = 'hapus_draf_admin' AND aktor_id = adm),
        '5', 'tiap baris terhapus tercatat');

    r := studio_soal_admin_hapus_batch_draf(adm, batch);
    PERFORM pg_temp.ip_cek(format('%s/%s/%s', r->>'jumlah_soal', r->>'jumlah_bacaan', r->>'dipertahankan'),
        '0/0/1', 'aman diulang');

    PERFORM pg_temp.ip_harus_gagal(format(
        'SELECT studio_soal_tulis_log(''soal'', gen_random_uuid(), %L, ''mentor'', ''hapus_draf_admin'', NULL, NULL, NULL)', adm),
        'aksi hapus_draf_admin hanya peran admin');

    RAISE EXCEPTION USING ERRCODE = 'SIDR0', MESSAGE = 'dry-run selesai, batalkan semua perubahan';
  EXCEPTION WHEN SQLSTATE 'SIDR0' THEN
    RAISE NOTICE 'STUDIO SOAL PERAWATAN DRY-RUN [v1]: SEMUA SKENARIO LULUS';
  END;

  IF EXISTS (SELECT 1 FROM users WHERE email LIKE 'dryrun-rawat-%@example.invalid') THEN
    RAISE EXCEPTION 'DRY-RUN GAGAL [v1]: akun tiruan masih tersisa setelah sub-transaksi dibatalkan';
  END IF;
END $$;
