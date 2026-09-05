-- Tambah kolom rumpun (Saintek/Soshum) ke ptn_jurusan — PRD Bagian 7.4.3
-- (Rekomendasi Jurusan wajib serumpun dengan Pilihan 1 siswa) & Bagian 13.
--
-- Tabel ptn_jurusan di live DB SUDAH punya baris (beda dari migrasi jenjang
-- dulu yang jalan waktu tabel masih kosong) — jadi kolom ditambah NULLABLE
-- dulu, di-backfill lewat mapping nama_jurusan yang sudah diverifikasi manual
-- terhadap isi live DB saat ini, baru NOT NULL diaktifkan SETELAH semua baris
-- terisi. Kalau ternyata ada baris baru yang lolos dari backfill (mis. masuk
-- di antara migrasi ini ditulis dan dijalankan), constraint NOT NULL SENGAJA
-- tidak diaktifkan dulu (lihat blok DO $$ di bawah) — RAISE NOTICE akan
-- menyebutkan berapa baris yang masih kosong, isi manual lewat halaman Admin
-- > Kelola Assessment (field Rumpun sekarang wajib di form itu), lalu jalankan
-- ulang migrasi ini (aman, idempotent).
--
-- Jalankan sekali di Supabase Studio > SQL Editor.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rumpun_jurusan') THEN
        CREATE TYPE rumpun_jurusan AS ENUM ('saintek', 'soshum');
    END IF;
END $$;

ALTER TABLE ptn_jurusan
    ADD COLUMN IF NOT EXISTS rumpun rumpun_jurusan;

-- Backfill data existing — mapping dicek manual terhadap nama_jurusan yang
-- ada di live DB saat migrasi ini ditulis (30 nama unik, klasifikasi rumpun
-- resmi SNBP/SNBT Kemendikbudristek).
UPDATE ptn_jurusan SET rumpun = 'saintek'
WHERE rumpun IS NULL AND lower(trim(nama_jurusan)) IN (
    'fakultas teknik mesin dan dirgantara',
    'fakultas teknik pertambangan dan perminyakan',
    'farmasi',
    'fisioterapi',
    'gizi',
    'ilmu keperawatan',
    'ilmu komputer',
    'informatika',
    'kedokteran',
    'keperawatan',
    'pendidikan dokter',
    'sekolah teknik elektro dan informatika-komputasi',
    'sistem informasi',
    'teknik informatika',
    'teknik sipil',
    'teknologi pangan dan hasil pertanian'
);

UPDATE ptn_jurusan SET rumpun = 'soshum'
WHERE rumpun IS NULL AND lower(trim(nama_jurusan)) IN (
    'akuntansi',
    'bisnis digital',
    'ekonomi',
    'hukum',
    'ilmu administrasi negara',
    'ilmu hukum',
    'ilmu komunikasi',
    'ilmu psikologi',
    'manajemen',
    'pendidikan bahasa dan sastra indonesia',
    'pendidikan guru sd',
    'pendidikan guru sekolah dasar',
    'psikologi',
    'sosiologi'
);

-- Fallback heuristik (keyword) untuk baris yang belum kena mapping exact di
-- atas — mis. nama_jurusan baru yang mirip pola umum. Tetap SANGAT eksplisit
-- (bukan tebakan luas) supaya tidak salah klasifikasi.
UPDATE ptn_jurusan SET rumpun = 'saintek'
WHERE rumpun IS NULL AND (
    lower(nama_jurusan) ~ 'teknik|informatika|komputer|farmasi|kedokteran|dokter|gigi|keperawatan|fisioterapi|gizi|kimia|biologi|fisika|matematika|pertanian|elektro|arsitektur|geologi|pertambangan|perminyakan|mipa|pangan'
);

UPDATE ptn_jurusan SET rumpun = 'soshum'
WHERE rumpun IS NULL AND (
    lower(nama_jurusan) ~ 'akuntansi|manajemen|ekonomi|hukum|administrasi|komunikasi|psikologi|sosiologi|pendidikan|bisnis|sastra|bahasa'
);

-- Aktifkan NOT NULL HANYA kalau semua baris sudah terisi — lihat catatan di
-- header file ini kalau masih ada baris NULL.
DO $$
DECLARE
    remaining INT;
BEGIN
    SELECT COUNT(*) INTO remaining FROM ptn_jurusan WHERE rumpun IS NULL;
    IF remaining = 0 THEN
        ALTER TABLE ptn_jurusan ALTER COLUMN rumpun SET NOT NULL;
        RAISE NOTICE 'Semua baris ptn_jurusan sudah punya rumpun — kolom sekarang NOT NULL.';
    ELSE
        RAISE NOTICE 'Masih ada % baris ptn_jurusan dengan rumpun NULL — isi manual lewat Admin > Kelola Assessment, lalu jalankan ulang file ini supaya NOT NULL bisa diaktifkan.', remaining;
    END IF;
END $$;

-- PostgREST perlu di-reload supaya schema cache-nya update.
NOTIFY pgrst, 'reload schema';
