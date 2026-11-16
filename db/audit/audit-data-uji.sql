-- ============================================================================
-- AUDIT READ-ONLY: DATA UJI SEBELUM SOFT LAUNCH
--
-- HANYA SELECT. Tidak ada pernyataan yang mengubah data atau skema. Aman dijalankan
-- berulang kali di Supabase SQL Editor (database yang sama dipakai Preview & Production;
-- pembayaran Mayar LIVE = uang asli).
--
-- CARA PAKAI
--   SQL Editor Supabase hanya menampilkan hasil pernyataan TERAKHIR. Karena itu berkas ini
--   berisi kueri bernomor yang MASING-MASING MANDIRI dan menghasilkan SATU tabel.
--   Jalankan SATU PER SATU: seleksi (blok) satu kueri saja dari komentar "-- >>> KODE" sampai
--   tanda ';' pertama di akhirnya, lalu Run (Ctrl/Cmd+Enter pada seleksi menjalankan seleksi itu).
--   Urutan yang disarankan:
--     Q0  ringkasan semua kategori (UNION ALL: kategori, jumlah, contoh_id_atau_nama, catatan)
--     A1  kelas uji                      B1/B2  mekanisme & status sembunyi
--     C1/C2  enrollment di kelas uji     D1  siswa kandidat hapus vs JANGAN hapus
--     E1  pembayaran (cek Mayar!)        F1  akun QA / mentor uji
--     G1  kelas asli yang tercemar       H1  email mentor aktif
--     I1  data turunan per tabel         J1  leads / asesmen uji
--
-- DEFINISI "UJI" (bisa diubah di CTE kelas_uji / akun_qa, tersalin di tiap kueri):
--   kelas uji  = nama memuat [UJI]  ATAU  harga (setelah diskon) <= Rp10.000  ATAU  nama berpola uji.
--   akun QA    = email plus-address (+), domain uji (example.com, mailinator.com, ...), email/nama
--                berpola uji (qa/test/uji/dummy/demo), atau email memuat 'eduspark'.
--   Hasil adalah KANDIDAT untuk ditinjau Rio — bukan daftar yang boleh langsung dihapus.
--
-- MEKANISME SEMBUNYI KELAS: kolom kelas.tampil_di_katalog (BOOLEAN, default true).
--   false = hilang dari katalog /program, rekomendasi, hasil asesmen & checkout; /program/kelas/[id]
--   jadi 404; siswa yang SUDAH terdaftar tetap melihat kelasnya.
--
-- DIHASILKAN dari skema db/schema.sql + db/add_*.sql. Nama kolom mengikuti skema itu.
-- ============================================================================


-- ============================================================================
-- >>> Q0 — RINGKASAN semua kategori (satu tabel: kategori, jumlah, contoh_id_atau_nama, catatan)

--     Jalankan PERTAMA untuk gambaran besar; detail ada di A1..J1.

