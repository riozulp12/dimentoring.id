-- Migration: Studio Soal — PERAWATAN SOAL "BUATAN SENDIRI" OLEH ADMIN.
-- Additive: tidak mengubah tabel/kolom/data. Hanya fungsi dan daftar aksi log.
--
-- Isi:
--   1. Aksi log baru 'ubah_admin', 'hapus_draf_admin' (wajib peran admin)
--   2. RPC studio_soal_admin_hapus_batch_draf (hapus draf satu batch impor + bacaan draf
--      yang jadi tidak punya soal; soal bukan draf dipertahankan)
--   3. Perubahan kecil studio_soal_cek_relasi() dan studio_soal_jaga_penulis_eligible()
--   4-8. RPC studio_soal_admin_simpan | _versi_baru | _terbitkan_versi | _arsipkan | _hapus_draf
--   9. Hak EXECUTE (hanya service_role)
--
-- Semua RPC: SECURITY DEFINER + search_path dikunci, cek Admin aktif di database,
-- hanya baris sumber 'buatan_sendiri', mencatat soal_tinjauan_log.
--
-- Urutan: jalankan SETELAH add_studio_soal_draf.sql dan add_impor_soal.sql.
-- PERHATIAN: menjalankan ulang add_studio_soal.sql, add_studio_soal_draf.sql, atau
-- add_impor_soal.sql SESUDAH file ini mengembalikan fungsi trigger & daftar aksi log
-- ke versi lama (edit Admin ditolak). Kalau terjadi, jalankan ulang file ini.
--
-- Idempotent: DROP CONSTRAINT IF EXISTS + ADD, CREATE OR REPLACE FUNCTION.
-- TIDAK menyentuh webhook/pembayaran, soal_ai, materi, tryout_attempts, dan alur tinjau mentor.
--
-- DRY-RUN (SQL Editor Supabase, satu kali eksekusi):
--     BEGIN;
--     <isi file ini>
--     <isi file ini SEKALI LAGI>                    -- bukti idempotent
--     <isi db/test_studio_soal_impor_perawatan_DRYRUN.sql>
--     ROLLBACK;
--   Harapan: NOTICE "STUDIO SOAL PERAWATAN DRY-RUN [v1]: SEMUA SKENARIO LULUS".
-- Verifikasi sesudah jalan sungguhan: db/add_impor_perawatan_verify.sql.
-- Pembatalan: db/add_impor_perawatan_rollback.sql.
--
-- HASIL RPC: JSONB { "status": "<kode>", ... }
-- studio_soal_admin_hapus_batch_draf : 'dihapus' (+ jumlah_soal, jumlah_bacaan, dipertahankan)
--     gagal: input_tidak_valid | bukan_admin | tidak_ditemukan
-- studio_soal_admin_simpan          : 'disimpan' (+ soal_id, updated_at)
--     gagal: bukan_buatan_sendiri | terkunci | sudah_berubah | identitas_berubah | data_tidak_valid
-- studio_soal_admin_versi_baru      : 'versi_dibuat' (+ soal_id)
--     gagal: status_tidak_valid | ada_versi_terbuka (+ soal_id) | stimulus_tidak_aktif
-- studio_soal_admin_terbitkan_versi : 'versi_terbit' | semua kegagalan simpan
--     | status_tidak_valid | bukan_versi_baru | versi_lama_tidak_aktif | stimulus_tidak_aktif
-- studio_soal_admin_arsipkan        : 'diarsipkan'
--     gagal: status_tidak_valid | ada_versi_terbuka | dipakai_paket
-- studio_soal_admin_hapus_draf      : 'dihapus' (+ jumlah_bacaan)
--     gagal: status_tidak_valid | pernah_diajukan | dipakai_paket

-- ============================================================================
-- 1. AKSI LOG
-- ============================================================================
ALTER TABLE soal_tinjauan_log DROP CONSTRAINT IF EXISTS soal_tinjauan_log_aksi_valid;
ALTER TABLE soal_tinjauan_log ADD CONSTRAINT soal_tinjauan_log_aksi_valid
    CHECK (aksi IN ('ajukan', 'tarik', 'setujui', 'tolak', 'publikasi_admin', 'arsipkan',
                    'publikasi_paket', 'versi_baru', 'terbit_admin_buatan_sendiri',
                    'ubah_admin', 'hapus_draf_admin'));

