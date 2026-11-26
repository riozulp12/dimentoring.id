-- Migration: Studio Soal — GAMBAR pada soal, pembahasan, dan bacaan (unggah Word Admin).
-- Additive: tabel baru, dua bucket Storage privat, fungsi & trigger. Bentuk konten v:1
-- tidak berubah artinya; hanya boleh memuat konten.gambar / blok {jenis:"gambar"}.
--
-- Isi:
--   1. Bucket privat soal-media (gambar) & impor-staging (Word sementara), TANPA policy
--      -> hanya service_role
--   2. Tabel soal_media (RLS aktif, tanpa policy)
--   3. studio_soal_media_ref() + trigger studio_soal_jaga_media: tiap media_id harus
--      ada, dan gambar hanya untuk baris sumber 'buatan_sendiri' (jalur mentor ditolak)
--   4. studio_soal_impor_admin: menerima p_batch.media (menggantikan versi add_impor_soal.sql)
--   5. studio_soal_admin_simpan: menolak media_id yang belum terkait soal itu
--      (menggantikan versi add_impor_perawatan.sql)
--   6. RPC studio_soal_admin_media_yatim & _hapus_media (pembersihan gambar tak terpakai)
--   7. Hak EXECUTE (hanya service_role)
--
-- Versi baru (studio_soal_admin_versi_baru) menyalin konten apa adanya: media_id yang
-- sama dipakai bersama, berkas tidak digandakan.
--
-- Urutan: jalankan SETELAH add_impor_perawatan.sql.
-- PERHATIAN: menjalankan ulang add_impor_soal.sql atau add_impor_perawatan.sql SESUDAH
-- file ini mengembalikan dua fungsi di butir 4-5 ke versi tanpa gambar. Kalau terjadi,
-- jalankan ulang file ini.
--
-- Idempotent: ON CONFLICT, IF NOT EXISTS, DROP ... IF EXISTS, CREATE OR REPLACE.
-- TIDAK menyentuh webhook/pembayaran.
--
-- DRY-RUN (SQL Editor Supabase, satu kali eksekusi):
--     BEGIN;
--     <isi file ini>
--     <isi file ini SEKALI LAGI>                    -- bukti idempotent
--     <isi db/test_studio_soal_media_DRYRUN.sql>
--     ROLLBACK;
--   Harapan: NOTICE "STUDIO SOAL MEDIA DRY-RUN [v1]: SEMUA SKENARIO LULUS".
-- Verifikasi sesudah jalan sungguhan: db/add_soal_media_verify.sql.
-- Pembatalan: db/add_soal_media_rollback.sql.

-- ============================================================================
-- 1. BUCKET STORAGE (privat)
-- ============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
    ('soal-media', 'soal-media', false, 2097152, ARRAY['image/png', 'image/jpeg', 'image/webp']),
    ('impor-staging', 'impor-staging', false, 26214400,
     ARRAY['application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ============================================================================
-- 2. TABEL
-- ============================================================================
CREATE TABLE IF NOT EXISTS soal_media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    impor_batch_id UUID REFERENCES soal_impor_batch(id) ON DELETE SET NULL,
    path TEXT NOT NULL UNIQUE,                 -- lokasi di bucket soal-media
    mime TEXT NOT NULL,
    ukuran_byte INT NOT NULL,
    lebar INT NOT NULL,
    tinggi INT NOT NULL,
    teks_alternatif TEXT NOT NULL DEFAULT '',
    dibuat_oleh UUID NOT NULL REFERENCES users(id),
    dibuat_pada TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE soal_media DROP CONSTRAINT IF EXISTS soal_media_isi_valid;
ALTER TABLE soal_media ADD CONSTRAINT soal_media_isi_valid CHECK (
    mime IN ('image/png', 'image/jpeg', 'image/webp')
    AND ukuran_byte BETWEEN 1 AND 2097152
    AND lebar BETWEEN 1 AND 2400
    AND tinggi BETWEEN 1 AND 2400
    AND length(path) BETWEEN 1 AND 200
    AND length(teks_alternatif) <= 300
);

CREATE INDEX IF NOT EXISTS idx_soal_media_batch ON soal_media(impor_batch_id) WHERE impor_batch_id IS NOT NULL;

ALTER TABLE soal_media ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 3. RUJUKAN & PENJAGA
-- ============================================================================
-- media_id yang dirujuk konten soal (konten.gambar) atau bacaan (blok gambar).
-- Hasil NULL = entri gambar tanpa media_id.
CREATE OR REPLACE FUNCTION studio_soal_media_ref(p_konten JSONB)
RETURNS SETOF TEXT
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
    SELECT lower(g->>'media_id')
    FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(p_konten->'gambar') = 'array' THEN p_konten->'gambar' ELSE '[]'::jsonb END) AS g
    UNION ALL
    SELECT lower(b->>'media_id')
    FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(p_konten->'blok') = 'array' THEN p_konten->'blok' ELSE '[]'::jsonb END) AS b
    WHERE b->>'jenis' = 'gambar';
