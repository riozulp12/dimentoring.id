-- Migration: presensi multi-mentor (PRD Bagian 7.5.5, Bagian 13 — SesiKelas).
-- Tiap sesi yang ditandai mencatat SIAPA mentor yang menandai + mapel-nya
-- (snapshot nama Subtes saat ditandai, supaya tetap terbaca walau pasangan
-- kelas_subtes_mentor nanti diubah Admin). Total sesi per siswa TIDAK
-- berubah (tetap kelas.jumlah_sesi per enrollment, dibagi antar mentor).
-- Baris lama: mentor_id & nama_mapel NULL, tampil seperti sebelumnya.
--
-- Jalankan di SQL Editor Supabase SETELAH db/add_sesi_review_log.sql dan
-- SEBELUM deploy kode yang menulis kolom ini. Idempotent-safe.

ALTER TABLE sesi_kelas ADD COLUMN IF NOT EXISTS mentor_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE sesi_kelas ADD COLUMN IF NOT EXISTS nama_mapel TEXT;

-- Dasar batas harian "satu penandaan per enrollment per MENTOR per hari WIB".
CREATE INDEX IF NOT EXISTS idx_sesi_kelas_enrollment_mentor ON sesi_kelas(enrollment_id, mentor_id);

-- putuskan_sesi_review (db/add_sesi_review_log.sql) diperbarui: "batalkan"
-- juga mengosongkan mentor_id & nama_mapel, karena sesi kembali "belum
-- terjadi" (snapshot sebelumnya tetap ada di sesi_review_log.snapshot_sebelum).
CREATE OR REPLACE FUNCTION putuskan_sesi_review(
    p_sesi_id UUID,
    p_admin_id UUID,
    p_keputusan TEXT,
    p_alasan TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_sesi sesi_kelas%ROWTYPE;
BEGIN
    SELECT * INTO v_sesi FROM sesi_kelas
    WHERE id = p_sesi_id AND perlu_review_admin = true
    FOR UPDATE;
    IF NOT FOUND THEN
        RETURN false;
    END IF;

    INSERT INTO sesi_review_log (sesi_id, admin_id, keputusan, snapshot_sebelum, alasan)
    VALUES (p_sesi_id, p_admin_id, p_keputusan, to_jsonb(v_sesi), NULLIF(btrim(p_alasan), ''));

    IF p_keputusan = 'setujui' THEN
        UPDATE sesi_kelas
        SET status_siswa = 'dikonfirmasi', perlu_review_admin = false
        WHERE id = p_sesi_id;
    ELSE
        -- 'batalkan' (nilai lain sudah ditolak CHECK di insert log di atas).
        UPDATE sesi_kelas
        SET dikonfirmasi_mentor = false,
            dikonfirmasi_mentor_pada = NULL,
            tanggal_dilaksanakan = NULL,
            status_siswa = 'belum',
            dikonfirmasi_siswa_pada = NULL,
            perlu_review_admin = false,
            mentor_id = NULL,
            nama_mapel = NULL
        WHERE id = p_sesi_id;
    END IF;

    RETURN true;
END $$;

-- CREATE OR REPLACE mempertahankan hak akses lama, diulang di sini supaya
-- aman walau file ini dijalankan di database yang hak aksesnya berbeda.
REVOKE ALL ON FUNCTION putuskan_sesi_review(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION putuskan_sesi_review(UUID, UUID, TEXT, TEXT) TO service_role;