-- ============================================================================
WITH kelas_uji AS (
    SELECT x.*
    FROM (
        SELECT k.id, k.nama, k.harga, k.diskon_persen, k.tampil_di_katalog,
               round(k.harga * (100 - k.diskon_persen) / 100.0) AS harga_efektif,
               CASE
                   WHEN k.nama ILIKE '%[UJI]%' THEN 'TINGGI'
                   WHEN k.harga * (100 - k.diskon_persen) / 100.0 <= 10000 THEN 'SEDANG (cek: mungkin kelas gratis sungguhan)'
                   ELSE 'RENDAH (hanya pola nama — cek manual)'
               END AS keyakinan,
               concat_ws('; ',
                   CASE WHEN k.nama ILIKE '%[UJI]%' THEN 'nama memuat [UJI]' END,
                   CASE WHEN k.harga <= 10000 THEN 'harga <= Rp10.000'
                        WHEN k.harga * (100 - k.diskon_persen) / 100.0 <= 10000 THEN 'harga setelah diskon <= Rp10.000' END,
                   CASE WHEN k.nama ~* '\m(uji|test|testing|dummy|sandbox|percobaan|qa)\M' AND k.nama NOT ILIKE '%[UJI]%' THEN 'nama berpola uji' END
               ) AS alasan_uji
        FROM kelas k
    ) x
    WHERE x.alasan_uji <> ''
),
akun_qa AS (
    SELECT x.*
    FROM (
        SELECT u.id, u.nama, u.email, u.created_at,
               concat_ws('; ',
                   CASE WHEN u.email LIKE '%+%@%' THEN 'email plus-address (+)' END,
                   CASE WHEN lower(split_part(u.email, '@', 2)) IN
                        ('example.com', 'example.org', 'example.net', 'test.com', 'test.id',
                         'mailinator.com', 'yopmail.com', 'tempmail.com', 'guerrillamail.com', 'sharklasers.com')
                        THEN 'domain uji' END,
                   CASE WHEN u.email ILIKE '%eduspark%' THEN 'mentor Eduspark (disebut Rio)' END,
                   CASE WHEN u.email ~* '(^|[._+-])(qa|test|testing|tes|uji|dummy|demo)([._+@0-9-]|$)' THEN 'email berpola uji' END,
                   CASE WHEN u.nama ILIKE '%[UJI]%' OR u.nama ~* '\m(uji|test|testing|dummy|sandbox|percobaan|qa)\M' THEN 'nama berpola uji' END
               ) AS alasan_qa
        FROM users u
    ) x
    WHERE x.alasan_qa <> ''
),
enr_uji AS (
    SELECT e.id, e.user_id, e.kelas_id, e.status_pembayaran, e.sumber, e.tanggal_daftar, e.tanggal_keluar,
           e.nominal_dibayar, e.link_meet, e.mentor_offline_id
    FROM enrollments e
    WHERE e.kelas_id IN (SELECT id FROM kelas_uji)
),
pay_uji AS (
    SELECT p.*
    FROM payments p
    WHERE p.item_type = 'kelas' AND p.item_id IN (SELECT id FROM kelas_uji)
),
siswa_uji AS (
    -- Satu baris per akun yang punya >= 1 enrollment di kelas uji, plus pengaman sebelum dianggap kandidat hapus.
    SELECT u.id, u.nama, u.email, u.created_at,
           (SELECT count(*) FROM enrollments e WHERE e.user_id = u.id AND e.kelas_id IN (SELECT id FROM kelas_uji)) AS enr_kelas_uji,
           (SELECT count(*) FROM enrollments e WHERE e.user_id = u.id AND e.kelas_id NOT IN (SELECT id FROM kelas_uji)) AS enr_kelas_asli,
           (SELECT count(*) FROM payments p WHERE p.user_id = u.id
               AND NOT (p.item_type = 'kelas' AND p.item_id IN (SELECT id FROM kelas_uji))) AS payments_di_luar_kelas_uji,
           (SELECT string_agg(ur.role_type::text || ':' || ur.status::text, ', ' ORDER BY ur.role_type::text)
              FROM user_roles ur WHERE ur.user_id = u.id) AS roles,
           EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id AND ur.role_type IN ('mentor', 'admin')) AS punya_role_mentor_admin,
           (SELECT count(*) FROM tryout_attempts t WHERE t.user_id = u.id) AS tryout_attempts,
           (SELECT count(*) FROM assessments a WHERE a.user_id = u.id) AS assessments,
           (SELECT count(*) FROM referrals r WHERE r.referee_id = u.id OR r.referrer_id = u.id) AS referrals,
           (SELECT count(*) FROM reward_redemptions rr WHERE rr.user_id = u.id) AS reward_redemptions
    FROM users u
    WHERE EXISTS (SELECT 1 FROM enrollments e WHERE e.user_id = u.id AND e.kelas_id IN (SELECT id FROM kelas_uji))
),
relasi_qa_kelas_asli AS (
    -- Keterlibatan akun QA/uji di kelas yang BUKAN kelas uji. Kandidat DILEPAS (bukan dihapus).
    SELECT 'kelas_mentor'::text AS jenis, k.id AS kelas_id, k.nama::text AS kelas_nama, a.id AS akun_id, a.email::text AS email,
           NULL::text AS subtes, NULL::text AS detail,
           'lepas dari kelas_mentor'::text AS saran
    FROM kelas_mentor km
    JOIN akun_qa a ON a.id = km.mentor_id
    JOIN kelas k ON k.id = km.kelas_id
    WHERE km.kelas_id NOT IN (SELECT id FROM kelas_uji)
    UNION ALL
    SELECT 'kelas.mentor_id (DEPRECATED)', k.id, k.nama::text, a.id, a.email::text, NULL, NULL,
           'kosongkan kelas.mentor_id (kolom lama) bila bukan mentor sungguhan'
    FROM kelas k
    JOIN akun_qa a ON a.id = k.mentor_id
    WHERE k.id NOT IN (SELECT id FROM kelas_uji)
    UNION ALL
    SELECT 'kelas_subtes_mentor', k.id, k.nama::text, a.id, a.email::text, s.nama::text, NULL,
           'lepas pasangan Subtes-Mentor (memengaruhi hitungan pemegang subtes & "siapa cepat dia dapat")'
    FROM kelas_subtes_mentor ksm
    JOIN akun_qa a ON a.id = ksm.mentor_id
    JOIN kelas k ON k.id = ksm.kelas_id
    JOIN subtes s ON s.id = ksm.subtes_id
    WHERE ksm.kelas_id NOT IN (SELECT id FROM kelas_uji)
    UNION ALL
    SELECT 'enrollment akun QA sebagai SISWA', k.id, k.nama::text, a.id, a.email::text, NULL,
           'enrollment ' || e.id::text || '; status=' || e.status_pembayaran::text || '; sumber=' || e.sumber::text
               || '; daftar=' || e.tanggal_daftar::date::text,
           'enrollment uji di kelas asli: tinjau lalu hapus/batalkan (ikut hitungan kuota & honor)'
    FROM enrollments e
    JOIN akun_qa a ON a.id = e.user_id
    JOIN kelas k ON k.id = e.kelas_id
    WHERE e.kelas_id NOT IN (SELECT id FROM kelas_uji)
    UNION ALL
    SELECT 'enrollments.mentor_offline_id', k.id, k.nama::text, a.id, a.email::text, NULL,
           'enrollment ' || e.id::text || '; status=' || e.status_pembayaran::text,
           'ganti mentor tatap muka'
    FROM enrollments e
    JOIN akun_qa a ON a.id = e.mentor_offline_id
    JOIN kelas k ON k.id = e.kelas_id
    WHERE e.kelas_id NOT IN (SELECT id FROM kelas_uji)
    UNION ALL
    SELECT 'enrollment_subtes.mentor_id (PENERIMA siswa)', k.id, k.nama::text, a.id, a.email::text, s.nama::text,
           'enrollment ' || e.id::text || '; diterima_pada=' || coalesce(es.diterima_pada::text, '-'),
           'penerima = akun QA: siswa dianggap milik akun uji (memengaruhi presensi/honor) — tinjau'
    FROM enrollment_subtes es
    JOIN akun_qa a ON a.id = es.mentor_id
    JOIN enrollments e ON e.id = es.enrollment_id
    JOIN kelas k ON k.id = e.kelas_id
    JOIN subtes s ON s.id = es.subtes_id
    WHERE e.kelas_id NOT IN (SELECT id FROM kelas_uji)
    UNION ALL
    SELECT 'sesi_kelas.mentor_id (presensi ditandai akun QA)', k.id, k.nama::text, a.id, a.email::text, NULL,
           count(*)::text || ' sesi ditandai; ' || count(*) FILTER (WHERE sk.dibayar_pada IS NOT NULL)::text || ' sudah ditandai honor dibayar',
           'presensi uji di kelas asli: memengaruhi laporan Honor — tinjau'
    FROM sesi_kelas sk
    JOIN akun_qa a ON a.id = sk.mentor_id
    JOIN enrollments e ON e.id = sk.enrollment_id
    JOIN kelas k ON k.id = e.kelas_id
    WHERE e.kelas_id NOT IN (SELECT id FROM kelas_uji)
    GROUP BY k.id, k.nama, a.id, a.email
    UNION ALL
    SELECT 'mentor_subtes_diampu (global, bukan per kelas)', NULL::uuid, NULL::text, a.id, a.email::text, s.nama::text, NULL,
           'hapus subtes diampu bila akun ini bukan mentor sungguhan'
    FROM mentor_subtes_diampu msd
    JOIN mentor_profiles mp ON mp.id = msd.mentor_profile_id
    JOIN akun_qa a ON a.id = mp.user_id
    JOIN subtes s ON s.id = msd.subtes_id
    UNION ALL
    SELECT 'studio_soal_penugasan (global, bukan per kelas)', NULL::uuid, NULL::text, a.id, a.email::text, s.nama::text,
           'ditugaskan_pada=' || ssp.ditugaskan_pada::date::text,
           'cabut penugasan Studio Soal bila akun ini bukan mentor sungguhan'
    FROM studio_soal_penugasan ssp
    JOIN akun_qa a ON a.id = ssp.mentor_id
    JOIN subtes s ON s.id = ssp.subtes_id
),
turunan_uji AS (
    -- Jumlah baris per tabel yang merujuk kelas uji / enrollment uji / payment uji.
    SELECT 1 AS urut, 'kelas (uji)'::text AS tabel, (SELECT count(*) FROM kelas_uji) AS jumlah,
           'induk — dihapus terakhir'::text AS catatan
    UNION ALL SELECT 2, 'enrollments (di kelas uji)', (SELECT count(*) FROM enr_uji), 'FK kelas_id TANPA cascade: enrollment harus dihapus dulu'
    UNION ALL SELECT 3, 'enrollment_subtes', (SELECT count(*) FROM enrollment_subtes WHERE enrollment_id IN (SELECT id FROM enr_uji)), 'CASCADE dari enrollments'
    UNION ALL SELECT 4, '  - di antaranya sudah punya penerima (mentor_id terisi)', (SELECT count(*) FROM enrollment_subtes WHERE enrollment_id IN (SELECT id FROM enr_uji) AND mentor_id IS NOT NULL), 'klaim "terima siswa"'
    UNION ALL SELECT 5, 'sesi_kelas (presensi)', (SELECT count(*) FROM sesi_kelas WHERE enrollment_id IN (SELECT id FROM enr_uji)), 'CASCADE dari enrollments'
    UNION ALL SELECT 6, '  - sudah ditandai mentor', (SELECT count(*) FROM sesi_kelas WHERE enrollment_id IN (SELECT id FROM enr_uji) AND dikonfirmasi_mentor), 'masuk hitungan Honor'
    UNION ALL SELECT 7, '  - honor sudah ditandai DIBAYAR (dibayar_pada terisi)', (SELECT count(*) FROM sesi_kelas WHERE enrollment_id IN (SELECT id FROM enr_uji) AND dibayar_pada IS NOT NULL), 'PERHATIAN: bila > 0, cek laporan honor sebelum menghapus'
    UNION ALL SELECT 8, 'sesi_review_log (keputusan Admin atas sesi uji)', (SELECT count(*) FROM sesi_review_log WHERE sesi_id IN (SELECT id FROM sesi_kelas WHERE enrollment_id IN (SELECT id FROM enr_uji))), 'sesi_id jadi NULL bila sesi dihapus (log audit tetap)'
    UNION ALL SELECT 9, 'enrollment_manual_log (kelas/enrollment uji)', (SELECT count(*) FROM enrollment_manual_log WHERE kelas_id IN (SELECT id FROM kelas_uji) OR enrollment_id IN (SELECT id FROM enr_uji)), 'log audit — sengaja dipertahankan (FK SET NULL)'
    UNION ALL SELECT 10, 'payments (item_id = kelas uji)', (SELECT count(*) FROM pay_uji), 'payments.user_id TANPA cascade'
    UNION ALL SELECT 11, '  - berstatus berhasil (lunas)', (SELECT count(*) FROM pay_uji WHERE status = 'berhasil'), 'cek Mayar: bisa uang asli'
    UNION ALL SELECT 12, '  - memakai kode promo (kode_promo_id terisi)', (SELECT count(*) FROM pay_uji WHERE kode_promo_id IS NOT NULL AND status = 'berhasil'), 'kode_promo.jumlah_terpakai perlu dikoreksi'
    UNION ALL SELECT 13, 'payment_subtes_pilihan', (SELECT count(*) FROM payment_subtes_pilihan WHERE payment_id IN (SELECT id FROM pay_uji)), 'CASCADE dari payments'
    UNION ALL SELECT 14, 'kelas_mentor (kelas uji)', (SELECT count(*) FROM kelas_mentor WHERE kelas_id IN (SELECT id FROM kelas_uji)), 'CASCADE dari kelas'
    UNION ALL SELECT 15, 'kelas_subtes (kelas uji)', (SELECT count(*) FROM kelas_subtes WHERE kelas_id IN (SELECT id FROM kelas_uji)), 'CASCADE dari kelas'
    UNION ALL SELECT 16, 'kelas_subtes_mentor (kelas uji)', (SELECT count(*) FROM kelas_subtes_mentor WHERE kelas_id IN (SELECT id FROM kelas_uji)), 'CASCADE dari kelas'
    UNION ALL SELECT 17, 'kode_promo_kelas (kelas uji)', (SELECT count(*) FROM kode_promo_kelas WHERE kelas_id IN (SELECT id FROM kelas_uji)), 'CASCADE dari kelas'
    UNION ALL SELECT 18, 'materi (kelas uji)', (SELECT count(*) FROM materi WHERE kelas_id IN (SELECT id FROM kelas_uji)), 'materi.kelas_id TANPA cascade'
    UNION ALL SELECT 19, 'materi_progress (atas materi kelas uji)', (SELECT count(*) FROM materi_progress WHERE materi_id IN (SELECT id FROM materi WHERE kelas_id IN (SELECT id FROM kelas_uji))), 'CASCADE dari materi'
    UNION ALL SELECT 20, 'soal_ai (kelas_id = kelas uji)', (SELECT count(*) FROM soal_ai WHERE kelas_id IN (SELECT id FROM kelas_uji)), 'soal_ai.kelas_id TANPA cascade'
    UNION ALL SELECT 21, 'link Meet per siswa terisi (enrollments.link_meet)', (SELECT count(*) FROM enr_uji WHERE link_meet IS NOT NULL), 'ikut hilang bersama enrollment'
    UNION ALL SELECT 22, 'link Meet kelas terisi (kelas.link_meet, kelas uji)', (SELECT count(*) FROM kelas WHERE id IN (SELECT id FROM kelas_uji) AND link_meet IS NOT NULL), 'ikut hilang bersama kelas'
    UNION ALL SELECT 23, 'notifikasi yang tautannya memuat id kelas uji', (SELECT count(*) FROM notifikasi n WHERE EXISTS (SELECT 1 FROM kelas_uji ku WHERE n.link_tujuan LIKE '%' || ku.id::text || '%')), 'notifikasi tidak punya FK ke kelas: hanya terdeteksi lewat link_tujuan; notifikasi "siswa baru" milik mentor bisa tidak terdeteksi'
    UNION ALL SELECT 24, 'notifikasi_wa_log (kunci memuat id enrollment/payment uji)', (SELECT count(*) FROM notifikasi_wa_log w WHERE EXISTS (SELECT 1 FROM enr_uji e WHERE w.kunci_kejadian LIKE '%' || e.id::text || '%') OR EXISTS (SELECT 1 FROM pay_uji p WHERE w.kunci_kejadian LIKE '%' || p.id::text || '%')), 'log kiriman WA mentor "siswa baru"'
    UNION ALL SELECT 25, 'referrals dengan referee = siswa di kelas uji', (SELECT count(*) FROM referrals WHERE referee_id IN (SELECT user_id FROM enr_uji)), 'referrals TANPA cascade; poin perlu dibalik (lihat db/cleanup_enrollment_uji_TEMPLATE.sql)'
    UNION ALL SELECT 26, '  - referral_rewards dari referral di atas', (SELECT count(*) FROM referral_rewards WHERE referral_id IN (SELECT id FROM referrals WHERE referee_id IN (SELECT user_id FROM enr_uji))), 'poin ikut tercatat di gamifikasi_profiles'
    UNION ALL SELECT 27, 'PER-AKUN siswa di kelas uji: tryout_attempts', (SELECT count(*) FROM tryout_attempts WHERE user_id IN (SELECT user_id FROM enr_uji)), 'CASCADE dari users (hanya bila akun dihapus)'
    UNION ALL SELECT 28, 'PER-AKUN siswa di kelas uji: assessments', (SELECT count(*) FROM assessments WHERE user_id IN (SELECT user_id FROM enr_uji)), 'CASCADE dari users'
    UNION ALL SELECT 29, 'PER-AKUN siswa di kelas uji: notifikasi (semua)', (SELECT count(*) FROM notifikasi WHERE user_id IN (SELECT user_id FROM enr_uji)), 'CASCADE dari users'
    UNION ALL SELECT 30, 'PER-AKUN siswa di kelas uji: reward_redemptions', (SELECT count(*) FROM reward_redemptions WHERE user_id IN (SELECT user_id FROM enr_uji)), 'FK TANPA cascade: memblokir penghapusan akun'
    UNION ALL SELECT 31, 'PER-AKUN siswa di kelas uji: leads (user_id)', (SELECT count(*) FROM leads WHERE user_id IN (SELECT user_id FROM enr_uji)), 'FK SET NULL'
),
jejak_lead AS (
    SELECT 'lead'::text AS jenis, l.id::text AS id, coalesce(l.nama, '(tanpa nama)')::text AS label,
           concat_ws('; ', 'no_wa=' || l.no_wa, 'sumber=' || l.sumber, 'status=' || l.status, 'dibuat=' || l.created_at::date::text,
               CASE WHEN l.nama ILIKE '%[UJI]%' OR l.nama ~* '\m(uji|test|testing|dummy|sandbox|percobaan|qa)\M' THEN 'nama berpola uji' END,
               CASE WHEN l.no_wa ~ '(\d)\1{5,}' OR l.no_wa LIKE '62812345%' THEN 'nomor WA berpola uji' END,
               CASE WHEN l.user_id IN (SELECT id FROM akun_qa) THEN 'terkait akun QA' END,
               CASE WHEN l.user_id IN (SELECT user_id FROM enr_uji) THEN 'terkait siswa kelas uji' END) AS detail
    FROM leads l
    WHERE l.nama ILIKE '%[UJI]%' OR l.nama ~* '\m(uji|test|testing|dummy|sandbox|percobaan|qa)\M'
       OR l.no_wa ~ '(\d)\1{5,}' OR l.no_wa LIKE '62812345%'
       OR l.user_id IN (SELECT id FROM akun_qa)
       OR l.user_id IN (SELECT user_id FROM enr_uji)
    UNION ALL
    SELECT 'assessment', a.id::text, coalesce(u.email, '(anonim)')::text,
           concat_ws('; ', 'jalur=' || a.jalur::text, 'dibuat=' || a.created_at::date::text, 'utm_campaign=' || coalesce(a.utm_campaign, '-'))
    FROM assessments a
    JOIN akun_qa u ON u.id = a.user_id
)
SELECT x.kategori, x.jumlah, x.contoh_id_atau_nama, x.catatan
FROM (
    SELECT 10 AS urut, 'A. Kelas uji terdeteksi' AS kategori, count(*) AS jumlah,
           left(string_agg(nama, ' | ' ORDER BY nama), 300) AS contoh_id_atau_nama,
           'lihat A1; keyakinan TINGGI = nama [UJI]' AS catatan
    FROM kelas_uji
    UNION ALL
    SELECT 20, 'B. Kelas uji masih TERLIHAT di katalog (tampil_di_katalog = true)', count(*),
           left(string_agg(nama, ' | ' ORDER BY nama), 300),
           'sembunyikan lewat Admin > Kelola Kelas (saklar Tampilkan di katalog); lihat B1/B2'
    FROM kelas_uji WHERE tampil_di_katalog IS DISTINCT FROM false
    UNION ALL
    SELECT 21, 'B. Kelas uji sudah disembunyikan (tampil_di_katalog = false)', count(*), NULL, NULL
    FROM kelas_uji WHERE tampil_di_katalog = false
    UNION ALL
    SELECT 30, 'C. Enrollment di kelas uji (total)', count(*), NULL, 'lihat C1/C2' FROM enr_uji
    UNION ALL
    SELECT 31, 'C.   - berstatus lunas', count(*), NULL, 'masuk kuota kelas & hitungan Honor/Sales' FROM enr_uji WHERE status_pembayaran = 'lunas'
    UNION ALL
    SELECT 32, 'C.   - sumber manual (didaftarkan Admin)', count(*), NULL, NULL FROM enr_uji WHERE sumber = 'manual'
    UNION ALL
    SELECT 40, 'D. Akun yang HANYA punya enrollment di kelas uji (KANDIDAT HAPUS, setelah dicek di D1)', count(*),
           left(string_agg(email, ' | ' ORDER BY email), 300),
           'di luar itu: akun tanpa pengaman (role mentor/admin, kelas asli, pembayaran lain)'
    FROM siswa_uji WHERE enr_kelas_asli = 0 AND payments_di_luar_kelas_uji = 0 AND NOT punya_role_mentor_admin
    UNION ALL
    SELECT 41, 'D. Akun yang juga punya kelas asli / pembayaran lain / role mentor-admin (JANGAN HAPUS)', count(*),
           left(string_agg(email, ' | ' ORDER BY email), 300), 'tinjau di D1'
    FROM siswa_uji WHERE enr_kelas_asli > 0 OR payments_di_luar_kelas_uji > 0 OR punya_role_mentor_admin
    UNION ALL
    SELECT 50, 'E. Payments terkait kelas uji (total)', count(*), NULL,
           'total jumlah Rp' || coalesce(sum(jumlah)::bigint::text, '0') FROM pay_uji
    UNION ALL
    SELECT 51, 'E.   - berstatus BERHASIL (lunas) — bisa UANG ASLI', count(*),
           left(string_agg(order_id, ' | ' ORDER BY dibuat_pada), 300),
           'jumlah Rp' || coalesce(sum(jumlah)::bigint::text, '0') || '; cek di dashboard Mayar sebelum menghapus apa pun'
    FROM pay_uji WHERE status = 'berhasil'
    UNION ALL
    SELECT 60, 'F. Akun QA/uji terdeteksi (plus-address, domain uji, Eduspark, pola nama)', count(*),
           left(string_agg(email, ' | ' ORDER BY email), 300), 'lihat F1'
    FROM akun_qa
    UNION ALL
    SELECT 70, 'G. Keterlibatan akun QA di KELAS ASLI (kandidat DILEPAS, bukan dihapus)', count(*),
           left(string_agg(DISTINCT kelas_nama, ' | '), 300), 'lihat G1'
    FROM relasi_qa_kelas_asli WHERE kelas_nama IS NOT NULL
    UNION ALL
    SELECT 71, 'G.   - jenis relasi ' || jenis, count(*), NULL, NULL
    FROM relasi_qa_kelas_asli GROUP BY jenis
    UNION ALL
    SELECT 80, 'H. Mentor AKTIF (user_roles: mentor + active)', count(DISTINCT u.id), NULL,
           'periksa emailnya di H1; JANGAN mengirim email apa pun'
    FROM users u JOIN user_roles ur ON ur.user_id = u.id AND ur.role_type = 'mentor' AND ur.status = 'active'
    UNION ALL
    SELECT 90 + t.urut, 'I. ' || t.tabel, t.jumlah, NULL, t.catatan FROM turunan_uji t
    UNION ALL
    SELECT 200, 'J. Lead / asesmen yang tampak uji', count(*), left(string_agg(label, ' | '), 300), 'lihat J1' FROM jejak_lead
) x
ORDER BY x.urut, x.kategori;


