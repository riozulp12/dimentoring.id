-- ============================================================================
-- DIMENTORING — DATABASE SCHEMA
-- Diturunkan dari PRD v3.0 Bagian 13 (Data Model)
-- Target: PostgreSQL (kompatibel Supabase / Neon / RDS Postgres)
-- Cara pakai: jalankan file ini sebagai migration awal lewat Claude Code
--             (atau `psql -f dimentoring_schema.sql`), lalu sesuaikan dengan
--             ORM pilihan CTO (Prisma/Drizzle) jika perlu generate schema file.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- untuk gen_random_uuid()

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

CREATE TYPE status_verifikasi_akun AS ENUM ('unverified', 'verified');
CREATE TYPE sub_status_student AS ENUM ('calon_mahasiswa', 'mahasiswa');
CREATE TYPE role_type AS ENUM ('student', 'mentor', 'admin');
CREATE TYPE role_status AS ENUM ('active', 'pending', 'rejected');
CREATE TYPE sumber_pengajuan_role AS ENUM ('register_publik', 'upgrade_dari_akun_existing');
CREATE TYPE verification_channel AS ENUM ('wa', 'email');
CREATE TYPE subtes_kategori AS ENUM ('tps', 'literasi', 'tka_wajib', 'tka_elektif');
CREATE TYPE jalur_seleksi AS ENUM ('snbp', 'snbt', 'mandiri');
CREATE TYPE referral_status AS ENUM ('terdaftar', 'dalam_proses', 'terkonversi', 'tidak_valid');
CREATE TYPE reward_pencairan_status AS ENUM ('tertunda', 'cair', 'ditahan');
CREATE TYPE tingkat_kelas AS ENUM ('kelas_10', 'kelas_11', 'kelas_12', 'gap_year');
CREATE TYPE status_pembayaran_enrollment AS ENUM ('menunggu', 'lunas', 'batal');
CREATE TYPE tryout_kategori AS ENUM ('tka', 'snbt', 'mandiri');
CREATE TYPE tryout_akses AS ENUM ('free', 'premium');
CREATE TYPE payment_item_type AS ENUM ('kelas', 'tryout', 'lainnya');
CREATE TYPE payment_status AS ENUM ('menunggu', 'berhasil', 'gagal', 'refunded');
CREATE TYPE konten_info_tipe AS ENUM ('beasiswa', 'internship', 'event');
CREATE TYPE konten_info_status AS ENUM ('aktif', 'ditutup');
CREATE TYPE interaksi_konten_jenis AS ENUM ('disimpan', 'tertarik');
CREATE TYPE soal_ai_kesulitan AS ENUM ('mudah', 'sedang', 'hots');
CREATE TYPE soal_ai_status AS ENUM ('draft', 'published', 'ditolak');
CREATE TYPE redemption_status AS ENUM ('diproses', 'selesai', 'gagal');

-- ============================================================================
-- REFERENSI LOKASI & SEKOLAH (BR-16: auto-fill data SNBP dari Sekolah)
-- ============================================================================

