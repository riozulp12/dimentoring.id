-- Migration: samakan `subtes.nama` dengan redaksi RESMI SNBT (3 baris yang
-- selama ini pakai singkatan sendiri). ID baris TIDAK berubah, jadi SEMUA
-- relasi yang sudah ada (user_mapel_tersulit, mentor_subtes_diampu,
-- kelas_subtes, kelas_subtes_mentor, soal/tryout) tetap utuh — yang berubah
-- cuma teks yang ditampilkan.
--
-- Kenapa: checklist onboarding (lib/shared/mapelSubtesOptions.ts) sekarang
-- memakai nama resmi, dan resolusi pilihan -> subtes.id di
-- app/api/auth/lengkapi-profil/route.ts dilakukan lewat exact-match nama.
-- Alias nama lama tetap dipertahankan di kode sebagai jaring pengaman, jadi
-- migration ini TIDAK wajib dijalankan dulu supaya onboarding bekerja — tapi
-- tanpa ini, Admin & card Kelas masih menampilkan redaksi lama.
--
-- Jalankan ini di SQL Editor Supabase. Idempotent-safe (rerun = 0 baris
-- terpengaruh karena nama lamanya sudah tidak ada).

UPDATE subtes SET nama = 'Pemahaman Bacaan dan Menulis' WHERE nama = 'Pemahaman Bacaan & Menulis';
UPDATE subtes SET nama = 'Literasi dalam Bahasa Indonesia' WHERE nama = 'Literasi B. Indonesia';
UPDATE subtes SET nama = 'Literasi dalam Bahasa Inggris' WHERE nama = 'Literasi B. Inggris';

-- mapel_dasar menyusul nama baru (lihat db/add_subtes_mapel_dasar.sql — baris
-- di sana mencocokkan nama LAMA, jadi perlu diulang di sini untuk nama baru).
UPDATE subtes SET mapel_dasar = 'Bahasa Indonesia' WHERE nama = 'Pemahaman Bacaan dan Menulis';
UPDATE subtes SET mapel_dasar = 'Bahasa Indonesia' WHERE nama = 'Literasi dalam Bahasa Indonesia';
UPDATE subtes SET mapel_dasar = 'Bahasa Inggris' WHERE nama = 'Literasi dalam Bahasa Inggris';
