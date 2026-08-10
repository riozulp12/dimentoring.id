-- Seed data referensi tabel `subtes` (db/schema.sql).
--
-- Kenapa: register API (app/api/auth/register/route.ts) resolve nama mapel/subtes
-- yang dipilih user di form pendaftaran (app/(auth)/daftar/page.tsx) terhadap tabel
-- ini lewat exact-match nama. Tabel kosong = semua pilihan gagal resolve = error
-- "tidak dikenali sistem" untuk semua user, baik siswa maupun mentor.
--
-- Nama di kolom `nama` SENGAJA disamakan persis (termasuk kapitalisasi & singkatan
-- "B." untuk "Bahasa") dengan MAPEL_SULIT_OPTIONS & SUBTES_OPTIONS di
-- app/(auth)/daftar/page.tsx, supaya langsung match tanpa perlu ubah frontend.
--
-- "Penalaran Matematika" dikategorikan `literasi` sesuai docs/PRD.md Bagian 7.5,
-- yang menyebutnya sebagai bagian dari Tes Literasi (bukan kategori sendiri) --
-- enum subtes_kategori (db/schema.sql) memang tidak punya nilai terpisah untuk ini.
--
-- Baris "Pengetahuan dan Pemahaman Umum", "Antropologi", "Bahasa Arab", "Bahasa
-- Jepang" belum ada sebagai opsi di form saat ini -- tetap diseed untuk kelengkapan
-- data referensi resmi SNBT, form bisa ditambah menyusul kalau mau dipakai.
--
-- Idempotent: aman dijalankan berkali-kali (skip nama yang sudah ada). Tabel tidak
-- punya unique constraint di `nama`, jadi dedup dilakukan lewat NOT EXISTS.

INSERT INTO subtes (nama, kategori)
SELECT v.nama, v.kategori::subtes_kategori
FROM (VALUES
    -- TKA Wajib
    ('Matematika', 'tka_wajib'),
    ('Bahasa Indonesia', 'tka_wajib'),
    ('Bahasa Inggris', 'tka_wajib'),

    -- TKA Pilihan (elektif)
    ('Fisika', 'tka_elektif'),
    ('Kimia', 'tka_elektif'),
    ('Biologi', 'tka_elektif'),
    ('Sejarah', 'tka_elektif'),
    ('Ekonomi', 'tka_elektif'),
    ('Geografi', 'tka_elektif'),
    ('Antropologi', 'tka_elektif'),
    ('Bahasa Arab', 'tka_elektif'),
    ('Bahasa Jepang', 'tka_elektif'),

    -- TPS (Tes Potensi Skolastik)
    ('Penalaran Umum', 'tps'),
    ('Pengetahuan dan Pemahaman Umum', 'tps'),
    ('Pemahaman Bacaan & Menulis', 'tps'),
    ('Pengetahuan Kuantitatif', 'tps'),

    -- Literasi (termasuk Penalaran Matematika, lihat catatan di atas)
    ('Literasi B. Indonesia', 'literasi'),
    ('Literasi B. Inggris', 'literasi'),
    ('Penalaran Matematika', 'literasi')
) AS v(nama, kategori)
WHERE NOT EXISTS (
    SELECT 1 FROM subtes s WHERE s.nama = v.nama
);
