-- ============================================================================
-- TEMPLATE: kelas lama/legacy — dibeli SEBELUM website launch, di luar katalog,
-- TANPA pembayaran lewat sistem. Tujuan: mentor & siswanya bisa memakai absensi
-- (sesi_kelas) untuk kelas itu.
--
-- File ini HANYA berisi <<PLACEHOLDER>>. JANGAN menulis data pribadi asli
-- (nama, email, nomor) ke repo: salin file ini jadi
-- db/legacy_kelas_manual_<apa-saja>.sql (pola itu sudah di-.gitignore), isi
-- placeholder di salinannya, lalu jalankan di SQL Editor Supabase.
--
-- PRASYARAT
--   1. Migration db/add_kelas_tampil_di_katalog.sql sudah dijalankan.
--   2. Mentor & siswa SUDAH mendaftar sendiri lewat website (tanpa link referral).
--   3. Role mentor SUDAH di-approve Admin (user_roles.status = 'active').
--
-- CARA PAKAI
--   1. Ganti SEMUA <<PLACEHOLDER>> (ada di blok DO dan di blok VERIFIKASI).
--      Placeholder yang terlewat membuat skrip gagal di awal, sebelum ada baris
--      yang tertulis.
--   2. DRY-RUN dulu — jalankan seluruh isi file di antara BEGIN dan ROLLBACK:
--          BEGIN;
--          -- (tempel seluruh isi file ini)
--          ROLLBACK;
--      Periksa hasil blok VERIFIKASI. ROLLBACK membatalkan semuanya.
--   3. Kalau hasilnya benar, jalankan lagi dengan COMMIT; menggantikan ROLLBACK;.
--
-- IDEMPOTEN: aman dijalankan ulang. Tidak membuat baris ganda dan tidak
-- menimpa absensi yang sudah berjalan (sesi yang sudah ditandai tidak disentuh).
--
-- AUDIT (CLAUDE.md: status pembayaran cuma boleh berubah lewat webhook atau
-- override manual Admin DENGAN log audit — skrip ini adalah override manual,
-- dan tabel audit belum ada, jadi isi catatan ini di salinan yang dijalankan
-- dan simpan salinannya di luar repo):
--   Dijalankan oleh : <<NAMA_ADMIN>>
--   Tanggal         : <<TANGGAL_DIJALANKAN>>
--   Alasan          : <<ALASAN>>
--
-- KEPUTUSAN DESAIN (lihat PRD Bagian 13 & 7.5.3)
--   * tampil_di_katalog = false : tidak muncul di /program, rekomendasi, checkout.
--   * harga = 0                 : Honor mentor (getHonorBulanIni) dan chart Sales
--                                 Analytics sama-sama menghitung dari kelas.harga
--                                 × enrollment lunas — 0 supaya tidak ikut
--                                 terhitung. Honor kelas ini dibayar di luar sistem.
--   * kapasitas = 1             : cadangan — kalaupun tampil, tombolnya "Kelas Penuh".
--   * subtes_id NULL            : tidak ikut rekomendasi berbasis mapel tersulit.
--   * kelas.mentor_id WAJIB     : walau berlabel DEPRECATED, SEMUA jalur mentor
--                                 (Kelas Saya, tandai sesi, materi, link meet,
--                                 honor, siswa binaan) membaca kolom ini.
--   * TANPA baris payments      : tidak ada reward referral yang cair, tidak
--                                 muncul di Riwayat Transaksi.
--   * mode_pembelajaran         : HANYA 'online' — lihat catatan di v_mode_pembelajaran.
-- ============================================================================

DO $$
DECLARE
    -- Kunci idempotensi kelas (kelas.nama tidak unik). Generate SEKALI lalu
    -- pakai nilai yang sama tiap rerun:  SELECT gen_random_uuid();
    v_kelas_id          UUID          := '<<KELAS_UUID>>';
    v_mentor_email      TEXT          := '<<EMAIL_MENTOR>>';
    v_siswa_email       TEXT          := '<<EMAIL_SISWA>>';
    v_nama_kelas        TEXT          := '<<NAMA_KELAS>>';
    v_program           kelas_program := '<<PROGRAM_KATEGORI>>';  -- konsultasi | tka | snbt | ujian_mandiri | pendampingan_mahasiswa
    v_tingkat           tingkat_kelas := '<<TINGKAT_KELAS>>';     -- kelas_10 | kelas_11 | kelas_12 | gap_year
    v_tipe              kelas_tipe    := '<<TIPE_KELAS>>';        -- private | semi_private | grouping
    -- BIARKAN 'online', termasuk kalau kelasnya sebenarnya tatap muka. Mode
    -- 'offline' di sistem ini bukan sekadar label: mentornya TIDAK disimpan di
    -- kelas.mentor_id, melainkan per enrollment (enrollments.mentor_offline_id
    -- + lokasi_siswa_lat/lng, diisi alur checkout) dan kelasnya wajib punya
    -- tepat satu subtes. Sisi mentor (Kelas Saya, tandai sesi) saat ini HANYA
    -- membaca kelas.mentor_id, dan form Kelola Kelas mengosongkan mentor kelas
    -- offline setiap kali disimpan — mentor akan kehilangan akses absensi.
    v_mode_pembelajaran mode_pembelajaran := 'online';
    v_jumlah_sesi       INT           := <<JUMLAH_SESI>>;
    v_tanggal_beli      TIMESTAMPTZ   := '<<TANGGAL_BELI>>';      -- tanggal beli ASLI, mis. 2026-07-01
    v_n_selesai         INT           := <<N_SELESAI>>;           -- jumlah sesi yang sudah berjalan (0 kalau belum ada)
    -- Tanggal sesi 1..N_SELESAI, berurutan. Kalau N_SELESAI = 0: ARRAY[]::DATE[]
    v_tanggal_selesai   DATE[]        := ARRAY[<<'YYYY-MM-DD', 'YYYY-MM-DD'>>]::DATE[];

    v_mentor_id     UUID;
    v_siswa_id      UUID;
    v_enrollment_id UUID;
    v_status        status_pembayaran_enrollment;
    v_jumlah_baris  INT;
