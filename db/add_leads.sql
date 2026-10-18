-- Migration: Lead Capture tahap 1 — atribusi UTM + penyimpanan leads dari
-- Assessment gratis (PRD 7.4.6, BR-38, Bagian 13 — Lead, LeadStatusLog).
--
-- Isi:
--   1. assessments.utm_source / utm_medium / utm_campaign (atribusi first-touch
--      dari cookie dm_attr saat submit Assessment).
--   2. leads — nomor WhatsApp pengunjung (tamu atau user tanpa no_wa) yang
--      EKSPLISIT setuju dihubungi. Satu baris per nomor (format 628...).
--   3. lead_status_log — audit siapa mengubah status lead.
--   4. lead_rate_limit — catatan percobaan POST /api/leads (kunci = trial ID
--      atau hash IP, BUKAN IP mentah) untuk batas per jam.
--   5. Fungsi simpan_lead() — insert-or-update atomik: nomor yang sama TIDAK
--      menimpa UTM/consent/status pertama, cuma menambah jumlah_submit,
--      memperbarui assessment_id terbaru & updated_at.
--   6. RLS aktif tanpa policy di semua tabel baru (cuma service_role).
--
-- Jalankan di SQL Editor Supabase SEBELUM deploy kode yang memakai
-- /api/leads & halaman Admin /leads. Idempotent-safe: aman dijalankan ulang.
-- (Submit Assessment tetap jalan tanpa kolom utm_* — kodenya punya cadangan —
-- tapi atribusi baru tersimpan setelah migrasi ini.)
--
-- ---- DRY-RUN (disarankan sebelum menjalankan sungguhan) --------------------
-- Di SQL Editor, tempel:
--     BEGIN;
--     <seluruh isi file ini>
--     <query verifikasi di bawah>
--     ROLLBACK;
-- Semua perubahan dibatalkan di akhir; cek hasil query verifikasi.
--
-- ---- QUERY VERIFIKASI -------------------------------------------------------
-- -- a) Kolom baru assessments (harus 3 baris)
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'assessments'
--    AND column_name IN ('utm_source', 'utm_medium', 'utm_campaign');
-- -- b) Tabel baru + RLS aktif (3 baris, rowsecurity = true)
-- SELECT tablename, rowsecurity FROM pg_tables
--  WHERE schemaname = 'public' AND tablename IN ('leads', 'lead_status_log', 'lead_rate_limit');
-- -- c) Tidak ada policy di tabel baru (0 baris)
-- SELECT tablename, policyname FROM pg_policies
--  WHERE schemaname = 'public' AND tablename IN ('leads', 'lead_status_log', 'lead_rate_limit');
-- -- d) Constraint leads (no_wa unik + format, consent, status, sumber)
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--  WHERE conrelid = 'public.leads'::regclass ORDER BY conname;
-- -- e) Indeks
-- SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
--  AND tablename IN ('leads', 'lead_status_log', 'lead_rate_limit') ORDER BY indexname;
-- -- f) simpan_lead cuma bisa dipanggil service_role (anon/authenticated = false)
-- SELECT r AS role, has_function_privilege(r,
--        'simpan_lead(text,text,text,uuid,uuid,uuid,text,text,text,text,text,text)', 'EXECUTE') AS boleh
--   FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS r;
-- -- g) Uji upsert (DI DALAM dry-run saja): dua kali nomor sama -> 1 baris, jumlah_submit 2,
-- --    utm_campaign tetap 'pertama'
-- SELECT simpan_lead('6281234567890', NULL, 'assessment_snbp', NULL, NULL, NULL,
--                    'ig', NULL, 'pertama', NULL, NULL, 'v1-draf');
-- SELECT simpan_lead('6281234567890', 'Budi', 'assessment_snbp', NULL, NULL, NULL,
--                    'tiktok', NULL, 'kedua', NULL, NULL, 'v1-draf');
-- SELECT no_wa, nama, utm_source, utm_campaign, jumlah_submit, status FROM leads
--  WHERE no_wa = '6281234567890';
-- ----------------------------------------------------------------------------

-- ---- 1. Atribusi di assessments -------------------------------------------
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS utm_source TEXT;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS utm_medium TEXT;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS utm_campaign TEXT;

