-- Fix schema drift: tabel `ptn_jurusan` di database live belum punya kolom
-- `jenjang` yang sudah didefinisikan di db/schema.sql.
--
-- Akibatnya: query di app/assessment/page.tsx gagal dengan error
-- "column ptn_jurusan.jenjang does not exist" (PostgREST code 42703) ->
-- dropdown "Pilihan Universitas dan Jurusan" di halaman Assessment SNBP
-- selalu kosong.
--
-- Tabel ptn_jurusan saat ini kosong (0 baris) di live DB, jadi kolom baru
-- bisa langsung NOT NULL tanpa perlu DEFAULT/backfill.
--
-- Jalankan sekali di Supabase Studio > SQL Editor. Aman dijalankan berkali-kali
-- (IF NOT EXISTS).

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'jenjang_prodi') THEN
        CREATE TYPE jenjang_prodi AS ENUM ('D3', 'D4', 'S1');
    END IF;
END $$;

ALTER TABLE ptn_jurusan
    ADD COLUMN IF NOT EXISTS jenjang jenjang_prodi NOT NULL;

-- PostgREST perlu di-reload supaya schema cache-nya update (kalau tidak,
-- error "column does not exist" bisa tetap muncul walau kolom sudah ada).
NOTIFY pgrst, 'reload schema';
