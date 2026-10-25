-- Skenario uji DRY-RUN untuk db/add_studio_soal_draf.sql (PR 3b). Aman
-- dijalankan di database yang SUDAH berisi data asli (termasuk produksi).
--
-- Cara pakai (SQL Editor Supabase, satu kali eksekusi):
--     BEGIN;
--     <isi db/add_studio_soal_draf.sql>   -- lewati kalau sudah dijalankan
--     <isi db/add_studio_soal_draf.sql>   -- sekali lagi: bukti idempotent
--     <isi file ini>
--     ROLLBACK;
--
-- Hasil yang diharapkan: selesai tanpa error, NOTICE "STUDIO SOAL DRAF
-- DRY-RUN [v1]: SEMUA SKENARIO LULUS". Satu skenario gagal = RAISE EXCEPTION
-- "DRY-RUN GAGAL [v1]: ..." berisi nilai sebenarnya, seluruh transaksi batal.
--
-- TIDAK ADA TULISAN PERMANEN KE DATA ASLI — dua lapis pengaman:
--   1. Semua skenario berjalan di blok BEGIN ... EXCEPTION (sub-transaksi) yang
--      SELALU diakhiri RAISE kode 'SDDR0' -> semua perubahan dibatalkan.
--   2. BEGIN/ROLLBACK di luar tetap dianjurkan sebagai lapis kedua.
--
-- Tahan terhadap data asli: penugasan asli untuk subtes uji (PU, PK)
-- dinetralkan sementara di dalam sub-transaksi; akun tiruan memakai email acak
-- di domain .invalid dan no_wa NULL; semua pengecekan memakai id tiruan.
--
-- Butuh db/add_studio_soal.sql, db/add_studio_soal_penugasan.sql, dan subtes
-- 'Penalaran Umum', 'Pengetahuan Kuantitatif' (tps), 'Matematika' (tka_wajib).