CREATE TABLE provinsi (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nama VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE kota (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nama VARCHAR(100) NOT NULL,
    provinsi_id UUID NOT NULL REFERENCES provinsi(id)
);

CREATE TABLE sekolah (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nama VARCHAR(255) NOT NULL,
    kota_id UUID NOT NULL REFERENCES kota(id),
    akreditasi VARCHAR(10),              -- 'A' / 'B' / 'C' / dst.
    kuota_snbp INT,                      -- kuota siswa yang bisa diajukan sekolah untuk SNBP
    ranking_data JSONB,                  -- data ranking historis jika tersedia
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- REFERENSI SUBTES (dipakai lintas MentorProfile, Kelas, TryOut, SoalAI)
-- ============================================================================

CREATE TABLE subtes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nama VARCHAR(100) NOT NULL,          -- mis. 'Penalaran Matematika', 'Literasi B. Inggris'
    kategori subtes_kategori NOT NULL
);

-- ============================================================================
-- USERS & ROLE (BR-2, BR-26: multi-role dalam satu akun)
-- ============================================================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nama VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    no_wa VARCHAR(20) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    status_verifikasi_akun status_verifikasi_akun NOT NULL DEFAULT 'unverified',
    sub_status sub_status_student,               -- NULL jika bukan Student
    tingkat_kelas tingkat_kelas,                  -- Kelas 10/11/12/Gap Year, diisi saat onboarding (7.0.2 Langkah 2)
    nama_sekolah VARCHAR(255),                    -- DIREVISI: text bebas, bukan FK ke tabel sekolah (terlalu banyak sekolah untuk dipopulate satu-satu)
    kota_id UUID REFERENCES kota(id),
    provinsi_id UUID REFERENCES provinsi(id),     -- WAJIB diisi untuk Student — dasar validasi BR-28 (aturan provinsi SNBP), bukan lagi lewat sekolah→kota→provinsi
    nama_panggilan VARCHAR(50),                   -- dipakai di leaderboard (privasi anak)
    consent_leaderboard_lokasi BOOLEAN NOT NULL DEFAULT false,
    opt_out_leaderboard BOOLEAN NOT NULL DEFAULT false,
    kode_referral TEXT UNIQUE,                    -- generate otomatis saat akun dibuat (FR-R1)
    utm_source VARCHAR(100),                      -- BARU: sumber traffic saat daftar (mis. 'meta_ads', 'organic', 'tiktok')
    utm_campaign VARCHAR(150),                     -- BARU: nama campaign spesifik, buat cross-reference ke iklan_campaign
    referral_click_count INT NOT NULL DEFAULT 0,  -- jumlah klik link referral (FR-R3)
    avatar_url TEXT,
    notif_email BOOLEAN NOT NULL DEFAULT true,
    notif_wa BOOLEAN NOT NULL DEFAULT true,
    permintaan_hapus_akun BOOLEAN NOT NULL DEFAULT false,
    alasan_hapus_akun TEXT,
    tanggal_permintaan_hapus TIMESTAMPTZ,
    profiling_selesai BOOLEAN NOT NULL DEFAULT false,  -- FR-1.15: gerbang wajib sebelum akses dashboard
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_provinsi ON users(provinsi_id);

CREATE TYPE notifikasi_tipe AS ENUM (
    'approval_mentor', 'materi_baru', 'konten_review', 'sistem'
);

CREATE TABLE notifikasi (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tipe notifikasi_tipe NOT NULL,
    judul VARCHAR(255) NOT NULL,
    pesan TEXT,
    link_tujuan TEXT,              -- URL relatif untuk diarahkan saat diklik
    dibaca BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifikasi_user ON notifikasi(user_id, dibaca);

-- ============================================================================
-- INTEGRASI PARTNER EKSTERNAL (BELUM FINAL — kerjasama agensoal.com
-- masih dinegosiasikan). Tabel ini SENGAJA dipisah dengan prefix jelas
-- supaya gampang di-DROP TABLE utuh kalau kesepakatan batal, tanpa
-- menyentuh tabel inti lainnya.
-- ============================================================================

CREATE TABLE sso_token_eksternal (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL DEFAULT 'agensoal',
    token TEXT NOT NULL UNIQUE,
    expired_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sso_token_eksternal_user ON sso_token_eksternal(user_id);

-- Log mentah — belum tahu bentuk pasti payload dari agensoal, jadi
-- disimpan apa adanya dulu (JSONB), parsing detail menyusul setelah
-- kontrak data final.
CREATE TABLE webhook_log_eksternal (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform VARCHAR(50) NOT NULL DEFAULT 'agensoal',
    raw_payload JSONB NOT NULL,
    diproses BOOLEAN NOT NULL DEFAULT false,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TYPE pengeluaran_kategori AS ENUM ('operasional', 'gaji_honor', 'lainnya');

-- Pengeluaran umum di luar iklan (iklan_campaign.budget sudah cover itu 
-- terpisah) — dipakai gabung buat chart "Pengeluaran" di Analytics.
CREATE TABLE pengeluaran_bisnis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kategori pengeluaran_kategori NOT NULL,
    deskripsi VARCHAR(255) NOT NULL,
    jumlah DECIMAL(12,2) NOT NULL,
    tanggal DATE NOT NULL,
    dibuat_oleh_id UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TYPE iklan_platform AS ENUM ('meta', 'google', 'tiktok', 'lainnya');

-- Data campaign iklan diinput MANUAL oleh Admin (bukan integrasi API ke
-- Meta/Google/TikTok Ads Manager — terlalu berat untuk tim kecil sekarang).
-- utm_campaign_tag dipakai buat cocokkan ke users.utm_campaign supaya bisa
-- hitung jumlah leads per campaign tanpa perlu API pihak ketiga.
CREATE TABLE iklan_campaign (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nama_campaign VARCHAR(255) NOT NULL,
    platform iklan_platform NOT NULL,
    budget DECIMAL(12,2),
    tanggal_mulai DATE,
    tanggal_selesai DATE,
    utm_campaign_tag VARCHAR(150),        -- harus SAMA PERSIS dengan yang dipasang di link iklan
    catatan TEXT,
    dibuat_oleh_id UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Undangan Admin baru (BR-3) — Admin existing generate token sekali pakai,
-- dikirim manual (WA/email) ke calon Admin. Beda dari Mentor: begitu submit,
-- akun LANGSUNG aktif tanpa approval tambahan (generate undangan = approval).
CREATE TABLE admin_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invited_by_id UUID NOT NULL REFERENCES users(id),
    label TEXT,                        -- catatan opsional, mis. "untuk Amrul"
    token TEXT NOT NULL UNIQUE,
    expired_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    used_by_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_admin_invitations_token ON admin_invitations(token);

-- Field mapel_tersulit (array Student, FR onboarding Langkah 3) dinormalisasi jadi join table
CREATE TABLE user_mapel_tersulit (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subtes_id UUID NOT NULL REFERENCES subtes(id),
    PRIMARY KEY (user_id, subtes_id)
);

-- FR-1.8/BR-26: satu user_id bisa punya >1 baris role aktif sekaligus
CREATE TABLE user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_type role_type NOT NULL,
    status role_status NOT NULL DEFAULT 'pending',
    sumber_pengajuan sumber_pengajuan_role NOT NULL DEFAULT 'register_publik',
    direview_oleh_id UUID REFERENCES users(id),  -- Admin yang approve/reject (audit trail)
    tanggal_review TIMESTAMPTZ,
    alasan_tolak TEXT,                            -- opsional, diisi kalau status='rejected'
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, role_type)   -- satu user tidak boleh punya baris role_type ganda
);

CREATE INDEX idx_user_roles_user ON user_roles(user_id);

-- FR-1.4, Flow 9.2: profil tambahan khusus Mentor
CREATE TABLE mentor_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    asal_ptn VARCHAR(255) NOT NULL,
    semester INT NOT NULL,
    jurusan VARCHAR(255) NOT NULL
);

CREATE TABLE mentor_subtes_diampu (
    mentor_profile_id UUID NOT NULL REFERENCES mentor_profiles(id) ON DELETE CASCADE,
    subtes_id UUID NOT NULL REFERENCES subtes(id),
    PRIMARY KEY (mentor_profile_id, subtes_id)
);

-- BR-15: verifikasi via klik link (WA utama, email fallback), bukan OTP manual
CREATE TABLE verification_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    channel verification_channel NOT NULL,
    expired_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_verification_tokens_user ON verification_tokens(user_id);

-- ============================================================================
-- ASSESSMENT PREDIKSI PTN (Bagian 7.4 — Keketatan vs Peluang terpisah)
-- ============================================================================

CREATE TYPE jenjang_prodi AS ENUM ('D3', 'D4', 'S1');

CREATE TABLE ptn_jurusan (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nama_universitas VARCHAR(255) NOT NULL,
    nama_jurusan VARCHAR(255) NOT NULL,
    jenjang jenjang_prodi NOT NULL,       -- S1/D3/D4 dianggap prodi berbeda (FR-3.9)
    provinsi_id UUID NOT NULL REFERENCES provinsi(id), -- lokasi PTN, wajib untuk validasi BR-28
    kuota_tahun_berjalan INT NOT NULL,
    jumlah_peminat_tahun_lalu INT NOT NULL,
    jalur jalur_seleksi NOT NULL,
    sumber_data VARCHAR(100) NOT NULL,   -- 'snpmb.id' / 'input_manual_ptn'
    tahun_data INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (nama_universitas, nama_jurusan, jenjang, jalur, tahun_data)
);

CREATE INDEX idx_ptn_jurusan_provinsi ON ptn_jurusan(provinsi_id);

CREATE TABLE assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE, -- NULLABLE: NULL = assessment anonim (Bagian 7.4.1b/BR-29)
    anonymous_trial_id TEXT,             -- cookie trial ID, diisi kalau user_id NULL; NULL kalau sudah ditautkan ke akun
    jalur jalur_seleksi NOT NULL,
    input_data JSONB NOT NULL,           -- nilai rapor, prestasi, dsb. (lihat 7.4.2)
    rata_rata_rapor DECIMAL(5,2),        -- rata-rata Semester 1-5 (Bagian 7.4.3 #0)
    nilai_prestasi DECIMAL(5,2),         -- NULL jika siswa tidak isi Prestasi
    nilai_akhir DECIMAL(5,2),            -- rata-rata rapor+prestasi, atau = rata_rata_rapor jika prestasi NULL
    nilai_akhir_label VARCHAR(30),       -- 'Sangat Tinggi'/'Tinggi'/'Sedang'/'Rendah'/'Sangat Rendah' (FR-3.8)
    note_ai TEXT,                        -- hasil generate Gemini untuk section "Note" (BR-30), NULL jika belum/gagal generate
    hasil_breakdown JSONB,               -- catatan/insight tambahan
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_assessments_user ON assessments(user_id);
CREATE INDEX idx_assessments_anonymous_trial ON assessments(anonymous_trial_id) WHERE anonymous_trial_id IS NOT NULL;

ALTER TABLE assessments ADD CONSTRAINT chk_assessment_owner
  CHECK (user_id IS NOT NULL OR anonymous_trial_id IS NOT NULL); -- salah satu wajib ada

-- Setiap assessment punya 1-4 pilihan (sesuai desain Hasil Assessment SNBP)
CREATE TABLE assessment_pilihan (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    -- Catatan: SNBP maksimal 2 pilihan (aturan Kemendikbudristek SNBP 2026, BR-28),
    -- SNBT tetap 4 pilihan. Constraint DB dilonggarkan ke 1-4 supaya menampung
    -- kedua jalur; penegakan "maksimal 2 khusus SNBP" dan validasi provinsi
    -- WAJIB dilakukan di application layer (FR-3.10), bukan cuma di sini.
    urutan_pilihan SMALLINT NOT NULL CHECK (urutan_pilihan BETWEEN 1 AND 4),
    ptn_jurusan_id UUID NOT NULL REFERENCES ptn_jurusan(id),
    keketatan_score DECIMAL(5,2) NOT NULL,   -- formula publik: (kuota/peminat)*100
    keketatan_label VARCHAR(30) NOT NULL,    -- 'Sangat Ketat'/'Sedang'/'Sangat Longgar'
    peluang_score DECIMAL(5,2) NOT NULL,     -- personal, terpisah dari keketatan
    peluang_label VARCHAR(30) NOT NULL,      -- 'Peluang Kecil'/'Sedang'/'Peluang Besar'
    is_rekomendasi BOOLEAN NOT NULL DEFAULT false, -- true jika masuk "Rekomendasi Jurusan"
    UNIQUE (assessment_id, urutan_pilihan, is_rekomendasi)
);

CREATE INDEX idx_assessment_pilihan_assessment ON assessment_pilihan(assessment_id);

-- ============================================================================
-- KELAS BIMBINGAN & ENROLLMENT (Bagian 7.5)
-- ============================================================================

CREATE TYPE kelas_tipe AS ENUM ('private', 'semi_private', 'grouping');

CREATE TYPE kelas_program AS ENUM (
    'konsultasi', 'tka', 'snbt', 'ujian_mandiri', 'pendampingan_mahasiswa'
);

CREATE TABLE kelas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nama VARCHAR(255) NOT NULL,
    program_kategori kelas_program NOT NULL,  -- BARU: kategori bisnis (halaman /program), bukan mapel
    tingkat_kelas tingkat_kelas NOT NULL,
    tipe_kelas kelas_tipe NOT NULL DEFAULT 'grouping',  -- dasar hitung persentase honor mentor
    subtes_id UUID REFERENCES subtes(id),  -- DIREVISI: nullable — Konsultasi/Pendampingan Mahasiswa tidak selalu terikat mapel
    mentor_id UUID REFERENCES users(id),   -- FK ke users yg role_type='mentor' aktif
    kapasitas INT NOT NULL,
    harga DECIMAL(12,2) NOT NULL DEFAULT 0,
    deskripsi TEXT,                        -- manual atau AI-generated, tampil di detail kelas
    jadwal JSONB,                          -- array of {hari, jam} — mendukung lebih dari satu slot
    link_meet TEXT,                        -- link recurring statis per Kelas (bukan per siswa)
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_kelas_mentor ON kelas(mentor_id);
CREATE INDEX idx_kelas_program ON kelas(program_kategori);

-- Konfigurasi persentase honor per tipe kelas — tabel terpisah (bukan hardcode
-- di query) supaya Admin bisa ubah angkanya lewat Table Editor tanpa perlu
-- developer redeploy kode. Persentase berlaku dari HARGA KELAS, bukan flat
-- Rupiah (prinsip bisnis: margin konsisten meski ada diskon).
CREATE TABLE honor_persentase_config (
    tipe_kelas kelas_tipe PRIMARY KEY,
    persentase DECIMAL(5,2) NOT NULL
);

INSERT INTO honor_persentase_config (tipe_kelas, persentase) VALUES
    ('private', 65.00),
    ('semi_private', 65.00),
    ('grouping', 50.00);

-- Lacak materi mana yang sudah "selesai" per siswa — dasar perhitungan
-- enrollments.progres_persen (bukan angka manual yang mengambang)
CREATE TABLE materi_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    materi_id UUID NOT NULL REFERENCES materi(id) ON DELETE CASCADE,
    selesai BOOLEAN NOT NULL DEFAULT false,
    tanggal_selesai TIMESTAMPTZ,
    UNIQUE (user_id, materi_id)
);

CREATE INDEX idx_materi_progress_user ON materi_progress(user_id);

CREATE TABLE enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kelas_id UUID NOT NULL REFERENCES kelas(id),
    status_pembayaran status_pembayaran_enrollment NOT NULL DEFAULT 'menunggu',
    progres_persen SMALLINT NOT NULL DEFAULT 0 CHECK (progres_persen BETWEEN 0 AND 100),
    tanggal_daftar TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, kelas_id)
);

