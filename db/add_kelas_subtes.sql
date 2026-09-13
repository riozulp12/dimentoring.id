-- Migration: relasi banyak-ke-banyak Kelas <-> Subtes (PRD Bagian 7.5,
-- Bagian 13 — KelasSubtes baru). Menggantikan kelas.subtes_id (tunggal,
-- nullable) sebagai sumber data utama untuk badge Subtes di detail kelas &
-- filter Mentor di Kelola Kelas. kelas.subtes_id DIPERTAHANKAN (DEPRECATED,
-- kompatibilitas lama) — jangan hapus.
-- Jalankan ini di SQL Editor Supabase. Idempotent-safe.

CREATE TABLE IF NOT EXISTS kelas_subtes (
    kelas_id UUID NOT NULL REFERENCES kelas(id) ON DELETE CASCADE,
    subtes_id UUID NOT NULL REFERENCES subtes(id) ON DELETE CASCADE,
    PRIMARY KEY (kelas_id, subtes_id)
);

CREATE INDEX IF NOT EXISTS idx_kelas_subtes_kelas ON kelas_subtes(kelas_id);
CREATE INDEX IF NOT EXISTS idx_kelas_subtes_subtes ON kelas_subtes(subtes_id);

-- Backfill dari kelas.subtes_id (kolom lama) untuk kelas yang sudah pernah
-- di-assign subtes sebelum migrasi ini — supaya data existing tidak hilang.
INSERT INTO kelas_subtes (kelas_id, subtes_id)
SELECT id, subtes_id FROM kelas WHERE subtes_id IS NOT NULL
ON CONFLICT (kelas_id, subtes_id) DO NOTHING;

-- RLS wajib aktif di semua tabel (CLAUDE.md) — akses lewat service_role key
-- di server saja (pola sama dengan tabel lain), tidak ada policy granular
-- untuk anon/client karena semua akses Kelola Kelas lewat API route server.
ALTER TABLE kelas_subtes ENABLE ROW LEVEL SECURITY;