-- ============================================================================
-- >>> A1 — A. KELAS UJI: id, nama, harga, status tampil, jumlah enrollment, jumlah lunas

--     Kriteria: nama memuat [UJI], ATAU harga (setelah diskon) <= Rp10.000, ATAU nama berpola uji. Kolom alasan_uji + keyakinan menjelaskan kenapa terdeteksi; periksa SEBELUM dipakai.

-- ============================================================================
WITH kelas_uji AS (
    SELECT x.*
    FROM (
        SELECT k.id, k.nama, k.harga, k.diskon_persen, k.tampil_di_katalog,
               round(k.harga * (100 - k.diskon_persen) / 100.0) AS harga_efektif,
               CASE
                   WHEN k.nama ILIKE '%[UJI]%' THEN 'TINGGI'
                   WHEN k.harga * (100 - k.diskon_persen) / 100.0 <= 10000 THEN 'SEDANG (cek: mungkin kelas gratis sungguhan)'
                   ELSE 'RENDAH (hanya pola nama — cek manual)'
               END AS keyakinan,
               concat_ws('; ',
                   CASE WHEN k.nama ILIKE '%[UJI]%' THEN 'nama memuat [UJI]' END,
                   CASE WHEN k.harga <= 10000 THEN 'harga <= Rp10.000'
                        WHEN k.harga * (100 - k.diskon_persen) / 100.0 <= 10000 THEN 'harga setelah diskon <= Rp10.000' END,
                   CASE WHEN k.nama ~* '\m(uji|test|testing|dummy|sandbox|percobaan|qa)\M' AND k.nama NOT ILIKE '%[UJI]%' THEN 'nama berpola uji' END
               ) AS alasan_uji
        FROM kelas k
    ) x
    WHERE x.alasan_uji <> ''
)
SELECT ku.id AS kelas_id,
       ku.nama,
       ku.harga,
       ku.diskon_persen,
       ku.harga_efektif,
       ku.tampil_di_katalog,
       CASE WHEN ku.tampil_di_katalog = false THEN 'tersembunyi' ELSE 'TERLIHAT di katalog' END AS status_tampil,
       (SELECT count(*) FROM enrollments e WHERE e.kelas_id = ku.id) AS jumlah_enrollment,
       (SELECT count(*) FROM enrollments e WHERE e.kelas_id = ku.id AND e.status_pembayaran = 'lunas') AS jumlah_enrollment_lunas,
       ku.keyakinan,
       ku.alasan_uji
FROM kelas_uji ku
ORDER BY ku.keyakinan, ku.nama;


-- ============================================================================
-- >>> B1 — B. MEKANISME SEMBUNYI: kolom yang dipakai aplikasi (cek kolom ada di database)

--     Aplikasi menyembunyikan kelas lewat kolom kelas.tampil_di_katalog (BOOLEAN, default true). false = hilang dari katalog /program, rekomendasi kelas, hasil asesmen, dan checkout; halaman publik /program/kelas/[id] menjadi 404; siswa yang SUDAH terdaftar tetap melihat kelasnya. Tidak ada kolom status/arsip lain.

-- ============================================================================
SELECT c.table_name AS tabel,
       c.column_name AS kolom,
       c.data_type AS tipe,
       c.column_default AS nilai_bawaan,
       c.is_nullable AS boleh_null,
       'kolom ADA — dipakai filter .eq("tampil_di_katalog", true) di lib/dashboard/getProgramData.ts, lib/payment/getKelasForCheckout.ts, app/assessment/hasil/[id]/page.tsx' AS catatan
