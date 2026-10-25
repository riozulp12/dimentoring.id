-- Skenario uji DRY-RUN untuk db/add_studio_soal_penugasan.sql. Aman dijalankan
-- di database yang SUDAH berisi data asli (termasuk produksi).
--
-- Cara pakai (SQL Editor Supabase, satu kali eksekusi):
--     BEGIN;
--     <isi db/add_studio_soal_penugasan.sql>   -- lewati kalau sudah dijalankan
--     <isi db/add_studio_soal_penugasan.sql>   -- sekali lagi: bukti idempotent
--     <isi file ini>
--     ROLLBACK;
--
-- Hasil yang diharapkan: selesai tanpa error (NOTICE "STUDIO SOAL PENUGASAN
-- DRY-RUN [v1]: SEMUA SKENARIO LULUS"). Satu skenario gagal = RAISE EXCEPTION
-- "DRY-RUN GAGAL [v1]: ..." berisi nilai sebenarnya, seluruh transaksi batal.
-- Kalau penanda [v1] tidak muncul di pesan, yang dijalankan salinan berkas lama.
--
-- TIDAK ADA TULISAN PERMANEN KE DATA ASLI — dua lapis pengaman:
--   1. Semua skenario berjalan di blok BEGIN ... EXCEPTION (sub-transaksi) yang
--      SELALU diakhiri RAISE kode 'SPDR0' -> semua perubahan dibatalkan
--      Postgres, bahkan kalau BEGIN/ROLLBACK di luar lupa ditulis.
--   2. BEGIN/ROLLBACK di luar tetap dianjurkan sebagai lapis kedua.
--
-- Tahan terhadap data asli: penugasan asli untuk subtes uji (PU, PK)
-- dinetralkan sementara di dalam sub-transaksi; akun tiruan memakai email acak
-- di domain .invalid dan no_wa NULL; semua pengecekan memakai id tiruan.
--
-- Butuh db/add_studio_soal.sql dan subtes 'Penalaran Umum',
-- 'Pengetahuan Kuantitatif' (tps) dan 'Matematika' (tka_wajib).

CREATE FUNCTION pg_temp.pn_cek(p_dapat TEXT, p_harap TEXT, p_pesan TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    IF p_dapat IS DISTINCT FROM p_harap THEN
        RAISE EXCEPTION 'DRY-RUN GAGAL [v1]: % — diharapkan %, dapat %',
            p_pesan, coalesce(p_harap, '<NULL>'), coalesce(p_dapat, '<NULL>');
    END IF;
END $$;

CREATE FUNCTION pg_temp.pn_harus_gagal(p_sql TEXT, p_pesan TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
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

CREATE FUNCTION pg_temp.pn_status_rpc(p_hasil JSONB, p_harapan TEXT, p_pesan TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    IF p_hasil->>'status' IS DISTINCT FROM p_harapan THEN
        RAISE EXCEPTION 'DRY-RUN GAGAL [v1]: % — diharapkan status %, dapat %', p_pesan, p_harapan, p_hasil;
    END IF;
END $$;

CREATE FUNCTION pg_temp.pn_rpc_mati() RETURNS VOID LANGUAGE sql AS $$
    SELECT set_config('studio_soal.rpc', 'off', true);
$$;

CREATE FUNCTION pg_temp.pn_buat_user(p_kode TEXT) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO users (nama, email, no_wa, password_hash)
    VALUES ('DRYRUN ' || p_kode,
            'dryrun-penugasan-' || p_kode || '-' || replace(gen_random_uuid()::text, '-', '') || '@example.invalid',
            NULL, 'x')
    RETURNING id INTO v_id;
    RETURN v_id;
END $$;

-- Mentor dengan PROFIL MENGAJAR (mentor_subtes_diampu) — sengaja TIDAK
-- ditugaskan, untuk membuktikan profil tidak memberi hak menulis/meninjau.
CREATE FUNCTION pg_temp.pn_jadikan_mentor(p_user UUID, p_status TEXT, p_profil_subtes UUID[]) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    v_profil UUID;
BEGIN
    INSERT INTO user_roles (user_id, role_type, status) VALUES (p_user, 'mentor', p_status::role_status);
    INSERT INTO mentor_profiles (user_id, asal_ptn, semester, jurusan)
    VALUES (p_user, 'DRYRUN', 1, 'DRYRUN') RETURNING id INTO v_profil;
    INSERT INTO mentor_subtes_diampu (mentor_profile_id, subtes_id)
    SELECT v_profil, s FROM unnest(p_profil_subtes) AS s;
END $$;

CREATE FUNCTION pg_temp.pn_buat_pg(p_penulis UUID, p_subtes UUID) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO soal_bank (subtes_id, tipe, redaksi, konten, kunci, pembahasan, tingkat_kesulitan, penulis_id)
    VALUES (p_subtes, 'pilihan_ganda', 'Berapakah \(2+3\)?',
            '{"v":1,"opsi":[{"label":"A","teks":"3"},{"label":"B","teks":"4"},{"label":"C","teks":"5"},{"label":"D","teks":"6"},{"label":"E","teks":"7"}]}',
            '{"v":1,"opsi":"C"}', 'Dua ditambah tiga sama dengan lima.', 'mudah', p_penulis)
    RETURNING id INTO v_id;
    RETURN v_id;
END $$;

CREATE FUNCTION pg_temp.pn_jumlah_log(p_mentor UUID, p_subtes UUID) RETURNS TEXT LANGUAGE sql AS $$
    SELECT count(*)::text FROM studio_soal_penugasan_log WHERE mentor_id = p_mentor AND subtes_id = p_subtes;
$$;

DO $$
DECLARE
    pu UUID; pk UUID; mtk UUID;
    adm UUID; m1 UUID; m2 UUID; m3 UUID; mp UUID;
    r JSONB;
    s1 UUID; s2 UUID; s3 UUID;
    snap2 JSONB; snap3 JSONB;
    n_profil BIGINT;
    n INT;
    v_log RECORD;
BEGIN
  BEGIN
    -- ---- 0. Struktur ----
    PERFORM pg_temp.pn_cek(format('PU=%s PK=%s MTK=%s',
            (SELECT count(*) FROM subtes WHERE nama = 'Penalaran Umum' AND kategori = 'tps'),
            (SELECT count(*) FROM subtes WHERE nama = 'Pengetahuan Kuantitatif' AND kategori = 'tps'),
            (SELECT count(*) FROM subtes WHERE nama = 'Matematika' AND kategori = 'tka_wajib')),
        'PU=1 PK=1 MTK=1', 'jumlah baris subtes referensi (nama + kategori)');
    SELECT id INTO pu FROM subtes WHERE nama = 'Penalaran Umum' AND kategori = 'tps';
    SELECT id INTO pk FROM subtes WHERE nama = 'Pengetahuan Kuantitatif' AND kategori = 'tps';
    SELECT id INTO mtk FROM subtes WHERE nama = 'Matematika' AND kategori = 'tka_wajib';

    PERFORM pg_temp.pn_cek((SELECT string_agg(tablename || '=' || rowsecurity::text, ' ' ORDER BY tablename)
                         FROM pg_tables WHERE schemaname = 'public'
                           AND tablename IN ('studio_soal_penugasan', 'studio_soal_penugasan_log')),
        'studio_soal_penugasan=true studio_soal_penugasan_log=true', 'tabel ada & RLS aktif');
    PERFORM pg_temp.pn_cek((SELECT count(*)::text FROM pg_policies
                         WHERE tablename IN ('studio_soal_penugasan', 'studio_soal_penugasan_log')),
        '0', 'jumlah policy (akses hanya service_role)');
    PERFORM pg_temp.pn_cek((SELECT string_agg(proname || '=' || (prosrc LIKE '%studio_soal_penugasan%')::text, ' ' ORDER BY proname)
                         FROM pg_proc
                         WHERE proname IN ('studio_soal_mentor_eligible', 'studio_soal_hitung_peninjau_eligible')),
        'studio_soal_hitung_peninjau_eligible=true studio_soal_mentor_eligible=true',
        'fungsi izin membaca studio_soal_penugasan (bukan mentor_subtes_diampu)');
    PERFORM pg_temp.pn_cek((SELECT count(*)::text FROM pg_proc
                         WHERE proname IN ('studio_soal_mentor_eligible', 'studio_soal_hitung_peninjau_eligible')
                           AND prosrc LIKE '%mentor_subtes_diampu%'),
        '0', 'fungsi izin tidak lagi membaca mentor_subtes_diampu');
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        PERFORM pg_temp.pn_cek(format('anon=%s authenticated=%s',
                has_function_privilege('anon', 'studio_soal_atur_penugasan(uuid,uuid,uuid,text)', 'EXECUTE'),
                has_function_privilege('authenticated', 'studio_soal_atur_penugasan(uuid,uuid,uuid,text)', 'EXECUTE')),
            'anon=f authenticated=f', 'hak EXECUTE RPC penugasan');
    END IF;

    -- Netralkan penugasan asli subtes uji (dibatalkan bersama sub-transaksi).
    PERFORM studio_soal_mulai_rpc();
    DELETE FROM studio_soal_penugasan WHERE subtes_id IN (pu, pk);
    GET DIAGNOSTICS n = ROW_COUNT;
    PERFORM pg_temp.pn_rpc_mati();
    RAISE NOTICE 'DRY-RUN: % baris studio_soal_penugasan asli dinetralkan sementara (dibatalkan di akhir)', n;

    -- ---- Fixture ----
    adm := pg_temp.pn_buat_user('adm');
    INSERT INTO user_roles (user_id, role_type, status) VALUES (adm, 'admin', 'active');
    m1 := pg_temp.pn_buat_user('m1');  PERFORM pg_temp.pn_jadikan_mentor(m1, 'active', ARRAY[pu]);
    m2 := pg_temp.pn_buat_user('m2');  PERFORM pg_temp.pn_jadikan_mentor(m2, 'active', ARRAY[]::UUID[]);
    m3 := pg_temp.pn_buat_user('m3');  PERFORM pg_temp.pn_jadikan_mentor(m3, 'active', ARRAY[pu]);
    mp := pg_temp.pn_buat_user('mp');  PERFORM pg_temp.pn_jadikan_mentor(mp, 'pending', ARRAY[pu]);
    SELECT count(*) INTO n_profil FROM mentor_subtes_diampu;

    -- ---- 1. Profil mengajar TIDAK memberi hak ----
    PERFORM pg_temp.pn_cek(format('m1=%s m3=%s jumlah=%s', studio_soal_mentor_eligible(m1, pu),
                               studio_soal_mentor_eligible(m3, pu), studio_soal_hitung_peninjau_eligible(pu, NULL)),
        'm1=f m3=f jumlah=0', 'mentor dengan mentor_subtes_diampu PU tapi belum ditugaskan');
    PERFORM pg_temp.pn_harus_gagal(format('SELECT pg_temp.pn_buat_pg(%L::uuid, %L::uuid)', m1, pu),
        'mentor belum ditugaskan membuat soal PU');

    -- ---- 2. Tulis langsung (tanpa RPC) ditolak ----
    PERFORM pg_temp.pn_rpc_mati();
    PERFORM pg_temp.pn_harus_gagal(format(
        'INSERT INTO studio_soal_penugasan (mentor_id, subtes_id, ditugaskan_oleh) VALUES (%L, %L, %L)', m1, pu, adm),
        'INSERT studio_soal_penugasan langsung');
    PERFORM pg_temp.pn_harus_gagal(format(
        'INSERT INTO studio_soal_penugasan_log (admin_id, mentor_id, subtes_id, aksi) VALUES (%L, %L, %L, ''tugaskan'')', adm, m1, pu),
        'INSERT log langsung');

    -- ---- 3. Penolakan RPC (tanpa perubahan, tanpa log) ----
    r := studio_soal_atur_penugasan(m1, m1, pu, 'tugaskan');
    PERFORM pg_temp.pn_status_rpc(r, 'bukan_admin', 'mentor (bukan Admin) menugaskan dirinya');
    r := studio_soal_atur_penugasan(adm, m1, pu, 'hapus');
    PERFORM pg_temp.pn_status_rpc(r, 'input_tidak_valid', 'aksi tidak dikenal');
    r := studio_soal_atur_penugasan(adm, NULL, pu, 'tugaskan');
    PERFORM pg_temp.pn_status_rpc(r, 'input_tidak_valid', 'mentor NULL');
    r := studio_soal_atur_penugasan(adm, m1, mtk, 'tugaskan');
    PERFORM pg_temp.pn_status_rpc(r, 'subtes_tidak_valid', 'subtes TKA (bukan SNBT)');
    r := studio_soal_atur_penugasan(adm, mp, pu, 'tugaskan');
    PERFORM pg_temp.pn_status_rpc(r, 'bukan_mentor_aktif', 'mentor pending');
    r := studio_soal_atur_penugasan(adm, adm, pu, 'tugaskan');
    PERFORM pg_temp.pn_status_rpc(r, 'bukan_mentor_aktif', 'akun tanpa role mentor');
    PERFORM pg_temp.pn_cek((SELECT count(*)::text FROM studio_soal_penugasan WHERE mentor_id IN (m1, mp, adm)),
        '0', 'penugasan setelah semua penolakan');
    PERFORM pg_temp.pn_cek((SELECT count(*)::text FROM studio_soal_penugasan_log WHERE mentor_id IN (m1, mp, adm)),
        '0', 'log setelah semua penolakan');

    -- ---- 4. Tugaskan + idempotent ----
    r := studio_soal_atur_penugasan(adm, m1, pu, 'tugaskan');
    PERFORM pg_temp.pn_status_rpc(r, 'ditugaskan', 'tugaskan m1 ke PU');
    PERFORM pg_temp.pn_cek(r->>'jumlah_mentor_eligible', '1', 'jumlah mentor eligible PU setelah m1');
    PERFORM pg_temp.pn_cek(studio_soal_mentor_eligible(m1, pu)::text, 'true', 'm1 eligible PU');
    SELECT * INTO v_log FROM studio_soal_penugasan_log WHERE mentor_id = m1 AND subtes_id = pu;
    PERFORM pg_temp.pn_cek(format('admin=%s aksi=%s waktu=%s', v_log.admin_id = adm, v_log.aksi, v_log.created_at IS NOT NULL),
        'admin=t aksi=tugaskan waktu=t', 'isi log tugaskan (siapa, aksi, kapan)');
    PERFORM pg_temp.pn_cek((SELECT format('%s|%s', ditugaskan_oleh = adm, ditugaskan_pada IS NOT NULL)
                         FROM studio_soal_penugasan WHERE mentor_id = m1 AND subtes_id = pu),
        't|t', 'kolom ditugaskan_oleh/ditugaskan_pada');

    r := studio_soal_atur_penugasan(adm, m1, pu, 'tugaskan');
    PERFORM pg_temp.pn_status_rpc(r, 'sudah_ditugaskan', 'tugaskan ganda yang sama');
    PERFORM pg_temp.pn_cek((SELECT count(*)::text FROM studio_soal_penugasan WHERE mentor_id = m1 AND subtes_id = pu),
        '1', 'baris penugasan m1-PU setelah tugaskan ganda');
    PERFORM pg_temp.pn_cek(pg_temp.pn_jumlah_log(m1, pu), '1', 'log m1-PU setelah tugaskan ganda');

    -- Satu mentor banyak subtes, satu subtes banyak mentor.
    r := studio_soal_atur_penugasan(adm, m1, pk, 'tugaskan');
    PERFORM pg_temp.pn_status_rpc(r, 'ditugaskan', 'tugaskan m1 ke PK');
    r := studio_soal_atur_penugasan(adm, m2, pu, 'tugaskan');
    PERFORM pg_temp.pn_status_rpc(r, 'ditugaskan', 'tugaskan m2 ke PU');
    PERFORM pg_temp.pn_cek(format('PU=%s PK=%s', studio_soal_hitung_peninjau_eligible(pu, NULL),
                               studio_soal_hitung_peninjau_eligible(pk, NULL)),
        'PU=2 PK=1', 'jumlah mentor eligible per subtes');

    -- ---- 5. Aturan lama tetap berlaku lewat sumber baru ----
    s1 := pg_temp.pn_buat_pg(m1, pu);
    r := studio_soal_ajukan_soal(s1, m1);
    PERFORM pg_temp.pn_status_rpc(r, 'diajukan', 'm1 mengajukan soal PU');
    PERFORM pg_temp.pn_cek(r->>'jumlah_peninjau_eligible', '1', 'peninjau eligible PU selain penulis m1');
    r := studio_soal_tinjau('soal', s1, m1, 'mentor', 'setujui', NULL);
    PERFORM pg_temp.pn_status_rpc(r, 'tinjau_sendiri', 'penulis meninjau soalnya sendiri');
    r := studio_soal_tinjau('soal', s1, m3, 'mentor', 'setujui', NULL);
    PERFORM pg_temp.pn_status_rpc(r, 'tidak_eligible', 'm3 (hanya profil mengajar PU) meninjau');
    r := studio_soal_publikasi_admin('soal', s1, adm, 'Tidak ada peninjau lain untuk subtes ini.');
    PERFORM pg_temp.pn_status_rpc(r, 'masih_ada_peninjau', 'Admin publikasi saat m2 masih eligible');

    s2 := pg_temp.pn_buat_pg(m2, pu);                       -- draf m2
    s3 := pg_temp.pn_buat_pg(m2, pu);
    r := studio_soal_ajukan_soal(s3, m2);
    PERFORM pg_temp.pn_status_rpc(r, 'diajukan', 'm2 mengajukan s3');
    SELECT to_jsonb(b) INTO snap2 FROM soal_bank b WHERE id = s2;
    SELECT to_jsonb(b) INTO snap3 FROM soal_bank b WHERE id = s3;

    -- ---- 6. Cabut: soal tetap ada & tidak berubah ----
    r := studio_soal_atur_penugasan(adm, m2, pu, 'cabut');
    PERFORM pg_temp.pn_status_rpc(r, 'dicabut', 'cabut m2 dari PU');
    PERFORM pg_temp.pn_cek(r->>'jumlah_mentor_eligible', '1', 'jumlah mentor eligible PU setelah cabut');
    PERFORM pg_temp.pn_cek((SELECT count(*)::text FROM studio_soal_penugasan_log
                         WHERE mentor_id = m2 AND subtes_id = pu AND aksi = 'cabut' AND admin_id = adm),
        '1', 'log cabut (admin, mentor, subtes, aksi)');
    PERFORM pg_temp.pn_cek(pg_temp.pn_jumlah_log(m2, pu), '2', 'log m2-PU (tugaskan + cabut)');
    PERFORM pg_temp.pn_cek(studio_soal_mentor_eligible(m2, pu)::text, 'false', 'm2 tidak eligible setelah dicabut');
    PERFORM pg_temp.pn_cek((SELECT to_jsonb(b) FROM soal_bank b WHERE id = s2)::text, snap2::text, 'draf s2 tidak berubah setelah cabut');
    PERFORM pg_temp.pn_cek((SELECT to_jsonb(b) FROM soal_bank b WHERE id = s3)::text, snap3::text, 'soal diajukan s3 tidak berubah setelah cabut');
    PERFORM pg_temp.pn_cek(format('s2=%s s3=%s jumlah=%s',
            (SELECT status FROM soal_bank WHERE id = s2), (SELECT status FROM soal_bank WHERE id = s3),
            (SELECT count(*) FROM soal_bank WHERE penulis_id = m2)),
        's2=draf s3=diajukan jumlah=2', 'soal m2 tetap ada dengan status semula');

    r := studio_soal_atur_penugasan(adm, m2, pu, 'cabut');
    PERFORM pg_temp.pn_status_rpc(r, 'tidak_ditugaskan', 'cabut ganda');
    PERFORM pg_temp.pn_cek(pg_temp.pn_jumlah_log(m2, pu), '2', 'log m2-PU setelah cabut ganda');

    r := studio_soal_ajukan_soal(s2, m2);
    PERFORM pg_temp.pn_status_rpc(r, 'tidak_eligible', 'm2 (dicabut) mengajukan drafnya');
    PERFORM pg_temp.pn_cek((SELECT status FROM soal_bank WHERE id = s2), 'draf', 'draf s2 tetap draf');

    -- Publikasi Admin hanya bila 0 mentor eligible selain penulis.
    r := studio_soal_publikasi_admin('soal', s1, adm, 'Tidak ada peninjau lain untuk subtes ini.');
    PERFORM pg_temp.pn_status_rpc(r, 'terpublikasi', 'Admin publikasi s1 (satu-satunya mentor PU = penulis)');
    r := studio_soal_publikasi_admin('soal', s3, adm, 'Tidak ada peninjau lain untuk subtes ini.');
    PERFORM pg_temp.pn_status_rpc(r, 'masih_ada_peninjau', 'Admin publikasi s3 saat m1 eligible');
    r := studio_soal_tinjau('soal', s3, m1, 'mentor', 'setujui', NULL);
    PERFORM pg_temp.pn_status_rpc(r, 'terpublikasi', 'm1 meninjau soal m2 (penulis yang sudah dicabut)');

    -- ---- 7. Mentor nonaktif ----
    UPDATE user_roles SET status = 'pending' WHERE user_id = m1 AND role_type = 'mentor';
    PERFORM pg_temp.pn_cek(format('eligible=%s jumlah=%s', studio_soal_mentor_eligible(m1, pu),
                               studio_soal_hitung_peninjau_eligible(pu, NULL)),
        'eligible=f jumlah=0', 'mentor pending yang masih punya baris penugasan');
    r := studio_soal_atur_penugasan(adm, m1, pk, 'cabut');
    PERFORM pg_temp.pn_status_rpc(r, 'dicabut', 'cabut penugasan mentor nonaktif tetap boleh');
    UPDATE user_roles SET status = 'active' WHERE user_id = m1 AND role_type = 'mentor';

    -- ---- 8. Tabel terkunci ----
    PERFORM studio_soal_mulai_rpc();
    PERFORM pg_temp.pn_harus_gagal(format(
        'UPDATE studio_soal_penugasan SET ditugaskan_oleh = %L WHERE mentor_id = %L', m1, m1), 'UPDATE penugasan');
    PERFORM pg_temp.pn_harus_gagal(format(
        'UPDATE studio_soal_penugasan_log SET aksi = ''cabut'' WHERE mentor_id = %L', m1), 'UPDATE log');
    PERFORM pg_temp.pn_harus_gagal(format(
        'DELETE FROM studio_soal_penugasan_log WHERE mentor_id = %L', m1), 'DELETE log');
    PERFORM pg_temp.pn_rpc_mati();
    PERFORM pg_temp.pn_harus_gagal(format(
        'DELETE FROM studio_soal_penugasan WHERE mentor_id = %L', m1), 'DELETE penugasan tanpa RPC');

    -- ---- 9. Profil mengajar tidak disentuh ----
    PERFORM pg_temp.pn_cek((SELECT count(*) FROM mentor_subtes_diampu)::text, n_profil::text,
        'jumlah baris mentor_subtes_diampu sebelum vs sesudah semua aksi penugasan');

    RAISE EXCEPTION USING ERRCODE = 'SPDR0', MESSAGE = 'dry-run selesai, batalkan semua perubahan';
  EXCEPTION WHEN SQLSTATE 'SPDR0' THEN
    RAISE NOTICE 'STUDIO SOAL PENUGASAN DRY-RUN [v1]: SEMUA SKENARIO LULUS';
  END;

  IF EXISTS (SELECT 1 FROM users WHERE email LIKE 'dryrun-penugasan-%@example.invalid') THEN
    RAISE EXCEPTION 'DRY-RUN GAGAL [v1]: akun tiruan masih tersisa setelah sub-transaksi dibatalkan';
  END IF;
END $$;
