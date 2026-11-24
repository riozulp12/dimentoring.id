-- Skenario uji DRY-RUN untuk db/add_impor_soal.sql. Aman dijalankan di database
-- yang SUDAH berisi data asli (termasuk produksi).
--
-- Cara pakai (SQL Editor Supabase, satu kali eksekusi):
--     BEGIN;
--     <isi db/add_impor_soal.sql>   -- lewati kalau sudah dijalankan
--     <isi db/add_impor_soal.sql>   -- sekali lagi: bukti idempotent
--     <isi file ini>
--     ROLLBACK;
--
-- Hasil yang diharapkan: selesai tanpa error (NOTICE "STUDIO SOAL IMPOR DRY-RUN
-- [v1]: SEMUA SKENARIO LULUS"). Satu skenario gagal = RAISE EXCEPTION
-- "DRY-RUN GAGAL [v1]: ..." berisi nilai sebenarnya, seluruh transaksi batal.
--
-- TIDAK ADA TULISAN PERMANEN KE DATA ASLI: semua skenario berjalan di blok
-- BEGIN ... EXCEPTION yang SELALU diakhiri RAISE kode 'SIDR0' (sub-transaksi
-- dibatalkan Postgres). Akun tiruan memakai email acak di domain .invalid.
--
-- Butuh db/add_studio_soal*.sql dan subtes 'Penalaran Umum', 'Pengetahuan
-- Kuantitatif' (tps) dan 'Matematika' (tka_wajib).

CREATE FUNCTION pg_temp.ib_cek(p_dapat TEXT, p_harap TEXT, p_pesan TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    IF p_dapat IS DISTINCT FROM p_harap THEN
        RAISE EXCEPTION 'DRY-RUN GAGAL [v1]: % — diharapkan %, dapat %',
            p_pesan, coalesce(p_harap, '<NULL>'), coalesce(p_dapat, '<NULL>');
    END IF;
END $$;

CREATE FUNCTION pg_temp.ib_harus_gagal(p_sql TEXT, p_pesan TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
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

CREATE FUNCTION pg_temp.ib_status(p_hasil JSONB, p_harapan TEXT, p_pesan TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    IF p_hasil->>'status' IS DISTINCT FROM p_harapan THEN
        RAISE EXCEPTION 'DRY-RUN GAGAL [v1]: % — diharapkan status %, dapat %', p_pesan, p_harapan, p_hasil;
    END IF;
END $$;

CREATE FUNCTION pg_temp.ib_buat_user(p_kode TEXT) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO users (nama, email, no_wa, password_hash)
    VALUES ('DRYRUN ' || p_kode,
            'dryrun-impor-' || p_kode || '-' || replace(gen_random_uuid()::text, '-', '') || '@example.invalid',
            NULL, 'x')
    RETURNING id INTO v_id;
    RETURN v_id;
END $$;

-- Satu soal pilihan ganda valid (bentuk JSON sama dengan yang disusun API).
CREATE FUNCTION pg_temp.ib_soal(p_subtes UUID, p_kode TEXT, p_urutan INT, p_tipe TEXT) RETURNS JSONB LANGUAGE sql AS $$
    SELECT jsonb_build_object(
        'subtes_id', p_subtes, 'stimulus_kode', p_kode, 'urutan_dalam_stimulus', p_urutan, 'tipe', p_tipe,
        'redaksi', 'Berapakah \(2+3\)?',
        'konten', '{"v":1,"opsi":[{"label":"A","teks":"3"},{"label":"B","teks":"4"},{"label":"C","teks":"5"},{"label":"D","teks":"6"},{"label":"E","teks":"7"}]}'::jsonb,
        'kunci', '{"v":1,"opsi":"C"}'::jsonb,
        'pembahasan', 'Dua ditambah tiga sama dengan lima.',
        'sumber_rujukan', 'Buatan sendiri', 'tingkat_kesulitan', 'mudah');
$$;

CREATE FUNCTION pg_temp.ib_stimulus(p_subtes UUID, p_kode TEXT) RETURNS JSONB LANGUAGE sql AS $$
    SELECT jsonb_build_object(
        'kode', p_kode, 'subtes_id', p_subtes, 'judul_internal', 'Bacaan ' || p_kode,
        'konten', '{"v":1,"blok":[{"jenis":"teks","teks":"Bacaan uji coba."}]}'::jsonb,
        'sumber_rujukan', 'Buatan sendiri');
$$;

DO $$
DECLARE
    pu UUID; pk UUID; mtk UUID;
    adm UUID; mentor UUID; siswa UUID;
    r JSONB;
    batch UUID;
    s1 UUID; s2 UUID; s3 UUID; manual UUID;
    banyak JSONB;
    n INT; ns INT;
BEGIN
  BEGIN
    -- ---- 0. Struktur ----
    SELECT id INTO pu FROM subtes WHERE nama = 'Penalaran Umum' AND kategori = 'tps';
    SELECT id INTO pk FROM subtes WHERE nama = 'Pengetahuan Kuantitatif' AND kategori = 'tps';
    SELECT id INTO mtk FROM subtes WHERE nama = 'Matematika' AND kategori = 'tka_wajib';
    PERFORM pg_temp.ib_cek(format('PU=%s PK=%s MTK=%s', pu IS NOT NULL, pk IS NOT NULL, mtk IS NOT NULL),
        'PU=true PK=true MTK=true', 'subtes referensi ada');

    PERFORM pg_temp.ib_cek((SELECT rowsecurity::text FROM pg_tables
                            WHERE schemaname = 'public' AND tablename = 'soal_impor_batch'),
        'true', 'soal_impor_batch: RLS aktif');
    PERFORM pg_temp.ib_cek((SELECT count(*)::text FROM pg_policies WHERE tablename = 'soal_impor_batch'),
        '0', 'soal_impor_batch: tanpa policy');
    PERFORM pg_temp.ib_cek((SELECT string_agg(p.proname || '=' ||
                              has_function_privilege('anon', p.oid, 'EXECUTE')::text || '/' ||
                              has_function_privilege('authenticated', p.oid, 'EXECUTE')::text || '/' ||
                              has_function_privilege('service_role', p.oid, 'EXECUTE')::text, ' ' ORDER BY p.proname)
                            FROM pg_proc p
                            WHERE p.proname IN ('studio_soal_impor_admin', 'studio_soal_terbitkan_admin')),
        'studio_soal_impor_admin=false/false/true studio_soal_terbitkan_admin=false/false/true',
        'hak EXECUTE hanya service_role');

    adm := pg_temp.ib_buat_user('admin');
    INSERT INTO user_roles (user_id, role_type, status) VALUES (adm, 'admin', 'active');
    siswa := pg_temp.ib_buat_user('siswa');
    INSERT INTO user_roles (user_id, role_type, status) VALUES (siswa, 'student', 'active');

    -- Mentor aktif yang ditugaskan ke PU: tetap BUKAN admin.
    mentor := pg_temp.ib_buat_user('mentor');
    INSERT INTO user_roles (user_id, role_type, status) VALUES (mentor, 'mentor', 'active');
    r := studio_soal_atur_penugasan(adm, mentor, pu, 'tugaskan');
    PERFORM pg_temp.ib_status(r, 'ditugaskan', 'penugasan mentor uji');

    -- ---- 1. Impor: hanya Admin ----
    r := studio_soal_impor_admin(siswa, jsonb_build_object('soal', jsonb_build_array(pg_temp.ib_soal(pu, NULL, NULL, 'pilihan_ganda'))));
    PERFORM pg_temp.ib_status(r, 'bukan_admin', 'siswa tidak boleh impor');
    r := studio_soal_impor_admin(mentor, jsonb_build_object('soal', jsonb_build_array(pg_temp.ib_soal(pu, NULL, NULL, 'pilihan_ganda'))));
    PERFORM pg_temp.ib_status(r, 'bukan_admin', 'mentor (walau ditugaskan) tidak boleh impor');
    r := studio_soal_impor_admin(gen_random_uuid(), jsonb_build_object('soal', jsonb_build_array(pg_temp.ib_soal(pu, NULL, NULL, 'pilihan_ganda'))));
    PERFORM pg_temp.ib_status(r, 'bukan_admin', 'id acak bukan admin');
    r := studio_soal_impor_admin(adm, NULL);
    PERFORM pg_temp.ib_status(r, 'input_tidak_valid', 'batch NULL');
    r := studio_soal_impor_admin(adm, '{"soal": []}'::jsonb);
    PERFORM pg_temp.ib_status(r, 'input_tidak_valid', 'batch tanpa soal');
    r := studio_soal_impor_admin(adm, '{"soal": "x"}'::jsonb);
    PERFORM pg_temp.ib_status(r, 'input_tidak_valid', 'soal bukan array');

    -- ---- 2. Impor sukses (2 soal mandiri + 1 bacaan berisi 2 soal), Admin TANPA penugasan ----
    r := studio_soal_impor_admin(adm, jsonb_build_object(
        'nama_berkas', 'uji.csv', 'jumlah_baris', 6, 'jumlah_gagal', 1,
        'stimulus', jsonb_build_array(pg_temp.ib_stimulus(pu, 'B1')),
        'soal', jsonb_build_array(
            pg_temp.ib_soal(pu, NULL, NULL, 'pilihan_ganda'),
            pg_temp.ib_soal(pk, NULL, NULL, 'pilihan_ganda'),
            pg_temp.ib_soal(pu, 'B1', 1, 'pilihan_ganda'),
            pg_temp.ib_soal(pu, 'B1', 2, 'pilihan_ganda'))));
    PERFORM pg_temp.ib_status(r, 'disimpan', 'impor valid oleh admin tanpa penugasan');
    batch := (r->>'batch_id')::uuid;
    PERFORM pg_temp.ib_cek(format('%s/%s', r->>'jumlah_soal', r->>'jumlah_stimulus'), '4/1', 'jumlah dilaporkan');
    PERFORM pg_temp.ib_cek((SELECT format('%s/%s/%s/%s/%s', jumlah_baris, jumlah_ok, jumlah_gagal, nama_berkas, admin_id = adm)
                            FROM soal_impor_batch WHERE id = batch),
        '6/4/1/uji.csv/true', 'baris batch');
    PERFORM pg_temp.ib_cek((SELECT format('%s/%s/%s/%s', count(*), count(*) FILTER (WHERE status = 'draf'),
                                          count(*) FILTER (WHERE sumber = 'buatan_sendiri' AND penulis_id = adm),
                                          count(*) FILTER (WHERE peninjau_id IS NULL))
                            FROM soal_bank WHERE impor_batch_id = batch),
        '4/4/4/4', 'soal batch: semua draf, sumber buatan_sendiri, penulis admin, belum ditinjau');
    PERFORM pg_temp.ib_cek((SELECT format('%s/%s/%s', count(*), count(*) FILTER (WHERE status = 'draf'),
                                          count(*) FILTER (WHERE sumber = 'buatan_sendiri' AND penulis_id = adm))
                            FROM soal_stimulus WHERE impor_batch_id = batch),
        '1/1/1', 'stimulus batch');
    PERFORM pg_temp.ib_cek((SELECT count(*)::text FROM soal_bank WHERE impor_batch_id = batch AND stimulus_id IS NOT NULL),
        '2', 'dua soal terhubung ke bacaan');
    PERFORM pg_temp.ib_cek(studio_soal_impor_aktif()::text, 'false', 'penanda impor dimatikan lagi setelah RPC');

    -- ---- 3. Semua-atau-tidak ----
    SELECT count(*) INTO n FROM soal_bank WHERE sumber = 'buatan_sendiri';
    SELECT count(*) INTO ns FROM soal_stimulus WHERE sumber = 'buatan_sendiri';
    r := studio_soal_impor_admin(adm, jsonb_build_object('jumlah_baris', 4, 'soal', jsonb_build_array(
        pg_temp.ib_soal(pu, NULL, NULL, 'pilihan_ganda'),
        pg_temp.ib_soal(pu, NULL, NULL, 'pilihan_ganda'),
        pg_temp.ib_soal(pu, NULL, NULL, 'tipe_ngawur'))));
    PERFORM pg_temp.ib_status(r, 'data_tidak_valid', 'baris ke-3 salah tipe');
    PERFORM pg_temp.ib_cek(format('%s/%s', r->>'jenis', r->>'indeks'), 'soal/3', 'lokasi galat dilaporkan');
    PERFORM pg_temp.ib_cek((SELECT count(*)::text FROM soal_bank WHERE sumber = 'buatan_sendiri'), n::text,
        'tidak ada soal tersisa dari batch gagal');
    PERFORM pg_temp.ib_cek((SELECT count(*)::text FROM soal_impor_batch WHERE admin_id = adm), '1',
        'batch gagal tidak meninggalkan baris batch');
    PERFORM pg_temp.ib_cek(studio_soal_impor_aktif()::text, 'false', 'penanda impor mati setelah galat');

    r := studio_soal_impor_admin(adm, jsonb_build_object('soal', jsonb_build_array(
        pg_temp.ib_soal(pu, NULL, NULL, 'pilihan_ganda'),
        pg_temp.ib_soal(pu, 'TIDAK_ADA', 1, 'pilihan_ganda'))));
    PERFORM pg_temp.ib_status(r, 'data_tidak_valid', 'kode bacaan tidak ada');
    r := studio_soal_impor_admin(adm, jsonb_build_object(
        'stimulus', jsonb_build_array(pg_temp.ib_stimulus(pu, 'X'), pg_temp.ib_stimulus(pu, 'X')),
        'soal', jsonb_build_array(pg_temp.ib_soal(pu, 'X', 1, 'pilihan_ganda'))));
    PERFORM pg_temp.ib_status(r, 'data_tidak_valid', 'kode bacaan ganda');
    r := studio_soal_impor_admin(adm, jsonb_build_object('soal', jsonb_build_array(
        pg_temp.ib_soal(mtk, NULL, NULL, 'pilihan_ganda'))));
    PERFORM pg_temp.ib_status(r, 'data_tidak_valid', 'subtes non-SNBT ditolak');
    r := studio_soal_impor_admin(adm, jsonb_build_object(
        'stimulus', jsonb_build_array(pg_temp.ib_stimulus(pu, 'Y')),
        'soal', jsonb_build_array(pg_temp.ib_soal(pk, 'Y', 1, 'pilihan_ganda'))));
    PERFORM pg_temp.ib_status(r, 'data_tidak_valid', 'soal dan bacaan beda subtes');
    PERFORM pg_temp.ib_cek((SELECT count(*)::text FROM soal_bank WHERE sumber = 'buatan_sendiri'), n::text,
        'tidak ada soal tersisa dari semua batch gagal');
    PERFORM pg_temp.ib_cek((SELECT count(*)::text FROM soal_stimulus WHERE sumber = 'buatan_sendiri'), ns::text,
        'tidak ada bacaan tersisa dari batch gagal');

    -- ---- 4. Batas jumlah ----
    SELECT jsonb_agg(pg_temp.ib_soal(pu, NULL, NULL, 'pilihan_ganda')) INTO banyak FROM generate_series(1, 301);
    r := studio_soal_impor_admin(adm, jsonb_build_object('soal', banyak));
    PERFORM pg_temp.ib_status(r, 'terlalu_banyak', '301 soal ditolak');
    SELECT jsonb_agg(pg_temp.ib_soal(pu, NULL, NULL, 'pilihan_ganda')) INTO banyak FROM generate_series(1, 300);
    r := studio_soal_impor_admin(adm, jsonb_build_object('soal', banyak));
    PERFORM pg_temp.ib_status(r, 'disimpan', '300 soal diterima');
    PERFORM pg_temp.ib_cek((SELECT count(*)::text FROM soal_bank WHERE impor_batch_id = (r->>'batch_id')::uuid), '300',
        '300 soal tersimpan');

    -- ---- 5. Jalur tulis langsung tetap tertutup ----
    PERFORM pg_temp.ib_harus_gagal(format(
        'INSERT INTO soal_bank (subtes_id, tipe, redaksi, penulis_id, sumber) VALUES (%L, ''pilihan_ganda'', ''x'', %L, ''buatan_sendiri'')',
        pu, adm), 'INSERT sumber buatan_sendiri di luar RPC impor');
    PERFORM pg_temp.ib_harus_gagal(format(
        'INSERT INTO soal_bank (subtes_id, tipe, redaksi, penulis_id, sumber) VALUES (%L, ''pilihan_ganda'', ''x'', %L, ''buatan_sendiri'')',
        pu, siswa), 'INSERT sumber buatan_sendiri oleh non-admin');
    PERFORM pg_temp.ib_harus_gagal(format(
        'UPDATE soal_bank SET status = ''terpublikasi'' WHERE impor_batch_id = %L', batch), 'UPDATE status langsung');

    -- ---- 6. Terbit: aturan akses & batas ----
    PERFORM pg_temp.ib_status(studio_soal_terbitkan_admin(siswa, ARRAY[gen_random_uuid()], 'x'), 'bukan_admin', 'siswa tidak boleh terbit');
    PERFORM pg_temp.ib_status(studio_soal_terbitkan_admin(mentor, ARRAY[gen_random_uuid()], 'x'), 'bukan_admin', 'mentor tidak boleh terbit');
    PERFORM pg_temp.ib_status(studio_soal_terbitkan_admin(adm, ARRAY[]::uuid[], 'x'), 'input_tidak_valid', 'daftar kosong');
    PERFORM pg_temp.ib_status(studio_soal_terbitkan_admin(adm, NULL, 'x'), 'input_tidak_valid', 'daftar NULL');
    PERFORM pg_temp.ib_status(
        studio_soal_terbitkan_admin(adm, ARRAY(SELECT gen_random_uuid() FROM generate_series(1, 201)), 'x'),
        'terlalu_banyak', '201 id ditolak');

    -- ---- 7. Terbit: soal mandiri + soal dalam bacaan + soal manual + id tak ada ----
    SELECT id INTO s1 FROM soal_bank WHERE impor_batch_id = batch AND stimulus_id IS NULL AND subtes_id = pu LIMIT 1;
    SELECT id INTO s2 FROM soal_bank WHERE impor_batch_id = batch AND urutan_dalam_stimulus = 1;
    SELECT id INTO s3 FROM soal_bank WHERE impor_batch_id = batch AND urutan_dalam_stimulus = 2;
    INSERT INTO soal_bank (subtes_id, tipe, redaksi, konten, kunci, pembahasan, tingkat_kesulitan, penulis_id)
    VALUES (pu, 'pilihan_ganda', 'Soal manual mentor.',
            '{"v":1,"opsi":[{"label":"A","teks":"1"},{"label":"B","teks":"2"},{"label":"C","teks":"3"},{"label":"D","teks":"4"},{"label":"E","teks":"5"}]}',
            '{"v":1,"opsi":"A"}', 'Pembahasan soal manual.', 'mudah', mentor)
    RETURNING id INTO manual;

    r := studio_soal_terbitkan_admin(adm, ARRAY[s1, s2, manual, gen_random_uuid(), s1], '  Unggah uji coba  ');
    PERFORM pg_temp.ib_status(r, 'selesai', 'terbit campuran');
    PERFORM pg_temp.ib_cek(jsonb_array_length(r->'diterbitkan')::text, '2', 'dua soal diterbitkan (id ganda dihitung sekali)');
    PERFORM pg_temp.ib_cek(jsonb_array_length(r->'stimulus_diterbitkan')::text, '1', 'bacaan ikut terbit');
    PERFORM pg_temp.ib_cek((SELECT string_agg(x->>'alasan', ',' ORDER BY x->>'alasan') FROM jsonb_array_elements(r->'dilewati') x),
        'bukan_buatan_sendiri,tidak_ditemukan', 'alasan yang dilewati');
    PERFORM pg_temp.ib_cek((SELECT format('%s/%s/%s', status, peninjau_id = adm, ditinjau_pada IS NOT NULL)
                            FROM soal_bank WHERE id = s1), 'terpublikasi/true/true', 'soal mandiri terbit, peninjau admin');
    PERFORM pg_temp.ib_cek((SELECT status FROM soal_bank WHERE id = s2), 'terpublikasi', 'soal dalam bacaan terbit');
    PERFORM pg_temp.ib_cek((SELECT status FROM soal_bank WHERE id = s3), 'draf', 'soal lain di bacaan itu tetap draf');
    PERFORM pg_temp.ib_cek((SELECT status FROM soal_stimulus WHERE impor_batch_id = batch), 'terpublikasi', 'bacaan terbit');
    PERFORM pg_temp.ib_cek((SELECT status FROM soal_bank WHERE id = manual), 'draf', 'soal manual mentor tidak disentuh');
    PERFORM pg_temp.ib_cek((SELECT format('%s/%s/%s/%s', count(*), count(*) FILTER (WHERE objek_jenis = 'soal'),
                                          count(*) FILTER (WHERE peran = 'admin' AND aktor_id = adm),
                                          min(alasan))
                            FROM soal_tinjauan_log WHERE aksi = 'terbit_admin_buatan_sendiri' AND objek_id IN (s1, s2, (SELECT id FROM soal_stimulus WHERE impor_batch_id = batch))),
        '3/2/3/Unggah uji coba', 'log audit: 2 soal + 1 bacaan, catatan dirapikan');

    -- Ulang: tidak terbit ganda, tidak ada log baru.
    r := studio_soal_terbitkan_admin(adm, ARRAY[s1, s2], NULL);
    PERFORM pg_temp.ib_cek(jsonb_array_length(r->'diterbitkan')::text, '0', 'terbit ulang: tidak ada yang diterbitkan');
    PERFORM pg_temp.ib_cek((SELECT string_agg(DISTINCT x->>'alasan', ',') FROM jsonb_array_elements(r->'dilewati') x),
        'bukan_draf', 'terbit ulang dilaporkan bukan_draf');
    PERFORM pg_temp.ib_cek((SELECT count(*)::text FROM soal_tinjauan_log WHERE aksi = 'terbit_admin_buatan_sendiri' AND objek_id IN (s1, s2)),
        '2', 'terbit ulang tidak menambah log');

    -- Soal kedua dalam bacaan yang sudah terbit boleh menyusul.
    r := studio_soal_terbitkan_admin(adm, ARRAY[s3], NULL);
    PERFORM pg_temp.ib_cek(jsonb_array_length(r->'diterbitkan')::text, '1', 'soal susulan di bacaan terbit');
    PERFORM pg_temp.ib_cek(jsonb_array_length(r->'stimulus_diterbitkan')::text, '0', 'bacaan tidak diterbitkan dua kali');

    -- Isi terbit terkunci (aturan lama tetap berlaku untuk soal impor).
    PERFORM pg_temp.ib_harus_gagal(format('UPDATE soal_bank SET redaksi = ''diubah'' WHERE id = %L', s1),
        'isi soal terbit terkunci');

    -- Soal impor yang tidak lengkap (pembahasan kosong lolos sebagai draf, tapi CHECK terbit menolak)
    -- dilewati dan dilaporkan; soal lain dalam panggilan yang sama tetap terbit.
    r := studio_soal_impor_admin(adm, jsonb_build_object('soal', jsonb_build_array(
        pg_temp.ib_soal(pu, NULL, NULL, 'pilihan_ganda') || '{"pembahasan": ""}'::jsonb,
        pg_temp.ib_soal(pu, NULL, NULL, 'pilihan_ganda'))));
    PERFORM pg_temp.ib_status(r, 'disimpan', 'impor draf tidak lengkap');
    SELECT id INTO s1 FROM soal_bank WHERE impor_batch_id = (r->>'batch_id')::uuid AND pembahasan = '';
    SELECT id INTO s2 FROM soal_bank WHERE impor_batch_id = (r->>'batch_id')::uuid AND pembahasan <> '';
    r := studio_soal_terbitkan_admin(adm, ARRAY[s1, s2], NULL);
    PERFORM pg_temp.ib_cek(format('%s/%s', jsonb_array_length(r->'diterbitkan'), r->'dilewati'->0->>'alasan'),
        '1/data_tidak_valid', 'soal tidak lengkap dilewati, soal lengkap terbit');
    PERFORM pg_temp.ib_cek((SELECT status FROM soal_bank WHERE id = s1), 'draf', 'soal tidak lengkap tetap draf');

    RAISE EXCEPTION USING ERRCODE = 'SIDR0', MESSAGE = 'dry-run selesai, batalkan semua perubahan';
  EXCEPTION WHEN SQLSTATE 'SIDR0' THEN
    RAISE NOTICE 'STUDIO SOAL IMPOR DRY-RUN [v1]: SEMUA SKENARIO LULUS';
  END;

  IF EXISTS (SELECT 1 FROM users WHERE email LIKE 'dryrun-impor-%@example.invalid') THEN
    RAISE EXCEPTION 'DRY-RUN GAGAL [v1]: akun tiruan masih tersisa setelah sub-transaksi dibatalkan';
  END IF;
END $$;
