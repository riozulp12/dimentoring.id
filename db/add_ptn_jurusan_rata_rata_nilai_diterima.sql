-- Tambah kolom rata_rata_nilai_diterima ke ptn_jurusan.
--
-- Konteks: konsolidasi data univ + univ_major (dua tabel PTN lama, tidak
-- dipakai kode aplikasi manapun) ke ptn_jurusan (satu-satunya sumber data
-- PTN yang jadi acuan, sudah FK di assessment_pilihan). univ_major punya
-- kolom avg_accepted_score yang tidak ada padanannya di ptn_jurusan — kolom
-- ini murni data referensi tambahan (BUKAN input formula keketatan_score/
-- peluang_score, yang tetap dihitung dari kuota_tahun_berjalan dan
-- jumlah_peminat_tahun_lalu saja).
--
-- Jalankan sekali di Supabase Studio > SQL Editor. Aman dijalankan berkali-kali
-- (IF NOT EXISTS).

ALTER TABLE ptn_jurusan
    ADD COLUMN IF NOT EXISTS rata_rata_nilai_diterima DECIMAL(5,2);

NOTIFY pgrst, 'reload schema';