CREATE FUNCTION pg_temp.dr_cek(p_dapat TEXT, p_harap TEXT, p_pesan TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    IF p_dapat IS DISTINCT FROM p_harap THEN
        RAISE EXCEPTION 'DRY-RUN GAGAL [v1]: % — diharapkan %, dapat %',
            p_pesan, coalesce(p_harap, '<NULL>'), coalesce(p_dapat, '<NULL>');
    END IF;
END $$;

CREATE FUNCTION pg_temp.dr_harus_gagal(p_sql TEXT, p_pesan TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
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

CREATE FUNCTION pg_temp.dr_status(p_hasil JSONB, p_harapan TEXT, p_pesan TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    IF p_hasil->>'status' IS DISTINCT FROM p_harapan THEN
        RAISE EXCEPTION 'DRY-RUN GAGAL [v1]: % — diharapkan status %, dapat %', p_pesan, p_harapan, p_hasil;
    END IF;
END $$;

CREATE FUNCTION pg_temp.dr_rpc_mati() RETURNS VOID LANGUAGE sql AS $$
    SELECT set_config('studio_soal.rpc', 'off', true);
$$;

CREATE FUNCTION pg_temp.dr_buat_user(p_kode TEXT) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO users (nama, email, no_wa, password_hash)
    VALUES ('DRYRUN ' || p_kode,
            'dryrun-draf-' || p_kode || '-' || replace(gen_random_uuid()::text, '-', '') || '@example.invalid',
            NULL, 'x')
    RETURNING id INTO v_id;
    RETURN v_id;
END $$;

-- Data soal PG lengkap (lolos CHECK saat diajukan).
CREATE FUNCTION pg_temp.dr_data_pg(p_subtes UUID, p_stimulus UUID) RETURNS JSONB LANGUAGE sql AS $$
    SELECT jsonb_build_object(
        'subtes_id', p_subtes, 'tipe', 'pilihan_ganda', 'stimulus_id', p_stimulus,
        'redaksi', 'Berapakah \(2+3\)?',
        'konten', '{"v":1,"opsi":[{"label":"A","teks":"3"},{"label":"B","teks":"4"},{"label":"C","teks":"5"},{"label":"D","teks":"6"},{"label":"E","teks":"7"}]}'::jsonb,
        'kunci', '{"v":1,"opsi":"C"}'::jsonb,
        'pembahasan', 'Dua ditambah tiga sama dengan lima.',
        'sumber_rujukan', NULL, 'tingkat_kesulitan', 'mudah',
        'level_kognitif', NULL, 'estimasi_waktu_detik', 90);
$$;

DO $$
DECLARE
    pu UUID; pk UUID; mtk UUID;
    adm UUID; m1 UUID; m2 UUID; m3 UUID;
    r JSONB;
    s1 UUID := gen_random_uuid();
    s2 UUID := gen_random_uuid();
    s3 UUID := gen_random_uuid();
    s4 UUID := gen_random_uuid();
    s5 UUID := gen_random_uuid();
    g1 UUID := gen_random_uuid();
    g2 UUID := gen_random_uuid();
    g_m2 UUID := gen_random_uuid();
    st UUID := gen_random_uuid();
    st_pk UUID := gen_random_uuid();
    st_kosong UUID := gen_random_uuid();
    v_baru UUID;
BEGIN
  BEGIN
    -- ---- 0. Struktur & fixture ----
    PERFORM pg_temp.dr_cek(format('PU=%s PK=%s MTK=%s',
            (SELECT count(*) FROM subtes WHERE nama = 'Penalaran Umum' AND kategori = 'tps'),
            (SELECT count(*) FROM subtes WHERE nama = 'Pengetahuan Kuantitatif' AND kategori = 'tps'),
            (SELECT count(*) FROM subtes WHERE nama = 'Matematika' AND kategori = 'tka_wajib')),
        'PU=1 PK=1 MTK=1', 'jumlah baris subtes referensi (nama + kategori)');
    SELECT id INTO pu FROM subtes WHERE nama = 'Penalaran Umum' AND kategori = 'tps';
    SELECT id INTO pk FROM subtes WHERE nama = 'Pengetahuan Kuantitatif' AND kategori = 'tps';
    SELECT id INTO mtk FROM subtes WHERE nama = 'Matematika' AND kategori = 'tka_wajib';

    PERFORM pg_temp.dr_cek((SELECT count(*)::text FROM pg_proc
                            WHERE proname IN ('studio_soal_simpan_soal', 'studio_soal_simpan_stimulus', 'studio_soal_hapus_draf')),
        '3', 'jumlah RPC draf');
    PERFORM pg_temp.dr_cek((SELECT string_agg(DISTINCT
                                format('%s:anon=%s,auth=%s,svc=%s', p.proname,
                                       has_function_privilege('anon', p.oid, 'EXECUTE'),
                                       has_function_privilege('authenticated', p.oid, 'EXECUTE'),
                                       has_function_privilege('service_role', p.oid, 'EXECUTE')), ' ')
                            FROM pg_proc p
                            WHERE p.proname IN ('studio_soal_simpan_soal', 'studio_soal_hapus_draf')),
        'studio_soal_hapus_draf:anon=f,auth=f,svc=t studio_soal_simpan_soal:anon=f,auth=f,svc=t',
        'hak EXECUTE hanya service_role');

    -- Netralkan penugasan asli untuk subtes uji (dibatalkan bersama sub-transaksi).
    PERFORM studio_soal_mulai_rpc();
    DELETE FROM studio_soal_penugasan WHERE subtes_id IN (pu, pk);
    PERFORM pg_temp.dr_rpc_mati();

    adm := pg_temp.dr_buat_user('adm');
    INSERT INTO user_roles (user_id, role_type, status) VALUES (adm, 'admin', 'active');
    m1 := pg_temp.dr_buat_user('m1');
    m2 := pg_temp.dr_buat_user('m2');
    m3 := pg_temp.dr_buat_user('m3');
    INSERT INTO user_roles (user_id, role_type, status) VALUES (m1, 'mentor', 'active'), (m2, 'mentor', 'active'), (m3, 'mentor', 'active');
    PERFORM pg_temp.dr_status(studio_soal_atur_penugasan(adm, m1, pu, 'tugaskan'), 'ditugaskan', 'tugaskan m1 PU');
    PERFORM pg_temp.dr_status(studio_soal_atur_penugasan(adm, m2, pu, 'tugaskan'), 'ditugaskan', 'tugaskan m2 PU');
    PERFORM pg_temp.dr_status(studio_soal_atur_penugasan(adm, m1, pk, 'tugaskan'), 'ditugaskan', 'tugaskan m1 PK');
    PERFORM pg_temp.dr_status(studio_soal_atur_penugasan(adm, m3, pk, 'tugaskan'), 'ditugaskan', 'tugaskan m3 PK');

    -- ---- 1. Simpan soal: buat, idempoten, ubah ----
    r := studio_soal_simpan_soal(s1, m1, pg_temp.dr_data_pg(pu, NULL));
    PERFORM pg_temp.dr_status(r, 'disimpan', 'buat draf soal');
    PERFORM pg_temp.dr_cek(r->>'dibuat', 'true', 'flag dibuat pada simpan pertama');
    r := studio_soal_simpan_soal(s1, m1, pg_temp.dr_data_pg(pu, NULL));
    PERFORM pg_temp.dr_status(r, 'disimpan', 'simpan dobel (id sama)');
    PERFORM pg_temp.dr_cek(r->>'dibuat', 'false', 'simpan dobel menjadi ubah, bukan baris baru');
    PERFORM pg_temp.dr_cek((SELECT count(*)::text FROM soal_bank WHERE id = s1), '1', 'tidak ada duplikat');
    PERFORM pg_temp.dr_cek((SELECT format('%s/%s/%s/%s', status, penulis_id = m1, estimasi_waktu_detik, coalesce(sumber_rujukan, '<NULL>'))
                            FROM soal_bank WHERE id = s1),
        'draf/t/90/<NULL>', 'isi tersimpan, penulis dari aktor, sumber kosong = NULL');
    r := studio_soal_simpan_soal(s1, m1, pg_temp.dr_data_pg(pu, NULL) || '{"pembahasan":"Pembahasan diperbarui panjang.","sumber_rujukan":"  Buku X  "}');
    PERFORM pg_temp.dr_status(r, 'disimpan', 'ubah draf');
    PERFORM pg_temp.dr_cek((SELECT pembahasan || '|' || sumber_rujukan FROM soal_bank WHERE id = s1),
        'Pembahasan diperbarui panjang.|Buku X', 'perubahan tersimpan (sumber di-trim)');

    -- ---- 2. Hak: penugasan, subtes SNBT, penulis ----
    r := studio_soal_simpan_soal(s2, m3, pg_temp.dr_data_pg(pu, NULL));
    PERFORM pg_temp.dr_status(r, 'tidak_eligible', 'mentor yang tidak ditugaskan ke PU');
    PERFORM pg_temp.dr_cek((SELECT count(*)::text FROM soal_bank WHERE id = s2), '0', 'tidak ada baris dari mentor tidak ditugaskan');
    r := studio_soal_simpan_soal(s2, m1, pg_temp.dr_data_pg(mtk, NULL));
    PERFORM pg_temp.dr_status(r, 'subtes_tidak_valid', 'subtes TKA (bukan SNBT)');
    r := studio_soal_simpan_soal(s1, m2, pg_temp.dr_data_pg(pu, NULL) || '{"redaksi":"dibajak"}');
    PERFORM pg_temp.dr_status(r, 'bukan_penulis', 'mentor lain mengubah draf');
    PERFORM pg_temp.dr_cek((SELECT redaksi FROM soal_bank WHERE id = s1), 'Berapakah \(2+3\)?', 'draf tidak berubah oleh mentor lain');
    r := studio_soal_hapus_draf('soal', s1, m2);
    PERFORM pg_temp.dr_status(r, 'bukan_penulis', 'mentor lain menghapus draf');
    r := studio_soal_simpan_soal(s1, m1, pg_temp.dr_data_pg(pu, NULL) || '{"tipe":"isian"}');
    PERFORM pg_temp.dr_status(r, 'identitas_berubah', 'tipe diganti setelah disimpan');
    r := studio_soal_simpan_soal(s1, m1, pg_temp.dr_data_pg(pk, NULL));
    PERFORM pg_temp.dr_status(r, 'identitas_berubah', 'subtes diganti setelah disimpan');
    r := studio_soal_simpan_soal(s1, m1, '[]'::jsonb);
    PERFORM pg_temp.dr_status(r, 'input_tidak_valid', 'p_data bukan objek');
    r := studio_soal_simpan_soal(s2, m1, pg_temp.dr_data_pg(pu, NULL) || '{"subtes_id":"bukan-uuid"}');
    PERFORM pg_temp.dr_status(r, 'input_tidak_valid', 'subtes_id bukan UUID');

    -- ---- 3. Data melanggar CHECK -> status, bukan exception ----
    r := studio_soal_simpan_soal(s2, m1, pg_temp.dr_data_pg(pu, NULL) || '{"tingkat_kesulitan":"sulit"}');
    PERFORM pg_temp.dr_status(r, 'data_tidak_valid', 'tingkat kesulitan di luar mudah/sedang/hots');
    r := studio_soal_simpan_soal(s2, m1, pg_temp.dr_data_pg(pu, NULL) || jsonb_build_object('redaksi', repeat('x', 5001)));
    PERFORM pg_temp.dr_status(r, 'data_tidak_valid', 'redaksi > 5000 karakter');
    r := studio_soal_simpan_soal(s2, m1, pg_temp.dr_data_pg(pu, NULL) || '{"estimasi_waktu_detik":5}');
    PERFORM pg_temp.dr_status(r, 'data_tidak_valid', 'estimasi waktu < 10 detik');
    PERFORM pg_temp.dr_cek((SELECT count(*)::text FROM soal_bank WHERE id = s2), '0', 'tidak ada baris dari data tidak valid');

    -- ---- 4. Terkunci setelah diajukan; tarik membuka lagi ----
    r := studio_soal_ajukan_soal(s1, m1);
    PERFORM pg_temp.dr_status(r, 'diajukan', 'ajukan soal hasil simpan RPC');
    r := studio_soal_simpan_soal(s1, m1, pg_temp.dr_data_pg(pu, NULL) || '{"redaksi":"ubah saat diajukan"}');
    PERFORM pg_temp.dr_status(r, 'terkunci', 'ubah soal yang sedang diajukan');
    PERFORM pg_temp.dr_cek(r->>'status_soal', 'diajukan', 'status dikembalikan');
    r := studio_soal_tarik('soal', s1, m1);
    PERFORM pg_temp.dr_status(r, 'ditarik', 'tarik pengajuan');
    r := studio_soal_simpan_soal(s1, m1, pg_temp.dr_data_pg(pu, NULL) || '{"redaksi":"Berapakah \\(2+3\\)? (revisi)"}');
    PERFORM pg_temp.dr_status(r, 'disimpan', 'ubah setelah ditarik');
    r := studio_soal_hapus_draf('soal', s1, m1);
    PERFORM pg_temp.dr_status(r, 'pernah_diajukan', 'hapus draf yang pernah diajukan');

    -- Terbit -> terkunci; versi baru = draf baru yang bisa diedit & dihapus.
    r := studio_soal_ajukan_soal(s1, m1);
    r := studio_soal_tinjau('soal', s1, m2, 'mentor', 'setujui', NULL);
    PERFORM pg_temp.dr_status(r, 'terpublikasi', 'soal disetujui m2');
    r := studio_soal_simpan_soal(s1, m1, pg_temp.dr_data_pg(pu, NULL));
    PERFORM pg_temp.dr_status(r, 'terkunci', 'ubah soal terbit langsung');
    r := studio_soal_buat_versi_soal(s1, m1);
    PERFORM pg_temp.dr_status(r, 'versi_dibuat', 'versi baru');
    v_baru := (r->>'soal_id')::uuid;
    r := studio_soal_simpan_soal(v_baru, m1, pg_temp.dr_data_pg(pu, NULL) || '{"redaksi":"Versi dua"}');
    PERFORM pg_temp.dr_status(r, 'disimpan', 'ubah draf versi baru');
    r := studio_soal_hapus_draf('soal', v_baru, m1);
    PERFORM pg_temp.dr_status(r, 'dihapus', 'batalkan versi baru yang belum diajukan');
    PERFORM pg_temp.dr_cek((SELECT status FROM soal_bank WHERE id = s1), 'terpublikasi', 'versi terbit tetap setelah versi baru dibatalkan');
    r := studio_soal_hapus_draf('soal', s1, m1);
    PERFORM pg_temp.dr_status(r, 'status_tidak_valid', 'hapus soal terbit');

    -- ---- 5. Stimulus & K7 (satu penulis per stimulus) ----
    r := studio_soal_simpan_stimulus(st, m1, jsonb_build_object('subtes_id', pu, 'judul_internal', 'Bacaan uji',
            'konten', '{"v":1,"blok":[{"jenis":"teks","teks":"Paragraf bacaan."}]}'::jsonb, 'sumber_rujukan', 'Buatan sendiri'));
    PERFORM pg_temp.dr_status(r, 'disimpan', 'buat stimulus');
    r := studio_soal_simpan_stimulus(st, m1, jsonb_build_object('subtes_id', pu, 'judul_internal', 'Bacaan uji',
            'konten', '{"v":1,"blok":[{"jenis":"teks","teks":"Paragraf bacaan."}]}'::jsonb, 'sumber_rujukan', 'Buatan sendiri'));
    PERFORM pg_temp.dr_cek(r->>'dibuat', 'false', 'simpan stimulus dobel tidak membuat baris baru');
    PERFORM pg_temp.dr_cek((SELECT count(*)::text FROM soal_stimulus WHERE id = st), '1', 'stimulus tidak duplikat');
    r := studio_soal_simpan_stimulus(st, m2, jsonb_build_object('subtes_id', pu, 'judul_internal', 'Dibajak', 'konten', '{"v":1,"blok":[]}'::jsonb, 'sumber_rujukan', ''));
    PERFORM pg_temp.dr_status(r, 'bukan_penulis', 'mentor lain mengubah stimulus');
    r := studio_soal_simpan_stimulus(st_kosong, m3, jsonb_build_object('subtes_id', pu, 'judul_internal', 'Bacaan m3', 'konten', '{"v":1,"blok":[]}'::jsonb, 'sumber_rujukan', ''));
    PERFORM pg_temp.dr_status(r, 'tidak_eligible', 'stimulus oleh mentor tidak ditugaskan');
    r := studio_soal_simpan_stimulus(st_kosong, m1, jsonb_build_object('subtes_id', pu, 'judul_internal', 'ab', 'konten', '{"v":1,"blok":[]}'::jsonb, 'sumber_rujukan', ''));
    PERFORM pg_temp.dr_status(r, 'data_tidak_valid', 'judul internal < 3 karakter');
    r := studio_soal_simpan_stimulus(st_pk, m1, jsonb_build_object('subtes_id', pk, 'judul_internal', 'Bacaan PK', 'konten', '{"v":1,"blok":[]}'::jsonb, 'sumber_rujukan', ''));
    PERFORM pg_temp.dr_status(r, 'disimpan', 'stimulus PK (draf boleh kosong & tanpa sumber)');

    r := studio_soal_simpan_soal(g1, m1, pg_temp.dr_data_pg(pu, st));
    PERFORM pg_temp.dr_status(r, 'disimpan', 'soal pertama di stimulus');
    r := studio_soal_simpan_soal(g2, m1, pg_temp.dr_data_pg(pu, st));
    PERFORM pg_temp.dr_status(r, 'disimpan', 'soal kedua di stimulus');
    PERFORM pg_temp.dr_cek((SELECT string_agg(urutan_dalam_stimulus::text, ',' ORDER BY urutan_dalam_stimulus)
                            FROM soal_bank WHERE id IN (g1, g2)), '1,2', 'urutan dihitung server');
    r := studio_soal_simpan_soal(g1, m1, pg_temp.dr_data_pg(pu, st) || '{"redaksi":"Ubah soal stimulus"}');
    PERFORM pg_temp.dr_cek((SELECT urutan_dalam_stimulus::text FROM soal_bank WHERE id = g1), '1', 'urutan tetap saat diubah');
    r := studio_soal_simpan_soal(g_m2, m2, pg_temp.dr_data_pg(pu, st));
    PERFORM pg_temp.dr_status(r, 'stimulus_bukan_milik', 'mentor lain menambah soal ke stimulus (K7)');
    r := studio_soal_simpan_soal(g_m2, m1, pg_temp.dr_data_pg(pu, st_pk));
    PERFORM pg_temp.dr_status(r, 'stimulus_beda_subtes', 'soal PU di stimulus PK');
    r := studio_soal_simpan_soal(g_m2, m1, pg_temp.dr_data_pg(pu, gen_random_uuid()));
    PERFORM pg_temp.dr_status(r, 'stimulus_tidak_ditemukan', 'stimulus tidak ada');
    r := studio_soal_simpan_soal(g1, m1, pg_temp.dr_data_pg(pu, NULL));
    PERFORM pg_temp.dr_status(r, 'identitas_berubah', 'soal dipindah keluar stimulus');

    r := studio_soal_ajukan_stimulus(st, m1);
    PERFORM pg_temp.dr_status(r, 'diajukan', 'ajukan kelompok stimulus hasil simpan RPC');
    r := studio_soal_simpan_soal(g_m2, m1, pg_temp.dr_data_pg(pu, st));
    PERFORM pg_temp.dr_status(r, 'stimulus_terkunci', 'tambah soal ke stimulus yang sedang ditinjau');
    r := studio_soal_simpan_stimulus(st, m1, jsonb_build_object('subtes_id', pu, 'judul_internal', 'Ubah', 'konten', '{"v":1,"blok":[]}'::jsonb, 'sumber_rujukan', ''));
    PERFORM pg_temp.dr_status(r, 'terkunci', 'ubah stimulus yang sedang diajukan');
    r := studio_soal_tarik('stimulus', st, m1);
    PERFORM pg_temp.dr_status(r, 'ditarik', 'tarik kelompok stimulus');

    -- Hapus stimulus: hanya bila kosong.
    r := studio_soal_hapus_draf('stimulus', st_pk, m1);
    PERFORM pg_temp.dr_status(r, 'dihapus', 'hapus stimulus kosong yang belum pernah diajukan');
    r := studio_soal_simpan_soal(s3, m1, pg_temp.dr_data_pg(pu, NULL));
    r := studio_soal_simpan_stimulus(st_kosong, m1, jsonb_build_object('subtes_id', pu, 'judul_internal', 'Bacaan dua', 'konten', '{"v":1,"blok":[]}'::jsonb, 'sumber_rujukan', ''));
    r := studio_soal_simpan_soal(s4, m1, pg_temp.dr_data_pg(pu, st_kosong));
    r := studio_soal_hapus_draf('stimulus', st_kosong, m1);
    PERFORM pg_temp.dr_status(r, 'masih_ada_soal', 'hapus stimulus yang masih berisi soal');
    r := studio_soal_hapus_draf('soal', s4, m1);
    PERFORM pg_temp.dr_status(r, 'dihapus', 'hapus soal draf di stimulus');
    r := studio_soal_hapus_draf('stimulus', st_kosong, m1);
    PERFORM pg_temp.dr_status(r, 'dihapus', 'hapus stimulus setelah kosong');
    r := studio_soal_hapus_draf('paket', s3, m1);
    PERFORM pg_temp.dr_status(r, 'input_tidak_valid', 'jenis objek tidak dikenal');
    r := studio_soal_hapus_draf('soal', gen_random_uuid(), m1);
    PERFORM pg_temp.dr_status(r, 'tidak_ditemukan', 'hapus id tidak ada');

    -- ---- 6. Penugasan dicabut: isi terkunci (RPC & trigger), status tetap bisa ditinjau ----
    r := studio_soal_simpan_soal(s5, m1, pg_temp.dr_data_pg(pu, NULL));
    r := studio_soal_ajukan_soal(s5, m1);
    PERFORM pg_temp.dr_status(r, 'diajukan', 'ajukan s5 sebelum dicabut');
    PERFORM pg_temp.dr_status(studio_soal_atur_penugasan(adm, m1, pu, 'cabut'), 'dicabut', 'cabut m1 dari PU');
    r := studio_soal_simpan_soal(s3, m1, pg_temp.dr_data_pg(pu, NULL) || '{"redaksi":"ubah setelah dicabut"}');
    PERFORM pg_temp.dr_status(r, 'tidak_eligible', 'RPC ubah draf setelah penugasan dicabut');
    r := studio_soal_hapus_draf('soal', s3, m1);
    PERFORM pg_temp.dr_status(r, 'tidak_eligible', 'RPC hapus draf setelah penugasan dicabut');
    PERFORM pg_temp.dr_rpc_mati();
    PERFORM pg_temp.dr_harus_gagal(format('UPDATE soal_bank SET redaksi = %L WHERE id = %L', 'ubah langsung', s3),
        'UPDATE isi langsung oleh penulis yang dicabut (trigger)');
    PERFORM pg_temp.dr_harus_gagal(format('UPDATE soal_stimulus SET judul_internal = %L WHERE id = %L', 'Ubah langsung', st),
        'UPDATE isi stimulus langsung oleh penulis yang dicabut (trigger)');
    r := studio_soal_tinjau('soal', s5, m2, 'mentor', 'tolak', 'Kunci jawaban perlu dicek ulang.');
    PERFORM pg_temp.dr_status(r, 'ditolak', 'soal milik mentor yang dicabut tetap bisa ditinjau');
    PERFORM pg_temp.dr_status(studio_soal_atur_penugasan(adm, m1, pu, 'tugaskan'), 'ditugaskan', 'tugaskan ulang m1');
    r := studio_soal_simpan_soal(s5, m1, pg_temp.dr_data_pg(pu, NULL) || '{"redaksi":"Diperbaiki setelah ditolak"}');
    PERFORM pg_temp.dr_status(r, 'disimpan', 'ubah soal ditolak setelah ditugaskan ulang');
    PERFORM pg_temp.dr_cek((SELECT status FROM soal_bank WHERE id = s5), 'ditolak', 'status ditolak tetap sampai diajukan ulang');

    RAISE EXCEPTION USING ERRCODE = 'SDDR0', MESSAGE = 'dry-run selesai, batalkan semua perubahan';
  EXCEPTION WHEN SQLSTATE 'SDDR0' THEN
    RAISE NOTICE 'STUDIO SOAL DRAF DRY-RUN [v1]: SEMUA SKENARIO LULUS';
  END;
END $$;
