-- Verifikasi db/add_jenis_lainnya.sql — HANYA BACA (SELECT saja). Jalankan SATU PER SATU.

-- ---- KUERI 1: nilai enum konten_info_tipe. Harapan SESUDAH migrasi: 6 baris, 'lainnya' terakhir ----
-- (SEBELUM migrasi: 5 baris tanpa 'lainnya'.)
SELECT enumsortorder, enumlabel
  FROM pg_enum
 WHERE enumtypid = 'konten_info_tipe'::regtype
 ORDER BY enumsortorder;

-- ---- KUERI 2: jumlah baris konten_info per tipe (bandingkan sebelum vs sesudah: tipe lama harus SAMA) ----
-- Hanya SESUDAH COMMIT (nilai baru tidak boleh dipakai di transaksi yang sama dengan ADD VALUE).
SELECT tipe, count(*) AS jumlah
  FROM konten_info
 GROUP BY tipe
 ORDER BY tipe;

-- ---- KUERI 3: 'lainnya' bisa dipakai (hanya SESUDAH COMMIT). Harapan: 0 baris sampai Admin menambah satu; tidak error ----
SELECT id, judul FROM konten_info WHERE tipe = 'lainnya';