-- ============================================================================
-- TRY OUT (Bagian 7.6 — Free/Premium, timer, navigator soal)
-- ============================================================================

CREATE TYPE tryout_sumber AS ENUM ('in_house', 'agensoal');

CREATE TABLE tryouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nama VARCHAR(255) NOT NULL,
    kategori tryout_kategori NOT NULL,
    ptn_terkait UUID REFERENCES ptn_jurusan(id),  -- wajib diisi jika kategori='mandiri' (BR-8)
    subtes_id UUID NOT NULL REFERENCES subtes(id),
    durasi_menit INT NOT NULL,
    tipe_akses tryout_akses NOT NULL DEFAULT 'free',
    sumber tryout_sumber NOT NULL DEFAULT 'agensoal',  -- BELUM FINAL, lihat catatan integrasi agensoal
    link_eksternal TEXT,  -- URL spesifik paket ini di agensoal.com, NULL kalau sumber='in_house'
    jadwal TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_mandiri_wajib_ptn CHECK (
        (kategori <> 'mandiri') OR (kategori = 'mandiri' AND ptn_terkait IS NOT NULL)
    )
);

-- Riwayat hasil tryout dari partner eksternal (BELUM FINAL, bagian dari
-- modul integrasi agensoal — lihat catatan di sso_token_eksternal).
-- TERPISAH dari TryOutAttempt in-house karena datanya cuma ringkasan
-- (skor), bukan detail per-soal seperti tryout in-house.
CREATE TABLE tryout_riwayat_eksternal (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tryout_id UUID NOT NULL REFERENCES tryouts(id),
    skor DECIMAL(6,2),
    breakdown_subtes JSONB,        -- opsional, kalau agensoal kirim rincian per subtes
    link_review_eksternal TEXT,    -- link "Lihat Pembahasan" di agensoal, kalau tersedia
    waktu_selesai TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tryout_riwayat_eksternal_user ON tryout_riwayat_eksternal(user_id);

-- FR-T5–T8: navigator soal & timer server-side
CREATE TABLE tryout_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tryout_id UUID NOT NULL REFERENCES tryouts(id),
    jawaban JSONB NOT NULL DEFAULT '{}',
    status_per_soal JSONB NOT NULL DEFAULT '{}',   -- {"1": "dikerjakan", "2": "belum", ...}
    skor DECIMAL(6,2),
    waktu_mulai TIMESTAMPTZ NOT NULL DEFAULT now(),
    waktu_tersisa_server INT NOT NULL,             -- detik tersisa, source of truth (FR-T2)
    waktu_selesai TIMESTAMPTZ,
    immutable_lock BOOLEAN NOT NULL DEFAULT false, -- true setelah submit (BR-9)
    pdf_export_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tryout_attempts_user ON tryout_attempts(user_id);
CREATE INDEX idx_tryout_attempts_tryout ON tryout_attempts(tryout_id);

-- ============================================================================
-- REFERRAL & GAMIFIKASI (Bagian 7.1–7.3)
-- ============================================================================

CREATE TABLE referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_id UUID NOT NULL REFERENCES users(id),
    referee_id UUID NOT NULL REFERENCES users(id),
    kode_referral VARCHAR(30) NOT NULL,
    status referral_status NOT NULL DEFAULT 'terdaftar',
    tanggal_daftar TIMESTAMPTZ NOT NULL DEFAULT now(),
    tanggal_konversi TIMESTAMPTZ,
    CONSTRAINT chk_no_self_referral CHECK (referrer_id <> referee_id)  -- BR-11
);

