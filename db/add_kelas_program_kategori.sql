-- Migration: tambah kategori bisnis ke kelas (halaman publik /program —
-- PRD Bagian 4.3 poin 5, Bagian 7.5, Bagian 13) dan jadikan subtes_id
-- opsional (Konsultasi & Pendampingan Mahasiswa tidak selalu terikat mapel).
-- Jalankan ini di SQL Editor Supabase. Idempotent-safe.

DO $$ BEGIN
    CREATE TYPE kelas_program AS ENUM (
        'konsultasi', 'tka', 'snbt', 'ujian_mandiri', 'pendampingan_mahasiswa'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE kelas ADD COLUMN IF NOT EXISTS program_kategori kelas_program;

-- Backfill kelas lama (dibuat sebelum kolom ini ada) ke 'tka' — kategori
-- paling umum dari data kelas existing yang semuanya berbasis subtes.
-- Admin bisa koreksi manual lewat Edit Kelas kalau kategorinya sebenarnya
-- beda.
UPDATE kelas SET program_kategori = 'tka' WHERE program_kategori IS NULL;

ALTER TABLE kelas ALTER COLUMN program_kategori SET NOT NULL;

ALTER TABLE kelas ALTER COLUMN subtes_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_kelas_program ON kelas(program_kategori);