FROM information_schema.columns c
WHERE c.table_schema = 'public' AND c.table_name = 'kelas' AND c.column_name = 'tampil_di_katalog'
UNION ALL
SELECT 'kelas', 'tampil_di_katalog', NULL, NULL, NULL,
       'KOLOM TIDAK DITEMUKAN — jalankan db/add_kelas_tampil_di_katalog.sql dulu'
WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns c
                  WHERE c.table_schema = 'public' AND c.table_name = 'kelas' AND c.column_name = 'tampil_di_katalog');


-- ============================================================================
-- >>> B2 — B. NILAI SAAT INI kelas.tampil_di_katalog untuk kelas uji (dan kelas non-uji yang tersembunyi)

--     Baris berstatus 'TERLIHAT' pada kelas uji = masih tampil ke calon siswa dan bisa dibeli (Mayar LIVE). Kelas non-uji yang tersembunyi ikut ditampilkan supaya Rio tahu bila ada kelas asli yang tak sengaja tersembunyi.

-- ============================================================================
WITH kelas_uji AS (
    SELECT x.*
    FROM (
        SELECT k.id, k.nama, k.harga, k.diskon_persen, k.tampil_di_katalog,
               round(k.harga * (100 - k.diskon_persen) / 100.0) AS harga_efektif,
               CASE
                   WHEN k.nama ILIKE '%[UJI]%' THEN 'TINGGI'
                   WHEN k.harga * (100 - k.diskon_persen) / 100.0 <= 10000 THEN 'SEDANG (cek: mungkin kelas gratis sungguhan)'
                   ELSE 'RENDAH (hanya pola nama — cek manual)'
               END AS keyakinan,
               concat_ws('; ',
                   CASE WHEN k.nama ILIKE '%[UJI]%' THEN 'nama memuat [UJI]' END,
                   CASE WHEN k.harga <= 10000 THEN 'harga <= Rp10.000'
                        WHEN k.harga * (100 - k.diskon_persen) / 100.0 <= 10000 THEN 'harga setelah diskon <= Rp10.000' END,
                   CASE WHEN k.nama ~* '\m(uji|test|testing|dummy|sandbox|percobaan|qa)\M' AND k.nama NOT ILIKE '%[UJI]%' THEN 'nama berpola uji' END
               ) AS alasan_uji
        FROM kelas k
    ) x
    WHERE x.alasan_uji <> ''
)
SELECT k.id AS kelas_id,
       k.nama,
       k.tampil_di_katalog,
       (ku.id IS NOT NULL) AS kelas_uji,
       CASE
           WHEN ku.id IS NOT NULL AND k.tampil_di_katalog IS DISTINCT FROM false THEN 'KELAS UJI MASIH TERLIHAT & BISA DIBELI — sembunyikan'
           WHEN ku.id IS NOT NULL THEN 'kelas uji sudah tersembunyi (OK)'
           ELSE 'kelas NON-uji tersembunyi — pastikan memang disengaja'
       END AS status,
       k.harga,
       (SELECT count(*) FROM enrollments e WHERE e.kelas_id = k.id AND e.status_pembayaran = 'lunas') AS enrollment_lunas
FROM kelas k
LEFT JOIN kelas_uji ku ON ku.id = k.id
WHERE ku.id IS NOT NULL OR k.tampil_di_katalog = false
ORDER BY (ku.id IS NULL), k.tampil_di_katalog, k.nama;


-- ============================================================================
-- >>> C1 — C. ENROLLMENT di kelas uji — agregat per kelas x status pembayaran x sumber

--     sumber = enrollments.sumber ('checkout' = beli lewat website; 'manual' = didaftarkan Admin).

-- ============================================================================
WITH kelas_uji AS (
    SELECT x.*
    FROM (
        SELECT k.id, k.nama, k.harga, k.diskon_persen, k.tampil_di_katalog,
               round(k.harga * (100 - k.diskon_persen) / 100.0) AS harga_efektif,
               CASE
                   WHEN k.nama ILIKE '%[UJI]%' THEN 'TINGGI'
                   WHEN k.harga * (100 - k.diskon_persen) / 100.0 <= 10000 THEN 'SEDANG (cek: mungkin kelas gratis sungguhan)'
                   ELSE 'RENDAH (hanya pola nama — cek manual)'
               END AS keyakinan,
               concat_ws('; ',
                   CASE WHEN k.nama ILIKE '%[UJI]%' THEN 'nama memuat [UJI]' END,
                   CASE WHEN k.harga <= 10000 THEN 'harga <= Rp10.000'
                        WHEN k.harga * (100 - k.diskon_persen) / 100.0 <= 10000 THEN 'harga setelah diskon <= Rp10.000' END,
                   CASE WHEN k.nama ~* '\m(uji|test|testing|dummy|sandbox|percobaan|qa)\M' AND k.nama NOT ILIKE '%[UJI]%' THEN 'nama berpola uji' END
               ) AS alasan_uji
        FROM kelas k
    ) x
    WHERE x.alasan_uji <> ''
),
enr_uji AS (
    SELECT e.id, e.user_id, e.kelas_id, e.status_pembayaran, e.sumber, e.tanggal_daftar, e.tanggal_keluar,
           e.nominal_dibayar, e.link_meet, e.mentor_offline_id
    FROM enrollments e
    WHERE e.kelas_id IN (SELECT id FROM kelas_uji)
)
SELECT ku.id AS kelas_id,
       ku.nama AS kelas,
       e.status_pembayaran,
       e.sumber,
       count(*) AS jumlah,
       count(*) FILTER (WHERE e.tanggal_keluar IS NOT NULL) AS sudah_keluar,
       coalesce(sum(e.nominal_dibayar), 0) AS total_nominal_dibayar_manual,
       min(e.tanggal_daftar)::date AS daftar_pertama,
       max(e.tanggal_daftar)::date AS daftar_terakhir
FROM kelas_uji ku
JOIN enr_uji e ON e.kelas_id = ku.id
GROUP BY ku.id, ku.nama, e.status_pembayaran, e.sumber
ORDER BY ku.nama, e.status_pembayaran, e.sumber;


-- ============================================================================
-- >>> C2 — C. ENROLLMENT di kelas uji — daftar siswa (id, nama, email)

--     Satu baris per enrollment.

-- ============================================================================
WITH kelas_uji AS (
    SELECT x.*
    FROM (
        SELECT k.id, k.nama, k.harga, k.diskon_persen, k.tampil_di_katalog,
               round(k.harga * (100 - k.diskon_persen) / 100.0) AS harga_efektif,
               CASE
                   WHEN k.nama ILIKE '%[UJI]%' THEN 'TINGGI'
                   WHEN k.harga * (100 - k.diskon_persen) / 100.0 <= 10000 THEN 'SEDANG (cek: mungkin kelas gratis sungguhan)'
                   ELSE 'RENDAH (hanya pola nama — cek manual)'
               END AS keyakinan,
               concat_ws('; ',
                   CASE WHEN k.nama ILIKE '%[UJI]%' THEN 'nama memuat [UJI]' END,
                   CASE WHEN k.harga <= 10000 THEN 'harga <= Rp10.000'
                        WHEN k.harga * (100 - k.diskon_persen) / 100.0 <= 10000 THEN 'harga setelah diskon <= Rp10.000' END,
                   CASE WHEN k.nama ~* '\m(uji|test|testing|dummy|sandbox|percobaan|qa)\M' AND k.nama NOT ILIKE '%[UJI]%' THEN 'nama berpola uji' END
               ) AS alasan_uji
        FROM kelas k
    ) x
    WHERE x.alasan_uji <> ''
),
enr_uji AS (
    SELECT e.id, e.user_id, e.kelas_id, e.status_pembayaran, e.sumber, e.tanggal_daftar, e.tanggal_keluar,
           e.nominal_dibayar, e.link_meet, e.mentor_offline_id
    FROM enrollments e
    WHERE e.kelas_id IN (SELECT id FROM kelas_uji)
)
SELECT ku.nama AS kelas,
       u.id AS siswa_id,
       u.nama AS siswa_nama,
       u.email AS siswa_email,
       e.id AS enrollment_id,
       e.status_pembayaran,
       e.sumber,
       e.nominal_dibayar,
       e.tanggal_daftar,
       e.tanggal_keluar
FROM enr_uji e
JOIN kelas_uji ku ON ku.id = e.kelas_id
JOIN users u ON u.id = e.user_id
ORDER BY ku.nama, e.tanggal_daftar;


-- ============================================================================
-- >>> D1 — D. SISWA di kelas uji: KANDIDAT HAPUS vs JANGAN HAPUS

--     KANDIDAT HAPUS hanya bila: tidak punya enrollment di kelas asli, tidak punya pembayaran di luar kelas uji, dan tidak punya role mentor/admin. Kolom aktivitas_lain (tryout/asesmen/referral/penukaran reward) tetap harus dicek manual — akun dengan aktivitas itu belum tentu akun uji.

