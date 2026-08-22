-- Migration: tambah kolom deskripsi ke kelas (manual atau AI-generated,
-- ditampilkan di halaman detail kelas — Siswa & popup detail Admin).
-- Jalankan ini di SQL Editor Supabase. Idempotent-safe.

ALTER TABLE kelas ADD COLUMN IF NOT EXISTS deskripsi TEXT;
