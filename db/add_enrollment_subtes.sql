-- Migration: pilihan SISWA saat checkout kelas paket (PRD Bagian 7.5, Bagian
-- 13 — enrollment_subtes BARU). Kelas paket (kelas_subtes > 1 baris) minta
-- siswa pilih maksimal 3 subtes dari pool yang tersedia; beda siswa di kelas
-- yang sama bisa pilih subtes berbeda-beda. Dasar filter materi yang tampil
-- ke siswa & mentor mana yang dapat notifikasi siswa baru (lihat
-- kelas_subtes_mentor). Diisi dari payment_subtes_pilihan SETELAH payment
-- berhasil, bukan langsung saat checkout (BR-19: status/derivat enrollment
-- cuma final setelah webhook konfirmasi).
-- Jalankan ini di SQL Editor Supabase. Idempotent-safe.

CREATE TABLE IF NOT EXISTS enrollment_subtes (
    enrollment_id UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
    subtes_id UUID NOT NULL REFERENCES subtes(id) ON DELETE CASCADE,
    PRIMARY KEY (enrollment_id, subtes_id)
);

CREATE INDEX IF NOT EXISTS idx_enrollment_subtes_enrollment ON enrollment_subtes(enrollment_id);

-- RLS wajib aktif di semua tabel (CLAUDE.md) — akses lewat service_role key
-- di server saja (pola sama dengan tabel lain), tidak ada policy granular
-- untuk anon/client karena semua akses lewat API route server (webhook payment
-- & halaman Kelas Saya siswa).
ALTER TABLE enrollment_subtes ENABLE ROW LEVEL SECURITY;