-- ============================================================================
WITH kelas_uji AS (
    SELECT x.*
    FROM (
        SELECT k.id, k.nama, k.harga, k.diskon_persen, k.tampil_di_katalog,
               round(k.harga * (100 - k.diskon_persen) / 100.0) AS harga_efektif,
               CASE
                   WHEN k.nama ILIKE '%[UJI]%' THEN 'TINGGI'
                   WHEN k.harga * (100 - k.diskon_persen) / 100.0 <= 10000 THEN 'SEDANG (cek: mungkin kelas gratis sungguhan)'
                   ELSE 'RENDAH (hanya pola nama — cek manual)'
               END AS keyakinan,
               concat_ws('; ',
                   CASE WHEN k.nama ILIKE '%[UJI]%' THEN 'nama memuat [UJI]' END,
                   CASE WHEN k.harga <= 10000 THEN 'harga <= Rp10.000'
                        WHEN k.harga * (100 - k.diskon_persen) / 100.0 <= 10000 THEN 'harga setelah diskon <= Rp10.000' END,
                   CASE WHEN k.nama ~* '\m(uji|test|testing|dummy|sandbox|percobaan|qa)\M' AND k.nama NOT ILIKE '%[UJI]%' THEN 'nama berpola uji' END
               ) AS alasan_uji
        FROM kelas k
    ) x
    WHERE x.alasan_uji <> ''
),
akun_qa AS (
    SELECT x.*
    FROM (
        SELECT u.id, u.nama, u.email, u.created_at,
               concat_ws('; ',
                   CASE WHEN u.email LIKE '%+%@%' THEN 'email plus-address (+)' END,
                   CASE WHEN lower(split_part(u.email, '@', 2)) IN
                        ('example.com', 'example.org', 'example.net', 'test.com', 'test.id',
                         'mailinator.com', 'yopmail.com', 'tempmail.com', 'guerrillamail.com', 'sharklasers.com')
                        THEN 'domain uji' END,
                   CASE WHEN u.email ILIKE '%eduspark%' THEN 'mentor Eduspark (disebut Rio)' END,
                   CASE WHEN u.email ~* '(^|[._+-])(qa|test|testing|tes|uji|dummy|demo)([._+@0-9-]|$)' THEN 'email berpola uji' END,
                   CASE WHEN u.nama ILIKE '%[UJI]%' OR u.nama ~* '\m(uji|test|testing|dummy|sandbox|percobaan|qa)\M' THEN 'nama berpola uji' END
               ) AS alasan_qa
        FROM users u
    ) x
    WHERE x.alasan_qa <> ''
),
siswa_uji AS (
    -- Satu baris per akun yang punya >= 1 enrollment di kelas uji, plus pengaman sebelum dianggap kandidat hapus.
    SELECT u.id, u.nama, u.email, u.created_at,
           (SELECT count(*) FROM enrollments e WHERE e.user_id = u.id AND e.kelas_id IN (SELECT id FROM kelas_uji)) AS enr_kelas_uji,
           (SELECT count(*) FROM enrollments e WHERE e.user_id = u.id AND e.kelas_id NOT IN (SELECT id FROM kelas_uji)) AS enr_kelas_asli,
           (SELECT count(*) FROM payments p WHERE p.user_id = u.id
               AND NOT (p.item_type = 'kelas' AND p.item_id IN (SELECT id FROM kelas_uji))) AS payments_di_luar_kelas_uji,
           (SELECT string_agg(ur.role_type::text || ':' || ur.status::text, ', ' ORDER BY ur.role_type::text)
              FROM user_roles ur WHERE ur.user_id = u.id) AS roles,
           EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id AND ur.role_type IN ('mentor', 'admin')) AS punya_role_mentor_admin,
           (SELECT count(*) FROM tryout_attempts t WHERE t.user_id = u.id) AS tryout_attempts,
           (SELECT count(*) FROM assessments a WHERE a.user_id = u.id) AS assessments,
           (SELECT count(*) FROM referrals r WHERE r.referee_id = u.id OR r.referrer_id = u.id) AS referrals,
           (SELECT count(*) FROM reward_redemptions rr WHERE rr.user_id = u.id) AS reward_redemptions
    FROM users u
    WHERE EXISTS (SELECT 1 FROM enrollments e WHERE e.user_id = u.id AND e.kelas_id IN (SELECT id FROM kelas_uji))
)
SELECT CASE
           WHEN s.punya_role_mentor_admin THEN '2. JANGAN HAPUS — punya role mentor/admin'
           WHEN s.enr_kelas_asli > 0 THEN '2. JANGAN HAPUS — juga terdaftar di kelas asli'
           WHEN s.payments_di_luar_kelas_uji > 0 THEN '2. JANGAN HAPUS — punya pembayaran di luar kelas uji'
           ELSE '1. KANDIDAT HAPUS — hanya di kelas uji'
       END AS klasifikasi,
       s.id AS siswa_id,
       s.nama,
       s.email,
       s.enr_kelas_uji,
       s.enr_kelas_asli,
       s.payments_di_luar_kelas_uji,
       s.roles,
       concat_ws('; ',
           CASE WHEN s.tryout_attempts > 0 THEN 'tryout_attempts=' || s.tryout_attempts END,
           CASE WHEN s.assessments > 0 THEN 'assessments=' || s.assessments END,
           CASE WHEN s.referrals > 0 THEN 'referrals=' || s.referrals END,
           CASE WHEN s.reward_redemptions > 0 THEN 'reward_redemptions=' || s.reward_redemptions END) AS aktivitas_lain,
       (SELECT a.alasan_qa FROM akun_qa a WHERE a.id = s.id) AS terdeteksi_akun_qa,
       s.created_at::date AS akun_dibuat
FROM siswa_uji s
ORDER BY klasifikasi, s.email;


-- ============================================================================
-- >>> E1 — E. PEMBAYARAN terkait kelas uji (payments.item_type='kelas' dan item_id = kelas uji)

--     payments TIDAK punya kolom provider/ID Mayar khusus: ID Mayar = payments.gateway_reference (data.id payment request), order_id = ID dari kita, metode = metode bayar. Transaksi sandbox tidak terbedakan dari yang asli lewat API (CLAUDE.md) — status berhasil harus dicek di dashboard Mayar.

-- ============================================================================
WITH kelas_uji AS (
    SELECT x.*
    FROM (
        SELECT k.id, k.nama, k.harga, k.diskon_persen, k.tampil_di_katalog,
               round(k.harga * (100 - k.diskon_persen) / 100.0) AS harga_efektif,
               CASE
                   WHEN k.nama ILIKE '%[UJI]%' THEN 'TINGGI'
                   WHEN k.harga * (100 - k.diskon_persen) / 100.0 <= 10000 THEN 'SEDANG (cek: mungkin kelas gratis sungguhan)'
                   ELSE 'RENDAH (hanya pola nama — cek manual)'
               END AS keyakinan,
               concat_ws('; ',
                   CASE WHEN k.nama ILIKE '%[UJI]%' THEN 'nama memuat [UJI]' END,
                   CASE WHEN k.harga <= 10000 THEN 'harga <= Rp10.000'
                        WHEN k.harga * (100 - k.diskon_persen) / 100.0 <= 10000 THEN 'harga setelah diskon <= Rp10.000' END,
                   CASE WHEN k.nama ~* '\m(uji|test|testing|dummy|sandbox|percobaan|qa)\M' AND k.nama NOT ILIKE '%[UJI]%' THEN 'nama berpola uji' END
               ) AS alasan_uji
        FROM kelas k
    ) x
    WHERE x.alasan_uji <> ''
),
pay_uji AS (
    SELECT p.*
    FROM payments p
    WHERE p.item_type = 'kelas' AND p.item_id IN (SELECT id FROM kelas_uji)
)
SELECT p.id AS payment_id,
       p.order_id,
       ku.nama AS kelas,
       p.user_id,
       u.email AS siswa_email,
       p.jumlah_sebelum_diskon,
       p.jumlah,
       p.status,
       p.metode,
       p.gateway_reference AS id_mayar_gateway_reference,
       p.kode_promo_id,
       p.tanggal_lunas,
       p.dibuat_pada,
       EXISTS (SELECT 1 FROM enrollments e WHERE e.user_id = p.user_id AND e.kelas_id = p.item_id) AS punya_enrollment,
       CASE
           WHEN p.status = 'berhasil' AND p.jumlah > 0 THEN 'LUNAS Rp' || p.jumlah::bigint::text || ' — kemungkinan UANG ASLI: cek dashboard Mayar'
           WHEN p.status = 'berhasil' THEN 'berhasil tetapi Rp0'
           WHEN p.status = 'refunded' THEN 'refunded'
           ELSE 'belum lunas (' || p.status::text || ')'
       END AS tanda
FROM pay_uji p
JOIN kelas_uji ku ON ku.id = p.item_id
LEFT JOIN users u ON u.id = p.user_id
ORDER BY (p.status = 'berhasil') DESC, p.dibuat_pada DESC;


-- ============================================================================
-- >>> F1 — F. AKUN QA / MENTOR UJI: role, status, kelas & subtes yang dipegang

--     Terdeteksi dari: email plus-address (+), domain uji, mengandung 'eduspark', email/nama berpola uji. Daftar domain/pola ada di CTE akun_qa — ubah bila perlu. Email Eduspark sengaja TIDAK ditulis penuh di berkas ini (alasan: lihat README).

-- ============================================================================
WITH kelas_uji AS (
    SELECT x.*
    FROM (
        SELECT k.id, k.nama, k.harga, k.diskon_persen, k.tampil_di_katalog,
               round(k.harga * (100 - k.diskon_persen) / 100.0) AS harga_efektif,
               CASE
                   WHEN k.nama ILIKE '%[UJI]%' THEN 'TINGGI'
                   WHEN k.harga * (100 - k.diskon_persen) / 100.0 <= 10000 THEN 'SEDANG (cek: mungkin kelas gratis sungguhan)'
                   ELSE 'RENDAH (hanya pola nama — cek manual)'
               END AS keyakinan,
               concat_ws('; ',
                   CASE WHEN k.nama ILIKE '%[UJI]%' THEN 'nama memuat [UJI]' END,
                   CASE WHEN k.harga <= 10000 THEN 'harga <= Rp10.000'
                        WHEN k.harga * (100 - k.diskon_persen) / 100.0 <= 10000 THEN 'harga setelah diskon <= Rp10.000' END,
                   CASE WHEN k.nama ~* '\m(uji|test|testing|dummy|sandbox|percobaan|qa)\M' AND k.nama NOT ILIKE '%[UJI]%' THEN 'nama berpola uji' END
               ) AS alasan_uji
        FROM kelas k
    ) x
    WHERE x.alasan_uji <> ''
),
akun_qa AS (
    SELECT x.*
    FROM (
        SELECT u.id, u.nama, u.email, u.created_at,
               concat_ws('; ',
                   CASE WHEN u.email LIKE '%+%@%' THEN 'email plus-address (+)' END,
                   CASE WHEN lower(split_part(u.email, '@', 2)) IN
                        ('example.com', 'example.org', 'example.net', 'test.com', 'test.id',
                         'mailinator.com', 'yopmail.com', 'tempmail.com', 'guerrillamail.com', 'sharklasers.com')
                        THEN 'domain uji' END,
                   CASE WHEN u.email ILIKE '%eduspark%' THEN 'mentor Eduspark (disebut Rio)' END,
                   CASE WHEN u.email ~* '(^|[._+-])(qa|test|testing|tes|uji|dummy|demo)([._+@0-9-]|$)' THEN 'email berpola uji' END,
                   CASE WHEN u.nama ILIKE '%[UJI]%' OR u.nama ~* '\m(uji|test|testing|dummy|sandbox|percobaan|qa)\M' THEN 'nama berpola uji' END
               ) AS alasan_qa
        FROM users u
    ) x
    WHERE x.alasan_qa <> ''
)
SELECT a.id AS user_id,
       a.nama,
       a.email,
       a.alasan_qa,
       (SELECT string_agg(ur.role_type::text || ':' || ur.status::text, ', ' ORDER BY ur.role_type::text)
          FROM user_roles ur WHERE ur.user_id = a.id) AS role_dan_status,
       (SELECT mp.asal_ptn FROM mentor_profiles mp WHERE mp.user_id = a.id) AS mentor_asal_ptn,
       (SELECT string_agg(s.nama, ', ' ORDER BY s.nama)
          FROM mentor_profiles mp
          JOIN mentor_subtes_diampu msd ON msd.mentor_profile_id = mp.id
          JOIN subtes s ON s.id = msd.subtes_id
         WHERE mp.user_id = a.id) AS subtes_diampu,
       (SELECT string_agg(DISTINCT x.label, ' | ' ORDER BY x.label)
      FROM (
          SELECT k.nama || ' [kelas_mentor]' || CASE WHEN k.id IN (SELECT id FROM kelas_uji) THEN ' (KELAS UJI)' ELSE '' END AS label
            FROM kelas_mentor km JOIN kelas k ON k.id = km.kelas_id WHERE km.mentor_id = a.id
          UNION ALL
          SELECT k.nama || ' [kelas.mentor_id]' || CASE WHEN k.id IN (SELECT id FROM kelas_uji) THEN ' (KELAS UJI)' ELSE '' END
            FROM kelas k WHERE k.mentor_id = a.id
          UNION ALL
          SELECT k.nama || ' / ' || s.nama || ' [subtes]' || CASE WHEN k.id IN (SELECT id FROM kelas_uji) THEN ' (KELAS UJI)' ELSE '' END
            FROM kelas_subtes_mentor m JOIN kelas k ON k.id = m.kelas_id JOIN subtes s ON s.id = m.subtes_id WHERE m.mentor_id = a.id
      ) x) AS kelas_dipegang,
       (SELECT count(*) FROM enrollments e WHERE e.user_id = a.id) AS enrollment_sebagai_siswa,
       (SELECT count(*) FROM payments p WHERE p.user_id = a.id) AS payments,
       a.created_at::date AS akun_dibuat