ALTER TABLE soal_tinjauan_log DROP CONSTRAINT IF EXISTS soal_tinjauan_log_aksi_khusus_admin;
ALTER TABLE soal_tinjauan_log ADD CONSTRAINT soal_tinjauan_log_aksi_khusus_admin
    CHECK (aksi NOT IN ('ubah_admin', 'hapus_draf_admin') OR peran = 'admin');

-- ============================================================================
-- 2. HAPUS DRAF SATU BATCH IMPOR
-- ============================================================================
-- Dipertahankan: soal bukan draf, serta draf yang pernah diajukan atau dipakai
-- paket (tidak terjadi lewat jalur Admin; jaring pengaman). Baris batch tetap ada
-- sebagai riwayat unggahan.
CREATE OR REPLACE FUNCTION studio_soal_admin_hapus_batch_draf(p_admin_id UUID, p_batch_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_soal soal_bank%ROWTYPE;
    v_stimulus soal_stimulus%ROWTYPE;
    v_n_soal INT := 0;
    v_n_bacaan INT := 0;
    v_tahan INT;
BEGIN
    PERFORM studio_soal_mulai_rpc();
    IF p_admin_id IS NULL OR p_batch_id IS NULL THEN
        RETURN jsonb_build_object('status', 'input_tidak_valid');
    END IF;
    IF NOT studio_soal_admin_aktif(p_admin_id) THEN
        RETURN jsonb_build_object('status', 'bukan_admin');
    END IF;
    PERFORM 1 FROM soal_impor_batch WHERE id = p_batch_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'tidak_ditemukan');
    END IF;

    FOR v_soal IN
        SELECT * FROM soal_bank
        WHERE impor_batch_id = p_batch_id AND sumber = 'buatan_sendiri' AND status = 'draf'
        ORDER BY id
        FOR UPDATE
    LOOP
        IF EXISTS (SELECT 1 FROM soal_tinjauan_log WHERE objek_id = v_soal.id AND aksi = 'ajukan')
           OR EXISTS (SELECT 1 FROM paket_soal_item WHERE soal_id = v_soal.id) THEN
            CONTINUE;
        END IF;
        DELETE FROM soal_bank WHERE id = v_soal.id;
        PERFORM studio_soal_tulis_log('soal', v_soal.id, p_admin_id, 'admin', 'hapus_draf_admin', NULL, NULL,
                                      to_jsonb(v_soal));
        v_n_soal := v_n_soal + 1;
    END LOOP;

    SELECT count(*) INTO v_tahan FROM soal_bank WHERE impor_batch_id = p_batch_id;

    FOR v_stimulus IN
        SELECT s.* FROM soal_stimulus s
        WHERE s.impor_batch_id = p_batch_id AND s.sumber = 'buatan_sendiri' AND s.status = 'draf'
          AND NOT EXISTS (SELECT 1 FROM soal_bank b WHERE b.stimulus_id = s.id)
          AND NOT EXISTS (SELECT 1 FROM soal_stimulus n WHERE n.menggantikan_id = s.id)
          AND NOT EXISTS (SELECT 1 FROM soal_tinjauan_log l WHERE l.objek_id = s.id AND l.aksi = 'ajukan')
        ORDER BY s.id
        FOR UPDATE
    LOOP
        DELETE FROM soal_stimulus WHERE id = v_stimulus.id;
        PERFORM studio_soal_tulis_log('stimulus', v_stimulus.id, p_admin_id, 'admin', 'hapus_draf_admin', NULL, NULL,
                                      to_jsonb(v_stimulus));
        v_n_bacaan := v_n_bacaan + 1;
    END LOOP;

    RETURN jsonb_build_object('status', 'dihapus', 'jumlah_soal', v_n_soal, 'jumlah_bacaan', v_n_bacaan,
                              'dipertahankan', v_tahan);
END $$;

-- ============================================================================
-- 3. TRIGGER: perubahan kecil supaya Admin bisa menyunting soal Buatan Sendiri
-- ============================================================================
-- Penanda studio_soal.impor hanya dinyalakan di dalam RPC yang SUDAH memeriksa Admin
-- aktif (studio_soal_impor_admin, studio_soal_admin_*), lokal per transaksi.

