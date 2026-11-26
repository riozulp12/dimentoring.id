-- Migration: Studio Soal — PERAWATAN SOAL "BUATAN SENDIRI" OLEH ADMIN.
-- Additive: tidak mengubah tabel/kolom/data. Hanya fungsi studio_soal_admin_* dan
-- daftar aksi log.
--
-- Isi:
--   1. Aksi log baru 'hapus_draf_admin' (wajib peran admin)
--   2. RPC studio_soal_admin_hapus_batch_draf (hapus draf satu batch impor + bacaan draf
--      yang jadi tidak punya soal; soal bukan draf dipertahankan)
--   3. Hak EXECUTE (hanya service_role)
--
-- Semua RPC: SECURITY DEFINER + search_path dikunci, cek Admin aktif di database,
-- hanya baris sumber 'buatan_sendiri', mencatat soal_tinjauan_log.
--
-- Urutan: jalankan SETELAH add_impor_soal.sql.
-- PERHATIAN: menjalankan ulang add_studio_soal.sql atau add_impor_soal.sql SESUDAH
-- file ini mempersempit daftar aksi log kembali (gagal bila log aksi baru sudah ada).
-- Kalau terjadi, jalankan ulang file ini.
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

-- ============================================================================
-- 1. AKSI LOG
-- ============================================================================
ALTER TABLE soal_tinjauan_log DROP CONSTRAINT IF EXISTS soal_tinjauan_log_aksi_valid;
ALTER TABLE soal_tinjauan_log ADD CONSTRAINT soal_tinjauan_log_aksi_valid
    CHECK (aksi IN ('ajukan', 'tarik', 'setujui', 'tolak', 'publikasi_admin', 'arsipkan',
                    'publikasi_paket', 'versi_baru', 'terbit_admin_buatan_sendiri',
                    'hapus_draf_admin'));

ALTER TABLE soal_tinjauan_log DROP CONSTRAINT IF EXISTS soal_tinjauan_log_aksi_khusus_admin;
ALTER TABLE soal_tinjauan_log ADD CONSTRAINT soal_tinjauan_log_aksi_khusus_admin
    CHECK (aksi NOT IN ('hapus_draf_admin') OR peran = 'admin');

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
-- 3. HAK EXECUTE
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
