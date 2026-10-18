-- Migration: log audit keputusan Admin atas sesi yang disangkal siswa (PRD
-- Bagian 7.5.5 FR-A3, BR-34, Bagian 11 Auditability). Setiap "Setujui" /
-- "Batalkan" di halaman Sesi Perlu Ditinjau tercatat: siapa, kapan,
-- keputusan apa, alasan, dan SNAPSHOT baris sesi_kelas SEBELUM diubah
-- (jejak "siswa pernah menyangkal" tidak hilang walau statusnya ditimpa).
--
-- Kolom waktu respons siswa TIDAK perlu ditambah: sesi_kelas.dikonfirmasi_siswa_pada
-- sudah ada dan sudah diisi saat siswa mengonfirmasi MAUPUN menyangkal.
--
-- Jalankan ini di SQL Editor Supabase SEBELUM deploy kode yang memanggil
-- putuskan_sesi_review (app/api/admin/sesi-review). Idempotent-safe.

CREATE TABLE IF NOT EXISTS sesi_review_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- SET NULL, bukan CASCADE: log audit tetap ada walau baris sesi dihapus
    -- (mis. cleanup data uji); enrollment_id & nomor_sesi ada di snapshot.
    sesi_id UUID REFERENCES sesi_kelas(id) ON DELETE SET NULL,
    admin_id UUID NOT NULL REFERENCES users(id),
    keputusan TEXT NOT NULL CHECK (keputusan IN ('setujui', 'batalkan')),
    snapshot_sebelum JSONB NOT NULL,
    alasan TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Alasan WAJIB untuk "batalkan" (dicek juga di API, ini lapis terakhir).
    CONSTRAINT sesi_review_log_alasan_batalkan
        CHECK (keputusan <> 'batalkan' OR length(btrim(coalesce(alasan, ''))) > 0)
);

CREATE INDEX IF NOT EXISTS idx_sesi_review_log_sesi ON sesi_review_log(sesi_id);

-- RLS wajib aktif di semua tabel (CLAUDE.md) — tanpa policy: cuma service_role.
ALTER TABLE sesi_review_log ENABLE ROW LEVEL SECURITY;

-- Keputusan + log dalam SATU transaksi: baris dikunci (FOR UPDATE) supaya dua
-- Admin yang klik bersamaan tidak sama-sama memutuskan; kalau insert log gagal
-- (mis. alasan kosong untuk batalkan), perubahan sesi ikut batal. Mengembalikan
-- false kalau sesi tidak ada / sudah tidak menunggu review.
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
            perlu_review_admin = false
        WHERE id = p_sesi_id;
    END IF;

    RETURN true;
END $$;

-- Supabase memberi EXECUTE fungsi baru ke anon/authenticated secara default —
-- cabut, cuma API route server (service_role) yang boleh memanggil.
REVOKE ALL ON FUNCTION putuskan_sesi_review(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION putuskan_sesi_review(UUID, UUID, TEXT, TEXT) TO service_role;