-- ---- 2. leads ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    no_wa VARCHAR(20) NOT NULL UNIQUE,              -- selalu 628xxxxxxxxx (lib/shared/noWa.ts)
    nama VARCHAR(100),                              -- opsional, diisi pengunjung sendiri
    sumber TEXT NOT NULL,
    -- SET NULL: lead tetap ada walau assessment/akun dihapus.
    assessment_id UUID REFERENCES assessments(id) ON DELETE SET NULL,
    anonymous_trial_id UUID,                        -- cookie dm_trial_id saat submit (tamu)
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    -- Atribusi first-touch (cookie dm_attr) dari submit PERTAMA — tidak ditimpa.
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_content TEXT,
    fbclid TEXT,
    -- Persetujuan dihubungi via WhatsApp (BR-38): wajib true, versi teks dari server.
    consent_wa BOOLEAN NOT NULL,
    consent_versi TEXT NOT NULL,
    consent_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'baru',
    catatan TEXT,
    jumlah_submit INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_no_wa_format') THEN
        ALTER TABLE leads ADD CONSTRAINT leads_no_wa_format CHECK (no_wa ~ '^628[0-9]{8,12}$');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_sumber_valid') THEN
        ALTER TABLE leads ADD CONSTRAINT leads_sumber_valid CHECK (sumber IN ('assessment_snbp'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_consent_wa_wajib') THEN
        ALTER TABLE leads ADD CONSTRAINT leads_consent_wa_wajib CHECK (consent_wa = true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_status_valid') THEN
        ALTER TABLE leads ADD CONSTRAINT leads_status_valid
            CHECK (status IN ('baru', 'dihubungi', 'daftar', 'tidak_tertarik'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_jumlah_submit_positif') THEN
        ALTER TABLE leads ADD CONSTRAINT leads_jumlah_submit_positif CHECK (jumlah_submit >= 1);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_utm_campaign ON leads(utm_campaign) WHERE utm_campaign IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_assessment ON leads(assessment_id) WHERE assessment_id IS NOT NULL;

-- ---- 3. Audit perubahan status ---------------------------------------------
CREATE TABLE IF NOT EXISTS lead_status_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
    status_lama TEXT NOT NULL,
    status_baru TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_status_log_lead ON lead_status_log(lead_id, created_at DESC);

-- ---- 4. Rate limit POST /api/leads -----------------------------------------
-- kunci: 'trial:<uuid>' atau 'ip:<hmac-sha256>' — IP mentah tidak disimpan.
-- Baris > 1 hari dibersihkan oleh aplikasi saat ada percobaan baru.
CREATE TABLE IF NOT EXISTS lead_rate_limit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kunci TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_rate_limit_kunci ON lead_rate_limit(kunci, created_at DESC);

-- ---- 5. RLS (wajib, CLAUDE.md) — tanpa policy: cuma service_role ------------
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_status_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_rate_limit ENABLE ROW LEVEL SECURITY;

-- ---- 6. simpan_lead: insert-or-update atomik --------------------------------
-- Nomor baru  -> baris baru (consent_at = now()).
-- Nomor lama  -> jumlah_submit + 1, updated_at = now(), assessment_id terbaru
--                (kalau dikirim). UTM, fbclid, consent, sumber, status TIDAK
--                diubah. nama / user_id / anonymous_trial_id cuma diisi kalau
--                sebelumnya kosong.
-- Mengembalikan {"baru": true|false}; aplikasi TIDAK meneruskannya ke klien.
CREATE OR REPLACE FUNCTION simpan_lead(
    p_no_wa TEXT,
    p_nama TEXT,
    p_sumber TEXT,
    p_assessment_id UUID,
    p_anonymous_trial_id UUID,
    p_user_id UUID,
    p_utm_source TEXT,
    p_utm_medium TEXT,
    p_utm_campaign TEXT,
    p_utm_content TEXT,
    p_fbclid TEXT,
    p_consent_versi TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_baru BOOLEAN;
BEGIN
    INSERT INTO leads (
        no_wa, nama, sumber, assessment_id, anonymous_trial_id, user_id,
        utm_source, utm_medium, utm_campaign, utm_content, fbclid,
        consent_wa, consent_versi, consent_at
    ) VALUES (
        p_no_wa, NULLIF(btrim(p_nama), ''), p_sumber, p_assessment_id, p_anonymous_trial_id, p_user_id,
        p_utm_source, p_utm_medium, p_utm_campaign, p_utm_content, p_fbclid,
        true, p_consent_versi, now()
    )
    ON CONFLICT (no_wa) DO UPDATE SET
        assessment_id      = COALESCE(EXCLUDED.assessment_id, leads.assessment_id),
        nama               = COALESCE(leads.nama, EXCLUDED.nama),
        user_id            = COALESCE(leads.user_id, EXCLUDED.user_id),
        anonymous_trial_id = COALESCE(leads.anonymous_trial_id, EXCLUDED.anonymous_trial_id),
        jumlah_submit      = leads.jumlah_submit + 1,
        updated_at         = now()
    RETURNING (xmax = 0) INTO v_baru;

    RETURN jsonb_build_object('baru', v_baru);
END;
$$;

REVOKE ALL ON FUNCTION simpan_lead(TEXT, TEXT, TEXT, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION simpan_lead(TEXT, TEXT, TEXT, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
    TO service_role;
