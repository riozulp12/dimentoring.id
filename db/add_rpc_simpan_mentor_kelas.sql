-- Migration: fungsi simpan_mentor_kelas — simpan mentor kelas + "bekukan pemilik" dalam SATU transaksi.
--
-- Konteks: Kelola Kelas boleh memasang BANYAK mentor pada satu subtes (kelas_subtes_mentor). Saat pemegang
-- AKTIF sebuah subtes naik dari 1 menjadi >=2, siswa yang masih mentor_id NULL (dimiliki pemegang tunggal
-- secara implisit) akan menjadi "menunggu penerima" yang bisa direbut mentor baru. Aplikasi mencegahnya
-- dengan MEMBEKUKAN baris-baris itu ke pemegang tunggal yang lama (lib/shared/bekukanPemilik.ts).
-- Pembekuan dan penyimpanan mentor HARUS atomik — supabase-js tidak punya transaksi multi-statement,
-- jadi dibungkus fungsi ini. Aplikasi menghitung DAFTAR yang dibekukan; fungsi ini hanya menerapkannya.
--
-- Yang dilakukan fungsi (satu transaksi — galat di mana pun = semuanya dibatalkan):
--   1. Kunci baris kelas (FOR UPDATE) agar dua simpan bersamaan diserialkan.
--   2. Penjaga lepas mentor (cadangan balapan): bila ada pasangan lama (subtes, mentor) yang TIDAK ada di
--      pasangan baru dan mentor itu masih jadi enrollment_subtes.mentor_id siswa kelas ini pada subtes itu
--      -> kembalikan 'mentor_masih_memegang_siswa' TANPA menulis apa pun.
--   3. Bekukan: UPDATE enrollment_subtes SET mentor_id, diterima_pada ... WHERE mentor_id IS NULL
--      (hanya baris milik kelas ini, dan hanya bila mentor tujuan memang pemegang baru subtes itu).
--      Baris yang sudah terisi TIDAK ditimpa.
--   4. Ganti kelas_subtes_mentor dan kelas_mentor kelas ini dengan daftar baru.
--
-- TIDAK menyentuh: payments, enrollments, sesi_kelas, tabel honor. Tidak mengubah struktur tabel mana pun
-- (tidak ada kolom/tabel baru) — PRD Bagian 13 tidak perlu diubah.
--
-- Argumen:
--   p_kelas_id    UUID
--   p_pasangan    JSONB  — [{"subtes_id": "<uuid>", "mentor_id": "<uuid>"}, ...]   (daftar LENGKAP pasangan baru)
--   p_mentor_ids  UUID[] — seluruh mentor kelas (kelas_mentor), unik
--   p_bekukan     JSONB  — [{"id": "<enrollment_subtes.id>", "mentor_id": "<uuid>", "diterima_pada": "<ISO>"}, ...]
-- Hasil JSONB: {"status": "ok", "dibekukan": <n>} | {"status": "kelas_tidak_ditemukan"}
--              | {"status": "mentor_masih_memegang_siswa"}
--
-- CARA MENJALANKAN (SQL Editor Supabase) — JANGAN langsung COMMIT:
--   1. Ketik BEGIN; lalu tempel bagian "MIGRASI" di bawah.
--   2. Jalankan bagian "VERIFIKASI" (uji kering: memanggil fungsi dengan keadaan SAAT INI, jadi tidak
--      mengubah isi data) dan cocokkan hasilnya dengan yang diharapkan.
--   3. Kalau ada yang janggal: ROLLBACK;
--   4. Kalau sesuai: COMMIT;
-- Idempotent-safe (CREATE OR REPLACE) — aman dijalankan ulang.
-- Jalankan SEBELUM Admin pertama kali menambah mentor kedua pada subtes yang sudah punya siswa baru;
-- sebelum itu aplikasi tetap jalan (fungsi hanya dipanggil bila ada yang harus dibekukan) dan, bila
-- fungsi belum ada, aplikasi menolak simpan dengan pesan jelas tanpa mengubah apa pun.

-- ============================== MIGRASI ==============================