CREATE UNIQUE INDEX idx_referrals_referee ON referrals(referee_id); -- 1 referee cuma dirujuk 1x
CREATE INDEX idx_referrals_referrer ON referrals(referrer_id);

CREATE TABLE referral_rewards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referral_id UUID NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,
    jenis_reward VARCHAR(50) NOT NULL,     -- 'diskon' / 'saldo' / 'poin'
    nominal_atau_poin DECIMAL(12,2) NOT NULL,
    status_pencairan reward_pencairan_status NOT NULL DEFAULT 'tertunda',
    tanggal TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE gamifikasi_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    total_poin INT NOT NULL DEFAULT 0,
    level VARCHAR(50) NOT NULL DEFAULT 'Rookie Referrer',
    streak_counter INT NOT NULL DEFAULT 0
);

CREATE TABLE badges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nama VARCHAR(100) NOT NULL,
    kriteria TEXT NOT NULL,
    ikon TEXT
);

CREATE TABLE gamifikasi_user_badges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gamifikasi_profile_id UUID NOT NULL REFERENCES gamifikasi_profiles(id) ON DELETE CASCADE,
    badge_id UUID NOT NULL REFERENCES badges(id),
    earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (gamifikasi_profile_id, badge_id)
);

CREATE TABLE reward_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nama_reward VARCHAR(255) NOT NULL,
    biaya_poin INT NOT NULL,
    stok_atau_anggaran_tersisa INT NOT NULL DEFAULT 0,  -- BR-13: anggaran wajib ada cap
    dikelola_oleh_admin_id UUID NOT NULL REFERENCES users(id)
);

