-- Rollback untuk db/add_soal_media.sql.
--
-- PERINGATAN — baca sebelum menjalankan:
--   * Revert kode PR gambar SEBELUM rollback (unggah Word memakai bucket & tabel ini).
--   * Tabel soal_media DIHAPUS beserta isinya. Soal/bacaan yang memuat gambar tetap ada,
--     tetapi gambarnya tidak bisa ditampilkan lagi. Cek KUERI 1 dulu (idealnya 0).
--   * Bucket soal-media & impor-staging TIDAK dihapus oleh file ini: kosongkan lalu hapus
--     lewat Dashboard Supabase (Storage) bila memang tidak dipakai lagi.
--   * Tanpa BEGIN/COMMIT — Anda yang mengatur transaksi. Aman dijalankan dua kali.

-- ---- KUERI 1 (pra-cek): jumlah gambar tersimpan ----
-- SELECT count(*) AS gambar FROM soal_media;

-- ============================== ROLLBACK ==============================
DROP TRIGGER IF EXISTS trg_studio_soal_jaga_media_soal ON soal_bank;
DROP TRIGGER IF EXISTS trg_studio_soal_jaga_media_stimulus ON soal_stimulus;
DROP FUNCTION IF EXISTS studio_soal_jaga_media();
DROP FUNCTION IF EXISTS studio_soal_admin_media_yatim(UUID);
DROP FUNCTION IF EXISTS studio_soal_admin_hapus_media(UUID, UUID[]);

-- Versi sebelum gambar (salinan db/add_impor_soal.sql).
CREATE OR REPLACE FUNCTION studio_soal_impor_admin(p_admin_id UUID, p_batch JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_batch_id UUID := gen_random_uuid();
    v_stimulus JSONB;
    v_soal JSONB;
    v_daftar_stimulus JSONB;
    v_daftar_soal JSONB;
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
    IF jsonb_typeof(v_daftar_soal) IS DISTINCT FROM 'array' OR jsonb_typeof(v_daftar_stimulus) <> 'array' THEN
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

        v_jenis := 'stimulus';
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

-- Versi sebelum gambar (salinan db/add_impor_perawatan.sql).
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

DROP FUNCTION IF EXISTS studio_soal_media_ref(JSONB);
DROP TABLE IF EXISTS soal_media;