$$;

-- Diperiksa saat konten ditulis dan saat baris diterbitkan.
CREATE OR REPLACE FUNCTION studio_soal_jaga_media()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_ref TEXT;
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.konten IS NOT DISTINCT FROM OLD.konten
       AND NOT (NEW.status = 'terpublikasi' AND OLD.status IS DISTINCT FROM NEW.status) THEN
        RETURN NEW;
    END IF;
    FOR v_ref IN SELECT * FROM studio_soal_media_ref(NEW.konten) LOOP
        IF NEW.sumber <> 'buatan_sendiri' THEN
            RAISE EXCEPTION 'studio_soal: gambar hanya untuk soal Buatan Sendiri';
        END IF;
        IF v_ref IS NULL OR NOT EXISTS (SELECT 1 FROM soal_media m WHERE m.id::text = v_ref) THEN
            RAISE EXCEPTION 'studio_soal: gambar % tidak ditemukan', coalesce(v_ref, '(tanpa id)');
        END IF;
    END LOOP;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_studio_soal_jaga_media_soal ON soal_bank;
CREATE TRIGGER trg_studio_soal_jaga_media_soal
    BEFORE INSERT OR UPDATE ON soal_bank
    FOR EACH ROW EXECUTE FUNCTION studio_soal_jaga_media();

DROP TRIGGER IF EXISTS trg_studio_soal_jaga_media_stimulus ON soal_stimulus;
CREATE TRIGGER trg_studio_soal_jaga_media_stimulus
    BEFORE INSERT OR UPDATE ON soal_stimulus
    FOR EACH ROW EXECUTE FUNCTION studio_soal_jaga_media();

