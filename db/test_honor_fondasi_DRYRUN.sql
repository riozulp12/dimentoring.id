-- Skenario uji DRY-RUN untuk db/add_honor_fondasi.sql. Aman dijalankan di
-- database yang SUDAH berisi data asli (termasuk produksi).
--
-- Cara pakai (SQL Editor Supabase, SATU kali eksekusi, semua ditempel urut):
--     BEGIN;
--     <isi db/add_honor_fondasi.sql>
--     <isi db/add_honor_fondasi.sql>    -- SENGAJA dua kali: uji idempotent
--     <isi file ini>
--     ROLLBACK;
--
-- Hasil yang diharapkan: NOTICE "HONOR FONDASI DRY-RUN [v1]: SEMUA SKENARIO LULUS".
-- Satu skenario gagal = RAISE EXCEPTION "DRY-RUN GAGAL [v1]: ..." dan seluruh
-- transaksi batal. Error SEBELUM file ini (di salah satu salinan migrasi) =
-- migrasi tidak idempotent.
--
-- TIDAK ADA TULISAN PERMANEN KE DATA ASLI — dua lapis pengaman:
--   1. Skenario yang menulis baris uji berjalan di blok BEGIN ... EXCEPTION
--      (sub-transaksi) yang SELALU diakhiri RAISE kode 'HFDR0' — semua
--      perubahannya dibatalkan Postgres walau BEGIN/ROLLBACK di luar lupa.
--   2. BEGIN/ROLLBACK di luar tetap dianjurkan (membatalkan migrasinya juga).
-- Akun uji: email acak di domain .invalid, no_wa NULL. Pengecekan memakai id
-- baris uji, bukan jumlah baris tabel.
--
-- Setiap pesan gagal diawali penanda versi berkas "[v1]". Kalau penanda itu
-- tidak muncul, yang dijalankan adalah salinan berkas lama.

