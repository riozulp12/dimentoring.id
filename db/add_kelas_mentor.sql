-- Migration: relasi banyak-ke-banyak Kelas <-> Mentor (PRD Bagian 7.5,
-- Bagian 13 — KelasMentor baru). Menggantikan kelas.mentor_id (tunggal)
-- sebagai sumber data utama untuk section "Mentor Kelas Ini" di detail kelas
-- publik dan notifikasi saat ada siswa baru mendaftar (bayar). kelas.mentor_id
-- DIPERTAHANKAN (DEPRECATED, kompatibilitas lama) — jangan hapus.
-- Jalankan ini di SQL Editor Supabase. Idempotent-safe.

CREATE TABLE IF NOT EXISTS kelas_mentor (
    kelas_id UUID NOT NULL REFERENCES kelas(id) ON DELETE CASCADE,
    mentor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (kelas_id, mentor_id)
);

CREATE INDEX IF NOT EXISTS idx_kelas_mentor_kelas ON kelas_mentor(kelas_id);
CREATE INDEX IF NOT EXISTS idx_kelas_mentor_mentor ON kelas_mentor(mentor_id);

-- Backfill dari kelas.mentor_id (kolom lama) untuk kelas yang sudah pernah
-- di-assign mentor sebelum migrasi ini — supaya data existing tidak hilang.
INSERT INTO kelas_mentor (kelas_id, mentor_id)
SELECT id, mentor_id FROM kelas WHERE mentor_id IS NOT NULL
ON CONFLICT (kelas_id, mentor_id) DO NOTHING;

-- RLS wajib aktif di semua tabel (CLAUDE.md) — akses lewat service_role key
-- di server saja (pola sama dengan tabel lain), tidak ada policy granular
-- untuk anon/client karena semua akses Kelola Kelas lewat API route server.
ALTER TABLE kelas_mentor ENABLE ROW LEVEL SECURITY;
