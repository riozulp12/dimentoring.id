-- Migration: tambah kolom avatar_url ke users (dipakai Navbar/Header —
-- foto profil kalau terisi, avatar default (ikon person) kalau NULL).
-- Jalankan ini di SQL Editor Supabase. Idempotent-safe.

ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