-- Salinan versi db/add_impor_soal.sql; satu-satunya perubahan: draf VERSI BARU
-- (menggantikan_id terisi) tetap boleh dibuat walau penulis aslinya bukan Admin
-- aktif lagi. Penulis dipertahankan karena wajib sama dengan penulis bacaannya.
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
               AND (studio_soal_admin_aktif(v_pemilik) OR (v_new->>'menggantikan_id') IS NOT NULL)
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

-- Salinan versi db/add_studio_soal_draf.sql; tambahan: Admin menyunting baris Buatan
-- Sendiri lewat RPC (penanda transaksi) tidak butuh penugasan mentor.
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
       AND NOT (studio_soal_impor_aktif() AND OLD.sumber = 'buatan_sendiri' AND NEW.sumber = 'buatan_sendiri')
       AND NOT studio_soal_mentor_eligible(NEW.penulis_id, NEW.subtes_id) THEN
        RAISE EXCEPTION 'studio_soal: penulis tidak (lagi) ditugaskan ke subtes ini — isi % tidak bisa diubah', TG_TABLE_NAME;
    END IF;
    RETURN NEW;
END $$;

-- ============================================================================
-- 4. SIMPAN DRAF
-- ============================================================================
-- p_updated_at = updated_at yang dibaca layar; berbeda = soal sudah diubah di tempat lain.
-- p_data sama bentuknya dengan studio_soal_simpan_soal (sudah divalidasi API).
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

-- ============================================================================
-- 5. VERSI BARU DARI SOAL TERBIT
-- ============================================================================
-- Pola studio_soal_buat_versi_soal: keluarga sama, versi+1, menggantikan_id = versi
-- lama; versi lama tetap terbit. impor_batch_id ikut disalin (asal-usul soal).
CREATE OR REPLACE FUNCTION studio_soal_admin_versi_baru(p_admin_id UUID, p_soal_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_soal soal_bank%ROWTYPE;
    v_terbuka UUID;
    v_baru UUID;
BEGIN
    PERFORM studio_soal_mulai_rpc();
    IF p_admin_id IS NULL OR p_soal_id IS NULL THEN RETURN jsonb_build_object('status', 'input_tidak_valid'); END IF;
    IF NOT studio_soal_admin_aktif(p_admin_id) THEN RETURN jsonb_build_object('status', 'bukan_admin'); END IF;
    SELECT * INTO v_soal FROM soal_bank WHERE id = p_soal_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'tidak_ditemukan'); END IF;
    IF v_soal.sumber <> 'buatan_sendiri' THEN RETURN jsonb_build_object('status', 'bukan_buatan_sendiri'); END IF;
    IF v_soal.status <> 'terpublikasi' THEN RETURN jsonb_build_object('status', 'status_tidak_valid'); END IF;

    SELECT id INTO v_terbuka FROM soal_bank
    WHERE keluarga_id = v_soal.keluarga_id AND status IN ('draf', 'diajukan', 'ditolak');
    IF FOUND THEN RETURN jsonb_build_object('status', 'ada_versi_terbuka', 'soal_id', v_terbuka); END IF;
    IF v_soal.stimulus_id IS NOT NULL
       AND (SELECT status FROM soal_stimulus WHERE id = v_soal.stimulus_id) <> 'terpublikasi' THEN
        RETURN jsonb_build_object('status', 'stimulus_tidak_aktif');
    END IF;

    BEGIN
        PERFORM set_config('studio_soal.impor', 'on', true);
        INSERT INTO soal_bank (
            keluarga_id, versi, menggantikan_id, subtes_id, topik_id, stimulus_id, urutan_dalam_stimulus,
            tipe, redaksi, konten, kunci, pembahasan, sumber_rujukan, tingkat_kesulitan, level_kognitif,
            estimasi_waktu_detik, aturan_skor, bobot, sumber, penulis_id, impor_batch_id
        )
        SELECT keluarga_id,
               (SELECT max(versi) + 1 FROM soal_bank WHERE keluarga_id = v_soal.keluarga_id),
               id, subtes_id, topik_id, stimulus_id, urutan_dalam_stimulus,
               tipe, redaksi, konten, kunci, pembahasan, sumber_rujukan, tingkat_kesulitan, level_kognitif,
               estimasi_waktu_detik, aturan_skor, bobot, sumber, penulis_id, impor_batch_id
        FROM soal_bank WHERE id = p_soal_id
        RETURNING id INTO v_baru;
        PERFORM studio_soal_tulis_log('soal', v_baru, p_admin_id, 'admin', 'versi_baru', NULL, NULL,
                                      jsonb_build_object('dari', p_soal_id));
        PERFORM set_config('studio_soal.impor', 'off', true);
    EXCEPTION WHEN check_violation OR unique_violation OR raise_exception THEN
        RETURN jsonb_build_object('status', 'data_tidak_valid', 'detail', SQLERRM);
    END;

    RETURN jsonb_build_object('status', 'versi_dibuat', 'soal_id', v_baru);
