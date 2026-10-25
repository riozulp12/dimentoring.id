-- Migration: Studio Soal — simpan & hapus DRAF soal/stimulus lewat RPC (PR 3b,
-- form mentor; desain docs/design/studio-soal-snbt-tahap1.md, BR-37).
--
-- Kenapa: db/add_studio_soal.sql belum punya fungsi untuk MEMBUAT/MENGEDIT/
-- MENGHAPUS draf (rancangan awal: API menulis langsung ke tabel, dijaga
-- trigger). Aturan PR 3b: kode aplikasi TIDAK menulis langsung ke tabel —
-- semua lewat fungsi studio_soal_*. File ini menambah:
--   1. RPC studio_soal_simpan_soal      (buat ATAU ubah draf soal; idempoten per id)
--   2. RPC studio_soal_simpan_stimulus  (buat ATAU ubah draf stimulus; idempoten per id)
--   3. RPC studio_soal_hapus_draf       (hapus draf yang belum pernah diajukan)
--   4. Trigger studio_soal_jaga_penulis_eligible: mengubah ISI soal/stimulus
--      mewajibkan penulisnya MASIH ditugaskan Admin ke subtes itu
--      (studio_soal_penugasan). Sebelumnya kelayakan hanya dicek saat INSERT,
--      jadi mentor yang penugasannya dicabut masih bisa mengedit draf lama.
--   5. Hak EXECUTE (hanya service_role)
--
-- Idempoten "simpan dobel": id baris dibuat di BROWSER (crypto.randomUUID)
-- sekali per form. Klik dua kali / kirim ulang = id sama -> baris kedua tidak
-- dibuat; permintaan berikutnya menjadi UPDATE. INSERT ... ON CONFLICT (id)
-- DO NOTHING menangani dua permintaan yang tiba bersamaan.
--
-- TIDAK mengubah tabel, constraint, atau fungsi yang sudah ada. Butuh
-- db/add_studio_soal.sql dan db/add_studio_soal_penugasan.sql sudah dijalankan.
-- Menjalankan ulang kedua file itu SESUDAH file ini aman (fungsi & trigger di
-- sini bernama lain, tidak tertimpa).
--
-- Idempotent: CREATE OR REPLACE FUNCTION, DROP TRIGGER IF EXISTS sebelum CREATE.
--
-- ============================================================================
-- CARA DRY-RUN (SQL Editor Supabase, satu kali eksekusi)
-- ============================================================================
--     BEGIN;
--     <isi file ini>
--     <isi file ini SEKALI LAGI>          -- bukti idempotent
--     <isi db/test_studio_soal_draf_DRYRUN.sql>
--     ROLLBACK;
--   Harus selesai tanpa error, NOTICE "STUDIO SOAL DRAF DRY-RUN [v1]: SEMUA
--   SKENARIO LULUS". Gagal = pesan "DRY-RUN GAGAL [v1]: ...".
--
-- CARA JALAN SUNGGUHAN: jalankan file ini, lalu jalankan SEKALI LAGI (harus
-- tanpa error). Cek dengan query verifikasi di bawah.
--
-- ============================================================================
-- QUERY VERIFIKASI
-- ============================================================================
--   -- (a) 3 RPC baru, anon/authenticated tidak boleh EXECUTE:
--   SELECT p.proname,
--          has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon,
--          has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
--          has_function_privilege('service_role', p.oid, 'EXECUTE')  AS service_role
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public'
--     AND p.proname IN ('studio_soal_simpan_soal', 'studio_soal_simpan_stimulus',
--                       'studio_soal_hapus_draf', 'studio_soal_jaga_penulis_eligible');
--                                          -- harapan: 4 baris, false, false, true
--
--   -- (b) trigger penulis eligible terpasang di 2 tabel:
--   SELECT event_object_table, trigger_name FROM information_schema.triggers
--   WHERE trigger_name LIKE 'trg_studio_soal_penulis_eligible%'
--   GROUP BY 1, 2 ORDER BY 1;              -- harapan: soal_bank, soal_stimulus
--
-- ============================================================================
-- HASIL RPC: JSONB { "status": "<kode>", ... }
-- ============================================================================
-- Sukses : 'disimpan' (+ id, dibuat true/false, updated_at) | 'dihapus'
-- Gagal  : input_tidak_valid | subtes_tidak_valid | tidak_eligible
--          | bukan_penulis (id milik mentor lain — API menjawab 404, tidak
--            membocorkan bahwa id itu ada)
--          | terkunci (status bukan draf/ditolak: edit = versi baru)
--          | identitas_berubah (subtes/tipe/stimulus tidak bisa diganti
--            setelah disimpan)
--          | stimulus_tidak_ditemukan | stimulus_bukan_milik (K7) | stimulus_beda_subtes
--          | stimulus_terkunci | stimulus_penuh (maks. 50 soal)
--          | data_tidak_valid (melanggar CHECK; validator aplikasi seharusnya
--            sudah menolak lebih dulu — jaring pengaman)
--          | tidak_ditemukan | status_tidak_valid | pernah_diajukan
--          | dipakai_paket | masih_ada_soal (hapus)

