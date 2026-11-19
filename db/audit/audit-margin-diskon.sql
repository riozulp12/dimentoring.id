-- =============================================================================
-- AUDIT MARGIN DISKON — kelas private ONLINE (HANYA BACA, semua SELECT)
-- =============================================================================
-- Aturan yang diaudit (sama dengan lib/shared/marginKelas.ts):
--   honor per sesi   = round(65% x round(harga_normal / jumlah_sesi))
--   honor paket penuh = honor per sesi x jumlah_sesi
--   margin           = (harga_dibayar - honor paket penuh) / harga_dibayar
--   batas            = margin minimal 30%  (ubah angka 30 di tiap query bila batasnya berubah)
--
-- JALANKAN SATU PER SATU. SQL Editor Supabase hanya menampilkan hasil pernyataan TERAKHIR yang
-- dijalankan, jadi blok/pilih satu pernyataan, jalankan, catat hasilnya, lalu lanjut ke berikutnya.
-- Tidak ada INSERT/UPDATE/DELETE di file ini.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- HASIL 1 — Kelas private online yang DISKON KELAS-nya SAAT INI sudah membuat margin paket penuh < 30%.
-- Kosong = aman.
-- -----------------------------------------------------------------------------
WITH dasar AS (
    SELECT
        k.id,
        k.nama,
        k.harga::numeric                                                       AS harga_normal,
        k.diskon_persen,
        k.jumlah_sesi,
        round(k.harga * (100 - k.diskon_persen) / 100.0)                       AS harga_aktif,
        round(0.65 * round(k.harga / k.jumlah_sesi)) * k.jumlah_sesi           AS honor_paket_penuh
    FROM kelas k
    WHERE k.tipe_kelas::text = 'private'
      AND k.mode_pembelajaran::text = 'online'
      AND k.harga > 0
      AND k.jumlah_sesi > 0
)
SELECT
    id,
    nama,
    harga_normal,
    diskon_persen,
    harga_aktif,
    honor_paket_penuh,
    round((harga_aktif - honor_paket_penuh) * 100.0 / harga_aktif, 1)          AS margin_persen,
    ceil(honor_paket_penuh * 100.0 / (100 - 30))                               AS harga_bayar_minimal
FROM dasar
WHERE harga_aktif < ceil(honor_paket_penuh * 100.0 / (100 - 30))
ORDER BY margin_persen ASC, nama;


-- -----------------------------------------------------------------------------
-- HASIL 2 — Kode promo AKTIF yang, bila ditumpuk dengan diskon kelas yang berlaku saat ini,
-- membuat margin paket penuh kelas private online < 30%. Satu baris per pasangan (kode promo, kelas).
-- Promo persen dihitung dari harga setelah diskon kelas (sama dengan checkout); promo nominal dipotong langsung.
-- Kosong = aman. (Tanggal berlaku & kuota sengaja TIDAK disaring: yang diaudit adalah kode yang masih "aktif".)
-- -----------------------------------------------------------------------------
WITH dasar AS (
    SELECT
        k.id,
        k.nama,
        k.harga::numeric                                                       AS harga_normal,
        k.jumlah_sesi,
        round(k.harga * (100 - k.diskon_persen) / 100.0)                       AS harga_aktif,
        round(0.65 * round(k.harga / k.jumlah_sesi)) * k.jumlah_sesi           AS honor_paket_penuh
    FROM kelas k
    WHERE k.tipe_kelas::text = 'private'
      AND k.mode_pembelajaran::text = 'online'
      AND k.harga > 0
      AND k.jumlah_sesi > 0
),
tumpuk AS (
    SELECT
        d.id,
        d.nama,
        d.harga_normal,
        d.harga_aktif,
        d.honor_paket_penuh,
        p.kode,
        p.tipe_diskon::text                                                    AS tipe_promo,
        p.nilai_diskon                                                         AS nilai_promo,
        least(
            d.harga_aktif,
            CASE WHEN p.tipe_diskon::text = 'persen'
                 THEN round(d.harga_aktif * p.nilai_diskon / 100.0)
                 ELSE round(p.nilai_diskon)
            END
        )                                                                      AS potongan_promo
    FROM dasar d
    JOIN kode_promo p
      ON p.status::text = 'aktif'
     AND (
            p.berlaku_semua_kelas
         OR EXISTS (SELECT 1 FROM kode_promo_kelas pk WHERE pk.kode_promo_id = p.id AND pk.kelas_id = d.id)
     )
)
SELECT
    id,
    nama,
    harga_normal,
    harga_aktif,
    honor_paket_penuh,
    kode,
    tipe_promo,
    nilai_promo,
    harga_aktif - potongan_promo                                                AS harga_setelah_promo,
    round((harga_aktif - potongan_promo - honor_paket_penuh) * 100.0
          / nullif(harga_aktif - potongan_promo, 0), 1)                         AS margin_persen,
    ceil(honor_paket_penuh * 100.0 / (100 - 30))                                AS harga_bayar_minimal
FROM tumpuk
WHERE harga_aktif - potongan_promo < ceil(honor_paket_penuh * 100.0 / (100 - 30))
ORDER BY margin_persen ASC NULLS FIRST, nama, kode;