END $$;

-- ============================================================================
-- 6. SIMPAN + TERBITKAN VERSI BARU (satu transaksi)
-- ============================================================================
-- Simpan isi, versi lama -> 'digantikan' (dulu, karena indeks satu-terbit), versi baru
-- -> 'terpublikasi'. Gagal di langkah mana pun = tidak ada yang berubah.
CREATE OR REPLACE FUNCTION studio_soal_admin_terbitkan_versi(p_admin_id UUID, p_soal_id UUID, p_updated_at TIMESTAMPTZ, p_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_soal soal_bank%ROWTYPE;
    v_lama soal_bank%ROWTYPE;
    v_simpan JSONB;
BEGIN
    PERFORM studio_soal_mulai_rpc();
    IF p_admin_id IS NULL OR p_soal_id IS NULL THEN RETURN jsonb_build_object('status', 'input_tidak_valid'); END IF;
    IF NOT studio_soal_admin_aktif(p_admin_id) THEN RETURN jsonb_build_object('status', 'bukan_admin'); END IF;
    SELECT * INTO v_soal FROM soal_bank WHERE id = p_soal_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'tidak_ditemukan'); END IF;
    IF v_soal.sumber <> 'buatan_sendiri' THEN RETURN jsonb_build_object('status', 'bukan_buatan_sendiri'); END IF;
    IF v_soal.status <> 'draf' THEN RETURN jsonb_build_object('status', 'status_tidak_valid'); END IF;
    IF v_soal.menggantikan_id IS NULL THEN RETURN jsonb_build_object('status', 'bukan_versi_baru'); END IF;
    SELECT * INTO v_lama FROM soal_bank WHERE id = v_soal.menggantikan_id FOR UPDATE;
    IF v_lama.status IS DISTINCT FROM 'terpublikasi' THEN
        RETURN jsonb_build_object('status', 'versi_lama_tidak_aktif');
    END IF;
    IF v_soal.stimulus_id IS NOT NULL
       AND (SELECT status FROM soal_stimulus WHERE id = v_soal.stimulus_id) <> 'terpublikasi' THEN
        RETURN jsonb_build_object('status', 'stimulus_tidak_aktif');
    END IF;

    BEGIN
        v_simpan := studio_soal_admin_simpan(p_admin_id, p_soal_id, p_updated_at, p_data);
        IF v_simpan->>'status' <> 'disimpan' THEN
            RETURN v_simpan;
        END IF;
        SELECT * INTO v_soal FROM soal_bank WHERE id = p_soal_id;
        UPDATE soal_bank SET status = 'digantikan' WHERE id = v_lama.id;
        UPDATE soal_bank
        SET status = 'terpublikasi', peninjau_id = p_admin_id, ditinjau_pada = now(), alasan_tolak = NULL
        WHERE id = p_soal_id;
        PERFORM studio_soal_tulis_log('soal', p_soal_id, p_admin_id, 'admin', 'terbit_admin_buatan_sendiri', NULL, NULL,
                                      to_jsonb(v_soal) || jsonb_build_object('menggantikan', v_lama.id));
        PERFORM studio_soal_sinkron_paket(ARRAY[p_soal_id]);
    EXCEPTION WHEN check_violation OR unique_violation OR not_null_violation OR raise_exception THEN
        RETURN jsonb_build_object('status', 'data_tidak_valid', 'detail', SQLERRM);
    END;

    RETURN jsonb_build_object('status', 'versi_terbit', 'soal_id', p_soal_id, 'menggantikan_id', v_lama.id);
END $$;

