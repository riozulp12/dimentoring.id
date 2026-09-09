-- Migration: tabel password_reset_tokens (Lupa Password / Reset Password).
-- Tabel TERPISAH dari verification_tokens (BR-15) sengaja — verification_tokens
-- lingkupnya verifikasi kepemilikan akun, bukan reset password; kalau digabung,
-- link verifikasi lama yang bocor/basi bisa dipakai buat reset password akun
-- orang lain. Token TIDAK di-hash (konsisten dengan pola verification_tokens
-- yang sudah ada), tapi WAJIB single-use (used_at) & expired_at pendek (30 menit,
-- lihat lib/auth/passwordResetToken.ts) untuk membatasi jendela eksploitasi.
-- Jalankan ini di SQL Editor Supabase. Idempotent-safe.

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    expired_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens(user_id);

-- RLS wajib aktif di semua tabel (CLAUDE.md) — tidak ada policy dibuat sengaja,
-- akses tertutup total dari anon/authenticated key, backend selalu lewat
-- service_role key yang melewati RLS sepenuhnya.
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
