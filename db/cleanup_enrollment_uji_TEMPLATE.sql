-- ============================================================================
-- TEMPLATE: bersihkan data UJI pembayaran satu akun uji.
--
-- Kenapa perlu: selama Midtrans masih Sandbox, pembayaran yang disimulasikan
-- tetap memicu webhook → enrollment 'lunas' GRATIS + sesi_kelas, dan (kalau
-- akun ujinya didaftarkan lewat link referral) poin referral untuk perujuk &
-- akun uji. Skrip ini menghapus jejak itu supaya tidak mencemari Honor,
-- Analytics (Sales), kuota kelas, dan poin referral.
--
-- File ini HANYA berisi <<PLACEHOLDER>>. JANGAN menulis email asli ke repo:
-- salin jadi db/cleanup_enrollment_uji_<apa-saja>.sql (pola itu sudah
-- di-.gitignore), isi placeholder di salinannya, lalu jalankan di SQL Editor
-- Supabase.
--
-- VARIABEL — ganti di SEMUA tempat (ada 2: LANGKAH 1 dan LANGKAH 2):
--     <<EMAIL_AKUN_UJI>>   email akun uji, mis. akun QA khusus pengujian
--                          (ganti SELURUHNYA, termasuk tanda << dan >>)
--
-- PERINGATAN: skrip ini menghapus SEMUA payments & enrollments akun itu, bukan
-- cuma yang terakhir. Pakai HANYA untuk akun yang memang khusus pengujian —
-- jangan pernah untuk akun siswa sungguhan.
--
-- CARA PAKAI
--   1. Jalankan LANGKAH 1 SENDIRI (seleksi statement-nya saja lalu Run) —
--      murni SELECT, tidak mengubah apa pun. SQL Editor hanya menampilkan
--      hasil statement terakhir, jadi jangan dijalankan bareng LANGKAH 2.
--      Periksa: apakah semua baris memang data uji?
--   2. Jalankan LANGKAH 2 apa adanya. Bawaannya diakhiri ROLLBACK, jadi ini
--      DRY-RUN: penghapusan dicoba lalu dibatalkan. Kalau tidak ada error,
--      urutan hapusnya aman.
--   3. Ganti ROLLBACK; di akhir LANGKAH 2 menjadi COMMIT; lalu jalankan lagi.
--   4. Jalankan LANGKAH 1 sekali lagi — semua jumlah harus 0, KECUALI
--      enrollment_manual_log (urut 10): log audit sengaja tetap ada, kolom
--      enrollment_id-nya jadi NULL (ON DELETE SET NULL).
--
-- YANG TIDAK DISENTUH: akun uji itu sendiri (users, user_roles), kelas,
-- notifikasi "Siswa baru mendaftar" / "Kamu ditugaskan ke siswa baru" milik
-- mentor (tidak menyimpan rujukan ke siswa, jadi tidak bisa dipilih dengan
-- aman — hapus manual kalau perlu), dan enrollment_manual_log (log audit
-- pendaftaran manual Admin, PRD 7.5.10 — sengaja dipertahankan; ditampilkan
-- di LANGKAH 1 dan dilaporkan di LANGKAH 2, enrollment_id-nya jadi NULL).
-- ============================================================================


-- ============================================================================
-- LANGKAH 1 — LIHAT DULU (read-only, satu statement)
-- ============================================================================
WITH akun AS (
    SELECT id, email FROM users WHERE lower(email) = lower(trim('<<EMAIL_AKUN_UJI>>'))
)
SELECT 1 AS urut, 'akun' AS bagian, count(*) AS jumlah,
       jsonb_agg(jsonb_build_object('user_id', a.id, 'email', a.email)) AS rincian
FROM akun a
UNION ALL
SELECT 2, 'payments', count(*),
       jsonb_agg(jsonb_build_object(
           'order_id', p.order_id, 'status', p.status, 'jumlah', p.jumlah,
           'item_type', p.item_type, 'item_id', p.item_id,
           'kode_promo_id', p.kode_promo_id, 'dibuat_pada', p.dibuat_pada) ORDER BY p.dibuat_pada)
FROM payments p JOIN akun a ON a.id = p.user_id
UNION ALL
SELECT 3, 'enrollments', count(*),
       jsonb_agg(jsonb_build_object(
           'enrollment_id', e.id, 'kelas', k.nama, 'status', e.status_pembayaran,
           'tanggal_daftar', e.tanggal_daftar) ORDER BY e.tanggal_daftar)
FROM enrollments e JOIN akun a ON a.id = e.user_id JOIN kelas k ON k.id = e.kelas_id
UNION ALL
SELECT 4, 'sesi_kelas', count(*),
       jsonb_build_object(
           'ditandai_mentor', count(*) FILTER (WHERE s.dikonfirmasi_mentor),
           'dikonfirmasi_siswa', count(*) FILTER (WHERE s.status_siswa = 'dikonfirmasi'),
           'disangkal', count(*) FILTER (WHERE s.status_siswa = 'disangkal'))