FROM akun_qa a
ORDER BY a.alasan_qa, a.email;


-- ============================================================================
-- >>> G1 — G. KELAS ASLI YANG TERCEMAR akun QA/uji (kandidat DILEPAS, bukan dihapus)

--     Mencakup: kelas_mentor, kelas.mentor_id (lama), kelas_subtes_mentor, enrollment akun QA sebagai siswa, mentor_offline_id, enrollment_subtes.mentor_id (penerima siswa), presensi (sesi_kelas.mentor_id), dan mentor_subtes_diampu. Kelas uji dikecualikan (itu urusan A-E).

-- ============================================================================
WITH kelas_uji AS (
    SELECT x.*
    FROM (
        SELECT k.id, k.nama, k.harga, k.diskon_persen, k.tampil_di_katalog,
               round(k.harga * (100 - k.diskon_persen) / 100.0) AS harga_efektif,
               CASE
                   WHEN k.nama ILIKE '%[UJI]%' THEN 'TINGGI'
                   WHEN k.harga * (100 - k.diskon_persen) / 100.0 <= 10000 THEN 'SEDANG (cek: mungkin kelas gratis sungguhan)'
                   ELSE 'RENDAH (hanya pola nama — cek manual)'
               END AS keyakinan,
               concat_ws('; ',
                   CASE WHEN k.nama ILIKE '%[UJI]%' THEN 'nama memuat [UJI]' END,
                   CASE WHEN k.harga <= 10000 THEN 'harga <= Rp10.000'
                        WHEN k.harga * (100 - k.diskon_persen) / 100.0 <= 10000 THEN 'harga setelah diskon <= Rp10.000' END,
                   CASE WHEN k.nama ~* '\m(uji|test|testing|dummy|sandbox|percobaan|qa)\M' AND k.nama NOT ILIKE '%[UJI]%' THEN 'nama berpola uji' END
               ) AS alasan_uji
        FROM kelas k
    ) x
    WHERE x.alasan_uji <> ''
),
akun_qa AS (
    SELECT x.*
    FROM (
        SELECT u.id, u.nama, u.email, u.created_at,
               concat_ws('; ',
                   CASE WHEN u.email LIKE '%+%@%' THEN 'email plus-address (+)' END,
                   CASE WHEN lower(split_part(u.email, '@', 2)) IN
                        ('example.com', 'example.org', 'example.net', 'test.com', 'test.id',
                         'mailinator.com', 'yopmail.com', 'tempmail.com', 'guerrillamail.com', 'sharklasers.com')
                        THEN 'domain uji' END,
                   CASE WHEN u.email ILIKE '%eduspark%' THEN 'mentor Eduspark (disebut Rio)' END,
                   CASE WHEN u.email ~* '(^|[._+-])(qa|test|testing|tes|uji|dummy|demo)([._+@0-9-]|$)' THEN 'email berpola uji' END,
                   CASE WHEN u.nama ILIKE '%[UJI]%' OR u.nama ~* '\m(uji|test|testing|dummy|sandbox|percobaan|qa)\M' THEN 'nama berpola uji' END
               ) AS alasan_qa
        FROM users u
    ) x
    WHERE x.alasan_qa <> ''
),
relasi_qa_kelas_asli AS (
    -- Keterlibatan akun QA/uji di kelas yang BUKAN kelas uji. Kandidat DILEPAS (bukan dihapus).
    SELECT 'kelas_mentor'::text AS jenis, k.id AS kelas_id, k.nama::text AS kelas_nama, a.id AS akun_id, a.email::text AS email,
           NULL::text AS subtes, NULL::text AS detail,
           'lepas dari kelas_mentor'::text AS saran
    FROM kelas_mentor km
    JOIN akun_qa a ON a.id = km.mentor_id
    JOIN kelas k ON k.id = km.kelas_id
    WHERE km.kelas_id NOT IN (SELECT id FROM kelas_uji)
    UNION ALL
    SELECT 'kelas.mentor_id (DEPRECATED)', k.id, k.nama::text, a.id, a.email::text, NULL, NULL,
           'kosongkan kelas.mentor_id (kolom lama) bila bukan mentor sungguhan'
    FROM kelas k
    JOIN akun_qa a ON a.id = k.mentor_id
    WHERE k.id NOT IN (SELECT id FROM kelas_uji)
    UNION ALL
    SELECT 'kelas_subtes_mentor', k.id, k.nama::text, a.id, a.email::text, s.nama::text, NULL,
           'lepas pasangan Subtes-Mentor (memengaruhi hitungan pemegang subtes & "siapa cepat dia dapat")'
    FROM kelas_subtes_mentor ksm
    JOIN akun_qa a ON a.id = ksm.mentor_id
    JOIN kelas k ON k.id = ksm.kelas_id
    JOIN subtes s ON s.id = ksm.subtes_id
    WHERE ksm.kelas_id NOT IN (SELECT id FROM kelas_uji)
    UNION ALL
    SELECT 'enrollment akun QA sebagai SISWA', k.id, k.nama::text, a.id, a.email::text, NULL,
           'enrollment ' || e.id::text || '; status=' || e.status_pembayaran::text || '; sumber=' || e.sumber::text
               || '; daftar=' || e.tanggal_daftar::date::text,
           'enrollment uji di kelas asli: tinjau lalu hapus/batalkan (ikut hitungan kuota & honor)'
    FROM enrollments e
    JOIN akun_qa a ON a.id = e.user_id
    JOIN kelas k ON k.id = e.kelas_id
    WHERE e.kelas_id NOT IN (SELECT id FROM kelas_uji)
    UNION ALL
    SELECT 'enrollments.mentor_offline_id', k.id, k.nama::text, a.id, a.email::text, NULL,
           'enrollment ' || e.id::text || '; status=' || e.status_pembayaran::text,
           'ganti mentor tatap muka'
    FROM enrollments e
    JOIN akun_qa a ON a.id = e.mentor_offline_id
    JOIN kelas k ON k.id = e.kelas_id
    WHERE e.kelas_id NOT IN (SELECT id FROM kelas_uji)
    UNION ALL
    SELECT 'enrollment_subtes.mentor_id (PENERIMA siswa)', k.id, k.nama::text, a.id, a.email::text, s.nama::text,
           'enrollment ' || e.id::text || '; diterima_pada=' || coalesce(es.diterima_pada::text, '-'),
           'penerima = akun QA: siswa dianggap milik akun uji (memengaruhi presensi/honor) — tinjau'
    FROM enrollment_subtes es
    JOIN akun_qa a ON a.id = es.mentor_id
    JOIN enrollments e ON e.id = es.enrollment_id
    JOIN kelas k ON k.id = e.kelas_id
    JOIN subtes s ON s.id = es.subtes_id
    WHERE e.kelas_id NOT IN (SELECT id FROM kelas_uji)
    UNION ALL
    SELECT 'sesi_kelas.mentor_id (presensi ditandai akun QA)', k.id, k.nama::text, a.id, a.email::text, NULL,
           count(*)::text || ' sesi ditandai; ' || count(*) FILTER (WHERE sk.dibayar_pada IS NOT NULL)::text || ' sudah ditandai honor dibayar',
           'presensi uji di kelas asli: memengaruhi laporan Honor — tinjau'
    FROM sesi_kelas sk
    JOIN akun_qa a ON a.id = sk.mentor_id
    JOIN enrollments e ON e.id = sk.enrollment_id
    JOIN kelas k ON k.id = e.kelas_id
    WHERE e.kelas_id NOT IN (SELECT id FROM kelas_uji)
    GROUP BY k.id, k.nama, a.id, a.email
    UNION ALL
    SELECT 'mentor_subtes_diampu (global, bukan per kelas)', NULL::uuid, NULL::text, a.id, a.email::text, s.nama::text, NULL,
           'hapus subtes diampu bila akun ini bukan mentor sungguhan'
    FROM mentor_subtes_diampu msd
    JOIN mentor_profiles mp ON mp.id = msd.mentor_profile_id
    JOIN akun_qa a ON a.id = mp.user_id
    JOIN subtes s ON s.id = msd.subtes_id
    UNION ALL
    SELECT 'studio_soal_penugasan (global, bukan per kelas)', NULL::uuid, NULL::text, a.id, a.email::text, s.nama::text,
           'ditugaskan_pada=' || ssp.ditugaskan_pada::date::text,
           'cabut penugasan Studio Soal bila akun ini bukan mentor sungguhan'
    FROM studio_soal_penugasan ssp
    JOIN akun_qa a ON a.id = ssp.mentor_id
    JOIN subtes s ON s.id = ssp.subtes_id
)
SELECT r.kelas_nama AS kelas,
       r.jenis AS jenis_relasi,
       r.email AS akun_qa_email,
       r.subtes,
       r.detail,
       r.saran,
       r.kelas_id,
       r.akun_id
