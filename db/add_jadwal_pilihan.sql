-- Migration: Pilihan Jadwal Siswa (maks. 2, preferensi berurutan) — PRD 7.5.8.
-- Saklar per kelas `jadwal_pilih_siswa` (default MATI). Kalau menyala, slot di
-- kelas.jadwal diperlakukan sebagai OPSI: siswa memilih Pilihan 1 (& opsional
-- Pilihan 2) saat checkout, Admin yang menetapkan jadwal akhir. Tanpa kuota
-- per slot, tanpa tabel baru — slot dirujuk lewat salinan {hari, jam_mulai}.
--
-- Alur data (pola sama dengan mentor_offline_id): pilihan ditampung di
-- payments.jadwal_pilihan (enrollments belum ada saat checkout), lalu webhook
-- sukses menyalinnya ke enrollments.jadwal_pilihan. Admin menetapkan ->
-- enrollments.jadwal_ditetapkan (+ _at).
--
-- Jalankan ini di SQL Editor Supabase. Idempotent-safe.

ALTER TABLE kelas ADD COLUMN IF NOT EXISTS jadwal_pilih_siswa BOOLEAN NOT NULL DEFAULT false;

-- Array {hari, jam_mulai} berurutan (index 0 = Pilihan 1), maks. 2 elemen.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS jadwal_pilihan JSONB;

-- CHECK dipasang terpisah supaya rerun tidak gagal (ADD CONSTRAINT tidak punya
-- IF NOT EXISTS). Pakai CASE supaya jsonb_array_length tidak pernah dipanggil
-- untuk nilai non-array (urutan evaluasi AND tidak dijamin di PostgreSQL).
DO $$ BEGIN
    ALTER TABLE payments ADD CONSTRAINT payments_jadwal_pilihan_maks_2 CHECK (
        CASE
            WHEN jadwal_pilihan IS NULL THEN true
            WHEN jsonb_typeof(jadwal_pilihan) = 'array' THEN jsonb_array_length(jadwal_pilihan) <= 2
            ELSE false
        END
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS jadwal_pilihan JSONB;
-- Slot akhir yang ditetapkan Admin: satu object {hari, jam_mulai}.
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS jadwal_ditetapkan JSONB;
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS jadwal_ditetapkan_at TIMESTAMPTZ;
