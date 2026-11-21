-- Rollback untuk db/add_jenis_lainnya.sql.
--
-- NILAI ENUM TIDAK BISA DIHAPUS di PostgreSQL (tidak ada ALTER TYPE ... DROP VALUE). Nilai 'lainnya' yang tertinggal
-- di konten_info_tipe TIDAK BERBAHAYA: tidak ada kolom/baris yang terpengaruh, dan kode lama tidak
-- pernah menulis atau memfilternya. Rollback ini hanya menghapus BARIS konten_info yang memakai 'lainnya'.
--
-- PERINGATAN: menghapus baris = MENGHAPUS DATA (termasuk interaksi_konten yang bergantung bila FK-nya CASCADE).
-- Jalankan KUERI 1 dulu dan simpan hasilnya. Tarik/revert kode "Lainnya" sebelum rollback.
--
-- ---- KUERI 1 (pra-cek): berapa baris memakai 'lainnya' ----
SELECT count(*) AS baris_lainnya FROM konten_info WHERE tipe = 'lainnya';

-- ---- ROLLBACK (latihan dulu: BEGIN ... ROLLBACK; sungguhan: ganti ke COMMIT) ----
BEGIN;

DELETE FROM konten_info WHERE tipe = 'lainnya';

-- Harapan: 0
SELECT count(*) AS sisa_lainnya FROM konten_info WHERE tipe = 'lainnya';

ROLLBACK;  -- ganti ke COMMIT setelah verifikasi