CREATE TABLE reward_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    reward_catalog_id UUID NOT NULL REFERENCES reward_catalog(id),
    poin_terpakai INT NOT NULL,
    status redemption_status NOT NULL DEFAULT 'diproses',
    tanggal TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- PAYMENT (Bagian 8 BR-19: hanya webhook/admin override yang bisa ubah status)
-- ============================================================================

CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    item_type payment_item_type NOT NULL,
    item_id UUID NOT NULL,               -- polymorphic: kelas.id atau tryouts.id
    jumlah DECIMAL(12,2) NOT NULL,
    metode VARCHAR(50),
    status payment_status NOT NULL DEFAULT 'menunggu',
    kode_promo VARCHAR(30),
    gateway_reference TEXT,              -- id transaksi dari Midtrans/Xendit, utk idempotency webhook
    dibuat_pada TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_payments_gateway_ref ON payments(gateway_reference)
    WHERE gateway_reference IS NOT NULL;  -- cegah webhook diproses ganda

-- ============================================================================
-- KONTEN BEASISWA / INTERNSHIP / EVENT (Bagian 7 — FR-7.x)
-- ============================================================================

CREATE TABLE konten_info (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipe konten_info_tipe NOT NULL,
    judul VARCHAR(255) NOT NULL,
    deskripsi TEXT,                      -- ringkasan singkat, dipakai di card
    deskripsi_lengkap TEXT,              -- konten detail, dipakai di halaman detail (fallback ke deskripsi kalau kosong)
    link_pendaftaran TEXT,               -- URL eksternal tujuan "Daftar Sekarang"
    deadline DATE,
    target_filter JSONB,                 -- kriteria personalisasi (jurusan/PTN)
    status konten_info_status NOT NULL DEFAULT 'aktif',
    dibuat_oleh_admin_id UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE konten_info_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    konten_info_id UUID NOT NULL REFERENCES konten_info(id) ON DELETE CASCADE,
    jenis interaksi_konten_jenis NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, konten_info_id, jenis)
);

