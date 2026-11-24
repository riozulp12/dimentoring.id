-- Migration: Studio Soal — UNGGAH SOAL MASSAL (sumber buatan_sendiri) + TERBIT OLEH ADMIN.
-- Admin mengunggah CSV (soal teks + rumus LaTeX), simpan sebagai DRAF dalam satu
-- batch, lalu menerbitkan sendiri. Jalur tinjau sejawat mentor TIDAK diubah.
--
-- Isi:
--   1. Tabel soal_impor_batch (RLS aktif, tanpa policy -> hanya service_role)
--   2. Kolom  : soal_bank.impor_batch_id, soal_stimulus.sumber, soal_stimulus.impor_batch_id
--   3. Constraint (DROP IF EXISTS + ADD):
--        soal_bank.sumber IN ('manual','buatan_sendiri'); soal_stimulus.sumber idem;
--        peninjau boleh = penulis HANYA untuk sumber 'buatan_sendiri' (Admin menulis
--        sekaligus menerbitkan); aksi log 'terbit_admin_buatan_sendiri' wajib peran admin
--   4. Penanda transaksi studio_soal.impor + fungsi studio_soal_impor_aktif()
--   5. studio_soal_cek_relasi() — sama seperti add_studio_soal.sql, KECUALI
--      pembuat baris sumber 'buatan_sendiri' cukup Admin aktif (bukan mentor ditugaskan)
--      dan hanya di dalam RPC impor
--   6. RPC studio_soal_impor_admin   (draf stimulus+soal, satu transaksi, maks. 300 soal)
--   7. RPC studio_soal_terbitkan_admin (draf buatan_sendiri -> terpublikasi, maks. 200 id)
--   8. Hak EXECUTE (hanya service_role)
--
-- Urutan: jalankan SETELAH add_studio_soal.sql, add_studio_soal_draf.sql, add_studio_soal_penugasan.sql.
-- PERHATIAN: menjalankan ulang add_studio_soal.sql SESUDAH file ini mengembalikan
-- CHECK sumber/peninjau dan studio_soal_cek_relasi() ke versi lama (unggah soal akan
-- ditolak). Kalau itu terjadi, jalankan ulang file ini.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS,
-- DROP CONSTRAINT IF EXISTS + ADD, CREATE OR REPLACE FUNCTION.
-- TIDAK menyentuh webhook/pembayaran, soal_ai, materi, tryout_attempts, dan alur tinjau sejawat.
--
-- ============================================================================
-- DRY-RUN (SQL Editor Supabase, satu kali eksekusi)
-- ============================================================================
--     BEGIN;
--     <isi file ini>
--     <isi file ini SEKALI LAGI>                    -- bukti idempotent
--     <isi db/test_studio_soal_impor_DRYRUN.sql>
--     ROLLBACK;
--   Harapan: NOTICE "STUDIO SOAL IMPOR DRY-RUN [v1]: SEMUA SKENARIO LULUS".
-- Verifikasi sesudah jalan sungguhan: db/add_impor_soal_verify.sql.
-- Pembatalan: db/add_impor_soal_rollback.sql.
--
-- ============================================================================
-- HASIL RPC: JSONB { "status": "<kode>", ... }
-- ============================================================================
-- studio_soal_impor_admin : 'disimpan' (+ batch_id, jumlah_soal, jumlah_stimulus)
--     gagal: input_tidak_valid | bukan_admin | terlalu_banyak
--            | data_tidak_valid (+ jenis, indeks, detail; SELURUH batch dibatalkan)
-- studio_soal_terbitkan_admin : 'selesai' (+ diterbitkan[], stimulus_diterbitkan[],
--     dilewati[{id, alasan}]; alasan: tidak_ditemukan | bukan_draf | bukan_buatan_sendiri
--     | stimulus_tidak_valid | data_tidak_valid)
--     gagal: input_tidak_valid | bukan_admin | terlalu_banyak