FROM relasi_qa_kelas_asli r
ORDER BY r.kelas_nama NULLS LAST, r.jenis, r.email;


-- ============================================================================
-- >>> H1 — H. EMAIL MENTOR ASLI: semua mentor aktif + kelas yang diampu

--     Hanya membaca. JANGAN mengirim email apa pun dari hasil ini. Kolom terdeteksi_akun_qa terisi bila email/nama berpola uji (cek apakah akun itu seharusnya tampil di sini).

-- ============================================================================
WITH kelas_uji AS (
    SELECT x.*
    FROM (
        SELECT k.id, k.nama, k.harga, k.diskon_persen, k.tampil_di_katalog,
               round(k.harga * (100 - k.diskon_persen) / 100.0) AS harga_efektif,
               CASE
                   WHEN k.nama ILIKE '%[UJI]%' THEN 'TINGGI'
                   WHEN k.harga * (100 - k.diskon_persen) / 100.0 <= 10000 THEN 'SEDANG (cek: mungkin kelas gratis sungguhan)'
                   ELSE 'RENDAH (hanya pola nama — cek manual)'
               END AS keyakinan,
               concat_ws('; ',
                   CASE WHEN k.nama ILIKE '%[UJI]%' THEN 'nama memuat [UJI]' END,
                   CASE WHEN k.harga <= 10000 THEN 'harga <= Rp10.000'
                        WHEN k.harga * (100 - k.diskon_persen) / 100.0 <= 10000 THEN 'harga setelah diskon <= Rp10.000' END,
                   CASE WHEN k.nama ~* '\m(uji|test|testing|dummy|sandbox|percobaan|qa)\M' AND k.nama NOT ILIKE '%[UJI]%' THEN 'nama berpola uji' END
               ) AS alasan_uji
        FROM kelas k
    ) x
    WHERE x.alasan_uji <> ''
),
akun_qa AS (
    SELECT x.*
    FROM (
        SELECT u.id, u.nama, u.email, u.created_at,
               concat_ws('; ',
                   CASE WHEN u.email LIKE '%+%@%' THEN 'email plus-address (+)' END,
                   CASE WHEN lower(split_part(u.email, '@', 2)) IN
                        ('example.com', 'example.org', 'example.net', 'test.com', 'test.id',
                         'mailinator.com', 'yopmail.com', 'tempmail.com', 'guerrillamail.com', 'sharklasers.com')
                        THEN 'domain uji' END,
                   CASE WHEN u.email ILIKE '%eduspark%' THEN 'mentor Eduspark (disebut Rio)' END,
                   CASE WHEN u.email ~* '(^|[._+-])(qa|test|testing|tes|uji|dummy|demo)([._+@0-9-]|$)' THEN 'email berpola uji' END,
                   CASE WHEN u.nama ILIKE '%[UJI]%' OR u.nama ~* '\m(uji|test|testing|dummy|sandbox|percobaan|qa)\M' THEN 'nama berpola uji' END
               ) AS alasan_qa
        FROM users u
    ) x
    WHERE x.alasan_qa <> ''
)
SELECT u.id AS user_id,
       u.nama,
       u.email,
       ur.status AS status_role,
       (SELECT a.alasan_qa FROM akun_qa a WHERE a.id = u.id) AS terdeteksi_akun_qa,
       (SELECT mp.asal_ptn || ' / ' || mp.jurusan || ' (smt ' || mp.semester::text || ')'
          FROM mentor_profiles mp WHERE mp.user_id = u.id) AS profil_mentor,
       (SELECT string_agg(s.nama, ', ' ORDER BY s.nama)
          FROM mentor_profiles mp
          JOIN mentor_subtes_diampu msd ON msd.mentor_profile_id = mp.id
          JOIN subtes s ON s.id = msd.subtes_id
         WHERE mp.user_id = u.id) AS subtes_diampu,
       (SELECT string_agg(DISTINCT x.label, ' | ' ORDER BY x.label)
      FROM (
          SELECT k.nama || ' [kelas_mentor]' || CASE WHEN k.id IN (SELECT id FROM kelas_uji) THEN ' (KELAS UJI)' ELSE '' END AS label
            FROM kelas_mentor km JOIN kelas k ON k.id = km.kelas_id WHERE km.mentor_id = u.id
          UNION ALL
          SELECT k.nama || ' [kelas.mentor_id]' || CASE WHEN k.id IN (SELECT id FROM kelas_uji) THEN ' (KELAS UJI)' ELSE '' END
            FROM kelas k WHERE k.mentor_id = u.id
          UNION ALL
          SELECT k.nama || ' / ' || s.nama || ' [subtes]' || CASE WHEN k.id IN (SELECT id FROM kelas_uji) THEN ' (KELAS UJI)' ELSE '' END
            FROM kelas_subtes_mentor m JOIN kelas k ON k.id = m.kelas_id JOIN subtes s ON s.id = m.subtes_id WHERE m.mentor_id = u.id
      ) x) AS kelas_diampu,
       u.created_at::date AS akun_dibuat
FROM users u
JOIN user_roles ur ON ur.user_id = u.id AND ur.role_type = 'mentor' AND ur.status = 'active'
ORDER BY u.email;


-- ============================================================================
-- >>> I1 — I. DATA TURUNAN uji: jumlah baris per tabel yang merujuk kelas/enrollment/payment uji

--     Satu baris per tabel. Baris berawalan 'PER-AKUN' dihitung atas semua akun yang punya enrollment di kelas uji (ikut hilang hanya bila AKUN-nya dihapus). Cakupan: lihat README (tabel yang tidak punya FK ke kelas/enrollment hanya terdeteksi lewat tautan/kunci teks).

