-- Migration: tabel materi + perluasan soal_ai untuk BR-31 (PRD 7.5.1 & 7.7 revisi)
-- Jalankan ini di SQL Editor Supabase. Idempotent-safe kalau dijalankan ulang
-- (pakai IF NOT EXISTS / DO block cek existence) supaya aman kalau sebagian
-- sudah pernah jalan.

DO $$ BEGIN
    CREATE TYPE konten_sumber AS ENUM ('ai_generated', 'upload_mentor');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE soal_ai ADD COLUMN IF NOT EXISTS kelas_id UUID REFERENCES kelas(id);
ALTER TABLE soal_ai ADD COLUMN IF NOT EXISTS sumber konten_sumber NOT NULL DEFAULT 'ai_generated';
ALTER TABLE soal_ai ADD COLUMN IF NOT EXISTS dibuat_oleh_id UUID REFERENCES users(id);

DO $$ BEGIN
    CREATE TYPE materi_tipe AS ENUM ('video', 'dokumen', 'rangkuman_teks');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS materi (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kelas_id UUID NOT NULL REFERENCES kelas(id),
    subtes_id UUID REFERENCES subtes(id),
    judul VARCHAR(255) NOT NULL,
    tipe materi_tipe NOT NULL,
    konten TEXT,
    sumber konten_sumber NOT NULL DEFAULT 'ai_generated',
    status soal_ai_status NOT NULL DEFAULT 'draft',
    dibuat_oleh_id UUID REFERENCES users(id),
    direview_oleh_id UUID REFERENCES users(id),
    tanggal_review TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_materi_kelas ON materi(kelas_id);
CREATE INDEX IF NOT EXISTS idx_materi_status ON materi(status) WHERE status = 'draft';
CREATE INDEX IF NOT EXISTS idx_soal_ai_status ON soal_ai(status) WHERE status = 'draft';

-- RLS: tabel baru wajib di-enable manual — DO block RLS di schema.sql cuma
-- jalan sekali waktu setup awal, tidak retroaktif ke tabel yang baru dibuat.
-- Tidak ada policy public ditambahkan (default tertutup total dari anon key,
-- sama seperti soal_ai — akses hanya lewat service_role di API routes).
ALTER TABLE materi ENABLE ROW LEVEL SECURITY;

-- Verifikasi cepat setelah run:
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'soal_ai';
-- SELECT * FROM materi LIMIT 1;