-- ============================================================================
-- 1. TABEL & KOLOM
-- ============================================================================
CREATE TABLE IF NOT EXISTS soal_impor_batch (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL REFERENCES users(id),
    nama_berkas VARCHAR(200) NOT NULL DEFAULT '',
    jumlah_baris INT NOT NULL DEFAULT 0,      -- baris data di berkas soal.csv
    jumlah_ok INT NOT NULL DEFAULT 0,         -- soal yang tersimpan sebagai draf
    jumlah_gagal INT NOT NULL DEFAULT 0,      -- baris galat yang dilewati
    dibuat_pada TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE soal_impor_batch DROP CONSTRAINT IF EXISTS soal_impor_batch_angka_valid;
ALTER TABLE soal_impor_batch ADD CONSTRAINT soal_impor_batch_angka_valid
    CHECK (jumlah_baris >= 0 AND jumlah_ok >= 0 AND jumlah_gagal >= 0);

CREATE INDEX IF NOT EXISTS idx_soal_impor_batch_admin ON soal_impor_batch(admin_id, dibuat_pada DESC);

ALTER TABLE soal_bank ADD COLUMN IF NOT EXISTS impor_batch_id UUID REFERENCES soal_impor_batch(id);
ALTER TABLE soal_stimulus ADD COLUMN IF NOT EXISTS sumber TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE soal_stimulus ADD COLUMN IF NOT EXISTS impor_batch_id UUID REFERENCES soal_impor_batch(id);

CREATE INDEX IF NOT EXISTS idx_soal_bank_impor_batch ON soal_bank(impor_batch_id) WHERE impor_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_soal_stimulus_impor_batch ON soal_stimulus(impor_batch_id) WHERE impor_batch_id IS NOT NULL;

-- ============================================================================
-- 2. CONSTRAINT
-- ============================================================================
ALTER TABLE soal_bank DROP CONSTRAINT IF EXISTS soal_bank_sumber_valid;
ALTER TABLE soal_bank ADD CONSTRAINT soal_bank_sumber_valid CHECK (sumber IN ('manual', 'buatan_sendiri'));

ALTER TABLE soal_stimulus DROP CONSTRAINT IF EXISTS soal_stimulus_sumber_valid;
ALTER TABLE soal_stimulus ADD CONSTRAINT soal_stimulus_sumber_valid CHECK (sumber IN ('manual', 'buatan_sendiri'));

-- Soal/stimulus hasil unggahan Admin ditulis DAN diterbitkan Admin yang sama, jadi
-- peninjau = penulis diizinkan hanya untuk sumber 'buatan_sendiri'. Jejaknya ada di
-- soal_tinjauan_log (aksi 'terbit_admin_buatan_sendiri').
ALTER TABLE soal_bank DROP CONSTRAINT IF EXISTS soal_bank_peninjau_bukan_penulis;
ALTER TABLE soal_bank ADD CONSTRAINT soal_bank_peninjau_bukan_penulis
    CHECK (peninjau_id IS NULL OR peninjau_id <> penulis_id OR sumber = 'buatan_sendiri');

ALTER TABLE soal_stimulus DROP CONSTRAINT IF EXISTS soal_stimulus_peninjau_bukan_penulis;
ALTER TABLE soal_stimulus ADD CONSTRAINT soal_stimulus_peninjau_bukan_penulis
    CHECK (peninjau_id IS NULL OR peninjau_id <> penulis_id OR sumber = 'buatan_sendiri');

ALTER TABLE soal_tinjauan_log DROP CONSTRAINT IF EXISTS soal_tinjauan_log_aksi_valid;
ALTER TABLE soal_tinjauan_log ADD CONSTRAINT soal_tinjauan_log_aksi_valid
    CHECK (aksi IN ('ajukan', 'tarik', 'setujui', 'tolak', 'publikasi_admin', 'arsipkan',
                    'publikasi_paket', 'versi_baru', 'terbit_admin_buatan_sendiri'));

ALTER TABLE soal_tinjauan_log DROP CONSTRAINT IF EXISTS soal_tinjauan_log_terbit_admin_buatan_sendiri;
ALTER TABLE soal_tinjauan_log ADD CONSTRAINT soal_tinjauan_log_terbit_admin_buatan_sendiri
    CHECK (aksi <> 'terbit_admin_buatan_sendiri' OR peran = 'admin');

-- ============================================================================
-- 3. PENANDA TRANSAKSI IMPOR
-- ============================================================================
-- Hanya studio_soal_impor_admin yang menyalakannya (setelah cek Admin aktif),
-- lokal per transaksi, dan dimatikan lagi sebelum fungsi selesai.
CREATE OR REPLACE FUNCTION studio_soal_impor_aktif()
RETURNS BOOLEAN
LANGUAGE sql STABLE
SET search_path = public
AS $$
    SELECT coalesce(current_setting('studio_soal.impor', true), '') = 'on';
$$;

-- ============================================================================
-- 4. TRIGGER RELASI — pembuat sumber 'buatan_sendiri' = Admin aktif (di dalam RPC impor)
-- ============================================================================
-- Salinan studio_soal_cek_relasi() dari db/add_studio_soal.sql; satu-satunya
-- perubahan: syarat "mentor eligible" saat INSERT dilewati untuk baris
-- sumber 'buatan_sendiri' yang dibuat Admin aktif DI DALAM studio_soal_impor_admin.
CREATE OR REPLACE FUNCTION studio_soal_cek_relasi()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_new JSONB := to_jsonb(NEW);
    v_old JSONB;
    v_subtes_berubah BOOLEAN;
    v_pemilik UUID;
    v_stimulus soal_stimulus%ROWTYPE;
    v_topik_subtes UUID;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        v_old := to_jsonb(OLD);
    END IF;
    v_subtes_berubah := TG_OP = 'INSERT' OR (v_old->>'subtes_id') IS DISTINCT FROM (v_new->>'subtes_id');

    IF v_subtes_berubah AND NOT studio_soal_subtes_snbt((v_new->>'subtes_id')::uuid) THEN
        RAISE EXCEPTION 'studio_soal: Tahap 1 hanya menerima subtes SNBT (kategori tps/literasi)';
    END IF;

    IF TG_OP = 'INSERT' AND TG_TABLE_NAME IN ('soal_bank', 'soal_stimulus', 'paket_soal') THEN
        v_pemilik := coalesce(v_new->>'penulis_id', v_new->>'pembuat_id')::uuid;
        IF NOT (
               (v_new->>'sumber') = 'buatan_sendiri'
               AND studio_soal_impor_aktif()
               AND studio_soal_admin_aktif(v_pemilik)
           )
           AND NOT studio_soal_mentor_eligible(v_pemilik, (v_new->>'subtes_id')::uuid) THEN
            RAISE EXCEPTION 'studio_soal: pembuat bukan mentor aktif yang mengampu subtes ini';
        END IF;
    END IF;

    IF TG_TABLE_NAME = 'paket_soal' AND TG_OP = 'UPDATE' AND v_subtes_berubah
       AND EXISTS (SELECT 1 FROM paket_soal_item WHERE paket_id = NEW.id) THEN
        RAISE EXCEPTION 'studio_soal: subtes paket tidak bisa diganti selama paket berisi soal';
    END IF;

    IF TG_TABLE_NAME = 'soal_bank' THEN
        IF NEW.topik_id IS NOT NULL
           AND (v_subtes_berubah OR (v_old->>'topik_id') IS DISTINCT FROM (v_new->>'topik_id')) THEN
            SELECT subtes_id INTO v_topik_subtes FROM soal_topik WHERE id = NEW.topik_id;
            IF v_topik_subtes IS DISTINCT FROM NEW.subtes_id THEN
                RAISE EXCEPTION 'studio_soal: topik berasal dari subtes lain';
            END IF;
        END IF;

        IF NEW.stimulus_id IS NOT NULL
           AND (v_subtes_berubah OR (v_old->>'stimulus_id') IS DISTINCT FROM (v_new->>'stimulus_id')) THEN
            SELECT * INTO v_stimulus FROM soal_stimulus WHERE id = NEW.stimulus_id;
            IF v_stimulus.subtes_id IS DISTINCT FROM NEW.subtes_id THEN
                RAISE EXCEPTION 'studio_soal: stimulus berasal dari subtes lain';
            END IF;
            IF v_stimulus.penulis_id IS DISTINCT FROM NEW.penulis_id THEN
                RAISE EXCEPTION 'studio_soal: hanya penulis stimulus yang boleh menambah soal ke stimulus itu';
            END IF;
            IF v_stimulus.status IN ('diajukan', 'digantikan', 'diarsipkan') THEN
                RAISE EXCEPTION 'studio_soal: soal tidak bisa ditambahkan ke stimulus berstatus %', v_stimulus.status;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END $$;

-- ============================================================================
-- 5. RPC IMPOR (DRAF)
-- ============================================================================
-- p_batch (JSONB, dari API — sudah lolos validasi impor di server):
--   nama_berkas, jumlah_baris, jumlah_gagal
--   stimulus: [ { kode, subtes_id, judul_internal, konten, sumber_rujukan } ]
--   soal    : [ { subtes_id, topik_id, stimulus_kode, urutan_dalam_stimulus, tipe, redaksi,
--                 konten, kunci, pembahasan, sumber_rujukan, tingkat_kesulitan,
--                 level_kognitif, estimasi_waktu_detik } ]
-- Semua-atau-tidak: seluruh penyisipan ada di satu sub-transaksi; galat apa pun
-- membatalkan SEMUA baris batch ini (juga batch-nya).
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

-- ============================================================================
-- 6. RPC TERBIT OLEH ADMIN
-- ============================================================================
-- Draf sumber 'buatan_sendiri' -> terpublikasi. Bacaan (stimulus) draf milik soal itu ikut
-- terbit. Soal lain dilewati dan dilaporkan; satu soal bermasalah tidak
-- menggagalkan yang lain (tiap soal = sub-transaksi sendiri).
CREATE OR REPLACE FUNCTION studio_soal_terbitkan_admin(p_admin_id UUID, p_ids UUID[], p_catatan TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_ids UUID[];
    v_id UUID;
    v_soal soal_bank%ROWTYPE;
    v_stimulus soal_stimulus%ROWTYPE;
    v_ok UUID[] := ARRAY[]::UUID[];
    v_stimulus_ok UUID[];
    v_dilewati JSONB := '[]'::jsonb;
    v_alasan TEXT;
    v_detail TEXT;
    v_catatan TEXT;
BEGIN
    PERFORM studio_soal_mulai_rpc();

    IF p_admin_id IS NULL OR p_ids IS NULL THEN
        RETURN jsonb_build_object('status', 'input_tidak_valid');
    END IF;
    IF NOT studio_soal_admin_aktif(p_admin_id) THEN
        RETURN jsonb_build_object('status', 'bukan_admin');
    END IF;
    SELECT coalesce(array_agg(DISTINCT x ORDER BY x), ARRAY[]::UUID[]) INTO v_ids
    FROM unnest(p_ids) AS x WHERE x IS NOT NULL;
    IF cardinality(v_ids) = 0 THEN
        RETURN jsonb_build_object('status', 'input_tidak_valid');
    END IF;
    IF cardinality(v_ids) > 200 THEN
        RETURN jsonb_build_object('status', 'terlalu_banyak', 'maks', 200);
    END IF;
    v_catatan := nullif(btrim(coalesce(p_catatan, ''), E' \t\r\n'), '');

    FOREACH v_id IN ARRAY v_ids LOOP
        v_alasan := NULL;
        v_detail := NULL;
        BEGIN
            SELECT * INTO v_soal FROM soal_bank WHERE id = v_id FOR UPDATE;
            IF NOT FOUND THEN
                v_alasan := 'tidak_ditemukan';
            ELSIF v_soal.status <> 'draf' THEN
                v_alasan := 'bukan_draf';
            ELSIF v_soal.sumber <> 'buatan_sendiri' THEN
                v_alasan := 'bukan_buatan_sendiri';
            ELSE
                IF v_soal.stimulus_id IS NOT NULL THEN
                    SELECT * INTO v_stimulus FROM soal_stimulus WHERE id = v_soal.stimulus_id FOR UPDATE;
                    IF v_stimulus.status = 'draf' AND v_stimulus.sumber = 'buatan_sendiri' THEN
                        UPDATE soal_stimulus
                        SET status = 'terpublikasi', peninjau_id = p_admin_id, ditinjau_pada = now(), alasan_tolak = NULL
                        WHERE id = v_stimulus.id;
                        PERFORM studio_soal_tulis_log('stimulus', v_stimulus.id, p_admin_id, 'admin',
                                                      'terbit_admin_buatan_sendiri', v_catatan, NULL, to_jsonb(v_stimulus));
                    ELSIF v_stimulus.status <> 'terpublikasi' THEN
                        v_alasan := 'stimulus_tidak_valid';
                    END IF;
                END IF;
                IF v_alasan IS NULL THEN
                    UPDATE soal_bank
                    SET status = 'terpublikasi', peninjau_id = p_admin_id, ditinjau_pada = now(), alasan_tolak = NULL
                    WHERE id = v_soal.id;
                    PERFORM studio_soal_tulis_log('soal', v_soal.id, p_admin_id, 'admin',
                                                  'terbit_admin_buatan_sendiri', v_catatan, NULL, to_jsonb(v_soal));
                    v_ok := v_ok || v_soal.id;
                END IF;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            -- Sub-transaksi dibatalkan: stimulus yang sempat terbit untuk soal ini ikut batal.
            v_alasan := 'data_tidak_valid';
            v_detail := SQLERRM;
        END;
        IF v_alasan IS NOT NULL THEN
            v_dilewati := v_dilewati || jsonb_build_array(
                jsonb_strip_nulls(jsonb_build_object('id', v_id, 'alasan', v_alasan, 'detail', v_detail)));
        END IF;
    END LOOP;

    SELECT coalesce(array_agg(id), ARRAY[]::UUID[]) INTO v_stimulus_ok
    FROM soal_stimulus
    WHERE id IN (SELECT stimulus_id FROM soal_bank WHERE id = ANY (v_ok) AND stimulus_id IS NOT NULL)
      AND peninjau_id = p_admin_id AND ditinjau_pada = now();

    RETURN jsonb_build_object('status', 'selesai', 'diterbitkan', to_jsonb(v_ok),
                              'stimulus_diterbitkan', to_jsonb(v_stimulus_ok), 'dilewati', v_dilewati);
END $$;

-- ============================================================================
-- 7. RLS & HAK EXECUTE
-- ============================================================================
ALTER TABLE soal_impor_batch ENABLE ROW LEVEL SECURITY;

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