FROM sesi_kelas s JOIN enrollments e ON e.id = s.enrollment_id JOIN akun a ON a.id = e.user_id
UNION ALL
SELECT 5, 'referral (akun uji sebagai yang dirujuk)', count(*),
       jsonb_agg(jsonb_build_object(
           'referral_id', r.id, 'referrer_id', r.referrer_id, 'status', r.status,
           'tanggal_konversi', r.tanggal_konversi))
FROM referrals r JOIN akun a ON a.id = r.referee_id
UNION ALL
SELECT 6, 'referral_rewards (poin dari pembayaran akun uji)', count(*),
       jsonb_agg(jsonb_build_object(
           'penerima', rr.penerima, 'poin', rr.nominal_atau_poin,
           'status_pencairan', rr.status_pencairan, 'tanggal', rr.tanggal))
FROM referral_rewards rr JOIN referrals r ON r.id = rr.referral_id JOIN akun a ON a.id = r.referee_id
UNION ALL
SELECT 7, 'poin akun uji (gamifikasi_profiles)', count(*),
       jsonb_agg(jsonb_build_object('total_poin', g.total_poin, 'level', g.level))
FROM gamifikasi_profiles g JOIN akun a ON a.id = g.user_id
UNION ALL
SELECT 8, 'materi_progress', count(*), NULL
FROM materi_progress mp JOIN akun a ON a.id = mp.user_id
UNION ALL
SELECT 9, 'notifikasi "Pembayaran berhasil!"', count(*), NULL
FROM notifikasi n JOIN akun a ON a.id = n.user_id
WHERE n.tipe = 'sistem' AND n.judul = 'Pembayaran berhasil!'
UNION ALL
SELECT 10, 'enrollment_manual_log (TETAP ADA — audit, enrollment_id jadi NULL)', count(*),
       jsonb_agg(jsonb_build_object(
           'aksi', l.aksi, 'kelas_id', l.kelas_id, 'enrollment_id', l.enrollment_id,
           'metode', l.metode_pembayaran, 'created_at', l.created_at) ORDER BY l.created_at)
FROM enrollment_manual_log l JOIN akun a ON a.id = l.siswa_id
UNION ALL
SELECT 11, 'notifikasi "didaftarkan oleh Admin"', count(*), NULL
FROM notifikasi n JOIN akun a ON a.id = n.user_id
WHERE n.tipe = 'sistem' AND n.judul = 'Kamu sudah terdaftar di kelas baru'
ORDER BY urut;


-- ============================================================================
-- LANGKAH 2 — HAPUS (bawaannya DRY-RUN: diakhiri ROLLBACK)
-- ============================================================================
BEGIN;

DO $$
DECLARE
    v_email   TEXT := '<<EMAIL_AKUN_UJI>>';
    v_user_id UUID;
    v_jumlah  INT;
    v_sisa    INT;
