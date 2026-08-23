-- Fix schema drift: enum sumber_pengajuan_role di database live belum punya
-- value 'undangan_admin' yang sudah didefinisikan di db/schema.sql (dipakai
-- app/api/auth/daftar-admin/route.ts — BR-3, akun Admin baru via undangan).
--
-- Tanpa migration ini, insert user_roles dengan sumber_pengajuan='undangan_admin'
-- gagal dengan error Postgres 22P02 "invalid input value for enum
-- sumber_pengajuan_role: \"undangan_admin\"".
--
-- Jalankan sekali di Supabase Studio > SQL Editor. Aman dijalankan berkali-kali
-- (IF NOT EXISTS, didukung native oleh ALTER TYPE ... ADD VALUE sejak Postgres 9.6).

ALTER TYPE sumber_pengajuan_role ADD VALUE IF NOT EXISTS 'undangan_admin';

-- PostgREST perlu di-reload supaya schema cache-nya update (kalau tidak, error
-- "invalid input value" bisa tetap muncul walau enum value sudah ada).
NOTIFY pgrst, 'reload schema';
