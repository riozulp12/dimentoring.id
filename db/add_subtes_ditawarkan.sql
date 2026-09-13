-- Migration: kolom subtes.ditawarkan (PRD Bagian 13 — Subtes diperluas).
-- Cuma subtes ditawarkan=true yang tampil di checklist multi-select Subtes
-- form Kelola Kelas — subtes elektif langka (Antropologi/Bahasa Arab/Bahasa
-- Jepang) belum ditawarkan sebagai kelas bimbingan, tapi tetap ada di tabel
-- untuk kebutuhan lain (TryOut/SoalAI). Lihat CLAUDE.md.
-- Jalankan ini di SQL Editor Supabase. Idempotent-safe.

ALTER TABLE subtes ADD COLUMN IF NOT EXISTS ditawarkan BOOLEAN NOT NULL DEFAULT true;

UPDATE subtes SET ditawarkan = false WHERE nama IN ('Antropologi', 'Bahasa Arab', 'Bahasa Jepang');
