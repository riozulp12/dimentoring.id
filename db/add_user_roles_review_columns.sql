-- Migration: tambah kolom audit review approval ke user_roles (Approval
-- Mentor — PRD Bagian 8 BR-2, Bagian 11 Auditability: "approval mentor"
-- wajib log audit). Jalankan ini di SQL Editor Supabase. Idempotent-safe.

ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS direview_oleh_id UUID REFERENCES users(id);
ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS tanggal_review TIMESTAMPTZ;
ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS alasan_tolak TEXT;
