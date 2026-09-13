-- Migration: kolom subtes.mapel_dasar (PRD Bagian 13 — subtes.mapel_dasar
-- BARU). Mengelompokkan subtes serumpun (mis. "Literasi B. Indonesia" dan
-- "Bahasa Indonesia" sama-sama mapel_dasar='Bahasa Indonesia') supaya
-- pencocokan Mentor <-> Subtes di form Kelola Kelas tidak lagi mensyaratkan
-- subtes_id persis sama, cukup mapel_dasar yang sama (lihat CLAUDE.md).
-- Jalankan ini di SQL Editor Supabase. Idempotent-safe.

ALTER TABLE subtes ADD COLUMN IF NOT EXISTS mapel_dasar VARCHAR(100);

UPDATE subtes SET mapel_dasar = 'Antropologi' WHERE nama = 'Antropologi';
UPDATE subtes SET mapel_dasar = 'Bahasa Arab' WHERE nama = 'Bahasa Arab';
UPDATE subtes SET mapel_dasar = 'Bahasa Indonesia' WHERE nama = 'Bahasa Indonesia';
UPDATE subtes SET mapel_dasar = 'Bahasa Inggris' WHERE nama = 'Bahasa Inggris';
UPDATE subtes SET mapel_dasar = 'Bahasa Jepang' WHERE nama = 'Bahasa Jepang';
UPDATE subtes SET mapel_dasar = 'Biologi' WHERE nama = 'Biologi';
UPDATE subtes SET mapel_dasar = 'Ekonomi' WHERE nama = 'Ekonomi';
UPDATE subtes SET mapel_dasar = 'Fisika' WHERE nama = 'Fisika';
UPDATE subtes SET mapel_dasar = 'Geografi' WHERE nama = 'Geografi';
UPDATE subtes SET mapel_dasar = 'Kimia' WHERE nama = 'Kimia';
UPDATE subtes SET mapel_dasar = 'Bahasa Indonesia' WHERE nama = 'Literasi B. Indonesia';
UPDATE subtes SET mapel_dasar = 'Bahasa Inggris' WHERE nama = 'Literasi B. Inggris';
UPDATE subtes SET mapel_dasar = 'Matematika' WHERE nama = 'Matematika';
UPDATE subtes SET mapel_dasar = 'Bahasa Indonesia' WHERE nama = 'Pemahaman Bacaan & Menulis';
UPDATE subtes SET mapel_dasar = 'Matematika' WHERE nama = 'Penalaran Matematika';
UPDATE subtes SET mapel_dasar = 'Bahasa Indonesia' WHERE nama = 'Penalaran Umum';
UPDATE subtes SET mapel_dasar = 'Bahasa Indonesia' WHERE nama = 'Pengetahuan dan Pemahaman Umum';
UPDATE subtes SET mapel_dasar = 'Matematika' WHERE nama = 'Pengetahuan Kuantitatif';
UPDATE subtes SET mapel_dasar = 'Sejarah' WHERE nama = 'Sejarah';