-- ============================================================================
-- AI MENTOR & AI PEMBUAT SOAL (Bagian 7.7, BR-17/BR-18/BR-21/BR-22)
-- ============================================================================

CREATE TABLE ai_mentor_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pertanyaan TEXT NOT NULL,
    jawaban TEXT NOT NULL,
    eskalasi_bool BOOLEAN NOT NULL DEFAULT false,
    dibuat_pada TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Data kampanye iklan (BARU) — input MANUAL oleh Admin, karena belum ada
-- integrasi API ke Meta/TikTok Ads Manager (dianggap belum perlu di Fase 1)
CREATE TYPE platform_iklan AS ENUM ('meta', 'tiktok', 'lainnya');

CREATE TABLE campaign_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nama_campaign VARCHAR(255) NOT NULL,
    platform platform_iklan NOT NULL,
    periode_mulai DATE NOT NULL,
    periode_selesai DATE NOT NULL,
    biaya DECIMAL(12,2),
    reach INT,
    klik INT,
    leads_dihasilkan INT,          -- estimasi manual Admin, dari data Ads Manager
    catatan TEXT,
    dicatat_oleh_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_campaign_data_periode ON campaign_data(periode_mulai, periode_selesai);

CREATE TYPE konten_sumber AS ENUM ('ai_generated', 'upload_mentor');