CREATE FUNCTION pg_temp.cek(p_dapat TEXT, p_harap TEXT, p_pesan TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    IF p_dapat IS DISTINCT FROM p_harap THEN
        RAISE EXCEPTION 'DRY-RUN GAGAL [v1]: % — diharapkan %, dapat %',
            p_pesan, coalesce(p_harap, '<NULL>'), coalesce(p_dapat, '<NULL>');
    END IF;
END $$;

-- p_sql harus GAGAL (exception). Perubahannya dibatalkan (sub-transaksi).
CREATE FUNCTION pg_temp.harus_gagal(p_sql TEXT, p_pesan TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    v_gagal BOOLEAN := false;
BEGIN
    BEGIN
        EXECUTE p_sql;
    EXCEPTION WHEN OTHERS THEN
        v_gagal := true;
    END;
    IF NOT v_gagal THEN
        RAISE EXCEPTION 'DRY-RUN GAGAL [v1]: seharusnya ditolak — %', p_pesan;
    END IF;
END $$;

DO $$
DECLARE
    v_user UUID;
    v_kelas UUID;
    v_enr UUID;
    v_lulus BOOLEAN := false;
BEGIN
    -- ---- 1. Kolom ada, tipe & nullability benar ------------------------------
    PERFORM pg_temp.cek(
        (SELECT string_agg(table_name || '.' || column_name || ':' || data_type || ':' || is_nullable, ', '
                           ORDER BY table_name, column_name)
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND ((table_name = 'sesi_kelas' AND column_name IN ('dibayar_pada', 'dibayar_batch'))
              OR (table_name = 'enrollments' AND column_name IN ('tanggal_keluar', 'alasan_keluar', 'diskon_dari_mentor')))),
        'enrollments.alasan_keluar:text:YES, enrollments.diskon_dari_mentor:boolean:NO, '
        || 'enrollments.tanggal_keluar:timestamp with time zone:YES, '
        || 'sesi_kelas.dibayar_batch:text:YES, sesi_kelas.dibayar_pada:timestamp with time zone:YES',
        'kolom baru (tabel.kolom:tipe:nullable)');

    -- ---- 2. Default diskon_dari_mentor = false -------------------------------
    PERFORM pg_temp.cek(
        (SELECT column_default FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'enrollments' AND column_name = 'diskon_dari_mentor'),
        'false', 'default enrollments.diskon_dari_mentor');

    -- ---- 3. Dua kali dijalankan tidak menggandakan constraint/index ----------
    PERFORM pg_temp.cek(
        (SELECT count(*)::text FROM pg_constraint WHERE conname = 'enrollments_alasan_keluar_valid'),
        '1', 'jumlah constraint enrollments_alasan_keluar_valid');
    PERFORM pg_temp.cek(
        (SELECT count(*)::text FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_sesi_kelas_dibayar_batch'),
        '1', 'jumlah index idx_sesi_kelas_dibayar_batch');
    PERFORM pg_temp.cek(
        (SELECT (indexdef LIKE '%WHERE (dibayar_pada IS NOT NULL)%')::text FROM pg_indexes
          WHERE schemaname = 'public' AND indexname = 'idx_sesi_kelas_dibayar_batch'),
        'true', 'index parsial WHERE dibayar_pada IS NOT NULL');

    -- ---- 4. Skenario dengan baris uji (selalu dibatalkan) --------------------
    BEGIN
        INSERT INTO users (nama, email)
        VALUES ('DRYRUN honor siswa', 'dryrun-honor-' || gen_random_uuid() || '@contoh.invalid')
        RETURNING id INTO v_user;
        INSERT INTO kelas (nama, program_kategori, tingkat_kelas, kapasitas, harga)
        VALUES ('DRYRUN honor kelas', 'snbt', 'kelas_12', 4, 750000)
        RETURNING id INTO v_kelas;
        INSERT INTO enrollments (user_id, kelas_id, status_pembayaran)
        VALUES (v_user, v_kelas, 'lunas')
        RETURNING id INTO v_enr;

        -- Default terisi untuk baris baru; kolom keluar kosong.
        PERFORM pg_temp.cek(
            (SELECT diskon_dari_mentor::text || '|' || coalesce(tanggal_keluar::text, 'null') || '|' || coalesce(alasan_keluar, 'null')
               FROM enrollments WHERE id = v_enr),
            'false|null|null', 'nilai awal pendaftaran baru (diskon|tanggal_keluar|alasan_keluar)');

        -- CHECK menolak alasan tidak dikenal.
        PERFORM pg_temp.harus_gagal(
            format('UPDATE enrollments SET alasan_keluar = %L WHERE id = %L', 'kabur', v_enr),
            'alasan_keluar ''kabur'' (tidak dikenal)');
        PERFORM pg_temp.harus_gagal(
            format('UPDATE enrollments SET alasan_keluar = %L WHERE id = %L', 'Refund', v_enr),
            'alasan_keluar ''Refund'' (huruf besar)');
        -- NOT NULL diskon_dari_mentor.
        PERFORM pg_temp.harus_gagal(
            format('UPDATE enrollments SET diskon_dari_mentor = NULL WHERE id = %L', v_enr),
            'diskon_dari_mentor = NULL');

        -- Semua alasan resmi diterima.
        UPDATE enrollments SET alasan_keluar = 'refund', tanggal_keluar = now(), diskon_dari_mentor = true WHERE id = v_enr;
        UPDATE enrollments SET alasan_keluar = 'pindah_kelas' WHERE id = v_enr;
        UPDATE enrollments SET alasan_keluar = 'pindah_mode' WHERE id = v_enr;
        UPDATE enrollments SET alasan_keluar = 'dikeluarkan_admin' WHERE id = v_enr;
        UPDATE enrollments SET alasan_keluar = 'lainnya' WHERE id = v_enr;
        UPDATE enrollments SET alasan_keluar = NULL WHERE id = v_enr;
        PERFORM pg_temp.cek((SELECT diskon_dari_mentor::text FROM enrollments WHERE id = v_enr), 'true', 'diskon_dari_mentor bisa diisi true');

        -- Penanda dibayar sesi: pola UPDATE dari tandai-dibayar.sql idempotent.
        INSERT INTO sesi_kelas (enrollment_id, nomor_sesi, dikonfirmasi_mentor) VALUES (v_enr, 1, true);
        UPDATE sesi_kelas SET dibayar_pada = '2026-10-24 10:00+07', dibayar_batch = '2026-10'
         WHERE enrollment_id = v_enr AND nomor_sesi = 1 AND dibayar_pada IS NULL;
        UPDATE sesi_kelas SET dibayar_pada = now(), dibayar_batch = '2026-11'
         WHERE enrollment_id = v_enr AND nomor_sesi = 1 AND dibayar_pada IS NULL;  -- kedua kali: tidak menimpa
        PERFORM pg_temp.cek(
            (SELECT dibayar_batch || '|' || (dibayar_pada = '2026-10-24 10:00+07')::text FROM sesi_kelas
              WHERE enrollment_id = v_enr AND nomor_sesi = 1),
            '2026-10|true', 'tandai dibayar dua kali tidak menimpa batch/waktu pertama');

        v_lulus := true;
        RAISE EXCEPTION USING ERRCODE = 'HFDR0', MESSAGE = 'batalkan baris uji';
    EXCEPTION WHEN SQLSTATE 'HFDR0' THEN
        NULL;  -- baris uji dibatalkan, lanjut
    END;

    IF NOT v_lulus THEN
        RAISE EXCEPTION 'DRY-RUN GAGAL [v1]: skenario baris uji tidak selesai';
    END IF;
    -- Baris uji benar-benar hilang.
    PERFORM pg_temp.cek((SELECT count(*)::text FROM enrollments WHERE id = v_enr), '0', 'baris uji enrollments dibatalkan');

    RAISE NOTICE 'HONOR FONDASI DRY-RUN [v1]: SEMUA SKENARIO LULUS';
END $$;
