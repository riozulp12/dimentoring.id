-- Migration: Notifikasi WhatsApp Mentor "siswa baru" — persetujuan + catatan kiriman
-- (lib/notifikasi/wa/, saklar di halaman Pengaturan khusus Mentor).
--
-- Isi (ADITIF — tidak menghapus / mengubah kolom atau tabel yang sudah ada):
--   1. users.notif_wa_setuju      BOOLEAN NOT NULL DEFAULT false
--      users.notif_wa_setuju_at   TIMESTAMPTZ NULL
--      Persetujuan Mentor menerima WhatsApp otomatis tentang siswa baru.
--      TERPISAH dari users.notif_wa (toggle umum "Notifikasi WhatsApp").
--      Semua baris lama otomatis false = tidak ada yang menerima sebelum setuju.
--   2. notifikasi_wa_log — satu baris per (kejadian + penerima). kunci_kejadian
--      UNIQUE adalah kunci idempotensi: aplikasi mengisinya dengan
--      INSERT ... ON CONFLICT DO NOTHING dan hanya mengirim kalau barisnya
--      benar-benar baru, jadi webhook ganda tidak menghasilkan dua WhatsApp.
--      Juga dipakai menghitung batas harian. Isi pesan & token TIDAK disimpan.
--   3. RLS aktif tanpa policy di tabel baru (hanya service_role).
--
-- Jalankan di SQL Editor Supabase. Idempotent-safe: aman dijalankan ulang.
-- Kode aplikasi tahan kalau migrasi BELUM dijalankan (WhatsApp dilewati dengan
-- satu baris log; saklar Pengaturan menampilkan pesan ramah). Kanal WhatsApp
-- tetap mati selama env WA_NOTIF_ENABLED bukan persis "true".
--
-- ---- DRY-RUN (disarankan sebelum menjalankan sungguhan) --------------------
-- Di SQL Editor, tempel:
--     BEGIN;
--     <seluruh isi file ini>
--     <query verifikasi di bawah>
--     ROLLBACK;
-- Semua perubahan dibatalkan di akhir; cek hasil query verifikasi.
--
-- ---- QUERY VERIFIKASI -------------------------------------------------------
-- -- a) Kolom baru users (harus 2 baris: boolean NOT NULL default false, timestamptz nullable)
-- SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'users'
--    AND column_name IN ('notif_wa_setuju', 'notif_wa_setuju_at') ORDER BY column_name;
-- -- b) Tabel baru + RLS aktif (1 baris, rowsecurity = true)
-- SELECT tablename, rowsecurity FROM pg_tables
--  WHERE schemaname = 'public' AND tablename = 'notifikasi_wa_log';
-- -- c) Tidak ada policy di tabel baru (0 baris)
-- SELECT tablename, policyname FROM pg_policies
--  WHERE schemaname = 'public' AND tablename = 'notifikasi_wa_log';
-- -- d) kunci_kejadian unik + status dibatasi (2+ baris: ..._kunci_kejadian_key, notifikasi_wa_log_status_valid)
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--  WHERE conrelid = 'public.notifikasi_wa_log'::regclass ORDER BY conname;
-- -- e) Indeks
-- SELECT indexname FROM pg_indexes
--  WHERE schemaname = 'public' AND tablename = 'notifikasi_wa_log' ORDER BY indexname;
-- -- f) Semua Mentor lama belum setuju (harus 0 baris true)
-- SELECT count(*) AS sudah_setuju FROM users WHERE notif_wa_setuju = true;

-- ---- 1. Persetujuan di users -------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS notif_wa_setuju BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notif_wa_setuju_at TIMESTAMPTZ;

-- ---- 2. Catatan kiriman ------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifikasi_wa_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Contoh: 'siswa_baru:<payments.id atau enrollments.id>:<users.id mentor>'
    kunci_kejadian TEXT NOT NULL UNIQUE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    jenis TEXT NOT NULL,                          -- mis. 'siswa_baru'
    status TEXT NOT NULL DEFAULT 'pending',       -- pending | terkirim | gagal | dilewati
    provider_ref TEXT,                            -- id pesan dari penyedia (kalau ada)
    error TEXT,                                   -- kode/alasan singkat, TANPA isi pesan, token, atau nomor
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifikasi_wa_log_status_valid') THEN
        ALTER TABLE notifikasi_wa_log ADD CONSTRAINT notifikasi_wa_log_status_valid
            CHECK (status IN ('pending', 'terkirim', 'gagal', 'dilewati'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_notifikasi_wa_log_created_at ON notifikasi_wa_log(created_at);
CREATE INDEX IF NOT EXISTS idx_notifikasi_wa_log_user ON notifikasi_wa_log(user_id);

-- ---- 3. RLS: aktif, tanpa policy (hanya service_role yang bisa akses) --------
ALTER TABLE notifikasi_wa_log ENABLE ROW LEVEL SECURITY;