CREATE TABLE soal_ai (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subtes_id UUID NOT NULL REFERENCES subtes(id),
    kelas_id UUID REFERENCES kelas(id),   -- NULL kalau soal generik lintas kelas (mis. bank tryout)
    konsep_sumber TEXT NOT NULL,          -- referensi konsep, BUKAN teks sumber asli (BR-18)
    redaksi TEXT NOT NULL,
    jawaban TEXT NOT NULL,
    pembahasan TEXT NOT NULL,
    tingkat_kesulitan soal_ai_kesulitan NOT NULL,
    estimasi_waktu_detik INT NOT NULL,
    versi INT NOT NULL DEFAULT 1,
    sumber konten_sumber NOT NULL DEFAULT 'ai_generated',  -- BR-31: manual mentor = auto-published
    status soal_ai_status NOT NULL DEFAULT 'draft',  -- wajib direview dulu KALAU sumber='ai_generated' (BR-17/BR-31)
    dibuat_oleh_id UUID REFERENCES users(id),  -- mentor yang upload manual; NULL kalau AI-generated
    direview_oleh_id UUID REFERENCES users(id),
    tanggal_review TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Materi belajar (BARU, BR-31): sama pola dengan soal_ai — bisa AI-generated (wajib review)
-- atau upload manual mentor (auto-published)
CREATE TYPE materi_tipe AS ENUM ('video', 'dokumen', 'rangkuman_teks');

CREATE TABLE materi (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kelas_id UUID NOT NULL REFERENCES kelas(id),
    subtes_id UUID REFERENCES subtes(id),
    judul VARCHAR(255) NOT NULL,
    tipe materi_tipe NOT NULL,
    konten TEXT,                          -- rangkuman teks, atau URL video/dokumen
    sumber konten_sumber NOT NULL DEFAULT 'ai_generated',
    status soal_ai_status NOT NULL DEFAULT 'draft',  -- reuse enum status yang sama (draft/published/ditolak)
    dibuat_oleh_id UUID REFERENCES users(id),
    direview_oleh_id UUID REFERENCES users(id),
    tanggal_review TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_materi_kelas ON materi(kelas_id);
CREATE INDEX idx_materi_status ON materi(status) WHERE status = 'draft';
CREATE INDEX idx_soal_ai_status ON soal_ai(status) WHERE status = 'draft';

-- ============================================================================
-- ROW LEVEL SECURITY (WAJIB — Supabase mengekspos setiap tabel lewat API publik
-- secara default. Tanpa RLS, siapa pun dengan anon key bisa baca/tulis langsung
-- ke tabel manapun, melewati seluruh business rule di application layer)
-- ============================================================================
-- Aktifkan RLS untuk SEMUA tabel di schema public. Tidak ada policy dibuat di
-- sini secara sengaja — artinya default akses via anon/authenticated key jadi
-- TERTUTUP TOTAL. Backend (Next.js API routes) tetap bisa akses normal selama
-- memakai service_role key di sisi server (key ini melewati RLS sepenuhnya).
-- Jika nanti ada kebutuhan akses langsung dari client (mis. leaderboard publik
-- di Fase 2/3), baru tambahkan policy granular per tabel saat itu terjadi.

DO $$
DECLARE
    t text;
BEGIN
    FOR t IN
        SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    END LOOP;
END $$;

-- Pengecualian sadar: ptn_jurusan dan subtes adalah data referensi PUBLIK
-- (bukan data pribadi), dan wajib bisa dibaca tanpa login karena halaman
-- Assessment sekarang bisa diakses anonim (Bagian 7.4.1b PRD). Beri akses
-- SELECT saja (bukan INSERT/UPDATE/DELETE) untuk anon & authenticated key.
CREATE POLICY "ptn_jurusan_public_read" ON ptn_jurusan
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "subtes_public_read" ON subtes
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- ============================================================================
-- CATATAN IMPLEMENTASI
-- ============================================================================
-- 1. Semua FK ke users(id) untuk "mentor_id"/"dikelola_oleh_admin_id" TIDAK divalidasi
--    di level DB bahwa role user tsb memang mentor/admin — validasi ini WAJIB
--    dilakukan di application layer (RBAC middleware, FR-1.7), karena Postgres
--    tidak bisa cek "role aktif" lintas tabel user_roles lewat FK constraint biasa.
-- 2. Audit log (Bagian 15 PRD) belum dibuat sebagai tabel terpisah di sini —
--    disarankan pakai extension seperti pgAudit atau tabel `audit_logs` generik
--    (actor_id, action, entity, entity_id, before, after, created_at) sebagai
--    langkah berikutnya jika diperlukan lebih detail.
-- 3. Tipe data DECIMAL dipakai untuk uang/skor agar presisi, hindari FLOAT.
-- 4. Sesuaikan lagi index tambahan setelah pola query nyata dari aplikasi terlihat
--    (mis. composite index leaderboard per periode di Fase 2).
-- ============================================================================