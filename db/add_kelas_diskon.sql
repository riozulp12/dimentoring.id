-- Migration: diskon/promo per Kelas (kolom `diskon_persen` di tabel `kelas`).
-- Dipakai Admin lewat form Kelola Kelas; tampilan harga di card Kelas publik
-- jadi "harga setelah diskon (bold, besar) + harga asli (dicoret, kecil)".
-- Jalankan ini di SQL Editor Supabase. Idempotent-safe.
--
-- CATATAN: ini TERPISAH dari sistem `kode_promo`/`kode_promo_kelas` yang sudah
-- ada (diskon yang ditebus siswa lewat kode). `diskon_persen` adalah diskon
-- yang MELEKAT ke kelas itu sendiri (harga coret di storefront), tidak butuh
-- kode apa pun. Keduanya hidup berdampingan — jangan salah satu dihapus.
--
-- Migration ini HANYA menyentuh tabel `kelas`. Tabel `payment_subtes_pilihan`
-- dan `sesi_kelas` TIDAK disentuh sama sekali (lihat PRD Bagian 13 — keduanya
-- masih dipakai aktif alur checkout/absensi).

ALTER TABLE kelas ADD COLUMN IF NOT EXISTS diskon_persen SMALLINT NOT NULL DEFAULT 0;

-- CHECK constraint dipasang terpisah supaya rerun migration tidak gagal
-- (ALTER TABLE ... ADD CONSTRAINT tidak punya IF NOT EXISTS di PostgreSQL).
DO $$ BEGIN
    ALTER TABLE kelas ADD CONSTRAINT kelas_diskon_persen_range CHECK (diskon_persen >= 0 AND diskon_persen <= 100);
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
