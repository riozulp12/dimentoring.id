-- Skenario uji DRY-RUN untuk db/add_studio_soal.sql. Aman dijalankan di
-- database yang SUDAH berisi data asli (termasuk produksi).
--
-- Cara pakai (SQL Editor Supabase, satu kali eksekusi):
--     BEGIN;
--     <isi db/add_studio_soal.sql>   -- lewati kalau migrasi sudah dijalankan
--     <isi file ini>
--     ROLLBACK;
--
-- Hasil yang diharapkan: NOTICE "STUDIO SOAL DRY-RUN: SEMUA SKENARIO LULUS".
-- Satu skenario gagal = RAISE EXCEPTION "DRY-RUN GAGAL: ..." dan seluruh
-- transaksi batal.
--
-- TIDAK ADA TULISAN PERMANEN KE DATA ASLI — dua lapis pengaman:
--   1. Seluruh skenario berjalan di dalam blok BEGIN ... EXCEPTION (sub-
--      transaksi) yang SELALU diakhiri RAISE dengan kode 'SSDR0'. Semua
--      perubahan di blok itu dibatalkan Postgres, bahkan kalau BEGIN/ROLLBACK
--      di luar lupa ditulis. Hanya fungsi pg_temp.* yang tersisa, dan itu
--      hilang sendiri saat sesi ditutup.
--   2. BEGIN/ROLLBACK di luar tetap dianjurkan sebagai lapis kedua.
--
-- Tahan terhadap data asli:
--   * Mentor asli yang mengampu subtes uji (PU, PK, Matematika) DINETRALKAN
--     sementara: baris mentor_subtes_diampu mereka untuk subtes itu dihapus
--     di dalam sub-transaksi (ikut dibatalkan). Bila db/add_studio_soal_penugasan.sql
--     sudah dijalankan (revisi K2), baris studio_soal_penugasan untuk subtes uji
--     juga dinetralkan dan mentor tiruan ditugaskan di kedua tabel — berkas ini
--     berlaku sebelum maupun sesudah migrasi penugasan. Tabel ini tabel ujung (tidak
--     dirujuk tabel lain), jadi tidak ada efek berantai. Dengan begitu semua
--     hitungan peninjau eligible pasti (m1/m2/m3 tiruan saja), termasuk batas
--     publikasi Admin "0 peninjau eligible".
--   * Subtes dicari berdasarkan nama + kategori dan wajib tepat satu baris.
--   * Akun tiruan: email unik acak di domain .invalid, no_wa NULL (tidak bisa
--     bentrok dengan nomor asli). Semua pengecekan memakai id baris tiruan,
--     bukan jumlah baris tabel.
--
-- Setiap pesan gagal diawali penanda versi berkas, mis. "DRY-RUN GAGAL [v5]".
-- Kalau penanda itu tidak muncul, yang dijalankan adalah salinan berkas lama.
-- Pesan pg_temp.cek selalu memuat nilai sebenarnya ("diharapkan X, dapat Y").
--
-- Butuh subtes 'Penalaran Umum', 'Pengetahuan Kuantitatif' (tps) dan
-- 'Matematika' (tka_wajib) di tabel subtes (db/seed_subtes.sql).