CREATE OR REPLACE FUNCTION simpan_mentor_kelas(
    p_kelas_id UUID,
    p_pasangan JSONB,
    p_mentor_ids UUID[],
    p_bekukan JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_dibekukan INTEGER := 0;
BEGIN
    PERFORM 1 FROM kelas WHERE id = p_kelas_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'kelas_tidak_ditemukan');
    END IF;

    -- Penjaga lepas mentor (cadangan; aplikasi sudah memeriksa lebih dulu): belum ada yang ditulis di titik ini.
    IF EXISTS (
        SELECT 1
        FROM kelas_subtes_mentor ksm
        WHERE ksm.kelas_id = p_kelas_id
          AND NOT EXISTS (
              SELECT 1
              FROM jsonb_to_recordset(COALESCE(p_pasangan, '[]'::jsonb)) AS p(subtes_id UUID, mentor_id UUID)
              WHERE p.subtes_id = ksm.subtes_id AND p.mentor_id = ksm.mentor_id
          )
          AND EXISTS (
              SELECT 1
              FROM enrollment_subtes es
              JOIN enrollments e ON e.id = es.enrollment_id
              WHERE e.kelas_id = p_kelas_id
                AND es.subtes_id = ksm.subtes_id
                AND es.mentor_id = ksm.mentor_id
          )
    ) THEN
        RETURN jsonb_build_object('status', 'mentor_masih_memegang_siswa');
    END IF;

    -- Bekukan pemilik: hanya baris kelas ini yang masih NULL, dan hanya ke mentor yang memang pemegang baru subtes itu.
    UPDATE enrollment_subtes es
    SET mentor_id = x.mentor_id,
        diterima_pada = x.diterima_pada
    FROM jsonb_to_recordset(COALESCE(p_bekukan, '[]'::jsonb)) AS x(id UUID, mentor_id UUID, diterima_pada TIMESTAMPTZ),
         enrollments e
    WHERE es.id = x.id
      AND es.mentor_id IS NULL
      AND e.id = es.enrollment_id
      AND e.kelas_id = p_kelas_id
      AND EXISTS (
          SELECT 1
          FROM jsonb_to_recordset(COALESCE(p_pasangan, '[]'::jsonb)) AS p(subtes_id UUID, mentor_id UUID)
          WHERE p.subtes_id = es.subtes_id AND p.mentor_id = x.mentor_id
      );
    GET DIAGNOSTICS v_dibekukan = ROW_COUNT;

    -- Ganti pasangan subtes-mentor dan daftar mentor kelas.
    DELETE FROM kelas_subtes_mentor WHERE kelas_id = p_kelas_id;
    INSERT INTO kelas_subtes_mentor (kelas_id, subtes_id, mentor_id)
    SELECT DISTINCT p_kelas_id, p.subtes_id, p.mentor_id
    FROM jsonb_to_recordset(COALESCE(p_pasangan, '[]'::jsonb)) AS p(subtes_id UUID, mentor_id UUID);

    DELETE FROM kelas_mentor WHERE kelas_id = p_kelas_id;
    INSERT INTO kelas_mentor (kelas_id, mentor_id)
    SELECT DISTINCT p_kelas_id, m
    FROM unnest(COALESCE(p_mentor_ids, ARRAY[]::UUID[])) AS m;

    RETURN jsonb_build_object('status', 'ok', 'dibekukan', v_dibekukan);
END $$;

REVOKE ALL ON FUNCTION simpan_mentor_kelas(UUID, JSONB, UUID[], JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION simpan_mentor_kelas(UUID, JSONB, UUID[], JSONB) TO service_role;

-- ============================== VERIFIKASI ==============================
-- Jalankan SETELAH bagian MIGRASI (masih di dalam transaksi). Uji kering: memanggil fungsi dengan
-- keadaan kelas SAAT INI (pasangan sekarang, mentor sekarang, tanpa pembekuan) — jadi isi data TIDAK berubah.
--
-- 1) Fungsi terpasang dan hanya service_role yang boleh menjalankan:
--    Harapan: 1 baris, fungsi_ada = true, anon_boleh = false, authenticated_boleh = false, service_role_boleh = true
--
-- SELECT
--   EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'simpan_mentor_kelas')                                  AS fungsi_ada,
--   has_function_privilege('anon', 'simpan_mentor_kelas(uuid,jsonb,uuid[],jsonb)', 'EXECUTE')              AS anon_boleh,
--   has_function_privilege('authenticated', 'simpan_mentor_kelas(uuid,jsonb,uuid[],jsonb)', 'EXECUTE')     AS authenticated_boleh,
--   has_function_privilege('service_role', 'simpan_mentor_kelas(uuid,jsonb,uuid[],jsonb)', 'EXECUTE')      AS service_role_boleh;
--
-- 2) Hitungan SEBELUM uji kering (catat angkanya):
--
-- SELECT
--   (SELECT count(*) FROM kelas_subtes_mentor)                         AS pasangan_sebelum,
--   (SELECT count(*) FROM kelas_mentor)                                AS kelas_mentor_sebelum,
--   (SELECT count(*) FROM enrollment_subtes WHERE mentor_id IS NOT NULL) AS terisi_sebelum;
--
-- 3) Uji kering pada SATU kelas (ganti baris pertama dengan kelas yang ada pasangannya bila perlu):
--    Harapan: hasil = {"status": "ok", "dibekukan": 0}
--
-- SELECT simpan_mentor_kelas(
--   k.id,
--   COALESCE((SELECT jsonb_agg(jsonb_build_object('subtes_id', subtes_id, 'mentor_id', mentor_id))
--             FROM kelas_subtes_mentor WHERE kelas_id = k.id), '[]'::jsonb),
--   COALESCE((SELECT array_agg(mentor_id) FROM kelas_mentor WHERE kelas_id = k.id), ARRAY[]::UUID[]),
--   '[]'::jsonb
-- ) AS hasil
-- FROM kelas k
-- WHERE EXISTS (SELECT 1 FROM kelas_subtes_mentor WHERE kelas_id = k.id)
-- LIMIT 1;
--
-- 4) Hitungan SESUDAH uji kering — HARUS sama persis dengan langkah 2 (pasangan_sesudah = pasangan_sebelum, dst.):
--
-- SELECT
--   (SELECT count(*) FROM kelas_subtes_mentor)                         AS pasangan_sesudah,
--   (SELECT count(*) FROM kelas_mentor)                                AS kelas_mentor_sesudah,
--   (SELECT count(*) FROM enrollment_subtes WHERE mentor_id IS NOT NULL) AS terisi_sesudah;
--
-- 5) Kelas yang tidak ada harus ditolak rapi. Harapan: {"status": "kelas_tidak_ditemukan"}
--
-- SELECT simpan_mentor_kelas('00000000-0000-0000-0000-000000000000', '[]'::jsonb, ARRAY[]::UUID[], '[]'::jsonb);

-- ============================== ROLLBACK ==============================
-- Hanya bila migrasi sudah di-COMMIT lalu perlu dibatalkan. Aman: tidak ada data/struktur yang bergantung
-- pada fungsi ini; tanpa fungsi, aplikasi hanya menolak simpan mentor yang membutuhkan pembekuan (pesan jelas).
--
-- DROP FUNCTION IF EXISTS simpan_mentor_kelas(UUID, JSONB, UUID[], JSONB);
