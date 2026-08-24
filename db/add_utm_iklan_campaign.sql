-- Migration: attribution marketing (PRD Bagian 13, Dashboard Marketing) —
-- users.utm_source/utm_campaign ditangkap saat register dari ?utm_source=/
-- ?utm_campaign= di URL /daftar, iklan_campaign dicatat manual oleh Admin
-- untuk cross-reference leads & CPL. Jalankan ini di SQL Editor Supabase.
-- Idempotent-safe.

ALTER TABLE users ADD COLUMN IF NOT EXISTS utm_source VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS utm_campaign VARCHAR(150);

DO $$ BEGIN
    CREATE TYPE iklan_platform AS ENUM ('meta', 'google', 'tiktok', 'lainnya');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS iklan_campaign (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nama_campaign VARCHAR(255) NOT NULL,
    platform iklan_platform NOT NULL,
    budget DECIMAL(12,2),
    tanggal_mulai DATE,
    tanggal_selesai DATE,
    utm_campaign_tag VARCHAR(150),        -- harus SAMA PERSIS dengan yang dipasang di link iklan
    catatan TEXT,
    dibuat_oleh_id UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