-- ============================================================================
-- 7. ARSIPKAN SOAL TERBIT
-- ============================================================================
-- Pemeriksaan tambahan Admin (sumber, status, versi terbuka), lalu memakai ulang
-- studio_soal_arsipkan_soal (cek paket + log).
CREATE OR REPLACE FUNCTION studio_soal_admin_arsipkan(p_admin_id UUID, p_soal_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_soal soal_bank%ROWTYPE;
    v_terbuka UUID;
BEGIN
    PERFORM studio_soal_mulai_rpc();
    IF p_admin_id IS NULL OR p_soal_id IS NULL THEN RETURN jsonb_build_object('status', 'input_tidak_valid'); END IF;
    IF NOT studio_soal_admin_aktif(p_admin_id) THEN RETURN jsonb_build_object('status', 'bukan_admin'); END IF;
    SELECT * INTO v_soal FROM soal_bank WHERE id = p_soal_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'tidak_ditemukan'); END IF;
    IF v_soal.sumber <> 'buatan_sendiri' THEN RETURN jsonb_build_object('status', 'bukan_buatan_sendiri'); END IF;
    IF v_soal.status <> 'terpublikasi' THEN RETURN jsonb_build_object('status', 'status_tidak_valid'); END IF;
    SELECT id INTO v_terbuka FROM soal_bank
    WHERE keluarga_id = v_soal.keluarga_id AND status IN ('draf', 'diajukan', 'ditolak');
    IF FOUND THEN RETURN jsonb_build_object('status', 'ada_versi_terbuka', 'soal_id', v_terbuka); END IF;
    RETURN studio_soal_arsipkan_soal(p_soal_id, p_admin_id, 'admin');
END $$;

-- ============================================================================
-- 8. HAPUS SATU DRAF
-- ============================================================================
-- Hanya draf. Bacaan draf Buatan Sendiri yang jadi tidak punya soal ikut dihapus.
CREATE OR REPLACE FUNCTION studio_soal_admin_hapus_draf(p_admin_id UUID, p_soal_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_soal soal_bank%ROWTYPE;
    v_stimulus soal_stimulus%ROWTYPE;
    v_n_bacaan INT := 0;
BEGIN
    PERFORM studio_soal_mulai_rpc();
    IF p_admin_id IS NULL OR p_soal_id IS NULL THEN RETURN jsonb_build_object('status', 'input_tidak_valid'); END IF;
    IF NOT studio_soal_admin_aktif(p_admin_id) THEN RETURN jsonb_build_object('status', 'bukan_admin'); END IF;
    SELECT * INTO v_soal FROM soal_bank WHERE id = p_soal_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'tidak_ditemukan'); END IF;
    IF v_soal.sumber <> 'buatan_sendiri' THEN RETURN jsonb_build_object('status', 'bukan_buatan_sendiri'); END IF;
    IF v_soal.status <> 'draf' THEN RETURN jsonb_build_object('status', 'status_tidak_valid'); END IF;
    IF EXISTS (SELECT 1 FROM soal_tinjauan_log WHERE objek_id = p_soal_id AND aksi = 'ajukan') THEN
        RETURN jsonb_build_object('status', 'pernah_diajukan');
    END IF;
    IF EXISTS (SELECT 1 FROM paket_soal_item WHERE soal_id = p_soal_id) THEN
        RETURN jsonb_build_object('status', 'dipakai_paket');
    END IF;

    DELETE FROM soal_bank WHERE id = p_soal_id;
    PERFORM studio_soal_tulis_log('soal', p_soal_id, p_admin_id, 'admin', 'hapus_draf_admin', NULL, NULL, to_jsonb(v_soal));

    SELECT s.* INTO v_stimulus FROM soal_stimulus s
    WHERE s.id = v_soal.stimulus_id AND s.sumber = 'buatan_sendiri' AND s.status = 'draf'
      AND NOT EXISTS (SELECT 1 FROM soal_bank b WHERE b.stimulus_id = s.id)
      AND NOT EXISTS (SELECT 1 FROM soal_stimulus n WHERE n.menggantikan_id = s.id)
      AND NOT EXISTS (SELECT 1 FROM soal_tinjauan_log l WHERE l.objek_id = s.id AND l.aksi = 'ajukan')
    FOR UPDATE;
    IF FOUND THEN
        DELETE FROM soal_stimulus WHERE id = v_stimulus.id;
        PERFORM studio_soal_tulis_log('stimulus', v_stimulus.id, p_admin_id, 'admin', 'hapus_draf_admin', NULL, NULL,
                                      to_jsonb(v_stimulus));
        v_n_bacaan := 1;
    END IF;

    RETURN jsonb_build_object('status', 'dihapus', 'jumlah_bacaan', v_n_bacaan);
END $$;

-- ============================================================================
-- 9. HAK EXECUTE
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