-- ============================================================================
-- 1. RPC SIMPAN SOAL
-- ============================================================================
-- p_data (JSONB, dari API — sudah lolos validasiSoal mode "draf"):
--   subtes_id, tipe, stimulus_id        -> hanya dipakai saat MEMBUAT; saat
--                                          mengubah wajib sama (identitas)
--   redaksi, konten, kunci, pembahasan, sumber_rujukan, tingkat_kesulitan,
--   level_kognitif, estimasi_waktu_detik
-- urutan_dalam_stimulus dihitung di sini (urutan terakhir + 1), bukan dari klien.
CREATE OR REPLACE FUNCTION studio_soal_simpan_soal(p_id UUID, p_aktor_id UUID, p_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_soal soal_bank%ROWTYPE;
    v_stimulus soal_stimulus%ROWTYPE;
    v_pola_uuid CONSTANT TEXT := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
    v_subtes UUID;
    v_stimulus_id UUID;
    v_tipe TEXT;
    v_urutan INT;
    v_n INT;
    v_redaksi TEXT;
    v_konten JSONB;
    v_kunci JSONB;
    v_pembahasan TEXT;
    v_sumber TEXT;
    v_kesulitan TEXT;
    v_level SMALLINT;
    v_estimasi INT;
BEGIN
    PERFORM studio_soal_mulai_rpc();

    IF p_id IS NULL OR p_aktor_id IS NULL OR p_data IS NULL OR jsonb_typeof(p_data) <> 'object' THEN
        RETURN jsonb_build_object('status', 'input_tidak_valid');
    END IF;
    IF (p_data ? 'konten' AND jsonb_typeof(p_data->'konten') <> 'object')
       OR (p_data ? 'kunci' AND jsonb_typeof(p_data->'kunci') <> 'object')
       OR coalesce(jsonb_typeof(p_data->'level_kognitif'), 'null') NOT IN ('number', 'null')
       OR coalesce(jsonb_typeof(p_data->'estimasi_waktu_detik'), 'null') NOT IN ('number', 'null') THEN
        RETURN jsonb_build_object('status', 'input_tidak_valid');
    END IF;

    -- Nilai isi (dipakai saat membuat maupun mengubah).
    v_redaksi := coalesce(p_data->>'redaksi', '');
    v_konten := coalesce(p_data->'konten', '{"v": 1}'::jsonb);
    v_kunci := coalesce(p_data->'kunci', '{"v": 1}'::jsonb);
    v_pembahasan := coalesce(p_data->>'pembahasan', '');
    v_sumber := nullif(btrim(coalesce(p_data->>'sumber_rujukan', ''), E' \t\r\n'), '');
    v_kesulitan := coalesce(p_data->>'tingkat_kesulitan', 'sedang');

    SELECT * INTO v_soal FROM soal_bank WHERE id = p_id FOR UPDATE;

    IF NOT FOUND THEN
        -- ---- MEMBUAT ----
        IF coalesce(p_data->>'subtes_id', '') !~ v_pola_uuid
           OR (p_data->>'stimulus_id' IS NOT NULL AND p_data->>'stimulus_id' !~ v_pola_uuid)
           OR coalesce(p_data->>'tipe', '') NOT IN ('pilihan_ganda', 'majemuk_kompleks', 'isian') THEN
            RETURN jsonb_build_object('status', 'input_tidak_valid');
        END IF;
        v_subtes := (p_data->>'subtes_id')::uuid;
        v_tipe := p_data->>'tipe';
        v_stimulus_id := (p_data->>'stimulus_id')::uuid;

        IF NOT studio_soal_subtes_snbt(v_subtes) THEN
            RETURN jsonb_build_object('status', 'subtes_tidak_valid');
        END IF;
        IF NOT studio_soal_mentor_eligible(p_aktor_id, v_subtes) THEN
            RETURN jsonb_build_object('status', 'tidak_eligible');
        END IF;

        IF v_stimulus_id IS NOT NULL THEN
            -- Kunci stimulus supaya dua soal baru bersamaan tidak mendapat urutan sama.
            SELECT * INTO v_stimulus FROM soal_stimulus WHERE id = v_stimulus_id FOR UPDATE;
            IF NOT FOUND THEN RETURN jsonb_build_object('status', 'stimulus_tidak_ditemukan'); END IF;
            IF v_stimulus.penulis_id <> p_aktor_id THEN
                RETURN jsonb_build_object('status', 'stimulus_bukan_milik');
            END IF;
            IF v_stimulus.subtes_id <> v_subtes THEN
                RETURN jsonb_build_object('status', 'stimulus_beda_subtes');
            END IF;
            IF v_stimulus.status NOT IN ('draf', 'ditolak', 'terpublikasi') THEN
                RETURN jsonb_build_object('status', 'stimulus_terkunci', 'status_stimulus', v_stimulus.status);
            END IF;
            SELECT coalesce(max(urutan_dalam_stimulus), 0) + 1 INTO v_urutan
            FROM soal_bank WHERE stimulus_id = v_stimulus_id;
            IF v_urutan > 50 THEN RETURN jsonb_build_object('status', 'stimulus_penuh'); END IF;
        END IF;

        BEGIN
            v_level := (p_data->>'level_kognitif')::smallint;
            v_estimasi := (p_data->>'estimasi_waktu_detik')::int;
            INSERT INTO soal_bank (
                id, subtes_id, stimulus_id, urutan_dalam_stimulus, tipe, redaksi, konten, kunci,
                pembahasan, sumber_rujukan, tingkat_kesulitan, level_kognitif, estimasi_waktu_detik, penulis_id
            ) VALUES (
                p_id, v_subtes, v_stimulus_id, v_urutan::smallint, v_tipe, v_redaksi, v_konten, v_kunci,
                v_pembahasan, v_sumber, v_kesulitan, v_level, v_estimasi, p_aktor_id
            )
            ON CONFLICT (id) DO NOTHING;
            GET DIAGNOSTICS v_n = ROW_COUNT;
        EXCEPTION WHEN check_violation OR invalid_text_representation OR numeric_value_out_of_range
                       OR not_null_violation OR foreign_key_violation OR raise_exception THEN
            RETURN jsonb_build_object('status', 'data_tidak_valid', 'detail', SQLERRM);
        END;

        IF v_n = 1 THEN
            RETURN jsonb_build_object('status', 'disimpan', 'id', p_id, 'dibuat', true,
                                      'updated_at', (SELECT updated_at FROM soal_bank WHERE id = p_id));
        END IF;
        -- Permintaan lain dengan id yang sama baru saja membuat baris ini
        -- (klik dobel bersamaan) -> lanjut sebagai UBAH.
        SELECT * INTO v_soal FROM soal_bank WHERE id = p_id FOR UPDATE;
        IF NOT FOUND THEN RETURN jsonb_build_object('status', 'input_tidak_valid'); END IF;
    END IF;

    -- ---- MENGUBAH ----
    IF v_soal.penulis_id <> p_aktor_id THEN RETURN jsonb_build_object('status', 'bukan_penulis'); END IF;
    IF v_soal.status NOT IN ('draf', 'ditolak') THEN
        RETURN jsonb_build_object('status', 'terkunci', 'status_soal', v_soal.status);
    END IF;
    IF (p_data ? 'subtes_id' AND p_data->>'subtes_id' IS DISTINCT FROM v_soal.subtes_id::text)
       OR (p_data ? 'tipe' AND p_data->>'tipe' IS DISTINCT FROM v_soal.tipe)
       OR (p_data ? 'stimulus_id' AND p_data->>'stimulus_id' IS DISTINCT FROM v_soal.stimulus_id::text) THEN
        RETURN jsonb_build_object('status', 'identitas_berubah');
    END IF;
    IF NOT studio_soal_mentor_eligible(p_aktor_id, v_soal.subtes_id) THEN
        RETURN jsonb_build_object('status', 'tidak_eligible');
    END IF;

    BEGIN
        v_level := (p_data->>'level_kognitif')::smallint;
        v_estimasi := (p_data->>'estimasi_waktu_detik')::int;
        UPDATE soal_bank
        SET redaksi = v_redaksi, konten = v_konten, kunci = v_kunci, pembahasan = v_pembahasan,
            sumber_rujukan = v_sumber, tingkat_kesulitan = v_kesulitan, level_kognitif = v_level,
            estimasi_waktu_detik = v_estimasi
        WHERE id = p_id;
    EXCEPTION WHEN check_violation OR invalid_text_representation OR numeric_value_out_of_range
                   OR not_null_violation OR raise_exception THEN
        RETURN jsonb_build_object('status', 'data_tidak_valid', 'detail', SQLERRM);
    END;

    RETURN jsonb_build_object('status', 'disimpan', 'id', p_id, 'dibuat', false,
                              'updated_at', (SELECT updated_at FROM soal_bank WHERE id = p_id));
END $$;

-- ============================================================================
-- 2. RPC SIMPAN STIMULUS
-- ============================================================================
-- p_data: subtes_id (identitas), judul_internal, konten ({v, blok}),
-- sumber_rujukan ("Buatan sendiri" / nama sumber — WAJIB saat diajukan, K4).
CREATE OR REPLACE FUNCTION studio_soal_simpan_stimulus(p_id UUID, p_aktor_id UUID, p_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_stimulus soal_stimulus%ROWTYPE;
    v_pola_uuid CONSTANT TEXT := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
    v_subtes UUID;
    v_n INT;
    v_judul TEXT;
    v_konten JSONB;
    v_sumber TEXT;
BEGIN
    PERFORM studio_soal_mulai_rpc();

    IF p_id IS NULL OR p_aktor_id IS NULL OR p_data IS NULL OR jsonb_typeof(p_data) <> 'object'
       OR (p_data ? 'konten' AND jsonb_typeof(p_data->'konten') <> 'object') THEN
        RETURN jsonb_build_object('status', 'input_tidak_valid');
    END IF;

    v_judul := coalesce(p_data->>'judul_internal', '');
    v_konten := coalesce(p_data->'konten', '{"v": 1, "blok": []}'::jsonb);
    v_sumber := coalesce(p_data->>'sumber_rujukan', '');

    SELECT * INTO v_stimulus FROM soal_stimulus WHERE id = p_id FOR UPDATE;

    IF NOT FOUND THEN
        IF coalesce(p_data->>'subtes_id', '') !~ v_pola_uuid THEN
            RETURN jsonb_build_object('status', 'input_tidak_valid');
        END IF;
        v_subtes := (p_data->>'subtes_id')::uuid;
        IF NOT studio_soal_subtes_snbt(v_subtes) THEN
            RETURN jsonb_build_object('status', 'subtes_tidak_valid');
        END IF;
        IF NOT studio_soal_mentor_eligible(p_aktor_id, v_subtes) THEN
            RETURN jsonb_build_object('status', 'tidak_eligible');
        END IF;

        BEGIN
            INSERT INTO soal_stimulus (id, subtes_id, judul_internal, konten, sumber_rujukan, penulis_id)
            VALUES (p_id, v_subtes, v_judul, v_konten, v_sumber, p_aktor_id)
            ON CONFLICT (id) DO NOTHING;
            GET DIAGNOSTICS v_n = ROW_COUNT;
        EXCEPTION WHEN check_violation OR invalid_text_representation OR not_null_violation
                       OR string_data_right_truncation OR foreign_key_violation OR raise_exception THEN
            RETURN jsonb_build_object('status', 'data_tidak_valid', 'detail', SQLERRM);
        END;

        IF v_n = 1 THEN
            RETURN jsonb_build_object('status', 'disimpan', 'id', p_id, 'dibuat', true,
                                      'updated_at', (SELECT updated_at FROM soal_stimulus WHERE id = p_id));
        END IF;
        SELECT * INTO v_stimulus FROM soal_stimulus WHERE id = p_id FOR UPDATE;
        IF NOT FOUND THEN RETURN jsonb_build_object('status', 'input_tidak_valid'); END IF;
    END IF;

    IF v_stimulus.penulis_id <> p_aktor_id THEN RETURN jsonb_build_object('status', 'bukan_penulis'); END IF;
    IF v_stimulus.status NOT IN ('draf', 'ditolak') THEN
        RETURN jsonb_build_object('status', 'terkunci', 'status_stimulus', v_stimulus.status);
    END IF;
    IF p_data ? 'subtes_id' AND p_data->>'subtes_id' IS DISTINCT FROM v_stimulus.subtes_id::text THEN
        RETURN jsonb_build_object('status', 'identitas_berubah');
    END IF;
    IF NOT studio_soal_mentor_eligible(p_aktor_id, v_stimulus.subtes_id) THEN
        RETURN jsonb_build_object('status', 'tidak_eligible');
    END IF;

    BEGIN
        UPDATE soal_stimulus
        SET judul_internal = v_judul, konten = v_konten, sumber_rujukan = v_sumber
        WHERE id = p_id;
    EXCEPTION WHEN check_violation OR invalid_text_representation OR not_null_violation
                   OR string_data_right_truncation OR raise_exception THEN
        RETURN jsonb_build_object('status', 'data_tidak_valid', 'detail', SQLERRM);
    END;

    RETURN jsonb_build_object('status', 'disimpan', 'id', p_id, 'dibuat', false,
                              'updated_at', (SELECT updated_at FROM soal_stimulus WHERE id = p_id));
END $$;

-- ============================================================================
-- 3. RPC HAPUS DRAF
-- ============================================================================
-- Hanya penulis, hanya status 'draf' yang BELUM PERNAH diajukan (tidak ada log
-- 'ajukan'), dan penulis masih ditugaskan ke subtesnya. Selain itu -> arsipkan
-- (fitur terpisah). Draf versi baru yang belum diajukan boleh dihapus
-- (= membatalkan versi baru; versi terbit tetap). Stimulus hanya bisa dihapus
-- bila tidak berisi soal (hapus soalnya dulu).
-- p_objek_jenis: 'soal' | 'stimulus'
CREATE OR REPLACE FUNCTION studio_soal_hapus_draf(p_objek_jenis TEXT, p_id UUID, p_aktor_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_soal soal_bank%ROWTYPE;
    v_stimulus soal_stimulus%ROWTYPE;
BEGIN
    PERFORM studio_soal_mulai_rpc();

    IF p_id IS NULL OR p_aktor_id IS NULL OR p_objek_jenis IS NULL
       OR p_objek_jenis NOT IN ('soal', 'stimulus') THEN
        RETURN jsonb_build_object('status', 'input_tidak_valid');
    END IF;

    IF p_objek_jenis = 'soal' THEN
        SELECT * INTO v_soal FROM soal_bank WHERE id = p_id FOR UPDATE;
        IF NOT FOUND THEN RETURN jsonb_build_object('status', 'tidak_ditemukan'); END IF;
        IF v_soal.penulis_id <> p_aktor_id THEN RETURN jsonb_build_object('status', 'bukan_penulis'); END IF;
        IF v_soal.status <> 'draf' THEN
            RETURN jsonb_build_object('status', 'status_tidak_valid', 'status_soal', v_soal.status);
        END IF;
        IF EXISTS (SELECT 1 FROM soal_tinjauan_log WHERE objek_jenis = 'soal' AND objek_id = p_id AND aksi = 'ajukan') THEN
            RETURN jsonb_build_object('status', 'pernah_diajukan');
        END IF;
        IF NOT studio_soal_mentor_eligible(p_aktor_id, v_soal.subtes_id) THEN
            RETURN jsonb_build_object('status', 'tidak_eligible');
        END IF;
        IF EXISTS (SELECT 1 FROM paket_soal_item WHERE soal_id = p_id) THEN
            RETURN jsonb_build_object('status', 'dipakai_paket');
        END IF;
        DELETE FROM soal_bank WHERE id = p_id;
        RETURN jsonb_build_object('status', 'dihapus');
    END IF;

    SELECT * INTO v_stimulus FROM soal_stimulus WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'tidak_ditemukan'); END IF;
    IF v_stimulus.penulis_id <> p_aktor_id THEN RETURN jsonb_build_object('status', 'bukan_penulis'); END IF;
    IF v_stimulus.status <> 'draf' THEN
        RETURN jsonb_build_object('status', 'status_tidak_valid', 'status_stimulus', v_stimulus.status);
    END IF;
    IF EXISTS (SELECT 1 FROM soal_tinjauan_log WHERE objek_jenis = 'stimulus' AND objek_id = p_id AND aksi = 'ajukan') THEN
        RETURN jsonb_build_object('status', 'pernah_diajukan');
    END IF;
    IF NOT studio_soal_mentor_eligible(p_aktor_id, v_stimulus.subtes_id) THEN
        RETURN jsonb_build_object('status', 'tidak_eligible');
    END IF;
    IF EXISTS (SELECT 1 FROM soal_bank WHERE stimulus_id = p_id) THEN
        RETURN jsonb_build_object('status', 'masih_ada_soal');
    END IF;
    DELETE FROM soal_stimulus WHERE id = p_id;
    RETURN jsonb_build_object('status', 'dihapus');
END $$;

-- ============================================================================
-- 4. TRIGGER: ubah ISI wajib penulis masih ditugaskan
-- ============================================================================
-- Isi = semua kolom kecuali metadata tinjau/status, kolom identitas, dan
-- topik_id (topik_id juga bisa berubah oleh ON DELETE SET NULL saat topik
-- dihapus — itu bukan suntingan penulis). Perubahan status lewat RPC
-- (tinjau, tarik, arsip) tidak menyentuh isi, jadi tidak terpengaruh: soal
-- milik mentor yang dicabut tetap bisa ditinjau/diarsipkan.
CREATE OR REPLACE FUNCTION studio_soal_jaga_penulis_eligible()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_abaikan CONSTANT TEXT[] := ARRAY[
        'status', 'peninjau_id', 'diajukan_pada', 'ditinjau_pada', 'alasan_tolak', 'updated_at',
        'id', 'keluarga_id', 'versi', 'menggantikan_id', 'penulis_id', 'created_at', 'topik_id'
    ];
BEGIN
    IF (to_jsonb(OLD) - v_abaikan) IS DISTINCT FROM (to_jsonb(NEW) - v_abaikan)
       AND NOT studio_soal_mentor_eligible(NEW.penulis_id, NEW.subtes_id) THEN
        RAISE EXCEPTION 'studio_soal: penulis tidak (lagi) ditugaskan ke subtes ini — isi % tidak bisa diubah', TG_TABLE_NAME;
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_studio_soal_penulis_eligible_soal ON soal_bank;
CREATE TRIGGER trg_studio_soal_penulis_eligible_soal
    BEFORE UPDATE ON soal_bank
    FOR EACH ROW EXECUTE FUNCTION studio_soal_jaga_penulis_eligible();

DROP TRIGGER IF EXISTS trg_studio_soal_penulis_eligible_stimulus ON soal_stimulus;
CREATE TRIGGER trg_studio_soal_penulis_eligible_stimulus
    BEFORE UPDATE ON soal_stimulus
    FOR EACH ROW EXECUTE FUNCTION studio_soal_jaga_penulis_eligible();

-- ============================================================================
-- 5. HAK EXECUTE
-- ============================================================================
-- Supabase memberi EXECUTE ke anon/authenticated untuk fungsi baru di schema
-- public secara default — cabut semuanya, beri hanya ke service_role.
DO $$
DECLARE
    f RECORD;
BEGIN
    FOR f IN
        SELECT p.oid::regprocedure AS sig
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname LIKE 'studio_soal_%'
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.sig);
    END LOOP;
END $$;