BEGIN
    -- ---- Validasi input ----------------------------------------------------
    IF v_mode_pembelajaran <> 'online' THEN
        RAISE EXCEPTION 'mode_pembelajaran harus ''online'' untuk kelas legacy (lihat catatan di v_mode_pembelajaran)';
    END IF;
    IF v_jumlah_sesi <= 0 THEN
        RAISE EXCEPTION 'JUMLAH_SESI harus lebih dari 0';
    END IF;
    IF v_n_selesai <> cardinality(v_tanggal_selesai) THEN
        RAISE EXCEPTION 'N_SELESAI (%) tidak sama dengan jumlah tanggal yang diisi (%)',
            v_n_selesai, cardinality(v_tanggal_selesai);
    END IF;
    IF v_n_selesai > v_jumlah_sesi THEN
        RAISE EXCEPTION 'N_SELESAI (%) melebihi JUMLAH_SESI (%)', v_n_selesai, v_jumlah_sesi;
    END IF;

    SELECT id INTO v_mentor_id FROM users WHERE lower(email) = lower(v_mentor_email);
    SELECT id INTO v_siswa_id  FROM users WHERE lower(email) = lower(v_siswa_email);
    IF v_mentor_id IS NULL THEN
        RAISE EXCEPTION 'Akun mentor belum terdaftar (cek EMAIL_MENTOR)';
    END IF;
    IF v_siswa_id IS NULL THEN
        RAISE EXCEPTION 'Akun siswa belum terdaftar (cek EMAIL_SISWA)';
    END IF;
    IF v_mentor_id = v_siswa_id THEN
        RAISE EXCEPTION 'Mentor dan siswa tidak boleh akun yang sama';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_id = v_mentor_id AND role_type = 'mentor' AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'Role mentor belum active — approve dulu lewat Approval Mentor';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM user_roles WHERE user_id = v_siswa_id AND role_type = 'student'
    ) THEN
        RAISE EXCEPTION 'Akun siswa tidak punya role student';
    END IF;

    -- ---- 1. Kelas (tersembunyi) ---------------------------------------------
    INSERT INTO kelas (
        id, nama, program_kategori, tingkat_kelas, tipe_kelas, mentor_id,
        kapasitas, harga, jumlah_sesi, mode_pembelajaran, tampil_di_katalog
    )
    VALUES (
        v_kelas_id, v_nama_kelas, v_program, v_tingkat, v_tipe, v_mentor_id,
        1, 0, v_jumlah_sesi, v_mode_pembelajaran, false
    )
    ON CONFLICT (id) DO NOTHING;

    -- Rerun dengan angka berbeda dari kelas yang sudah ada: berhenti, jangan
    -- diam-diam membuat jumlah sesi & baris sesi_kelas tidak sinkron.
    IF (SELECT jumlah_sesi FROM kelas WHERE id = v_kelas_id) <> v_jumlah_sesi THEN
        RAISE EXCEPTION 'Kelas % sudah ada dengan jumlah_sesi berbeda — periksa manual', v_kelas_id;
    END IF;
    IF (SELECT mentor_id FROM kelas WHERE id = v_kelas_id) IS DISTINCT FROM v_mentor_id THEN
        RAISE EXCEPTION 'Kelas % sudah ada dengan mentor berbeda — periksa manual', v_kelas_id;
    END IF;

    -- kelas_mentor = sumber mentor untuk form Kelola Kelas & detail kelas.
    INSERT INTO kelas_mentor (kelas_id, mentor_id)
    VALUES (v_kelas_id, v_mentor_id)
    ON CONFLICT (kelas_id, mentor_id) DO NOTHING;

    -- ---- 2. Enrollment lunas, tanpa baris payments --------------------------
    INSERT INTO enrollments (user_id, kelas_id, status_pembayaran, tanggal_daftar)
    VALUES (v_siswa_id, v_kelas_id, 'lunas', v_tanggal_beli)
    ON CONFLICT (user_id, kelas_id) DO NOTHING;

    SELECT id, status_pembayaran INTO v_enrollment_id, v_status
    FROM enrollments
    WHERE user_id = v_siswa_id AND kelas_id = v_kelas_id;

    IF v_status <> 'lunas' THEN
        RAISE EXCEPTION 'Enrollment sudah ada dengan status % — tidak diubah otomatis, periksa manual', v_status;
    END IF;

    -- ---- 3. Sesi 1..JUMLAH_SESI ---------------------------------------------
    INSERT INTO sesi_kelas (enrollment_id, nomor_sesi)
    SELECT v_enrollment_id, n FROM generate_series(1, v_jumlah_sesi) AS n
    ON CONFLICT (enrollment_id, nomor_sesi) DO NOTHING;

    SELECT count(*) INTO v_jumlah_baris FROM sesi_kelas WHERE enrollment_id = v_enrollment_id;
    IF v_jumlah_baris <> v_jumlah_sesi THEN
        RAISE EXCEPTION 'Jumlah baris sesi_kelas (%) tidak sama dengan JUMLAH_SESI (%)',
            v_jumlah_baris, v_jumlah_sesi;
    END IF;

    -- ---- 4. Tandai N_SELESAI sesi pertama -----------------------------------
    -- Dikonfirmasi DUA ARAH (mentor + siswa) supaya siswa tidak ditanya ulang.
    -- Hanya baris yang BELUM ditandai mentor yang disentuh, jadi rerun tidak
    -- menimpa absensi yang sudah berjalan lewat aplikasi.
    -- *_pada = waktu backfill ini dijalankan (jujur soal kapan datanya diisi);
    -- tanggal sesi yang sebenarnya ada di tanggal_dilaksanakan.
    UPDATE sesi_kelas s
    SET dikonfirmasi_mentor      = true,
        dikonfirmasi_mentor_pada = now(),
        status_siswa             = 'dikonfirmasi',
        dikonfirmasi_siswa_pada  = now(),
        tanggal_dilaksanakan     = t.tanggal,
        perlu_review_admin       = false
    FROM unnest(v_tanggal_selesai) WITH ORDINALITY AS t(tanggal, nomor)
    WHERE s.enrollment_id = v_enrollment_id
      AND s.nomor_sesi = t.nomor
      AND s.dikonfirmasi_mentor = false;