-- Bandingkan nilai sebenarnya (p_dapat) dengan harapan, keduanya teks.
-- Pesan gagal selalu memuat keduanya supaya error langsung informatif.
CREATE FUNCTION pg_temp.cek(p_dapat TEXT, p_harap TEXT, p_pesan TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    IF p_dapat IS DISTINCT FROM p_harap THEN
        RAISE EXCEPTION 'DRY-RUN GAGAL [v5]: % — diharapkan %, dapat %',
            p_pesan, coalesce(p_harap, '<NULL>'), coalesce(p_dapat, '<NULL>');
    END IF;
END $$;

-- Daftar mentor eligible untuk subtes (kecuali p_kecuali), untuk pesan gagal.
-- Akun tiruan tampil dengan namanya (DRYRUN m1/m2/...); akun asli hanya
-- sebagai "asli:<user_id>" supaya nama orang tidak ikut tercetak.
CREATE FUNCTION pg_temp.daftar_eligible(p_subtes UUID, p_kecuali UUID[]) RETURNS TEXT LANGUAGE sql AS $$
    SELECT coalesce(string_agg(DISTINCT CASE WHEN u.nama LIKE 'DRYRUN %' THEN u.nama
                                             ELSE 'asli:' || u.id::text END, ', '), '(kosong)')
    FROM user_roles ur
    JOIN users u ON u.id = ur.user_id
    WHERE ur.role_type = 'mentor' AND ur.status = 'active'
      AND studio_soal_mentor_eligible(ur.user_id, p_subtes)
      AND NOT (ur.user_id = ANY (coalesce(p_kecuali, ARRAY[]::UUID[])));
$$;

-- p_sql harus GAGAL (exception). Perubahannya dibatalkan (subtransaksi).
CREATE FUNCTION pg_temp.harus_gagal(p_sql TEXT, p_pesan TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    v_gagal BOOLEAN := false;
BEGIN
    BEGIN
        EXECUTE p_sql;
    EXCEPTION WHEN OTHERS THEN
        v_gagal := true;
    END;
    IF NOT v_gagal THEN
        RAISE EXCEPTION 'DRY-RUN GAGAL [v5]: seharusnya ditolak — %', p_pesan;
    END IF;
END $$;

CREATE FUNCTION pg_temp.status_rpc(p_hasil JSONB, p_harapan TEXT, p_pesan TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    IF p_hasil->>'status' IS DISTINCT FROM p_harapan THEN
        RAISE EXCEPTION 'DRY-RUN GAGAL [v5]: % — diharapkan status %, dapat %', p_pesan, p_harapan, p_hasil;
    END IF;
END $$;

-- Matikan penanda RPC (supaya uji "UPDATE langsung ditolak" bermakna setelah
-- RPC sebelumnya menyalakannya untuk sisa transaksi).
CREATE FUNCTION pg_temp.matikan_rpc() RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    PERFORM set_config('studio_soal.rpc', 'off', true);
END $$;

CREATE FUNCTION pg_temp.buat_user(p_kode TEXT) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
    v_id UUID;
BEGIN
    -- Email diberi akhiran acak supaya tidak bentrok dengan baris mana pun;
    -- no_wa NULL (kolom nullable) supaya tidak mungkin bentrok dengan nomor asli.
    INSERT INTO users (nama, email, no_wa, password_hash)
    VALUES ('DRYRUN ' || p_kode,
            'dryrun-studio-' || p_kode || '-' || replace(gen_random_uuid()::text, '-', '') || '@example.invalid',
            NULL, 'x')
    RETURNING id INTO v_id;
    RETURN v_id;
END $$;

CREATE FUNCTION pg_temp.jadikan_mentor(p_user UUID, p_subtes UUID[]) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    v_profil UUID;
BEGIN
    INSERT INTO user_roles (user_id, role_type, status) VALUES (p_user, 'mentor', 'active');
    INSERT INTO mentor_profiles (user_id, asal_ptn, semester, jurusan)
    VALUES (p_user, 'DRYRUN', 1, 'DRYRUN') RETURNING id INTO v_profil;
    INSERT INTO mentor_subtes_diampu (mentor_profile_id, subtes_id)
    SELECT v_profil, s FROM unnest(p_subtes) AS s;
    -- Sesudah revisi K2: hak menulis/meninjau = studio_soal_penugasan. Ditulis
    -- langsung (bukan lewat RPC Admin) karena fixture memakai subtes TKA juga;
    -- RPC penugasan diuji terpisah di db/test_studio_soal_penugasan_DRYRUN.sql.
    IF to_regclass('public.studio_soal_penugasan') IS NOT NULL THEN
        PERFORM studio_soal_mulai_rpc();
        EXECUTE 'INSERT INTO studio_soal_penugasan (mentor_id, subtes_id, ditugaskan_oleh)
                 SELECT $1, s, $1 FROM unnest($2) AS s'
            USING p_user, p_subtes;
        PERFORM set_config('studio_soal.rpc', 'off', true);
    END IF;
END $$;

CREATE FUNCTION pg_temp.buat_pg(p_penulis UUID, p_subtes UUID, p_stimulus UUID, p_urutan SMALLINT)
RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO soal_bank (subtes_id, stimulus_id, urutan_dalam_stimulus, tipe, redaksi, konten, kunci,
                           pembahasan, tingkat_kesulitan, penulis_id)
    VALUES (p_subtes, p_stimulus, p_urutan, 'pilihan_ganda', 'Berapakah \(2+3\)?',
            '{"v":1,"opsi":[{"label":"A","teks":"3"},{"label":"B","teks":"4"},{"label":"C","teks":"5"},{"label":"D","teks":"6"},{"label":"E","teks":"7"}]}',
            '{"v":1,"opsi":"C"}', 'Dua ditambah tiga sama dengan lima.', 'mudah', p_penulis)
    RETURNING id INTO v_id;
    RETURN v_id;
END $$;

DO $$
DECLARE
    pu UUID; pk UUID; mtk UUID;
    m1 UUID; m2 UUID; m3 UUID; adm UUID;
    r JSONB;
    s1 UUID; s2 UUID; s3 UUID; s_kurang UUID; s_m2 UUID; s_pk UUID; s_baru UUID; s_hapus UUID;
    st UUID; g1 UUID; g2 UUID; g3 UUID;
    pk1 UUID; pk2 UUID; pk3 UUID; s_p2 UUID; s_p3 UUID;
    n_netral INT;
BEGIN
  -- Sub-transaksi: SELALU dibatalkan oleh RAISE 'SSDR0' di akhir (lihat header).
  BEGIN
    PERFORM pg_temp.cek(format('PU=%s PK=%s MTK=%s',
            (SELECT count(*) FROM subtes WHERE nama = 'Penalaran Umum' AND kategori = 'tps'),
            (SELECT count(*) FROM subtes WHERE nama = 'Pengetahuan Kuantitatif' AND kategori = 'tps'),
            (SELECT count(*) FROM subtes WHERE nama = 'Matematika' AND kategori = 'tka_wajib')),
        'PU=1 PK=1 MTK=1', 'jumlah baris subtes referensi (nama + kategori)');
    SELECT id INTO pu FROM subtes WHERE nama = 'Penalaran Umum' AND kategori = 'tps';
    SELECT id INTO pk FROM subtes WHERE nama = 'Pengetahuan Kuantitatif' AND kategori = 'tps';
    SELECT id INTO mtk FROM subtes WHERE nama = 'Matematika' AND kategori = 'tka_wajib';

    -- Netralkan mentor asli untuk subtes uji (dibatalkan bersama sub-transaksi).
    DELETE FROM mentor_subtes_diampu WHERE subtes_id IN (pu, pk, mtk);
    GET DIAGNOSTICS n_netral = ROW_COUNT;
    RAISE NOTICE 'DRY-RUN: % baris mentor_subtes_diampu asli dinetralkan sementara (dibatalkan di akhir)', n_netral;
    IF to_regclass('public.studio_soal_penugasan') IS NOT NULL THEN
        PERFORM studio_soal_mulai_rpc();
        EXECUTE 'DELETE FROM studio_soal_penugasan WHERE subtes_id = ANY ($1)' USING ARRAY[pu, pk, mtk];
        GET DIAGNOSTICS n_netral = ROW_COUNT;
        PERFORM set_config('studio_soal.rpc', 'off', true);
        RAISE NOTICE 'DRY-RUN: % baris studio_soal_penugasan asli dinetralkan sementara (dibatalkan di akhir)', n_netral;
    END IF;
    PERFORM pg_temp.cek(format('PU=%s PK=%s', studio_soal_hitung_peninjau_eligible(pu, NULL),
                               studio_soal_hitung_peninjau_eligible(pk, NULL)),
        'PU=0 PK=0', format('mentor asli eligible setelah dinetralkan (PU: %s; PK: %s)',
                            pg_temp.daftar_eligible(pu, NULL), pg_temp.daftar_eligible(pk, NULL)));

    m1 := pg_temp.buat_user('m1');  PERFORM pg_temp.jadikan_mentor(m1, ARRAY[pu]);
    m2 := pg_temp.buat_user('m2');  PERFORM pg_temp.jadikan_mentor(m2, ARRAY[pu, mtk]);
    m3 := pg_temp.buat_user('m3');  PERFORM pg_temp.jadikan_mentor(m3, ARRAY[pk]);
    adm := pg_temp.buat_user('adm');
    INSERT INTO user_roles (user_id, role_type, status) VALUES (adm, 'admin', 'active');

    -- Fixture sesuai syarat studio_soal_mentor_eligible (role mentor active +
    -- penugasan subtes persis: mentor_subtes_diampu sebelum revisi K2,
    -- studio_soal_penugasan sesudahnya). Dicek di sini supaya
    -- salah fixture langsung terlihat, bukan baru di langkah ajukan.
    PERFORM pg_temp.cek(format('m1=%s m2=%s m3=%s',
            studio_soal_mentor_eligible(m1, pu), studio_soal_mentor_eligible(m2, pu),
            studio_soal_mentor_eligible(m3, pu)),
        'm1=t m2=t m3=f', 'kelayakan fixture untuk PU');
    PERFORM pg_temp.cek(studio_soal_hitung_peninjau_eligible(pu, ARRAY[m1])::text, '1',
        format('peninjau eligible PU selain m1 sebelum ajukan (daftar: %s)', pg_temp.daftar_eligible(pu, ARRAY[m1])));

    -- ---- 1. Kelayakan pembuat & subtes SNBT ----
    s1 := pg_temp.buat_pg(m1, pu, NULL, NULL);
    PERFORM pg_temp.harus_gagal(format(
        'SELECT pg_temp.buat_pg(%L::uuid, %L::uuid, NULL, NULL)', m3, pu), 'mentor tanpa subtes PU membuat soal PU');
    PERFORM pg_temp.harus_gagal(format(
        'SELECT pg_temp.buat_pg(%L::uuid, %L::uuid, NULL, NULL)', m2, mtk), 'soal subtes TKA di Tahap 1');
    PERFORM pg_temp.harus_gagal(format(
        'INSERT INTO soal_bank (subtes_id, tipe, penulis_id, status) VALUES (%L, ''isian'', %L, ''terpublikasi'')', pu, m1),
        'insert langsung berstatus terpublikasi');

    -- ---- 2. Status hanya lewat RPC ----
    PERFORM pg_temp.matikan_rpc();
    PERFORM pg_temp.harus_gagal(format(
        'UPDATE soal_bank SET status = ''terpublikasi'', peninjau_id = %L, ditinjau_pada = now() WHERE id = %L', m2, s1),
        'UPDATE status langsung tanpa RPC');
    UPDATE soal_bank SET pembahasan = 'Dua ditambah tiga sama dengan lima (diedit).' WHERE id = s1;  -- edit draf boleh

    -- ---- 3. Ajukan & tinjau ----
    r := studio_soal_ajukan_soal(s1, m2);  PERFORM pg_temp.status_rpc(r, 'bukan_penulis', 'ajukan oleh bukan penulis');
    r := studio_soal_ajukan_soal(s1, m1);  PERFORM pg_temp.status_rpc(r, 'diajukan', 'ajukan oleh penulis');
    PERFORM pg_temp.cek(r->>'jumlah_peninjau_eligible', '1',
        format('peninjau eligible PU selain m1 dari RPC ajukan (daftar: %s)', pg_temp.daftar_eligible(pu, ARRAY[m1])));

    PERFORM pg_temp.matikan_rpc();
    PERFORM pg_temp.harus_gagal(format('UPDATE soal_bank SET redaksi = ''ubah'' WHERE id = %L', s1),
        'edit isi soal yang sedang diajukan');

    r := studio_soal_tinjau('soal', s1, m1, 'mentor', 'setujui', NULL);
    PERFORM pg_temp.status_rpc(r, 'tinjau_sendiri', 'penulis meninjau soalnya sendiri');
    r := studio_soal_tinjau('soal', s1, m3, 'mentor', 'setujui', NULL);
    PERFORM pg_temp.status_rpc(r, 'tidak_eligible', 'mentor beda subtes meninjau');
    r := studio_soal_tinjau('soal', s1, m2, 'mentor', 'tolak', '123456789');
    PERFORM pg_temp.status_rpc(r, 'alasan_kurang', 'alasan tolak 9 karakter');
    r := studio_soal_tinjau('soal', s1, m2, 'mentor', 'tolak', '   1234567890   ');
    PERFORM pg_temp.status_rpc(r, 'ditolak', 'tolak dengan alasan 10 karakter');
    PERFORM pg_temp.cek((SELECT format('%s/%s', status, coalesce(alasan_tolak, '<NULL>')) FROM soal_bank WHERE id = s1),
        'ditolak/1234567890', 'status & alasan tolak tersimpan (trim)');

    PERFORM pg_temp.matikan_rpc();
    UPDATE soal_bank SET redaksi = 'Berapakah \(2+3\)? (revisi)' WHERE id = s1;  -- edit soal ditolak boleh
    r := studio_soal_ajukan_soal(s1, m1);  PERFORM pg_temp.status_rpc(r, 'diajukan', 'ajukan ulang setelah ditolak');
    r := studio_soal_tinjau('soal', s1, m2, 'mentor', 'setujui', NULL);
    PERFORM pg_temp.status_rpc(r, 'terpublikasi', 'peninjau sejawat menyetujui');
    PERFORM pg_temp.cek((SELECT format('%s/%s', status, CASE WHEN peninjau_id = m2 THEN 'm2'
                                                              ELSE coalesce(peninjau_id::text, '<NULL>') END)
                         FROM soal_bank WHERE id = s1),
        'terpublikasi/m2', 'soal terbit dengan peninjau m2');

    PERFORM pg_temp.matikan_rpc();
    PERFORM pg_temp.harus_gagal(format('UPDATE soal_bank SET redaksi = ''ubah'' WHERE id = %L', s1),
        'edit isi soal terbit');
    PERFORM pg_temp.harus_gagal(format('DELETE FROM soal_bank WHERE id = %L', s1), 'hapus soal terbit');

    -- ---- 4. Kelengkapan dicek saat diajukan (CHECK) ----
    s_kurang := pg_temp.buat_pg(m1, pu, NULL, NULL);
    PERFORM pg_temp.matikan_rpc();
    UPDATE soal_bank SET konten = '{"v":1,"opsi":[{"label":"A","teks":"1"},{"label":"B","teks":"2"},{"label":"C","teks":"3"},{"label":"D","teks":"4"}]}'
    WHERE id = s_kurang;  -- draf boleh belum lengkap
    PERFORM pg_temp.harus_gagal(format('SELECT studio_soal_ajukan_soal(%L, %L)', s_kurang, m1),
        'ajukan PG dengan 4 opsi');

    -- ---- 5. Publikasi Admin ----
    s2 := pg_temp.buat_pg(m1, pu, NULL, NULL);
    r := studio_soal_ajukan_soal(s2, m1);
    r := studio_soal_tinjau('soal', s2, adm, 'admin', 'setujui', NULL);
    PERFORM pg_temp.status_rpc(r, 'admin_pakai_publikasi_admin', 'admin setujui lewat jalur tinjau');
    r := studio_soal_publikasi_admin('soal', s2, adm, 'Tidak ada peninjau');
    PERFORM pg_temp.status_rpc(r, 'masih_ada_peninjau', 'admin publikasi saat m2 masih eligible');
    r := studio_soal_publikasi_admin('soal', s2, m2, 'Tidak ada peninjau lain');
    PERFORM pg_temp.status_rpc(r, 'bukan_admin', 'mentor memakai jalur admin');

    UPDATE user_roles SET status = 'pending' WHERE user_id = m2 AND role_type = 'mentor';
    r := studio_soal_publikasi_admin('soal', s2, adm, 'pendek');
    PERFORM pg_temp.status_rpc(r, 'alasan_kurang', 'publikasi admin dengan alasan pendek');
    r := studio_soal_publikasi_admin('soal', s2, adm, 'Tidak ada mentor PU lain yang aktif');
    PERFORM pg_temp.status_rpc(r, 'terpublikasi', 'publikasi admin saat 0 peninjau eligible');
    PERFORM pg_temp.cek((SELECT string_agg(format('eligible=%s aktor=%s', coalesce(jumlah_peninjau_eligible::text, '<NULL>'),
                                                  CASE WHEN aktor_id = adm THEN 'adm' ELSE aktor_id::text END), '; ')
                         FROM soal_tinjauan_log WHERE objek_id = s2 AND aksi = 'publikasi_admin'),
        'eligible=0 aktor=adm', 'log publikasi admin (satu baris)');
    UPDATE user_roles SET status = 'active' WHERE user_id = m2 AND role_type = 'mentor';

    -- Admin boleh menolak kapan saja (dengan alasan).
    s3 := pg_temp.buat_pg(m1, pu, NULL, NULL);
    r := studio_soal_ajukan_soal(s3, m1);
    r := studio_soal_tinjau('soal', s3, adm, 'admin', 'tolak', 'Kunci jawaban keliru.');
    PERFORM pg_temp.status_rpc(r, 'ditolak', 'admin menolak');

    -- ---- 6. Stimulus: satu kesatuan, satu penulis ----
    INSERT INTO soal_stimulus (subtes_id, judul_internal, konten, sumber_rujukan, penulis_id)
    VALUES (pu, 'Bacaan uji', '{"v":1,"blok":[{"jenis":"teks","teks":"Paragraf bacaan."}]}', 'Buatan sendiri', m1)
    RETURNING id INTO st;
    g1 := pg_temp.buat_pg(m1, pu, st, 1::smallint);
    INSERT INTO soal_bank (subtes_id, stimulus_id, urutan_dalam_stimulus, tipe, redaksi, konten, kunci, pembahasan, penulis_id)
    VALUES (pu, st, 2, 'majemuk_kompleks', 'Tentukan benar/salah.',
            '{"v":1,"label_kolom":["Benar","Salah"],"pernyataan":[{"id":"p1","teks":"A"},{"id":"p2","teks":"B"}]}',
            '{"v":1,"per_baris":{"p1":0,"p2":1}}', 'Pernyataan A benar, B salah.', m1)
    RETURNING id INTO g2;
    INSERT INTO soal_bank (subtes_id, stimulus_id, urutan_dalam_stimulus, tipe, redaksi, konten, kunci, pembahasan, penulis_id)
    VALUES (pu, st, 3, 'isian', 'Tiga tambah empat sama dengan {{r1}}.',
            '{"v":1,"rumpang":[{"id":"r1","jenis":"angka"}]}',
            '{"v":1,"rumpang":{"r1":{"diterima":["7"]}}}', 'Tiga tambah empat adalah tujuh.', m1)
    RETURNING id INTO g3;
    PERFORM pg_temp.harus_gagal(format('SELECT pg_temp.buat_pg(%L::uuid, %L::uuid, %L::uuid, 4::smallint)', m2, pu, st),
        'mentor lain menambah soal ke stimulus orang lain');

    r := studio_soal_ajukan_soal(g1, m1);
    PERFORM pg_temp.status_rpc(r, 'ajukan_lewat_stimulus', 'soal di stimulus draf diajukan sendiri');
    r := studio_soal_ajukan_stimulus(st, m1);
    PERFORM pg_temp.status_rpc(r, 'diajukan', 'ajukan kelompok stimulus');
    PERFORM pg_temp.cek(r->>'jumlah_soal', '3', 'jumlah soal dalam kelompok stimulus');
    PERFORM pg_temp.harus_gagal(format('SELECT pg_temp.buat_pg(%L::uuid, %L::uuid, %L::uuid, 4::smallint)', m1, pu, st),
        'menambah soal ke stimulus yang sedang ditinjau');
    r := studio_soal_tinjau('soal', g1, m2, 'mentor', 'setujui', NULL);
    PERFORM pg_temp.status_rpc(r, 'tinjau_sebagai_kelompok', 'soal kelompok ditinjau sendiri');
    r := studio_soal_tinjau('stimulus', st, m2, 'mentor', 'setujui', NULL);
    PERFORM pg_temp.status_rpc(r, 'terpublikasi', 'kelompok stimulus disetujui');
    PERFORM pg_temp.cek(format('stimulus=%s soal_terbit=%s',
            (SELECT status FROM soal_stimulus WHERE id = st),
            (SELECT count(*) FROM soal_bank WHERE stimulus_id = st AND status = 'terpublikasi')),
        'stimulus=terpublikasi soal_terbit=3', 'stimulus + 3 soal terbit');

    -- ---- 7. Versi baru (hanya penulis, satu versi terbuka) ----
    r := studio_soal_buat_versi_soal(s1, m2);  PERFORM pg_temp.status_rpc(r, 'bukan_penulis', 'versi baru oleh bukan penulis');
    r := studio_soal_buat_versi_soal(s1, m1);  PERFORM pg_temp.status_rpc(r, 'versi_dibuat', 'versi baru oleh penulis');
    s_baru := (r->>'soal_id')::uuid;
    r := studio_soal_buat_versi_soal(s1, m1);  PERFORM pg_temp.status_rpc(r, 'ada_versi_terbuka', 'versi kedua saat ada versi terbuka');
    PERFORM pg_temp.cek((SELECT format('versi=%s menggantikan=%s', versi,
                                CASE WHEN menggantikan_id = s1 THEN 's1' ELSE coalesce(menggantikan_id::text, '<NULL>') END)
                         FROM soal_bank WHERE id = s_baru),
        'versi=2 menggantikan=s1', 'versi 2 menunjuk versi 1');
    r := studio_soal_ajukan_soal(s_baru, m1);
    r := studio_soal_tinjau('soal', s_baru, m2, 'mentor', 'setujui', NULL);
    PERFORM pg_temp.status_rpc(r, 'terpublikasi', 'versi baru disetujui');
    PERFORM pg_temp.cek((SELECT status::text FROM soal_bank WHERE id = s1), 'digantikan', 'status versi lama');

    -- ---- 8. Paket ----
    s_m2 := pg_temp.buat_pg(m2, pu, NULL, NULL);                -- draf milik m2
    s_pk := pg_temp.buat_pg(m3, pk, NULL, NULL);                -- subtes lain
    INSERT INTO paket_soal (subtes_id, judul, pembuat_id) VALUES (pu, 'Paket uji 1', m1) RETURNING id INTO pk1;

    r := studio_soal_simpan_item_paket(pk1, m1, ARRAY[g1, s_baru, g2]);
    PERFORM pg_temp.status_rpc(r, 'stimulus_tidak_berurutan', 'soal satu stimulus tidak berurutan');
    r := studio_soal_simpan_item_paket(pk1, m1, ARRAY[s_baru, s_m2]);
    PERFORM pg_temp.status_rpc(r, 'soal_tidak_boleh', 'draf milik mentor lain');
    r := studio_soal_simpan_item_paket(pk1, m1, ARRAY[s_baru, s_pk]);
    PERFORM pg_temp.status_rpc(r, 'beda_subtes', 'soal beda subtes');
    r := studio_soal_simpan_item_paket(pk1, m1, ARRAY[s_baru, s_baru]);
    PERFORM pg_temp.status_rpc(r, 'soal_duplikat', 'soal ganda');
    r := studio_soal_simpan_item_paket(pk1, m2, ARRAY[s_baru]);
    PERFORM pg_temp.status_rpc(r, 'bukan_pembuat', 'bukan pembuat paket');
    -- Paket campuran: PG mandiri + kelompok stimulus (PG, majemuk, isian)
    r := studio_soal_simpan_item_paket(pk1, m1, ARRAY[s_baru, g1, g2, g3]);
    PERFORM pg_temp.status_rpc(r, 'disimpan', 'simpan paket campuran');
    r := studio_soal_simpan_item_paket(pk1, m1, ARRAY[g1, g2, g3, s_baru]);
    PERFORM pg_temp.status_rpc(r, 'disimpan', 'atur ulang urutan');
    r := studio_soal_ajukan_paket(pk1, m1);
    PERFORM pg_temp.status_rpc(r, 'terpublikasi', 'paket berisi soal terbit langsung terbit');
    PERFORM pg_temp.harus_gagal(format('INSERT INTO paket_soal_item (paket_id, soal_id, urutan) VALUES (%L, %L, 5)', pk1, s2),
        'ubah isi paket terbit');
    r := studio_soal_arsipkan_soal(s_baru, m1, 'mentor');
    PERFORM pg_temp.status_rpc(r, 'dipakai_paket', 'arsipkan soal yang dipakai paket terbit');

    -- Paket menunggu soal -> terbit otomatis saat soal terakhir disetujui
    s_p2 := pg_temp.buat_pg(m1, pu, NULL, NULL);
    INSERT INTO paket_soal (subtes_id, judul, pembuat_id) VALUES (pu, 'Paket uji 2', m1) RETURNING id INTO pk2;
    r := studio_soal_simpan_item_paket(pk2, m1, ARRAY[s2, s_p2]);
    r := studio_soal_ajukan_paket(pk2, m1);
    PERFORM pg_temp.status_rpc(r, 'menunggu_soal', 'paket dengan draf sendiri menunggu soal');
    PERFORM pg_temp.cek((SELECT status::text FROM soal_bank WHERE id = s_p2), 'diajukan', 'draf di paket ikut diajukan');
    r := studio_soal_tinjau('soal', s_p2, m2, 'mentor', 'setujui', NULL);
    PERFORM pg_temp.cek((SELECT status::text FROM paket_soal WHERE id = pk2), 'terpublikasi', 'paket terbit otomatis');

    -- Paket menunggu soal -> kembali draf bila soalnya ditolak
    s_p3 := pg_temp.buat_pg(m1, pu, NULL, NULL);
    INSERT INTO paket_soal (subtes_id, judul, pembuat_id) VALUES (pu, 'Paket uji 3', m1) RETURNING id INTO pk3;
    r := studio_soal_simpan_item_paket(pk3, m1, ARRAY[s_p3]);
    r := studio_soal_ajukan_paket(pk3, m1);
    r := studio_soal_tinjau('soal', s_p3, m2, 'mentor', 'tolak', 'Pembahasan kurang jelas.');
    PERFORM pg_temp.cek((SELECT status::text FROM paket_soal WHERE id = pk3), 'draf', 'paket kembali draf');

    -- ---- 9. Hapus draf ----
    s_hapus := pg_temp.buat_pg(m1, pu, NULL, NULL);
    DELETE FROM soal_bank WHERE id = s_hapus;                 -- draf belum pernah diajukan: boleh
    PERFORM pg_temp.cek((SELECT count(*) FROM soal_bank WHERE id = s_hapus)::text, '0', 'baris draf tersisa setelah dihapus');
    r := studio_soal_tarik('soal', s3, m1);                   -- s3 berstatus ditolak -> tidak bisa ditarik
    PERFORM pg_temp.status_rpc(r, 'status_tidak_valid', 'tarik soal yang tidak sedang diajukan');
    PERFORM pg_temp.harus_gagal(format('DELETE FROM soal_bank WHERE id = %L', s3), 'hapus soal yang pernah diajukan');

    -- Semua skenario lulus: batalkan seluruh perubahan sub-transaksi.
    RAISE EXCEPTION USING ERRCODE = 'SSDR0', MESSAGE = 'dry-run selesai, batalkan semua perubahan';
  EXCEPTION WHEN SQLSTATE 'SSDR0' THEN
    RAISE NOTICE 'STUDIO SOAL DRY-RUN: SEMUA SKENARIO LULUS';
  END;
END $$;
