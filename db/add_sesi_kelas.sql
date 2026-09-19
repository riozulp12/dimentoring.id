-- Migration: Absensi Kehadiran Mengajar — konfirmasi DUA ARAH (PRD Bagian
-- 7.5.5, Bagian 13 — SesiKelas BARU). Mentor checklist "Sudah Mengajar",
-- siswa konfirmasi balik (Dikonfirmasi/Disangkal) — tidak ada sesi yang
-- dianggap terlaksana hanya dari klaim sepihak mentor (BR-34).
-- Jalankan ini di SQL Editor Supabase. Idempotent-safe.

DO $$ BEGIN
    CREATE TYPE status_konfirmasi_sesi AS ENUM ('belum', 'dikonfirmasi', 'disangkal');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS sesi_kelas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_id UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
    nomor_sesi INT NOT NULL,
    tanggal_dilaksanakan DATE,
    dikonfirmasi_mentor BOOLEAN NOT NULL DEFAULT false,
    dikonfirmasi_mentor_pada TIMESTAMPTZ,
    status_siswa status_konfirmasi_sesi NOT NULL DEFAULT 'belum',
    dikonfirmasi_siswa_pada TIMESTAMPTZ,
    perlu_review_admin BOOLEAN NOT NULL DEFAULT false,
    UNIQUE(enrollment_id, nomor_sesi)
);

CREATE INDEX IF NOT EXISTS idx_sesi_kelas_enrollment ON sesi_kelas(enrollment_id);
-- Dasar query Admin "Sesi Perlu Ditinjau" (7.5.5 FR-A3) — filter langsung
-- WHERE perlu_review_admin=true tanpa scan penuh tabel.
CREATE INDEX IF NOT EXISTS idx_sesi_kelas_perlu_review ON sesi_kelas(perlu_review_admin) WHERE perlu_review_admin = true;

-- RLS wajib aktif di semua tabel (CLAUDE.md) — akses lewat service_role key
-- di server saja, tidak ada policy granular untuk anon/client karena semua
-- akses (mentor tandai, siswa konfirmasi, Admin review) lewat API route server.
ALTER TABLE sesi_kelas ENABLE ROW LEVEL SECURITY;
