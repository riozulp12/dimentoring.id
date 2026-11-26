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
    adm2 UUID;
    v1 UUID; v2 UUID; d1 UUID; d2 UUID; manual UUID;
    baris soal_bank%ROWTYPE;
    u0 TIMESTAMPTZ;
    isi JSONB;
BEGIN
  BEGIN
    SELECT id INTO pu FROM subtes WHERE nama = 'Penalaran Umum' AND kategori = 'tps';
    PERFORM pg_temp.ip_cek((pu IS NOT NULL)::text, 'true', 'subtes referensi ada');

    PERFORM pg_temp.ip_cek((SELECT string_agg(format('%s=%s/%s/%s/%s', p.proname, p.prosecdef,
                              has_function_privilege('anon', p.oid, 'EXECUTE'),
                              has_function_privilege('authenticated', p.oid, 'EXECUTE'),
                              has_function_privilege('service_role', p.oid, 'EXECUTE')), ' ' ORDER BY p.proname COLLATE "C")
                            FROM pg_proc p WHERE p.proname IN ('studio_soal_admin_arsipkan', 'studio_soal_admin_hapus_batch_draf',
                              'studio_soal_admin_hapus_draf', 'studio_soal_admin_simpan', 'studio_soal_admin_terbitkan_versi',
                              'studio_soal_admin_versi_baru')),
        'studio_soal_admin_arsipkan=t/f/f/t studio_soal_admin_hapus_batch_draf=t/f/f/t studio_soal_admin_hapus_draf=t/f/f/t studio_soal_admin_simpan=t/f/f/t studio_soal_admin_terbitkan_versi=t/f/f/t studio_soal_admin_versi_baru=t/f/f/t',
        'semua RPC: SECURITY DEFINER, EXECUTE hanya service_role');

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

    -- ======================= EDIT, VERSI, ARSIP, HAPUS =======================
    adm2 := pg_temp.ip_buat_user('admin2', 'admin');
    r := studio_soal_impor_admin(adm, jsonb_build_object(
        'stimulus', jsonb_build_array(pg_temp.ip_bacaan(pu, 'E1'), pg_temp.ip_bacaan(pu, 'E2')),
        'soal', jsonb_build_array(pg_temp.ip_soal(pu, 'E1', 1), pg_temp.ip_soal(pu, 'E2', 1), pg_temp.ip_soal(pu, NULL, NULL))));
    batch := (r->>'batch_id')::uuid;
    SELECT s.id INTO v1 FROM soal_bank s JOIN soal_stimulus t ON t.id = s.stimulus_id
    WHERE s.impor_batch_id = batch AND t.judul_internal = 'Bacaan E1';
    SELECT s.id INTO d1 FROM soal_bank s JOIN soal_stimulus t ON t.id = s.stimulus_id
    WHERE s.impor_batch_id = batch AND t.judul_internal = 'Bacaan E2';
    SELECT id INTO d2 FROM soal_bank WHERE impor_batch_id = batch AND stimulus_id IS NULL;

    -- Soal manual milik mentor yang ditugaskan.
    PERFORM studio_soal_atur_penugasan(adm, mentor, pu, 'tugaskan');
    manual := gen_random_uuid();
    r := studio_soal_simpan_soal(manual, mentor, jsonb_build_object('subtes_id', pu, 'tipe', 'pilihan_ganda', 'redaksi', 'Soal mentor.'));
    PERFORM pg_temp.ip_status(r, 'disimpan', 'draf manual mentor');

    -- ---- Simpan draf ----
    SELECT * INTO baris FROM soal_bank WHERE id = d2;
    u0 := baris.updated_at;
    isi := jsonb_build_object('subtes_id', pu, 'tipe', 'pilihan_ganda', 'stimulus_id', NULL,
        'redaksi', 'Redaksi disunting Admin.', 'konten', baris.konten, 'kunci', '{"v":1,"opsi":"B"}'::jsonb,
        'pembahasan', baris.pembahasan, 'sumber_rujukan', 'Buatan sendiri', 'tingkat_kesulitan', 'hots',
        'level_kognitif', 2, 'estimasi_waktu_detik', 90);

    PERFORM pg_temp.ip_status(studio_soal_admin_simpan(siswa, d2, u0, isi), 'bukan_admin', 'siswa tidak boleh simpan');
    PERFORM pg_temp.ip_status(studio_soal_admin_simpan(mentor, d2, u0, isi), 'bukan_admin', 'mentor tidak boleh simpan');
    PERFORM pg_temp.ip_status(studio_soal_admin_versi_baru(mentor, d2), 'bukan_admin', 'versi: mentor');
    PERFORM pg_temp.ip_status(studio_soal_admin_terbitkan_versi(mentor, d2, u0, isi), 'bukan_admin', 'terbit versi: mentor');
    PERFORM pg_temp.ip_status(studio_soal_admin_arsipkan(mentor, d2), 'bukan_admin', 'arsip: mentor');
    PERFORM pg_temp.ip_status(studio_soal_admin_hapus_draf(mentor, d2), 'bukan_admin', 'hapus: mentor');
    PERFORM pg_temp.ip_status(studio_soal_admin_simpan(adm, d2, NULL, isi), 'input_tidak_valid', 'tanpa updated_at');
    PERFORM pg_temp.ip_status(studio_soal_admin_simpan(adm, d2, u0 - interval '1 second', isi), 'sudah_berubah', 'tabrakan edit');
    PERFORM pg_temp.ip_cek((SELECT redaksi FROM soal_bank WHERE id = d2), baris.redaksi, 'tabrakan tidak menulis');
    PERFORM pg_temp.ip_status(studio_soal_admin_simpan(adm, d2, u0, isi || '{"tipe":"isian"}'::jsonb), 'identitas_berubah', 'tipe terkunci');
    PERFORM pg_temp.ip_status(studio_soal_admin_simpan(adm, d2, u0, isi || '{"tingkat_kesulitan":"x"}'::jsonb), 'data_tidak_valid', 'CHECK ditolak');

    SELECT updated_at INTO u0 FROM soal_bank WHERE id = manual;
    PERFORM pg_temp.ip_status(studio_soal_admin_simpan(adm, manual, u0, isi), 'bukan_buatan_sendiri', 'simpan manual');
    PERFORM pg_temp.ip_status(studio_soal_admin_versi_baru(adm, manual), 'bukan_buatan_sendiri', 'versi manual');
    PERFORM pg_temp.ip_status(studio_soal_admin_arsipkan(adm, manual), 'bukan_buatan_sendiri', 'arsip manual');
    PERFORM pg_temp.ip_status(studio_soal_admin_hapus_draf(adm, manual), 'bukan_buatan_sendiri', 'hapus manual');

    -- Admin LAIN (bukan penulis, tanpa penugasan) boleh menyunting draf Buatan Sendiri.
    SELECT updated_at INTO u0 FROM soal_bank WHERE id = d2;
    r := studio_soal_admin_simpan(adm2, d2, u0, isi);
    PERFORM pg_temp.ip_status(r, 'disimpan', 'edit draf');
    PERFORM pg_temp.ip_cek((SELECT format('%s|%s|%s|%s', redaksi, kunci->>'opsi', tingkat_kesulitan, status) FROM soal_bank WHERE id = d2),
        'Redaksi disunting Admin.|B|hots|draf', 'isi draf berubah');
    PERFORM pg_temp.ip_cek((SELECT count(*)::text FROM soal_tinjauan_log WHERE objek_id = d2 AND aksi = 'ubah_admin' AND aktor_id = adm2), '1', 'log ubah_admin');
    PERFORM pg_temp.ip_cek(coalesce(current_setting('studio_soal.impor', true), ''), 'off', 'penanda dimatikan');
    PERFORM pg_temp.ip_harus_gagal(format('UPDATE soal_bank SET redaksi = ''langsung'' WHERE id = %L', d2),
        'UPDATE isi langsung (tanpa RPC) tetap ditolak trigger penulis');
    PERFORM set_config('studio_soal.rpc', 'off', true);
    PERFORM pg_temp.ip_harus_gagal(format('UPDATE soal_bank SET status = ''terpublikasi'' WHERE id = %L', d2),
        'UPDATE status langsung ditolak');

    -- ---- Versi baru + terbitkan ----
    PERFORM pg_temp.ip_status(studio_soal_admin_versi_baru(adm, v1), 'status_tidak_valid', 'versi dari draf');
    SELECT updated_at INTO u0 FROM soal_bank WHERE id = d2;
    PERFORM pg_temp.ip_status(studio_soal_admin_terbitkan_versi(adm, d2, u0, isi), 'bukan_versi_baru', 'draf pertama bukan versi baru');
    r := studio_soal_terbitkan_admin(adm, ARRAY[v1], NULL);
    PERFORM pg_temp.ip_cek(jsonb_array_length(r->'diterbitkan')::text, '1', 'v1 terbit');
    SELECT * INTO baris FROM soal_bank WHERE id = v1;
    PERFORM pg_temp.ip_status(studio_soal_admin_simpan(adm, v1, baris.updated_at, isi), 'terkunci', 'soal terbit tidak diubah di tempat');
    PERFORM pg_temp.ip_status(studio_soal_admin_hapus_draf(adm, v1), 'status_tidak_valid', 'soal terbit tidak bisa dihapus');

    -- Penulis asli tidak lagi Admin aktif: versi baru tetap bisa dibuat Admin lain.
    UPDATE user_roles SET status = 'rejected' WHERE user_id = adm AND role_type = 'admin';
    r := studio_soal_admin_versi_baru(adm2, v1);
    PERFORM pg_temp.ip_status(r, 'versi_dibuat', 'versi baru');
    v2 := (r->>'soal_id')::uuid;
    UPDATE user_roles SET status = 'active' WHERE user_id = adm AND role_type = 'admin';
    PERFORM pg_temp.ip_cek((SELECT format('%s/%s/%s/%s/%s/%s', n.keluarga_id = l.keluarga_id, n.versi, n.menggantikan_id = l.id,
                                          n.status, n.impor_batch_id = l.impor_batch_id, l.status)
                            FROM soal_bank n, soal_bank l WHERE n.id = v2 AND l.id = v1),
        't/2/t/draf/t/terpublikasi', 'versi baru: keluarga sama, versi+1, lama tetap terbit');
    r := studio_soal_admin_versi_baru(adm, v1);
    PERFORM pg_temp.ip_cek(format('%s/%s', r->>'status', (r->>'soal_id')::uuid = v2), 'ada_versi_terbuka/t', 'satu versi terbuka');
    PERFORM pg_temp.ip_status(studio_soal_admin_arsipkan(adm, v1), 'ada_versi_terbuka', 'arsip ditahan selama ada versi terbuka');

    SELECT * INTO baris FROM soal_bank WHERE id = v2;
    u0 := baris.updated_at;
    isi := jsonb_build_object('subtes_id', pu, 'tipe', 'pilihan_ganda', 'stimulus_id', baris.stimulus_id,
        'redaksi', 'Versi dua.', 'konten', baris.konten, 'kunci', baris.kunci,
        'pembahasan', '', 'sumber_rujukan', 'Buatan sendiri', 'tingkat_kesulitan', 'sedang');
    -- Atomik: isi tidak lolos syarat terbit -> tidak ada yang berubah, termasuk simpanannya.
    PERFORM pg_temp.ip_status(studio_soal_admin_terbitkan_versi(adm, v2, u0, isi), 'data_tidak_valid', 'terbit tanpa pembahasan');
    PERFORM pg_temp.ip_cek((SELECT format('%s/%s/%s', n.status, n.redaksi = baris.redaksi, l.status)
                            FROM soal_bank n, soal_bank l WHERE n.id = v2 AND l.id = v1),
        'draf/t/terpublikasi', 'atomik: semua dibatalkan');
    PERFORM pg_temp.ip_cek((SELECT count(*)::text FROM soal_tinjauan_log WHERE objek_id = v2 AND aksi IN ('ubah_admin', 'terbit_admin_buatan_sendiri')),
        '0', 'atomik: tanpa log');
    isi := isi || '{"pembahasan":"Pembahasan versi dua yang lengkap."}'::jsonb;
    PERFORM pg_temp.ip_status(studio_soal_admin_terbitkan_versi(adm, v2, u0 - interval '1 second', isi), 'sudah_berubah', 'terbit: tabrakan');
    PERFORM pg_temp.ip_cek((SELECT status FROM soal_bank WHERE id = v1), 'terpublikasi', 'tabrakan: lama tetap terbit');
    PERFORM pg_temp.ip_status(studio_soal_admin_terbitkan_versi(adm, v2, u0, isi), 'versi_terbit', 'terbitkan versi baru');
    PERFORM pg_temp.ip_cek((SELECT format('%s/%s/%s', n.status, n.redaksi, l.status) FROM soal_bank n, soal_bank l WHERE n.id = v2 AND l.id = v1),
        'terpublikasi/Versi dua./digantikan', 'baru terbit, lama digantikan');
    PERFORM pg_temp.ip_cek((SELECT count(*)::text FROM soal_bank WHERE keluarga_id = baris.keluarga_id AND status = 'terpublikasi'), '1', 'satu versi terbit');
    PERFORM pg_temp.ip_cek((SELECT count(*)::text FROM soal_tinjauan_log WHERE objek_id = v2 AND aksi = 'terbit_admin_buatan_sendiri' AND peran = 'admin'),
        '1', 'log terbit versi');
    PERFORM pg_temp.ip_status(studio_soal_admin_hapus_draf(adm, v1), 'status_tidak_valid', 'versi digantikan tidak bisa dihapus');
    PERFORM pg_temp.ip_status(studio_soal_admin_arsipkan(adm, v1), 'status_tidak_valid', 'versi digantikan tidak diarsipkan');

    -- Draf versi 3 boleh dihapus: membatalkan versi baru, versi terbit tetap.
    r := studio_soal_admin_versi_baru(adm, v2);
    r := studio_soal_admin_hapus_draf(adm, (r->>'soal_id')::uuid);
    PERFORM pg_temp.ip_cek(format('%s/%s', r->>'status', r->>'jumlah_bacaan'), 'dihapus/0', 'hapus draf versi; bacaan terbit tetap');

    -- ---- Arsip ----
    PERFORM pg_temp.ip_status(studio_soal_admin_arsipkan(adm, d1), 'status_tidak_valid', 'draf tidak diarsipkan');
    PERFORM pg_temp.ip_status(studio_soal_admin_arsipkan(adm, v2), 'diarsipkan', 'arsipkan soal terbit');
    PERFORM pg_temp.ip_cek((SELECT status FROM soal_bank WHERE id = v2), 'diarsipkan', 'status arsip, baris tetap ada');
    PERFORM pg_temp.ip_cek((SELECT count(*)::text FROM soal_tinjauan_log WHERE objek_id = v2 AND aksi = 'arsipkan' AND peran = 'admin'), '1', 'log arsip');

    -- ---- Hapus satu draf + bacaan yatim ----
    r := studio_soal_admin_hapus_draf(adm, d1);
    PERFORM pg_temp.ip_cek(format('%s/%s', r->>'status', r->>'jumlah_bacaan'), 'dihapus/1', 'draf + bacaan yatim');
    PERFORM pg_temp.ip_cek((SELECT count(*)::text FROM soal_stimulus WHERE impor_batch_id = batch AND judul_internal = 'Bacaan E2'), '0', 'bacaan E2 hilang');
    PERFORM pg_temp.ip_status(studio_soal_admin_hapus_draf(adm, d2), 'dihapus', 'hapus draf mandiri');
    PERFORM pg_temp.ip_status(studio_soal_admin_hapus_draf(adm, d2), 'tidak_ditemukan', 'sudah dihapus');

    RAISE EXCEPTION USING ERRCODE = 'SIDR0', MESSAGE = 'dry-run selesai, batalkan semua perubahan';
  EXCEPTION WHEN SQLSTATE 'SIDR0' THEN
    RAISE NOTICE 'STUDIO SOAL PERAWATAN DRY-RUN [v1]: SEMUA SKENARIO LULUS';
  END;

  IF EXISTS (SELECT 1 FROM users WHERE email LIKE 'dryrun-rawat-%@example.invalid') THEN
    RAISE EXCEPTION 'DRY-RUN GAGAL [v1]: akun tiruan masih tersisa setelah sub-transaksi dibatalkan';
  END IF;
END $$;