BEGIN
    -- Placeholder yang tertinggal (mis. Find & Replace tanpa << >>) tidak akan
    -- pernah cocok dengan email mana pun — hentikan dengan pesan yang jelas.
    IF v_email LIKE '%<<%' OR v_email LIKE '%>>%' THEN
        RAISE EXCEPTION 'Placeholder belum diganti dengan benar: [%]', v_email;
    END IF;

    SELECT id INTO v_user_id FROM users WHERE lower(email) = lower(trim(v_email));
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Akun uji tidak ditemukan: [%] (tanda [] memperlihatkan spasi/sisa placeholder)', v_email;
    END IF;
    -- Rem darurat: Admin/Mentor bukan akun uji pembayaran.
    IF EXISTS (SELECT 1 FROM user_roles WHERE user_id = v_user_id AND role_type IN ('admin', 'mentor')) THEN
        RAISE EXCEPTION 'Akun ini punya role admin/mentor — skrip ini cuma untuk akun uji Siswa';
    END IF;

    -- ---- 1. Poin referral: kembalikan DULU, selagi baris reward masih ada ----
    -- Webhook menambah poin ke perujuk DAN ke akun uji (lib/referral/
    -- convertReferralOnPayment.ts). Kurangi persis sebesar yang tercatat di
    -- referral_rewards, tidak pernah sampai minus.
    UPDATE gamifikasi_profiles g
    SET total_poin = GREATEST(0, g.total_poin - x.poin)
    FROM (
        SELECT CASE rr.penerima WHEN 'referee' THEN r.referee_id ELSE r.referrer_id END AS user_id,
               sum(rr.nominal_atau_poin)::INT AS poin
        FROM referral_rewards rr
        JOIN referrals r ON r.id = rr.referral_id
        WHERE r.referee_id = v_user_id AND rr.jenis_reward = 'poin'
        GROUP BY 1
    ) x
    WHERE g.user_id = x.user_id;
    GET DIAGNOSTICS v_jumlah = ROW_COUNT;
    RAISE NOTICE 'gamifikasi_profiles dikoreksi: % baris', v_jumlah;

    -- Level selalu turunan dari total_poin (lib/gamifikasi/hitungLevel.ts).
    UPDATE gamifikasi_profiles g
    SET level = (
        SELECT t.nama_level FROM gamifikasi_level_tier t
        WHERE t.poin_minimum <= g.total_poin
        ORDER BY t.poin_minimum DESC
        LIMIT 1
    )
    WHERE g.user_id IN (
              SELECT r.referee_id FROM referrals r WHERE r.referee_id = v_user_id
              UNION
              SELECT r.referrer_id FROM referrals r WHERE r.referee_id = v_user_id
          )
      AND EXISTS (SELECT 1 FROM gamifikasi_level_tier t WHERE t.poin_minimum <= g.total_poin);

    -- ---- 2. Reward, lalu referral dikembalikan ke 'terdaftar' ---------------
    -- Baris referrals TIDAK dihapus (hubungan perujuk tetap sah) — cuma
    -- konversinya yang dibatalkan, supaya pembayaran sungguhan pertama nanti
    -- tetap bisa dikonversi.
    DELETE FROM referral_rewards rr
    USING referrals r
    WHERE r.id = rr.referral_id AND r.referee_id = v_user_id;
    GET DIAGNOSTICS v_jumlah = ROW_COUNT;
    RAISE NOTICE 'referral_rewards dihapus: %', v_jumlah;

    UPDATE referrals
    SET status = 'terdaftar', tanggal_konversi = NULL
    WHERE referee_id = v_user_id AND status = 'terkonversi';

    -- ---- 3. Kode promo: kembalikan hitungan pemakaian -----------------------
    -- Webhook menaikkan kode_promo.jumlah_terpakai untuk tiap payment berhasil.
    UPDATE kode_promo kp
    SET jumlah_terpakai = GREATEST(0, kp.jumlah_terpakai - x.n)
    FROM (
        SELECT kode_promo_id, count(*)::INT AS n
        FROM payments
        WHERE user_id = v_user_id AND status = 'berhasil' AND kode_promo_id IS NOT NULL
        GROUP BY kode_promo_id
    ) x
    WHERE kp.id = x.kode_promo_id;

    -- ---- 4. Anak enrollment → enrollment ------------------------------------
    -- enrollment_manual_log TIDAK dihapus (log audit Admin): enrollment_id
    -- otomatis jadi NULL lewat ON DELETE SET NULL. Dilaporkan di sini.
    SELECT count(*) INTO v_jumlah
    FROM enrollment_manual_log
    WHERE siswa_id = v_user_id
       OR enrollment_id IN (SELECT id FROM enrollments WHERE user_id = v_user_id);
    RAISE NOTICE 'enrollment_manual_log dipertahankan (enrollment_id jadi NULL): %', v_jumlah;

    -- (sesi_kelas & enrollment_subtes sebenarnya ON DELETE CASCADE; dihapus
    -- eksplisit supaya urutannya jelas dan jumlahnya tercatat.)
    DELETE FROM sesi_kelas
    WHERE enrollment_id IN (SELECT id FROM enrollments WHERE user_id = v_user_id);
    GET DIAGNOSTICS v_jumlah = ROW_COUNT;
    RAISE NOTICE 'sesi_kelas dihapus: %', v_jumlah;

    DELETE FROM enrollment_subtes
    WHERE enrollment_id IN (SELECT id FROM enrollments WHERE user_id = v_user_id);

    DELETE FROM materi_progress WHERE user_id = v_user_id;

    DELETE FROM enrollments WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_jumlah = ROW_COUNT;
    RAISE NOTICE 'enrollments dihapus: %', v_jumlah;

    -- ---- 5. Anak payment → payment ------------------------------------------
    DELETE FROM payment_subtes_pilihan
    WHERE payment_id IN (SELECT id FROM payments WHERE user_id = v_user_id);

    DELETE FROM payments WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_jumlah = ROW_COUNT;
    RAISE NOTICE 'payments dihapus: %', v_jumlah;

    -- ---- 6. Notifikasi pembayaran & pendaftaran manual milik akun uji -------
    DELETE FROM notifikasi
    WHERE user_id = v_user_id AND tipe = 'sistem'
      AND judul IN ('Pembayaran berhasil!', 'Kamu sudah terdaftar di kelas baru');
    GET DIAGNOSTICS v_jumlah = ROW_COUNT;
    RAISE NOTICE 'notifikasi pembayaran/didaftarkan dihapus: %', v_jumlah;

    -- ---- Pastikan benar-benar bersih ----------------------------------------
    SELECT (SELECT count(*) FROM payments WHERE user_id = v_user_id)
         + (SELECT count(*) FROM enrollments WHERE user_id = v_user_id)
         + (SELECT count(*) FROM referral_rewards rr JOIN referrals r ON r.id = rr.referral_id
             WHERE r.referee_id = v_user_id)
    INTO v_sisa;
    IF v_sisa <> 0 THEN
        RAISE EXCEPTION 'Masih ada % baris tersisa — tidak ada yang disimpan', v_sisa;
    END IF;
END $$;

-- DRY-RUN. Ganti baris di bawah menjadi COMMIT; hanya setelah LANGKAH 1 diperiksa.
ROLLBACK;
