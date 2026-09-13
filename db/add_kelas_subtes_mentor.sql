-- Migration: pasangan eksplisit Mentor-Subtes DALAM satu kelas paket (PRD
-- Bagian 7.5, Bagian 13 — kelas_subtes_mentor BARU). Beda dari kelas_mentor
-- (daftar mentor datar, tanpa hubungan ke subtes tertentu) — tabel ini
-- menjawab "di kelas ini, Subtes X diajar Mentor Y", jadi sumber utama untuk
-- notifikasi checkout (cuma mentor subtes yang dipilih siswa yang dapat
-- notifikasi) & tampilan "siapa ngajar apa" di Kelola Kelas.
-- Jalankan ini di SQL Editor Supabase. Idempotent-safe.

CREATE TABLE IF NOT EXISTS kelas_subtes_mentor (
    kelas_id UUID NOT NULL REFERENCES kelas(id) ON DELETE CASCADE,
    subtes_id UUID NOT NULL REFERENCES subtes(id) ON DELETE CASCADE,
    mentor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (kelas_id, subtes_id, mentor_id)
);

CREATE INDEX IF NOT EXISTS idx_ksm_kelas ON kelas_subtes_mentor(kelas_id);
CREATE INDEX IF NOT EXISTS idx_ksm_subtes ON kelas_subtes_mentor(subtes_id);
CREATE INDEX IF NOT EXISTS idx_ksm_mentor ON kelas_subtes_mentor(mentor_id);

-- Backfill dari kelas.subtes_id (tunggal, lama) x kelas_mentor (daftar datar,
-- lama) untuk kelas yang sudah pernah di-assign subtes+mentor sebelum
-- migrasi ini — asumsi wajar: sebelum ada pairing eksplisit, semua mentor
-- yang di-assign ke kelas itu dianggap mengajar satu-satunya subtes kelas
-- tsb. Kelas tanpa subtes (Konsultasi/Pendampingan Mahasiswa) otomatis
-- terlewat (subtes_id IS NULL), tidak ada baris yang perlu di-backfill.
INSERT INTO kelas_subtes_mentor (kelas_id, subtes_id, mentor_id)
SELECT k.id, k.subtes_id, km.mentor_id
FROM kelas k
JOIN kelas_mentor km ON km.kelas_id = k.id
WHERE k.subtes_id IS NOT NULL
ON CONFLICT (kelas_id, subtes_id, mentor_id) DO NOTHING;

-- RLS wajib aktif di semua tabel (CLAUDE.md) — akses lewat service_role key
-- di server saja (pola sama dengan tabel lain), tidak ada policy granular
-- untuk anon/client karena semua akses Kelola Kelas lewat API route server.
ALTER TABLE kelas_subtes_mentor ENABLE ROW LEVEL SECURITY;