-- ============================================================================
-- 4. RPC IMPOR (DRAF) — tambahan p_batch.media: [{ id, path, mime, ukuran_byte, lebar, tinggi, teks_alternatif }]
-- ============================================================================
CREATE OR REPLACE FUNCTION studio_soal_impor_admin(p_admin_id UUID, p_batch JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_batch_id UUID := gen_random_uuid();
    v_stimulus JSONB;
    v_soal JSONB;
    v_daftar_stimulus JSONB;
    v_daftar_soal JSONB;
    v_daftar_media JSONB;
    v_media JSONB;
    v_peta JSONB := '{}'::jsonb;
    v_id UUID;
    v_stimulus_id UUID;
    v_kode TEXT;
    v_n_soal INT;
    v_n_stimulus INT;
    v_idx INT := 0;
    v_jenis TEXT := 'batch';
    v_baris INT;
    v_gagal INT;
BEGIN
    PERFORM studio_soal_mulai_rpc();

    IF p_admin_id IS NULL OR p_batch IS NULL OR jsonb_typeof(p_batch) <> 'object' THEN
        RETURN jsonb_build_object('status', 'input_tidak_valid');
    END IF;
    v_daftar_soal := p_batch->'soal';
    v_daftar_stimulus := coalesce(p_batch->'stimulus', '[]'::jsonb);
    v_daftar_media := coalesce(p_batch->'media', '[]'::jsonb);
    IF jsonb_typeof(v_daftar_soal) IS DISTINCT FROM 'array' OR jsonb_typeof(v_daftar_stimulus) <> 'array'
       OR jsonb_typeof(v_daftar_media) <> 'array' OR jsonb_array_length(v_daftar_media) > 60 THEN
        RETURN jsonb_build_object('status', 'input_tidak_valid');
    END IF;
    IF NOT studio_soal_admin_aktif(p_admin_id) THEN
        RETURN jsonb_build_object('status', 'bukan_admin');
    END IF;

    v_n_soal := jsonb_array_length(v_daftar_soal);
    v_n_stimulus := jsonb_array_length(v_daftar_stimulus);
    IF v_n_soal = 0 THEN
        RETURN jsonb_build_object('status', 'input_tidak_valid');
    END IF;
    IF v_n_soal > 300 OR v_n_stimulus > 300 THEN
        RETURN jsonb_build_object('status', 'terlalu_banyak', 'maks', 300);
    END IF;

    PERFORM set_config('studio_soal.impor', 'on', true);

    BEGIN
        v_baris := greatest(coalesce((p_batch->>'jumlah_baris')::int, v_n_soal), v_n_soal);
        v_gagal := greatest(coalesce((p_batch->>'jumlah_gagal')::int, 0), 0);

        INSERT INTO soal_impor_batch (id, admin_id, nama_berkas, jumlah_baris, jumlah_ok, jumlah_gagal)
        VALUES (v_batch_id, p_admin_id, left(coalesce(p_batch->>'nama_berkas', ''), 200), v_baris, v_n_soal, v_gagal);

        -- Baris gambar lebih dulu: trigger studio_soal_jaga_media memeriksanya saat soal/bacaan disisipkan.
        v_jenis := 'media';
        FOR v_media IN SELECT * FROM jsonb_array_elements(v_daftar_media) LOOP
            v_idx := v_idx + 1;
            INSERT INTO soal_media (id, impor_batch_id, path, mime, ukuran_byte, lebar, tinggi, teks_alternatif, dibuat_oleh)
            VALUES ((v_media->>'id')::uuid, v_batch_id, v_media->>'path', v_media->>'mime',
                    (v_media->>'ukuran_byte')::int, (v_media->>'lebar')::int, (v_media->>'tinggi')::int,
                    left(coalesce(v_media->>'teks_alternatif', ''), 300), p_admin_id);
        END LOOP;

        v_jenis := 'stimulus';
        v_idx := 0;
        FOR v_stimulus IN SELECT * FROM jsonb_array_elements(v_daftar_stimulus) LOOP
            v_idx := v_idx + 1;
            v_kode := nullif(btrim(coalesce(v_stimulus->>'kode', ''), E' \t\r\n'), '');
            IF v_kode IS NULL OR v_peta ? v_kode THEN
                RAISE EXCEPTION 'kode bacaan kosong atau ganda';
            END IF;
            INSERT INTO soal_stimulus (subtes_id, judul_internal, konten, sumber_rujukan, penulis_id,
                                       sumber, impor_batch_id)
            VALUES ((v_stimulus->>'subtes_id')::uuid,
                    left(coalesce(v_stimulus->>'judul_internal', ''), 150),
                    coalesce(v_stimulus->'konten', '{"v": 1, "blok": []}'::jsonb),
                    coalesce(v_stimulus->>'sumber_rujukan', ''),
                    p_admin_id, 'buatan_sendiri', v_batch_id)
            RETURNING id INTO v_id;
            v_peta := v_peta || jsonb_build_object(v_kode, v_id);
        END LOOP;

        v_jenis := 'soal';
        v_idx := 0;
        FOR v_soal IN SELECT * FROM jsonb_array_elements(v_daftar_soal) LOOP
            v_idx := v_idx + 1;
            v_stimulus_id := NULL;
            v_kode := nullif(btrim(coalesce(v_soal->>'stimulus_kode', ''), E' \t\r\n'), '');
            IF v_kode IS NOT NULL THEN
                IF NOT (v_peta ? v_kode) THEN
                    RAISE EXCEPTION 'kode bacaan % tidak ada di batch', v_kode;
                END IF;
                v_stimulus_id := (v_peta->>v_kode)::uuid;
            END IF;
            INSERT INTO soal_bank (subtes_id, topik_id, stimulus_id, urutan_dalam_stimulus, tipe, redaksi,
                                   konten, kunci, pembahasan, sumber_rujukan, tingkat_kesulitan,
                                   level_kognitif, estimasi_waktu_detik, penulis_id, sumber, impor_batch_id)
            VALUES ((v_soal->>'subtes_id')::uuid,
                    (v_soal->>'topik_id')::uuid,
                    v_stimulus_id,
                    CASE WHEN v_stimulus_id IS NULL THEN NULL
                         ELSE (v_soal->>'urutan_dalam_stimulus')::smallint END,
                    v_soal->>'tipe',
                    coalesce(v_soal->>'redaksi', ''),
                    coalesce(v_soal->'konten', '{"v": 1}'::jsonb),
                    coalesce(v_soal->'kunci', '{"v": 1}'::jsonb),
                    coalesce(v_soal->>'pembahasan', ''),
                    nullif(btrim(coalesce(v_soal->>'sumber_rujukan', ''), E' \t\r\n'), ''),
                    coalesce(v_soal->>'tingkat_kesulitan', 'sedang'),
                    (v_soal->>'level_kognitif')::smallint,
                    (v_soal->>'estimasi_waktu_detik')::int,
                    p_admin_id, 'buatan_sendiri', v_batch_id);
        END LOOP;
    EXCEPTION WHEN OTHERS THEN
        PERFORM set_config('studio_soal.impor', 'off', true);
        RETURN jsonb_build_object('status', 'data_tidak_valid', 'jenis', v_jenis, 'indeks', v_idx,
                                  'detail', SQLERRM);
    END;

    PERFORM set_config('studio_soal.impor', 'off', true);
    RETURN jsonb_build_object('status', 'disimpan', 'batch_id', v_batch_id,
                              'jumlah_soal', v_n_soal, 'jumlah_stimulus', v_n_stimulus);
END $$;

-- ============================================================================
-- 5. SIMPAN DRAF ADMIN — tambahan hasil 'media_asing'
-- ============================================================================
CREATE OR REPLACE FUNCTION studio_soal_admin_simpan(p_admin_id UUID, p_soal_id UUID, p_updated_at TIMESTAMPTZ, p_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_soal soal_bank%ROWTYPE;
BEGIN
    PERFORM studio_soal_mulai_rpc();
    IF p_admin_id IS NULL OR p_soal_id IS NULL OR p_updated_at IS NULL
       OR p_data IS NULL OR jsonb_typeof(p_data) <> 'object'
       OR coalesce(jsonb_typeof(p_data->'konten'), '') <> 'object'
       OR coalesce(jsonb_typeof(p_data->'kunci'), '') <> 'object'
       OR coalesce(jsonb_typeof(p_data->'level_kognitif'), 'null') NOT IN ('number', 'null')
       OR coalesce(jsonb_typeof(p_data->'estimasi_waktu_detik'), 'null') NOT IN ('number', 'null') THEN
        RETURN jsonb_build_object('status', 'input_tidak_valid');
    END IF;
    IF NOT studio_soal_admin_aktif(p_admin_id) THEN
        RETURN jsonb_build_object('status', 'bukan_admin');
    END IF;
    SELECT * INTO v_soal FROM soal_bank WHERE id = p_soal_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'tidak_ditemukan'); END IF;
    IF v_soal.sumber <> 'buatan_sendiri' THEN RETURN jsonb_build_object('status', 'bukan_buatan_sendiri'); END IF;
    IF v_soal.status <> 'draf' THEN
        RETURN jsonb_build_object('status', 'terkunci', 'status_soal', v_soal.status);
    END IF;
    IF v_soal.updated_at IS DISTINCT FROM p_updated_at THEN
        RETURN jsonb_build_object('status', 'sudah_berubah');
    END IF;
    IF (p_data ? 'subtes_id' AND p_data->>'subtes_id' IS DISTINCT FROM v_soal.subtes_id::text)
       OR (p_data ? 'tipe' AND p_data->>'tipe' IS DISTINCT FROM v_soal.tipe)
       OR (p_data ? 'stimulus_id' AND p_data->>'stimulus_id' IS DISTINCT FROM v_soal.stimulus_id::text) THEN
        RETURN jsonb_build_object('status', 'identitas_berubah');
    END IF;

    -- Form tidak menambah gambar: hanya gambar yang sudah terkait dengan soal ini.
    IF EXISTS (SELECT 1 FROM studio_soal_media_ref(p_data->'konten') AS baru
               WHERE baru IS NULL OR NOT EXISTS (SELECT 1 FROM studio_soal_media_ref(v_soal.konten) AS lama WHERE lama = baru)) THEN
        RETURN jsonb_build_object('status', 'media_asing');
    END IF;

    BEGIN
        PERFORM set_config('studio_soal.impor', 'on', true);
        UPDATE soal_bank
        SET redaksi = coalesce(p_data->>'redaksi', ''),
            konten = p_data->'konten',
            kunci = p_data->'kunci',
            pembahasan = coalesce(p_data->>'pembahasan', ''),
            sumber_rujukan = nullif(btrim(coalesce(p_data->>'sumber_rujukan', ''), E' \t\r\n'), ''),
            tingkat_kesulitan = coalesce(p_data->>'tingkat_kesulitan', 'sedang'),
            level_kognitif = (p_data->>'level_kognitif')::smallint,
            estimasi_waktu_detik = (p_data->>'estimasi_waktu_detik')::int
        WHERE id = p_soal_id;
        PERFORM studio_soal_tulis_log('soal', p_soal_id, p_admin_id, 'admin', 'ubah_admin', NULL, NULL, to_jsonb(v_soal));
        PERFORM set_config('studio_soal.impor', 'off', true);
    EXCEPTION WHEN check_violation OR invalid_text_representation OR numeric_value_out_of_range
                   OR not_null_violation OR raise_exception THEN
        -- Sub-transaksi dibatalkan, termasuk penandanya.
        RETURN jsonb_build_object('status', 'data_tidak_valid', 'detail', SQLERRM);
    END;

    RETURN jsonb_build_object('status', 'disimpan', 'soal_id', p_soal_id,
                              'updated_at', (SELECT updated_at FROM soal_bank WHERE id = p_soal_id));
END $$;

-- ============================================================================
-- 6. PEMBERSIHAN GAMBAR TAK TERPAKAI
-- ============================================================================
-- Gambar yatim = tidak dirujuk soal_bank maupun soal_stimulus mana pun (semua status
-- dan versi). API menghapus berkasnya di Storage dulu, baru barisnya; baris yang
-- berkasnya gagal dihapus tetap ada dan dicoba lagi pada pembersihan berikutnya.
-- Gambar yatim tidak bisa dirujuk lagi: simpan Admin hanya boleh memakai gambar yang
-- sudah terkait dengan soal itu, dan impor selalu membuat gambar baru.
CREATE OR REPLACE FUNCTION studio_soal_admin_media_yatim(p_admin_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_hasil JSONB;
BEGIN
    IF p_admin_id IS NULL THEN RETURN jsonb_build_object('status', 'input_tidak_valid'); END IF;
    IF NOT studio_soal_admin_aktif(p_admin_id) THEN RETURN jsonb_build_object('status', 'bukan_admin'); END IF;
    WITH dipakai AS (
        SELECT r AS id FROM soal_bank s, LATERAL studio_soal_media_ref(s.konten) AS r
        UNION
        SELECT r FROM soal_stimulus t, LATERAL studio_soal_media_ref(t.konten) AS r
    ), yatim AS (
        SELECT m.id, m.path FROM soal_media m
        WHERE NOT EXISTS (SELECT 1 FROM dipakai d WHERE d.id = m.id::text)
        ORDER BY m.dibuat_pada, m.id
        LIMIT 200
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'path', path)), '[]'::jsonb) INTO v_hasil FROM yatim;
    RETURN jsonb_build_object('status', 'ok', 'media', v_hasil);
END $$;

CREATE OR REPLACE FUNCTION studio_soal_admin_hapus_media(p_admin_id UUID, p_ids UUID[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_jumlah INT;
BEGIN
    IF p_admin_id IS NULL OR p_ids IS NULL THEN RETURN jsonb_build_object('status', 'input_tidak_valid'); END IF;
    IF NOT studio_soal_admin_aktif(p_admin_id) THEN RETURN jsonb_build_object('status', 'bukan_admin'); END IF;
    WITH dipakai AS (
        SELECT r AS id FROM soal_bank s, LATERAL studio_soal_media_ref(s.konten) AS r
        UNION
        SELECT r FROM soal_stimulus t, LATERAL studio_soal_media_ref(t.konten) AS r
    )
    DELETE FROM soal_media m
    WHERE m.id = ANY (p_ids) AND NOT EXISTS (SELECT 1 FROM dipakai d WHERE d.id = m.id::text);
    GET DIAGNOSTICS v_jumlah = ROW_COUNT;
    RETURN jsonb_build_object('status', 'dihapus', 'jumlah', v_jumlah);
END $$;

-- ============================================================================
-- 7. HAK EXECUTE
-- ============================================================================
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
