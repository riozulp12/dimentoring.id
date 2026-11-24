-- Rollback untuk db/add_impor_soal.sql: mengembalikan skema ke keadaan sebelum impor soal.
--
-- PERINGATAN — baca sebelum menjalankan:
--   * Tarik/revert kode PR impor (rute /api/admin/studio-soal/impor/* dan halaman "Impor Soal") SEBELUM
--     rollback, kalau tidak halaman itu akan error.
--   * Rollback SENGAJA GAGAL (dan membatalkan semuanya) bila masih ada baris sumber 'buatan_sendiri' di soal_bank /
--     soal_stimulus, atau log aksi 'terbit_admin_buatan_sendiri': CHECK lama ('manual' saja) tidak bisa dipasang.
--     Soal yang sudah terbit TIDAK boleh dihapus; arsipkan lebih dulu bila memang harus dibatalkan,
--     lalu putuskan sendiri nasib barisnya (rollback ini tidak menghapus soal).
--   * Kolom impor_batch_id / sumber (stimulus) dan tabel soal_impor_batch DIHAPUS beserta isinya.
--   * Tanpa BEGIN/COMMIT — Anda yang mengatur transaksi:
--     BEGIN; (pra-cek di bawah); (rollback); verifikasi; ROLLBACK (latihan) atau COMMIT (sungguhan).
--   * Aman dijalankan dua kali (IF EXISTS).

-- ---- KUERI 1 (pra-cek, harus 0 semua agar rollback bisa jalan) ----
SELECT 'soal_bank buatan_sendiri' AS objek, count(*) AS jumlah FROM soal_bank WHERE sumber = 'buatan_sendiri'
UNION ALL
SELECT 'soal_stimulus buatan_sendiri', count(*) FROM soal_stimulus WHERE sumber = 'buatan_sendiri'
UNION ALL
SELECT 'log terbit_admin_buatan_sendiri', count(*) FROM soal_tinjauan_log WHERE aksi = 'terbit_admin_buatan_sendiri';

-- ============================== ROLLBACK ==============================
DROP FUNCTION IF EXISTS studio_soal_terbitkan_admin(UUID, UUID[], TEXT);
DROP FUNCTION IF EXISTS studio_soal_impor_admin(UUID, JSONB);

-- Fungsi relasi versi ASLI (salinan dari db/add_studio_soal.sql).
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
        IF NOT studio_soal_mentor_eligible(v_pemilik, (v_new->>'subtes_id')::uuid) THEN
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

DROP FUNCTION IF EXISTS studio_soal_impor_aktif();

-- Constraint versi asli (gagal bila masih ada baris 'buatan_sendiri' — itu disengaja).
ALTER TABLE soal_bank DROP CONSTRAINT IF EXISTS soal_bank_sumber_valid;
ALTER TABLE soal_bank ADD CONSTRAINT soal_bank_sumber_valid CHECK (sumber IN ('manual'));

ALTER TABLE soal_bank DROP CONSTRAINT IF EXISTS soal_bank_peninjau_bukan_penulis;
ALTER TABLE soal_bank ADD CONSTRAINT soal_bank_peninjau_bukan_penulis
    CHECK (peninjau_id IS NULL OR peninjau_id <> penulis_id);

ALTER TABLE soal_stimulus DROP CONSTRAINT IF EXISTS soal_stimulus_peninjau_bukan_penulis;
ALTER TABLE soal_stimulus ADD CONSTRAINT soal_stimulus_peninjau_bukan_penulis
    CHECK (peninjau_id IS NULL OR peninjau_id <> penulis_id);
ALTER TABLE soal_stimulus DROP CONSTRAINT IF EXISTS soal_stimulus_sumber_valid;

ALTER TABLE soal_tinjauan_log DROP CONSTRAINT IF EXISTS soal_tinjauan_log_terbit_admin_buatan_sendiri;
ALTER TABLE soal_tinjauan_log DROP CONSTRAINT IF EXISTS soal_tinjauan_log_aksi_valid;
ALTER TABLE soal_tinjauan_log ADD CONSTRAINT soal_tinjauan_log_aksi_valid
    CHECK (aksi IN ('ajukan', 'tarik', 'setujui', 'tolak', 'publikasi_admin', 'arsipkan',
                    'publikasi_paket', 'versi_baru'));

-- Kolom & tabel.
DROP INDEX IF EXISTS idx_soal_bank_impor_batch;
DROP INDEX IF EXISTS idx_soal_stimulus_impor_batch;
ALTER TABLE soal_bank DROP COLUMN IF EXISTS impor_batch_id;
ALTER TABLE soal_stimulus DROP COLUMN IF EXISTS impor_batch_id;
ALTER TABLE soal_stimulus DROP COLUMN IF EXISTS sumber;
DROP TABLE IF EXISTS soal_impor_batch;