-- ============================================================================
WITH kelas_uji AS (
    SELECT x.*
    FROM (
        SELECT k.id, k.nama, k.harga, k.diskon_persen, k.tampil_di_katalog,
               round(k.harga * (100 - k.diskon_persen) / 100.0) AS harga_efektif,
               CASE
                   WHEN k.nama ILIKE '%[UJI]%' THEN 'TINGGI'
                   WHEN k.harga * (100 - k.diskon_persen) / 100.0 <= 10000 THEN 'SEDANG (cek: mungkin kelas gratis sungguhan)'
                   ELSE 'RENDAH (hanya pola nama — cek manual)'
               END AS keyakinan,
               concat_ws('; ',
                   CASE WHEN k.nama ILIKE '%[UJI]%' THEN 'nama memuat [UJI]' END,
                   CASE WHEN k.harga <= 10000 THEN 'harga <= Rp10.000'
                        WHEN k.harga * (100 - k.diskon_persen) / 100.0 <= 10000 THEN 'harga setelah diskon <= Rp10.000' END,
                   CASE WHEN k.nama ~* '\m(uji|test|testing|dummy|sandbox|percobaan|qa)\M' AND k.nama NOT ILIKE '%[UJI]%' THEN 'nama berpola uji' END
               ) AS alasan_uji
        FROM kelas k
    ) x
    WHERE x.alasan_uji <> ''
),
enr_uji AS (
    SELECT e.id, e.user_id, e.kelas_id, e.status_pembayaran, e.sumber, e.tanggal_daftar, e.tanggal_keluar,
           e.nominal_dibayar, e.link_meet, e.mentor_offline_id
    FROM enrollments e
    WHERE e.kelas_id IN (SELECT id FROM kelas_uji)
),
pay_uji AS (
    SELECT p.*
    FROM payments p
    WHERE p.item_type = 'kelas' AND p.item_id IN (SELECT id FROM kelas_uji)
),
turunan_uji AS (
    -- Jumlah baris per tabel yang merujuk kelas uji / enrollment uji / payment uji.
    SELECT 1 AS urut, 'kelas (uji)'::text AS tabel, (SELECT count(*) FROM kelas_uji) AS jumlah,
           'induk — dihapus terakhir'::text AS catatan
    UNION ALL SELECT 2, 'enrollments (di kelas uji)', (SELECT count(*) FROM enr_uji), 'FK kelas_id TANPA cascade: enrollment harus dihapus dulu'
    UNION ALL SELECT 3, 'enrollment_subtes', (SELECT count(*) FROM enrollment_subtes WHERE enrollment_id IN (SELECT id FROM enr_uji)), 'CASCADE dari enrollments'
    UNION ALL SELECT 4, '  - di antaranya sudah punya penerima (mentor_id terisi)', (SELECT count(*) FROM enrollment_subtes WHERE enrollment_id IN (SELECT id FROM enr_uji) AND mentor_id IS NOT NULL), 'klaim "terima siswa"'
    UNION ALL SELECT 5, 'sesi_kelas (presensi)', (SELECT count(*) FROM sesi_kelas WHERE enrollment_id IN (SELECT id FROM enr_uji)), 'CASCADE dari enrollments'
    UNION ALL SELECT 6, '  - sudah ditandai mentor', (SELECT count(*) FROM sesi_kelas WHERE enrollment_id IN (SELECT id FROM enr_uji) AND dikonfirmasi_mentor), 'masuk hitungan Honor'
    UNION ALL SELECT 7, '  - honor sudah ditandai DIBAYAR (dibayar_pada terisi)', (SELECT count(*) FROM sesi_kelas WHERE enrollment_id IN (SELECT id FROM enr_uji) AND dibayar_pada IS NOT NULL), 'PERHATIAN: bila > 0, cek laporan honor sebelum menghapus'
    UNION ALL SELECT 8, 'sesi_review_log (keputusan Admin atas sesi uji)', (SELECT count(*) FROM sesi_review_log WHERE sesi_id IN (SELECT id FROM sesi_kelas WHERE enrollment_id IN (SELECT id FROM enr_uji))), 'sesi_id jadi NULL bila sesi dihapus (log audit tetap)'
    UNION ALL SELECT 9, 'enrollment_manual_log (kelas/enrollment uji)', (SELECT count(*) FROM enrollment_manual_log WHERE kelas_id IN (SELECT id FROM kelas_uji) OR enrollment_id IN (SELECT id FROM enr_uji)), 'log audit — sengaja dipertahankan (FK SET NULL)'
    UNION ALL SELECT 10, 'payments (item_id = kelas uji)', (SELECT count(*) FROM pay_uji), 'payments.user_id TANPA cascade'
    UNION ALL SELECT 11, '  - berstatus berhasil (lunas)', (SELECT count(*) FROM pay_uji WHERE status = 'berhasil'), 'cek Mayar: bisa uang asli'
    UNION ALL SELECT 12, '  - memakai kode promo (kode_promo_id terisi)', (SELECT count(*) FROM pay_uji WHERE kode_promo_id IS NOT NULL AND status = 'berhasil'), 'kode_promo.jumlah_terpakai perlu dikoreksi'
    UNION ALL SELECT 13, 'payment_subtes_pilihan', (SELECT count(*) FROM payment_subtes_pilihan WHERE payment_id IN (SELECT id FROM pay_uji)), 'CASCADE dari payments'
    UNION ALL SELECT 14, 'kelas_mentor (kelas uji)', (SELECT count(*) FROM kelas_mentor WHERE kelas_id IN (SELECT id FROM kelas_uji)), 'CASCADE dari kelas'
    UNION ALL SELECT 15, 'kelas_subtes (kelas uji)', (SELECT count(*) FROM kelas_subtes WHERE kelas_id IN (SELECT id FROM kelas_uji)), 'CASCADE dari kelas'
    UNION ALL SELECT 16, 'kelas_subtes_mentor (kelas uji)', (SELECT count(*) FROM kelas_subtes_mentor WHERE kelas_id IN (SELECT id FROM kelas_uji)), 'CASCADE dari kelas'
    UNION ALL SELECT 17, 'kode_promo_kelas (kelas uji)', (SELECT count(*) FROM kode_promo_kelas WHERE kelas_id IN (SELECT id FROM kelas_uji)), 'CASCADE dari kelas'
    UNION ALL SELECT 18, 'materi (kelas uji)', (SELECT count(*) FROM materi WHERE kelas_id IN (SELECT id FROM kelas_uji)), 'materi.kelas_id TANPA cascade'
    UNION ALL SELECT 19, 'materi_progress (atas materi kelas uji)', (SELECT count(*) FROM materi_progress WHERE materi_id IN (SELECT id FROM materi WHERE kelas_id IN (SELECT id FROM kelas_uji))), 'CASCADE dari materi'
    UNION ALL SELECT 20, 'soal_ai (kelas_id = kelas uji)', (SELECT count(*) FROM soal_ai WHERE kelas_id IN (SELECT id FROM kelas_uji)), 'soal_ai.kelas_id TANPA cascade'
    UNION ALL SELECT 21, 'link Meet per siswa terisi (enrollments.link_meet)', (SELECT count(*) FROM enr_uji WHERE link_meet IS NOT NULL), 'ikut hilang bersama enrollment'
    UNION ALL SELECT 22, 'link Meet kelas terisi (kelas.link_meet, kelas uji)', (SELECT count(*) FROM kelas WHERE id IN (SELECT id FROM kelas_uji) AND link_meet IS NOT NULL), 'ikut hilang bersama kelas'
    UNION ALL SELECT 23, 'notifikasi yang tautannya memuat id kelas uji', (SELECT count(*) FROM notifikasi n WHERE EXISTS (SELECT 1 FROM kelas_uji ku WHERE n.link_tujuan LIKE '%' || ku.id::text || '%')), 'notifikasi tidak punya FK ke kelas: hanya terdeteksi lewat link_tujuan; notifikasi "siswa baru" milik mentor bisa tidak terdeteksi'
    UNION ALL SELECT 24, 'notifikasi_wa_log (kunci memuat id enrollment/payment uji)', (SELECT count(*) FROM notifikasi_wa_log w WHERE EXISTS (SELECT 1 FROM enr_uji e WHERE w.kunci_kejadian LIKE '%' || e.id::text || '%') OR EXISTS (SELECT 1 FROM pay_uji p WHERE w.kunci_kejadian LIKE '%' || p.id::text || '%')), 'log kiriman WA mentor "siswa baru"'
    UNION ALL SELECT 25, 'referrals dengan referee = siswa di kelas uji', (SELECT count(*) FROM referrals WHERE referee_id IN (SELECT user_id FROM enr_uji)), 'referrals TANPA cascade; poin perlu dibalik (lihat db/cleanup_enrollment_uji_TEMPLATE.sql)'
    UNION ALL SELECT 26, '  - referral_rewards dari referral di atas', (SELECT count(*) FROM referral_rewards WHERE referral_id IN (SELECT id FROM referrals WHERE referee_id IN (SELECT user_id FROM enr_uji))), 'poin ikut tercatat di gamifikasi_profiles'
    UNION ALL SELECT 27, 'PER-AKUN siswa di kelas uji: tryout_attempts', (SELECT count(*) FROM tryout_attempts WHERE user_id IN (SELECT user_id FROM enr_uji)), 'CASCADE dari users (hanya bila akun dihapus)'
    UNION ALL SELECT 28, 'PER-AKUN siswa di kelas uji: assessments', (SELECT count(*) FROM assessments WHERE user_id IN (SELECT user_id FROM enr_uji)), 'CASCADE dari users'
    UNION ALL SELECT 29, 'PER-AKUN siswa di kelas uji: notifikasi (semua)', (SELECT count(*) FROM notifikasi WHERE user_id IN (SELECT user_id FROM enr_uji)), 'CASCADE dari users'
    UNION ALL SELECT 30, 'PER-AKUN siswa di kelas uji: reward_redemptions', (SELECT count(*) FROM reward_redemptions WHERE user_id IN (SELECT user_id FROM enr_uji)), 'FK TANPA cascade: memblokir penghapusan akun'
    UNION ALL SELECT 31, 'PER-AKUN siswa di kelas uji: leads (user_id)', (SELECT count(*) FROM leads WHERE user_id IN (SELECT user_id FROM enr_uji)), 'FK SET NULL'
)
SELECT t.tabel, t.jumlah, t.catatan
FROM turunan_uji t
ORDER BY t.urut;


-- ============================================================================
-- >>> J1 — J. LEADS / ASESMEN uji (nama berpola uji, nomor WA berpola uji, atau terkait akun QA / siswa kelas uji)

--     Nomor WA ditampilkan utuh karena hanya Rio yang melihatnya; pola nomor uji: digit sama >= 6 kali berurutan atau awalan 62812345.

-- ============================================================================
WITH kelas_uji AS (
    SELECT x.*
    FROM (
        SELECT k.id, k.nama, k.harga, k.diskon_persen, k.tampil_di_katalog,
               round(k.harga * (100 - k.diskon_persen) / 100.0) AS harga_efektif,
               CASE
                   WHEN k.nama ILIKE '%[UJI]%' THEN 'TINGGI'
                   WHEN k.harga * (100 - k.diskon_persen) / 100.0 <= 10000 THEN 'SEDANG (cek: mungkin kelas gratis sungguhan)'
                   ELSE 'RENDAH (hanya pola nama — cek manual)'
               END AS keyakinan,
               concat_ws('; ',
                   CASE WHEN k.nama ILIKE '%[UJI]%' THEN 'nama memuat [UJI]' END,
                   CASE WHEN k.harga <= 10000 THEN 'harga <= Rp10.000'
                        WHEN k.harga * (100 - k.diskon_persen) / 100.0 <= 10000 THEN 'harga setelah diskon <= Rp10.000' END,
                   CASE WHEN k.nama ~* '\m(uji|test|testing|dummy|sandbox|percobaan|qa)\M' AND k.nama NOT ILIKE '%[UJI]%' THEN 'nama berpola uji' END
               ) AS alasan_uji
        FROM kelas k
    ) x
    WHERE x.alasan_uji <> ''
),
akun_qa AS (
    SELECT x.*
    FROM (
        SELECT u.id, u.nama, u.email, u.created_at,
               concat_ws('; ',
                   CASE WHEN u.email LIKE '%+%@%' THEN 'email plus-address (+)' END,
                   CASE WHEN lower(split_part(u.email, '@', 2)) IN
                        ('example.com', 'example.org', 'example.net', 'test.com', 'test.id',
                         'mailinator.com', 'yopmail.com', 'tempmail.com', 'guerrillamail.com', 'sharklasers.com')
                        THEN 'domain uji' END,
                   CASE WHEN u.email ILIKE '%eduspark%' THEN 'mentor Eduspark (disebut Rio)' END,
                   CASE WHEN u.email ~* '(^|[._+-])(qa|test|testing|tes|uji|dummy|demo)([._+@0-9-]|$)' THEN 'email berpola uji' END,
                   CASE WHEN u.nama ILIKE '%[UJI]%' OR u.nama ~* '\m(uji|test|testing|dummy|sandbox|percobaan|qa)\M' THEN 'nama berpola uji' END
               ) AS alasan_qa
        FROM users u
    ) x
    WHERE x.alasan_qa <> ''
),
enr_uji AS (
    SELECT e.id, e.user_id, e.kelas_id, e.status_pembayaran, e.sumber, e.tanggal_daftar, e.tanggal_keluar,
           e.nominal_dibayar, e.link_meet, e.mentor_offline_id
    FROM enrollments e
    WHERE e.kelas_id IN (SELECT id FROM kelas_uji)
),
jejak_lead AS (
    SELECT 'lead'::text AS jenis, l.id::text AS id, coalesce(l.nama, '(tanpa nama)')::text AS label,
           concat_ws('; ', 'no_wa=' || l.no_wa, 'sumber=' || l.sumber, 'status=' || l.status, 'dibuat=' || l.created_at::date::text,
               CASE WHEN l.nama ILIKE '%[UJI]%' OR l.nama ~* '\m(uji|test|testing|dummy|sandbox|percobaan|qa)\M' THEN 'nama berpola uji' END,
               CASE WHEN l.no_wa ~ '(\d)\1{5,}' OR l.no_wa LIKE '62812345%' THEN 'nomor WA berpola uji' END,
               CASE WHEN l.user_id IN (SELECT id FROM akun_qa) THEN 'terkait akun QA' END,
               CASE WHEN l.user_id IN (SELECT user_id FROM enr_uji) THEN 'terkait siswa kelas uji' END) AS detail
    FROM leads l
    WHERE l.nama ILIKE '%[UJI]%' OR l.nama ~* '\m(uji|test|testing|dummy|sandbox|percobaan|qa)\M'
       OR l.no_wa ~ '(\d)\1{5,}' OR l.no_wa LIKE '62812345%'
       OR l.user_id IN (SELECT id FROM akun_qa)
       OR l.user_id IN (SELECT user_id FROM enr_uji)
    UNION ALL
    SELECT 'assessment', a.id::text, coalesce(u.email, '(anonim)')::text,
           concat_ws('; ', 'jalur=' || a.jalur::text, 'dibuat=' || a.created_at::date::text, 'utm_campaign=' || coalesce(a.utm_campaign, '-'))
    FROM assessments a
    JOIN akun_qa u ON u.id = a.user_id
)
SELECT j.jenis, j.id, j.label, j.detail
FROM jejak_lead j
ORDER BY j.jenis, j.label;