END $$;

-- ============================================================================
-- VERIFIKASI (read-only) — ganti <<KELAS_UUID>> dengan nilai yang sama.
-- Yang diharapkan:
--   kelas      : 1 baris, tampil_di_katalog = false, harga = 0, mentor terisi
--   enrollment : 1 baris, status_pembayaran = lunas, tanpa baris payments
--   sesi       : jumlah_baris_sesi = jumlah_sesi; sesi_ditandai_mentor = N_SELESAI
-- ============================================================================

SELECT k.id, k.nama, k.program_kategori, k.tingkat_kelas, k.tipe_kelas, k.mode_pembelajaran,
       k.jumlah_sesi, k.kapasitas, k.harga, k.tampil_di_katalog,
       k.mentor_id IS NOT NULL AS mentor_terisi,
       (SELECT count(*) FROM kelas_mentor km WHERE km.kelas_id = k.id) AS jumlah_kelas_mentor
FROM kelas k
WHERE k.id = '<<KELAS_UUID>>';

SELECT e.id AS enrollment_id, e.status_pembayaran, e.tanggal_daftar,
       (SELECT count(*) FROM payments p
         WHERE p.user_id = e.user_id AND p.item_type = 'kelas' AND p.item_id = e.kelas_id) AS jumlah_payments
FROM enrollments e
WHERE e.kelas_id = '<<KELAS_UUID>>';

SELECT e.id AS enrollment_id,
       count(s.id)                                                   AS jumlah_baris_sesi,
       count(s.id) FILTER (WHERE s.dikonfirmasi_mentor)              AS sesi_ditandai_mentor,
       count(s.id) FILTER (WHERE s.dikonfirmasi_mentor
                             AND s.status_siswa <> 'disangkal')      AS sesi_terhitung_progress,
       count(s.id) FILTER (WHERE s.status_siswa = 'dikonfirmasi')    AS sesi_dikonfirmasi_siswa,
       min(s.tanggal_dilaksanakan)                                   AS tanggal_sesi_pertama,
       max(s.tanggal_dilaksanakan)                                   AS tanggal_sesi_terakhir
FROM enrollments e
LEFT JOIN sesi_kelas s ON s.enrollment_id = e.id
WHERE e.kelas_id = '<<KELAS_UUID>>'
GROUP BY e.id;
