-- Migration: mentor bimbingan tatap muka (offline) — mode_pembelajaran per
-- Kelas, lokasi Mentor (GPS device), dan lokasi Siswa + mentor_offline_id
-- per Enrollment (matching jarak terdekat saat checkout, dihitung di sisi
-- aplikasi pakai Haversine, bukan geocoding berbayar).
-- Jalankan ini di SQL Editor Supabase. Idempotent-safe.

DO $$ BEGIN
    CREATE TYPE mode_pembelajaran AS ENUM ('online', 'offline');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE kelas ADD COLUMN IF NOT EXISTS mode_pembelajaran mode_pembelajaran NOT NULL DEFAULT 'online';
-- Default jumlah_sesi diisi 10 (online) / 8 (offline) di kode aplikasi waktu
-- bikin kelas baru — TETAP BISA diubah manual oleh Admin (mis. campaign khusus).
ALTER TABLE kelas ADD COLUMN IF NOT EXISTS jumlah_sesi INT NOT NULL DEFAULT 10;

-- Lokasi mentor (opsional, cuma perlu diisi kalau mentor bersedia ngajar
-- offline/tatap muka) — diambil dari GPS device (navigator.geolocation),
-- BUKAN geocoding alamat berbayar.
ALTER TABLE mentor_profiles ADD COLUMN IF NOT EXISTS bisa_offline BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE mentor_profiles ADD COLUMN IF NOT EXISTS lokasi_lat DECIMAL(10,7);
ALTER TABLE mentor_profiles ADD COLUMN IF NOT EXISTS lokasi_lng DECIMAL(10,7);

-- Lokasi siswa & mentor yang di-assign OTOMATIS berdasar jarak, dicatat PER
-- ENROLLMENT (bukan per kelas) — beda siswa, beda lokasi, beda mentor
-- terdekat, meski beli kelas offline yang sama.
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS lokasi_siswa_lat DECIMAL(10,7);
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS lokasi_siswa_lng DECIMAL(10,7);
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS mentor_offline_id UUID REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_enrollments_mentor_offline ON enrollments(mentor_offline_id);

-- Enrollments belum ada di titik checkout (baru dibuat webhook Payment SETELAH
-- sukses, lihat app/api/payment/webhook/route.ts) — jadi mentor pilihan siswa
-- & lokasinya ditampung dulu di payments (pola sama dengan
-- payment_subtes_pilihan), lalu dipindahkan webhook ke kolom enrollments di
-- atas begitu enrollment sudah pasti ada.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS mentor_offline_id UUID REFERENCES users(id);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS lokasi_siswa_lat DECIMAL(10,7);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS lokasi_siswa_lng DECIMAL(10,7);
