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
CREATE TYPE konten_info_tipe AS ENUM ('beasiswa', 'internship', 'event', 'webinar', 'workshop');
-- 'event' tetap jadi kategori umum/"lainnya" (BR baru) — kalau Admin input 
-- sesuatu yang bukan Beasiswa/Internship/Webinar/Workshop spesifik, pakai 
-- 'event', tampil ke publik sebagai label "Event" generik.
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
    kategori subtes_kategori NOT NULL,
    mapel_dasar VARCHAR(100),            -- BARU: pengelompokan mapel serumpun (mis. 'Bahasa Indonesia',
                                          -- 'Bahasa Inggris', 'Matematika') — dipakai untuk cocokkan mentor
                                          -- lintas varian subtes yang serumpun (Literasi vs biasa vs Lanjut)
    ditawarkan BOOLEAN NOT NULL DEFAULT true  -- db/add_subtes_ditawarkan.sql: cuma true yang tampil di
                                          -- checklist Subtes form Kelola Kelas (elektif langka = false)
);

-- ============================================================================
-- USERS & ROLE (BR-2, BR-26: multi-role dalam satu akun)
-- ============================================================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nama VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    no_wa VARCHAR(20) UNIQUE,                     -- NULLABLE: baru diisi di /lengkapi-profil (db/make_no_wa_password_nullable.sql)
    password_hash TEXT,                           -- NULLABLE: NULL permanen untuk akun yang hanya login lewat Google
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
    avatar_transparent_url TEXT,  -- versi background dihapus (remove.bg), khusus section Mentor landing page
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
-- INTEGRASI PARTNER EKSTERNAL — kerjasama agensoal.com SUDAH DISEPAKATI
-- (per Agustus 2026). Tabel ini tetap dipisah dengan prefix jelas untuk
-- kerapian modular, TAPI sekarang sudah boleh dibangun penuh (bukan lagi
-- sekadar kerangka/stub menunggu kepastian).
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

CREATE TYPE promo_tipe_diskon AS ENUM ('persen', 'nominal');
CREATE TYPE promo_status AS ENUM ('aktif', 'nonaktif');

-- Kode Promo — TERPISAH dari iklan_campaign (beda fungsi: ini dipakai
-- langsung siswa saat checkout, bukan cuma catatan internal Admin).
-- Link opsional ke campaign cuma buat pelaporan, bukan penggabungan fitur.
CREATE TABLE kode_promo (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kode VARCHAR(50) UNIQUE NOT NULL,       -- mis. 'MERDEKA17', disimpan uppercase
    tipe_diskon promo_tipe_diskon NOT NULL,
    nilai_diskon DECIMAL(10,2) NOT NULL,    -- persen (0-100) atau nominal Rupiah, sesuai tipe_diskon
    tanggal_mulai DATE,
    tanggal_selesai DATE,
    kuota_pemakaian INT,                    -- NULL = tidak terbatas
    jumlah_terpakai INT NOT NULL DEFAULT 0,
    status promo_status NOT NULL DEFAULT 'aktif',
    campaign_terkait_id UUID REFERENCES iklan_campaign(id),  -- opsional, buat pelaporan
    label_sekolah VARCHAR(255),             -- CUMA LABEL pengingat Admin (mis. "SMAN 1 Purwokerto"),
                                             -- TIDAK divalidasi sistem — nama_sekolah siswa teks bebas,
                                             -- jadi scoping sekolah dilakukan lewat distribusi kode manual
    berlaku_semua_kelas BOOLEAN NOT NULL DEFAULT true,  -- false = wajib ada baris di kode_promo_kelas
    dibuat_oleh_id UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_kode_promo_kode ON kode_promo(kode);

-- Scoping ke kelas tertentu — kalau kode_promo.berlaku_semua_kelas=false,
-- kode cuma valid untuk kelas yang baris-nya ada di sini.
CREATE TABLE kode_promo_kelas (
    kode_promo_id UUID NOT NULL REFERENCES kode_promo(id) ON DELETE CASCADE,
    kelas_id UUID NOT NULL REFERENCES kelas(id) ON DELETE CASCADE,
    PRIMARY KEY (kode_promo_id, kelas_id)
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

-- Kerjasama agensoal.com SUDAH DISEPAKATI (bukan lagi "belum final") —
-- mentor Dimentoring bisa buat soal di dashboard bimbel Agensoal,
-- direward poin di Dimentoring begitu soal itu published di sana.

-- Pemetaan akun: satu mentor Dimentoring = satu identitas di Agensoal.
-- WAJIB ada supaya webhook publish soal bisa tahu "ini poinnya milik siapa".
CREATE TABLE mentor_agensoal_mapping (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    agensoal_identifier TEXT NOT NULL UNIQUE,  -- ID/email mentor ini di sistem Agensoal
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Konfigurasi poin per soal — singleton row, Admin bisa ubah lewat Table
-- Editor tanpa redeploy (pola sama dengan honor_persentase_config dkk).
-- Dibedakan per tingkat kesulitan karena HOTS wajar dapat lebih besar.
CREATE TABLE mentor_soal_reward_config (
    id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    poin_per_soal_mudah INT NOT NULL DEFAULT 10,
    poin_per_soal_sedang INT NOT NULL DEFAULT 15,
    poin_per_soal_hots INT NOT NULL DEFAULT 25,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO mentor_soal_reward_config (id, poin_per_soal_mudah, poin_per_soal_sedang, poin_per_soal_hots)
VALUES (1, 10, 15, 25);

-- Log tiap reward yang diberikan — kunci UNIQUE di agensoal_soal_id
-- mencegah reward ganda kalau webhook yang sama terkirim berkali-kali
-- (idempotency, prinsip sama dengan payments.gateway_reference).
CREATE TABLE mentor_soal_reward_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    agensoal_soal_id TEXT NOT NULL UNIQUE,
    tingkat_kesulitan VARCHAR(20),
    poin_diberikan INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TYPE campaign_status AS ENUM ('aktif', 'nonaktif');

-- Banner campaign di landing page — fleksibel, bisa umumkan apa saja yang
-- bertujuan konversi (diskon, kelas baru, musim ujian, dst), tidak terikat
-- ke kode_promo. Admin kelola sendiri tanpa perlu developer.
CREATE TABLE landing_campaign (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    judul VARCHAR(150) NOT NULL,
    link_tujuan TEXT NOT NULL,
    tanggal_mulai DATE,           -- NULL = aktif segera setelah dibuat
    tanggal_selesai DATE,         -- NULL = tidak ada batas akhir otomatis
    status campaign_status NOT NULL DEFAULT 'aktif',
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
    jurusan VARCHAR(255) NOT NULL,
    foto_landing_url TEXT,                        -- BARU: foto PNG (background sudah 
                                                    -- dihapus manual) khusus untuk section 
                                                    -- Mentor di landing page, diupload Admin
    tampil_di_landing BOOLEAN NOT NULL DEFAULT false  -- BARU: Admin yang kontrol siapa tampil
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

CREATE TYPE rumpun_ilmu AS ENUM ('saintek', 'soshum');

CREATE TABLE ptn_jurusan (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nama_universitas VARCHAR(255) NOT NULL,
    nama_jurusan VARCHAR(255) NOT NULL,
    rumpun rumpun_ilmu NOT NULL,          -- BARU: dasar filter Rekomendasi Jurusan (harus 1 rumpun sama)
    jenjang jenjang_prodi NOT NULL,       -- S1/D3/D4 dianggap prodi berbeda (FR-3.9)
    provinsi_id UUID NOT NULL REFERENCES provinsi(id), -- lokasi PTN, wajib untuk validasi BR-28
    kuota_tahun_berjalan INT NOT NULL,
    jumlah_peminat_tahun_lalu INT NOT NULL,
    jalur jalur_seleksi NOT NULL,
    sumber_data VARCHAR(100) NOT NULL,   -- 'snpmb.id' / 'input_manual_ptn'
    tahun_data INT NOT NULL,
    rata_rata_nilai_diterima DECIMAL(5,2), -- opsional, dari migrasi univ_major dulu, boleh diisi manual juga
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (nama_universitas, nama_jurusan, jenjang, jalur, tahun_data)
);

CREATE INDEX idx_ptn_jurusan_provinsi ON ptn_jurusan(provinsi_id);
CREATE INDEX idx_ptn_jurusan_rumpun ON ptn_jurusan(rumpun);

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
    utm_source TEXT,                     -- BARU (BR-38): atribusi first-touch dari cookie dm_attr saat submit
    utm_medium TEXT,
    utm_campaign TEXT,
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
    mentor_id UUID REFERENCES users(id),   -- DEPRECATED, dipertahankan untuk kompatibilitas lama — 
                                            -- mentor sekarang dikelola lewat kelas_mentor (many-to-many)
    kapasitas INT NOT NULL,
    harga DECIMAL(12,2) NOT NULL DEFAULT 0,
    diskon_persen SMALLINT NOT NULL DEFAULT 0  -- diskon yang MELEKAT ke kelas (tanpa kode promo) — db/add_kelas_diskon.sql
        CONSTRAINT kelas_diskon_persen_range CHECK (diskon_persen >= 0 AND diskon_persen <= 100),
    deskripsi TEXT,                        -- manual atau AI-generated, tampil di detail kelas
    jadwal JSONB,                          -- array of {hari, jam} — mendukung lebih dari satu slot
    link_meet TEXT,                        -- link recurring statis per Kelas (bukan per siswa)
    link_lynkid TEXT,                      -- SEMENTARA: link produk Lynk.id, dipakai selama Payment 
                                            -- otomatis belum aktif (lihat BR pendaftaran manual)
    tampil_di_katalog BOOLEAN NOT NULL DEFAULT true,  -- false = disembunyikan dari katalog, rekomendasi & checkout
                                            -- (TIDAK menyentuh kelas yang sudah diikuti) — db/add_kelas_tampil_di_katalog.sql
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_kelas_mentor ON kelas(mentor_id);
CREATE INDEX idx_kelas_program ON kelas(program_kategori);

-- Relasi banyak-ke-banyak: satu kelas bisa punya banyak mentor, satu mentor
-- bisa mengampu banyak kelas. Menggantikan kelas.mentor_id (tunggal) sebagai
-- sumber data utama untuk section "Mentor Kelas Ini" dan notifikasi checkout.
CREATE TABLE kelas_mentor (
    kelas_id UUID NOT NULL REFERENCES kelas(id) ON DELETE CASCADE,
    mentor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (kelas_id, mentor_id)
);

CREATE INDEX idx_kelas_mentor_kelas ON kelas_mentor(kelas_id);
CREATE INDEX idx_kelas_mentor_mentor ON kelas_mentor(mentor_id);

-- Relasi banyak-ke-banyak: satu kelas bisa mencakup beberapa subtes sekaligus
-- (paket bundling, mis. "Paket TKA Saintek" = Matematika+Fisika+Kimia+Biologi).
-- Menggantikan kelas.subtes_id (tunggal, nullable) sebagai sumber utama.
CREATE TABLE kelas_subtes (
    kelas_id UUID NOT NULL REFERENCES kelas(id) ON DELETE CASCADE,
    subtes_id UUID NOT NULL REFERENCES subtes(id) ON DELETE CASCADE,
    PRIMARY KEY (kelas_id, subtes_id)
);

CREATE INDEX idx_kelas_subtes_kelas ON kelas_subtes(kelas_id);
CREATE INDEX idx_kelas_subtes_subtes ON kelas_subtes(subtes_id);

-- Pasangan Mentor-Subtes DALAM satu kelas paket (BARU) — beda dari kelas_mentor
-- (yang cuma daftar datar), ini eksplisit: "di kelas ini, Subtes X diajar Mentor Y".
-- Jadi sumber utama untuk notifikasi checkout & tampilan "siapa ngajar apa".
CREATE TABLE kelas_subtes_mentor (
    kelas_id UUID NOT NULL REFERENCES kelas(id) ON DELETE CASCADE,
    subtes_id UUID NOT NULL REFERENCES subtes(id) ON DELETE CASCADE,
    mentor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (kelas_id, subtes_id, mentor_id)
);

CREATE INDEX idx_ksm_kelas ON kelas_subtes_mentor(kelas_id);
CREATE INDEX idx_ksm_subtes ON kelas_subtes_mentor(subtes_id);
CREATE INDEX idx_ksm_mentor ON kelas_subtes_mentor(mentor_id);

-- Pilihan SISWA saat checkout (BARU) — dari pool subtes yang tersedia di kelas 
-- (kelas_subtes), siswa pilih maksimal 3 untuk dirinya sendiri. Beda siswa, 
-- beda kelas yang sama, bisa pilih subtes berbeda-beda.
CREATE TABLE enrollment_subtes (
    enrollment_id UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
    subtes_id UUID NOT NULL REFERENCES subtes(id) ON DELETE CASCADE,
    PRIMARY KEY (enrollment_id, subtes_id)
);

CREATE INDEX idx_enrollment_subtes_enrollment ON enrollment_subtes(enrollment_id);

-- Mode Pembelajaran & Jumlah Sesi (BARU) — offline berarti mentor mendatangi 
-- lokasi siswa, mentor dipilih otomatis berdasar jarak TERDEKAT saat checkout, 
-- bukan ditentukan di muka waktu bikin kelas (beda dari online).
CREATE TYPE mode_pembelajaran AS ENUM ('online', 'offline');

ALTER TABLE kelas ADD COLUMN mode_pembelajaran mode_pembelajaran NOT NULL DEFAULT 'online';
ALTER TABLE kelas ADD COLUMN jumlah_sesi INT NOT NULL DEFAULT 10; 
-- Default diisi 10 (online) di kode aplikasi waktu bikin kelas baru; kalau 
-- mode_pembelajaran='offline' dipilih, default form berubah jadi 8 — TETAP 
-- BISA diubah manual oleh Admin (mis. untuk campaign khusus).

-- Lokasi mentor (opsional, cuma perlu diisi kalau mentor bersedia ngajar 
-- offline/tatap muka) — diambil dari GPS device (navigator.geolocation), 
-- BUKAN geocoding alamat berbayar.
ALTER TABLE mentor_profiles ADD COLUMN bisa_offline BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE mentor_profiles ADD COLUMN lokasi_lat DECIMAL(10,7);
ALTER TABLE mentor_profiles ADD COLUMN lokasi_lng DECIMAL(10,7);

-- Lokasi siswa & mentor yang di-assign OTOMATIS berdasar jarak, dicatat PER 
-- ENROLLMENT (bukan per kelas) — karena beda siswa, beda lokasi, beda mentor 
-- terdekat, meski beli kelas offline yang sama.
ALTER TABLE enrollments ADD COLUMN lokasi_siswa_lat DECIMAL(10,7);
ALTER TABLE enrollments ADD COLUMN lokasi_siswa_lng DECIMAL(10,7);
ALTER TABLE enrollments ADD COLUMN mentor_offline_id UUID REFERENCES users(id);

-- Absensi Sesi (BARU) — konfirmasi DUA ARAH: mentor klik "Selesai", siswa 
-- konfirmasi terpisah. Cocok = valid otomatis. Tidak cocok = perlu_review_admin.
CREATE TYPE status_konfirmasi_sesi AS ENUM ('belum', 'dikonfirmasi', 'disangkal');

CREATE TABLE sesi_kelas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_id UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
    nomor_sesi INT NOT NULL,
    tanggal_dilaksanakan DATE,
    dikonfirmasi_mentor BOOLEAN NOT NULL DEFAULT false,
    dikonfirmasi_mentor_pada TIMESTAMPTZ,
    status_siswa status_konfirmasi_sesi NOT NULL DEFAULT 'belum',
    dikonfirmasi_siswa_pada TIMESTAMPTZ,
    perlu_review_admin BOOLEAN NOT NULL DEFAULT false,
    -- Multi-mentor (db/add_sesi_mentor_mapel.sql): mentor yang MENANDAI sesi
    -- ini + snapshot nama Subtes-nya saat ditandai. NULL = baris lama / belum ditandai.
    mentor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    nama_mapel TEXT,
    UNIQUE(enrollment_id, nomor_sesi)
);

CREATE INDEX idx_sesi_kelas_enrollment ON sesi_kelas(enrollment_id);
CREATE INDEX idx_sesi_kelas_enrollment_mentor ON sesi_kelas(enrollment_id, mentor_id);

-- Log audit keputusan Admin atas sesi yang disangkal siswa (BR-34, FR-A3) —
-- db/add_sesi_review_log.sql. snapshot_sebelum = baris sesi_kelas sebelum
-- keputusan. SET NULL supaya log tetap ada walau baris sesi dihapus.
CREATE TABLE sesi_review_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sesi_id UUID REFERENCES sesi_kelas(id) ON DELETE SET NULL,
    admin_id UUID NOT NULL REFERENCES users(id),
    keputusan TEXT NOT NULL CHECK (keputusan IN ('setujui', 'batalkan')),
    snapshot_sebelum JSONB NOT NULL,
    alasan TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT sesi_review_log_alasan_batalkan
        CHECK (keputusan <> 'batalkan' OR length(btrim(coalesce(alasan, ''))) > 0)
);

CREATE INDEX idx_sesi_review_log_sesi ON sesi_review_log(sesi_id);

-- Keputusan Admin + log dalam SATU transaksi (baris dikunci FOR UPDATE).
-- Dipanggil app/api/admin/sesi-review via service_role saja.
CREATE OR REPLACE FUNCTION putuskan_sesi_review(
    p_sesi_id UUID,
    p_admin_id UUID,
    p_keputusan TEXT,
    p_alasan TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_sesi sesi_kelas%ROWTYPE;
BEGIN
    SELECT * INTO v_sesi FROM sesi_kelas
    WHERE id = p_sesi_id AND perlu_review_admin = true
    FOR UPDATE;
    IF NOT FOUND THEN
        RETURN false;
    END IF;

    INSERT INTO sesi_review_log (sesi_id, admin_id, keputusan, snapshot_sebelum, alasan)
    VALUES (p_sesi_id, p_admin_id, p_keputusan, to_jsonb(v_sesi), NULLIF(btrim(p_alasan), ''));

    IF p_keputusan = 'setujui' THEN
        UPDATE sesi_kelas
        SET status_siswa = 'dikonfirmasi', perlu_review_admin = false
        WHERE id = p_sesi_id;
    ELSE
        UPDATE sesi_kelas
        SET dikonfirmasi_mentor = false,
            dikonfirmasi_mentor_pada = NULL,
            tanggal_dilaksanakan = NULL,
            status_siswa = 'belum',
            dikonfirmasi_siswa_pada = NULL,
            perlu_review_admin = false,
            mentor_id = NULL,
            nama_mapel = NULL
        WHERE id = p_sesi_id;
    END IF;

    RETURN true;
END $$;

REVOKE ALL ON FUNCTION putuskan_sesi_review(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION putuskan_sesi_review(UUID, UUID, TEXT, TEXT) TO service_role;

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
    penerima VARCHAR(20) NOT NULL DEFAULT 'referrer',  -- BARU: 'referrer' atau 'referee' — reward dua sisi
    jenis_reward VARCHAR(50) NOT NULL,     -- 'diskon' / 'saldo' / 'poin'
    nominal_atau_poin DECIMAL(12,2) NOT NULL,
    status_pencairan reward_pencairan_status NOT NULL DEFAULT 'tertunda',
    tanggal TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Konfigurasi besaran reward referral — singleton row (selalu id=1), Admin
-- bisa ubah lewat Table Editor tanpa perlu developer redeploy kode.
-- DIREVISI: persentase dari nilai transaksi, dengan batas bawah & atas
-- (bukan lagi poin flat) — supaya proporsional ke harga paket yang
-- rentangnya lebar (Konsultasi murah s/d Pendampingan Mahasiswa).
CREATE TABLE referral_reward_config (
    id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    persen_referrer DECIMAL(5,2) NOT NULL DEFAULT 5.00,  -- % dari payments.jumlah
    persen_referee DECIMAL(5,2) NOT NULL DEFAULT 2.00,
    poin_minimum_referrer INT NOT NULL DEFAULT 50,   -- floor
    poin_maksimum_referrer INT NOT NULL DEFAULT 500, -- cap
    poin_minimum_referee INT NOT NULL DEFAULT 20,
    poin_maksimum_referee INT NOT NULL DEFAULT 200,
    rupiah_per_100_poin DECIMAL(12,2) NOT NULL DEFAULT 10000,  -- kurs referensi (100 poin = Rp 10.000)
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO referral_reward_config (id, persen_referrer, persen_referee, poin_minimum_referrer, poin_maksimum_referrer, poin_minimum_referee, poin_maksimum_referee, rupiah_per_100_poin)
VALUES (1, 5.00, 2.00, 50, 500, 20, 200, 10000);

CREATE TABLE gamifikasi_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    total_poin INT NOT NULL DEFAULT 0,
    level VARCHAR(50) NOT NULL DEFAULT 'Rookie Referrer',
    streak_counter INT NOT NULL DEFAULT 0
);

-- Konfigurasi ambang batas tiap level — Admin bisa ubah lewat Table Editor
-- tanpa redeploy. level di gamifikasi_profiles di-update ulang tiap kali
-- total_poin berubah (lihat lib/referral/convertReferralOnPayment.ts).
CREATE TABLE gamifikasi_level_tier (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nama_level VARCHAR(50) NOT NULL,
    poin_minimum INT NOT NULL UNIQUE,
    urutan INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO gamifikasi_level_tier (nama_level, poin_minimum, urutan) VALUES
    ('Rookie Referrer', 0, 1),
    ('Rising Star', 500, 2),
    ('Referral Master', 2000, 3),
    ('Referral Legend', 5000, 4);

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
    jumlah_sebelum_diskon DECIMAL(12,2) NOT NULL,
    jumlah DECIMAL(12,2) NOT NULL,       -- jumlah_sebelum_diskon dikurangi diskon kode_promo
    metode VARCHAR(50),
    status payment_status NOT NULL DEFAULT 'menunggu',
    kode_promo_id UUID REFERENCES kode_promo(id),  -- DIREVISI: relasi ke tabel resmi, bukan teks bebas
    gateway_reference TEXT,              -- id transaksi dari Midtrans/Xendit, utk idempotency webhook
    order_id TEXT UNIQUE,                -- ID yang KITA generate, dikirim ke Midtrans sebagai order_id
    tanggal_lunas TIMESTAMPTZ,           -- diisi saat status berubah jadi 'berhasil', dasar chart Sales
    dibuat_pada TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Mentor Offline (BARU) — kelas.mode_pembelajaran='offline' saja. Ditampung
    -- di sini dulu (enrollments belum ada di titik checkout), dipindahkan
    -- webhook ke kolom enrollments senama begitu enrollment dibuat.
    mentor_offline_id UUID REFERENCES users(id),
    lokasi_siswa_lat DECIMAL(10,7),
    lokasi_siswa_lng DECIMAL(10,7)
);

CREATE UNIQUE INDEX idx_payments_gateway_ref ON payments(gateway_reference)
    WHERE gateway_reference IS NOT NULL;  -- cegah webhook diproses ganda
CREATE INDEX idx_payments_user ON payments(user_id);

-- Pilihan Subtes siswa yang MASIH MENUNGGU pembayaran (BARU) — enrollments
-- baru dibuat di webhook Payment SETELAH sukses, jadi pilihan subtes checkout
-- ditampung di sini dulu (per payment) sampai webhook memindahkannya ke
-- enrollment_subtes.
CREATE TABLE payment_subtes_pilihan (
    payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    subtes_id UUID NOT NULL REFERENCES subtes(id) ON DELETE CASCADE,
    PRIMARY KEY (payment_id, subtes_id)
);

CREATE INDEX idx_payment_subtes_pilihan_payment ON payment_subtes_pilihan(payment_id);

-- Pilihan Jadwal Siswa (BARU, Oktober 2026 — PRD 7.5.8, migration
-- db/add_jadwal_pilihan.sql). Saklar per kelas, default MATI. Kalau menyala,
-- kelas.jadwal = OPSI slot; siswa memilih maks. 2 (berurutan) saat checkout,
-- Admin menetapkan jadwal akhir. Slot dirujuk lewat salinan {hari, jam_mulai}.
ALTER TABLE kelas ADD COLUMN jadwal_pilih_siswa BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE payments ADD COLUMN jadwal_pilihan JSONB;  -- ditampung dulu, disalin webhook ke enrollments
ALTER TABLE payments ADD CONSTRAINT payments_jadwal_pilihan_maks_2 CHECK (
    CASE
        WHEN jadwal_pilihan IS NULL THEN true
        WHEN jsonb_typeof(jadwal_pilihan) = 'array' THEN jsonb_array_length(jadwal_pilihan) <= 2
        ELSE false
    END
);

ALTER TABLE enrollments ADD COLUMN jadwal_pilihan JSONB;           -- [{hari, jam_mulai}] index 0 = Pilihan 1
ALTER TABLE enrollments ADD COLUMN jadwal_ditetapkan JSONB;        -- {hari, jam_mulai} hasil penetapan Admin
ALTER TABLE enrollments ADD COLUMN jadwal_ditetapkan_at TIMESTAMPTZ;

-- Pendaftaran MANUAL oleh Admin (BARU, Oktober 2026 — PRD 7.5.10, migration
-- db/add_enrollment_manual.sql). Siswa yang bayar di luar website didaftarkan
-- Admin tanpa baris payments (tanpa promo/poin/referral), tanpa override
-- kapasitas, alasan wajib, semua aksi tercatat di enrollment_manual_log.
-- ---- 1. Kolom baru di enrollments ------------------------------------------
ALTER TABLE enrollments ADD COLUMN sumber TEXT NOT NULL DEFAULT 'checkout';
ALTER TABLE enrollments ADD COLUMN nominal_dibayar INTEGER;  -- rupiah, informasi saja (bukan dasar honor/pendapatan)
ALTER TABLE enrollments ADD COLUMN dibuat_oleh UUID REFERENCES users(id) ON DELETE SET NULL;  -- Admin yang mendaftarkan (NULL = checkout)

ALTER TABLE enrollments ADD CONSTRAINT enrollments_sumber_valid
    CHECK (sumber IN ('checkout', 'manual'));
ALTER TABLE enrollments ADD CONSTRAINT enrollments_nominal_dibayar_nonneg
    CHECK (nominal_dibayar IS NULL OR nominal_dibayar >= 0);

-- ---- 2. Log audit -----------------------------------------------------------
CREATE TABLE enrollment_manual_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL REFERENCES users(id),
    aksi TEXT NOT NULL CHECK (aksi IN ('daftar_siswa', 'tugaskan_mentor')),
    -- SET NULL: log tetap ada walau enrollment/kelas/akun dihapus (id ada di snapshot).
    enrollment_id UUID REFERENCES enrollments(id) ON DELETE SET NULL,
    kelas_id UUID REFERENCES kelas(id) ON DELETE SET NULL,
    siswa_id UUID REFERENCES users(id) ON DELETE SET NULL,
    metode_pembayaran TEXT
        CHECK (metode_pembayaran IS NULL
               OR metode_pembayaran IN ('transfer', 'tunai', 'mayar_luar', 'beasiswa', 'lainnya')),
    nominal INTEGER CHECK (nominal IS NULL OR nominal >= 0),
    alasan TEXT NOT NULL CHECK (length(btrim(alasan)) >= 10),
    snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Kunci idempotensi dari klien (satu per pengisian form) — klik dobel /
    -- kirim ulang dengan request_id sama tidak membuat pendaftaran kedua.
    request_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT enrollment_manual_log_metode_daftar
        CHECK (aksi <> 'daftar_siswa' OR metode_pembayaran IS NOT NULL)
);

CREATE INDEX idx_enrollment_manual_log_enrollment ON enrollment_manual_log(enrollment_id);
CREATE INDEX idx_enrollment_manual_log_kelas ON enrollment_manual_log(kelas_id);
CREATE UNIQUE INDEX idx_enrollment_manual_log_request
    ON enrollment_manual_log(request_id) WHERE request_id IS NOT NULL;

-- RLS wajib aktif di semua tabel (CLAUDE.md) — tanpa policy: cuma service_role.
ALTER TABLE enrollment_manual_log ENABLE ROW LEVEL SECURITY;

-- ---- 3. Daftarkan siswa manual (SATU transaksi) ----------------------------
-- enrollment 'lunas' (sumber='manual') + enrollment_subtes + sesi_kelas
-- 1..jumlah_sesi + log. Gagal di langkah mana pun = semuanya batal.
-- Baris kelas dikunci FOR NO KEY UPDATE supaya dua pendaftaran manual
-- bersamaan ke kelas yang sama bergantian (kunci ini bentrok dengan dirinya
-- sendiri) dan tidak bisa sama-sama lolos cek kapasitas — hitungan 'lunas'
-- dibaca SETELAH kunci didapat (READ COMMITTED: snapshot baru per statement,
-- jadi pemanggil kedua melihat enrollment pemanggil pertama). Sengaja bukan
-- FOR UPDATE: FOR NO KEY UPDATE tidak menahan FOR KEY SHARE yang dipakai cek
-- FK saat checkout/webhook menulis enrollments ke kelas ini.
--
-- sesi_kelas dibentuk SAMA PERSIS dengan lib/absensi/generateSesiKelas.ts
-- (enrollment_id, nomor_sesi 1..N, kolom lain default) — diulang di SQL
-- karena helper JS tidak bisa ikut transaksi ini.
--
-- Validasi peran (siswa aktif, mentor offline layak, pool subtes) dilakukan
-- di app/api/admin/enrollment-manual; di sini lapis terakhir yang menyangkut
-- integritas data (duplikat, kapasitas, idempotensi).
--
-- Checkout yang masih MENUNGGU bayar (payments 'menunggu', link belum
-- kedaluwarsa) untuk siswa+kelas yang sama juga ditolak: kalau siswa tetap
-- membayar link itu, webhook akan menimpa baris manual ini dan siswa membayar
-- dua kali. payments tidak punya kolom kedaluwarsa — batasnya dibuat_pada +
-- p_payment_kedaluwarsa_jam (dikirim API dari PAYMENT_EXPIRY_HOURS,
-- lib/payment/mayarLogic.ts). payments HANYA dibaca, tidak pernah diubah.
--
-- Idempotensi request_id: dikunci dengan pg_advisory_xact_lock (per
-- request_id, lepas otomatis di akhir transaksi) SEBELUM kunci kelas, supaya
-- request_id yang sama untuk kelas BERBEDA juga bergantian. request_id yang
-- sudah tercatat untuk siswa+kelas yang sama -> 'sudah_diproses'; untuk
-- siswa/kelas lain -> 'request_id_bentrok' (bukan error UNIQUE / HTTP 500).
-- Urutan kunci selalu request_id lalu kelas, jadi tidak ada deadlock.
--
-- status hasil: 'dibuat' | 'sudah_diproses' (request_id sama) | 'duplikat'
-- | 'payment_menunggu' | 'penuh' | 'kelas_tidak_ada' | 'mentor_sama_dengan_siswa'
-- | 'request_id_bentrok'.
CREATE OR REPLACE FUNCTION daftar_siswa_manual(
    p_admin_id UUID,
    p_siswa_id UUID,
    p_kelas_id UUID,
    p_subtes_ids UUID[],
    p_mentor_offline_id UUID,
    p_lokasi_lat DECIMAL,
    p_lokasi_lng DECIMAL,
    p_metode TEXT,
    p_nominal INTEGER,
    p_alasan TEXT,
    p_request_id UUID,
    p_payment_kedaluwarsa_jam INTEGER
) RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_kelas kelas%ROWTYPE;
    v_existing enrollments%ROWTYPE;
    v_log enrollment_manual_log%ROWTYPE;
    v_lunas INT;
    v_enrollment enrollments%ROWTYPE;
    v_subtes UUID[] := coalesce(p_subtes_ids, ARRAY[]::UUID[]);
BEGIN
    -- Akun multi-role (Student + Mentor) tidak boleh jadi mentor dirinya sendiri.
    IF p_mentor_offline_id IS NOT NULL AND p_mentor_offline_id = p_siswa_id THEN
        RETURN jsonb_build_object('status', 'mentor_sama_dengan_siswa');
    END IF;

    -- Idempotensi — dicek SETELAH kunci request_id supaya permintaan kembar
    -- yang menunggu kunci melihat log milik permintaan pertama.
    IF p_request_id IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(hashtextextended('daftar_siswa_manual:' || p_request_id::text, 0));
        SELECT * INTO v_log FROM enrollment_manual_log WHERE request_id = p_request_id;
        IF FOUND THEN
            IF v_log.siswa_id IS NOT DISTINCT FROM p_siswa_id AND v_log.kelas_id IS NOT DISTINCT FROM p_kelas_id THEN
                RETURN jsonb_build_object('status', 'sudah_diproses', 'enrollment_id', v_log.enrollment_id);
            END IF;
            RETURN jsonb_build_object('status', 'request_id_bentrok');
        END IF;
    END IF;

    SELECT * INTO v_kelas FROM kelas WHERE id = p_kelas_id FOR NO KEY UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'kelas_tidak_ada');
    END IF;

    SELECT * INTO v_existing FROM enrollments
    WHERE user_id = p_siswa_id AND kelas_id = p_kelas_id;
    IF FOUND THEN
        RETURN jsonb_build_object(
            'status', 'duplikat',
            'enrollment_id', v_existing.id,
            'status_pembayaran', v_existing.status_pembayaran
        );
    END IF;

    IF EXISTS (
        SELECT 1 FROM payments
        WHERE user_id = p_siswa_id
          AND item_type = 'kelas'
          AND item_id = p_kelas_id
          AND status = 'menunggu'
          -- NULL = fail-closed: semua payment 'menunggu' dianggap masih berlaku.
          AND (p_payment_kedaluwarsa_jam IS NULL
               OR dibuat_pada > now() - make_interval(hours => p_payment_kedaluwarsa_jam))
    ) THEN
        RETURN jsonb_build_object('status', 'payment_menunggu');
    END IF;

    SELECT count(*) INTO v_lunas FROM enrollments
    WHERE kelas_id = p_kelas_id AND status_pembayaran = 'lunas';
    IF v_lunas >= v_kelas.kapasitas THEN
        RETURN jsonb_build_object('status', 'penuh', 'kapasitas', v_kelas.kapasitas, 'terisi', v_lunas);
    END IF;

    BEGIN
        INSERT INTO enrollments (
            user_id, kelas_id, status_pembayaran, sumber, nominal_dibayar, dibuat_oleh,
            mentor_offline_id, lokasi_siswa_lat, lokasi_siswa_lng
        )
        VALUES (
            p_siswa_id, p_kelas_id, 'lunas', 'manual', p_nominal, p_admin_id,
            p_mentor_offline_id, p_lokasi_lat, p_lokasi_lng
        )
        RETURNING * INTO v_enrollment;
    EXCEPTION WHEN unique_violation THEN
        -- Checkout siswa yang lunas di detik yang sama (webhook tidak mengunci kelas).
        RETURN jsonb_build_object('status', 'duplikat');
    END;

    INSERT INTO enrollment_subtes (enrollment_id, subtes_id)
    SELECT v_enrollment.id, s FROM unnest(v_subtes) AS s
    ON CONFLICT DO NOTHING;

    IF v_kelas.jumlah_sesi > 0 THEN
        INSERT INTO sesi_kelas (enrollment_id, nomor_sesi)
        SELECT v_enrollment.id, n FROM generate_series(1, v_kelas.jumlah_sesi) AS n;
    END IF;

    INSERT INTO enrollment_manual_log (
        admin_id, aksi, enrollment_id, kelas_id, siswa_id,
        metode_pembayaran, nominal, alasan, snapshot, request_id
    )
    VALUES (
        p_admin_id, 'daftar_siswa', v_enrollment.id, p_kelas_id, p_siswa_id,
        p_metode, p_nominal, btrim(p_alasan),
        jsonb_build_object(
            -- TANPA lokasi siswa: log ini permanen (bertahan walau akun dihapus),
            -- koordinat anak tidak boleh ikut tersimpan di sini.
            'enrollment', to_jsonb(v_enrollment) - 'lokasi_siswa_lat' - 'lokasi_siswa_lng',
            'subtes_ids', to_jsonb(v_subtes),
            'jumlah_sesi', v_kelas.jumlah_sesi,
            'kelas', jsonb_build_object(
                'nama', v_kelas.nama,
                'harga', v_kelas.harga,
                'kapasitas', v_kelas.kapasitas,
                'terisi_sebelum', v_lunas
            )
        ),
        p_request_id
    );

    RETURN jsonb_build_object(
        'status', 'dibuat',
        'enrollment_id', v_enrollment.id,
        'jumlah_sesi', v_kelas.jumlah_sesi
    );
END $$;

REVOKE ALL ON FUNCTION daftar_siswa_manual(UUID, UUID, UUID, UUID[], UUID, DECIMAL, DECIMAL, TEXT, INTEGER, TEXT, UUID, INTEGER)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION daftar_siswa_manual(UUID, UUID, UUID, UUID[], UUID, DECIMAL, DECIMAL, TEXT, INTEGER, TEXT, UUID, INTEGER)
    TO service_role;

-- ---- 4. Ubah mentor offline satu enrollment (SATU transaksi) ---------------
-- Enrollment dikunci FOR UPDATE. Mentor baru wajib role mentor 'active' dan
-- bisa_offline (kecocokan mapel dicek di API). Sesi yang sudah ditandai mentor
-- lama TIDAK diubah (sesi_kelas.mentor_id tetap mencatat siapa yang mengajar).
--
-- status hasil: 'diubah' | 'tidak_ditemukan' | 'bukan_offline' | 'belum_lunas'
-- | 'sama' | 'mentor_tidak_valid' | 'mentor_sama_dengan_siswa'.
CREATE OR REPLACE FUNCTION ubah_mentor_offline_manual(
    p_admin_id UUID,
    p_enrollment_id UUID,
    p_mentor_baru UUID,
    p_alasan TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_enrollment enrollments%ROWTYPE;
    v_mode mode_pembelajaran;
BEGIN
    SELECT * INTO v_enrollment FROM enrollments WHERE id = p_enrollment_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'tidak_ditemukan');
    END IF;

    SELECT mode_pembelajaran INTO v_mode FROM kelas WHERE id = v_enrollment.kelas_id;
    IF v_mode IS DISTINCT FROM 'offline' THEN
        RETURN jsonb_build_object('status', 'bukan_offline');
    END IF;
    IF v_enrollment.status_pembayaran <> 'lunas' THEN
        RETURN jsonb_build_object('status', 'belum_lunas');
    END IF;
    IF p_mentor_baru = v_enrollment.user_id THEN
        RETURN jsonb_build_object('status', 'mentor_sama_dengan_siswa');
    END IF;
    IF v_enrollment.mentor_offline_id IS NOT DISTINCT FROM p_mentor_baru THEN
        RETURN jsonb_build_object('status', 'sama');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM user_roles ur
        JOIN mentor_profiles mp ON mp.user_id = ur.user_id
        WHERE ur.user_id = p_mentor_baru
          AND ur.role_type = 'mentor' AND ur.status = 'active'
          AND mp.bisa_offline = true
    ) THEN
        RETURN jsonb_build_object('status', 'mentor_tidak_valid');
    END IF;

    UPDATE enrollments SET mentor_offline_id = p_mentor_baru WHERE id = p_enrollment_id;

    INSERT INTO enrollment_manual_log (
        admin_id, aksi, enrollment_id, kelas_id, siswa_id, alasan, snapshot
    )
    VALUES (
        p_admin_id, 'tugaskan_mentor', p_enrollment_id, v_enrollment.kelas_id, v_enrollment.user_id,
        btrim(p_alasan),
        jsonb_build_object(
            'mentor_offline_id_lama', v_enrollment.mentor_offline_id,
            'mentor_offline_id_baru', p_mentor_baru
        )
    );

    RETURN jsonb_build_object(
        'status', 'diubah',
        'mentor_lama', v_enrollment.mentor_offline_id,
        'kelas_id', v_enrollment.kelas_id,
        'siswa_id', v_enrollment.user_id
    );
END $$;

REVOKE ALL ON FUNCTION ubah_mentor_offline_manual(UUID, UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ubah_mentor_offline_manual(UUID, UUID, UUID, TEXT) TO service_role;

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

-- Lead Capture tahap 1 (BARU, Oktober 2026 — PRD 7.4.6 / BR-38, migration
-- db/add_leads.sql). Nomor WhatsApp pengunjung Assessment gratis yang setuju
-- dihubungi. Kolom utm_* assessments ada di CREATE TABLE assessments di atas.
-- ---- leads -------------------------------------------------------------------
CREATE TABLE leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    no_wa VARCHAR(20) NOT NULL UNIQUE,              -- selalu 628xxxxxxxxx (lib/shared/noWa.ts)
    nama VARCHAR(100),                              -- opsional, diisi pengunjung sendiri
    sumber TEXT NOT NULL,
    -- SET NULL: lead tetap ada walau assessment/akun dihapus.
    assessment_id UUID REFERENCES assessments(id) ON DELETE SET NULL,
    anonymous_trial_id UUID,                        -- cookie dm_trial_id saat submit (tamu)
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    -- Atribusi first-touch (cookie dm_attr) dari submit PERTAMA — tidak ditimpa.
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_content TEXT,
    fbclid TEXT,
    -- Persetujuan dihubungi via WhatsApp (BR-38): wajib true, versi teks dari server.
    consent_wa BOOLEAN NOT NULL,
    consent_versi TEXT NOT NULL,
    consent_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'baru',
    catatan TEXT,
    jumlah_submit INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE leads ADD CONSTRAINT leads_no_wa_format CHECK (no_wa ~ '^628[0-9]{8,12}$');
ALTER TABLE leads ADD CONSTRAINT leads_sumber_valid CHECK (sumber IN ('assessment_snbp'));
ALTER TABLE leads ADD CONSTRAINT leads_consent_wa_wajib CHECK (consent_wa = true);
ALTER TABLE leads ADD CONSTRAINT leads_status_valid
    CHECK (status IN ('baru', 'dihubungi', 'daftar', 'tidak_tertarik'));
ALTER TABLE leads ADD CONSTRAINT leads_jumlah_submit_positif CHECK (jumlah_submit >= 1);

CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX idx_leads_utm_campaign ON leads(utm_campaign) WHERE utm_campaign IS NOT NULL;
CREATE INDEX idx_leads_assessment ON leads(assessment_id) WHERE assessment_id IS NOT NULL;

-- ---- Audit perubahan status lead ---------------------------------------------
CREATE TABLE lead_status_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
    status_lama TEXT NOT NULL,
    status_baru TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_status_log_lead ON lead_status_log(lead_id, created_at DESC);

-- ---- Rate limit POST /api/leads -----------------------------------------
-- kunci: 'trial:<uuid>' atau 'ip:<hmac-sha256>' — IP mentah tidak disimpan.
-- Baris > 1 hari dibersihkan oleh aplikasi saat ada percobaan baru.
CREATE TABLE lead_rate_limit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kunci TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_rate_limit_kunci ON lead_rate_limit(kunci, created_at DESC);

-- RLS wajib aktif di semua tabel (CLAUDE.md) — tanpa policy: cuma service_role.
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_status_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_rate_limit ENABLE ROW LEVEL SECURITY;

-- ---- simpan_lead: insert-or-update atomik --------------------------------
-- Nomor baru  -> baris baru (consent_at = now()).
-- Nomor lama  -> jumlah_submit + 1, updated_at = now(), assessment_id terbaru
--                (kalau dikirim). UTM, fbclid, consent, sumber, status TIDAK
--                diubah. nama / user_id / anonymous_trial_id cuma diisi kalau
--                sebelumnya kosong.
-- Mengembalikan {"baru": true|false}; aplikasi TIDAK meneruskannya ke klien.
CREATE OR REPLACE FUNCTION simpan_lead(
    p_no_wa TEXT,
    p_nama TEXT,
    p_sumber TEXT,
    p_assessment_id UUID,
    p_anonymous_trial_id UUID,
    p_user_id UUID,
    p_utm_source TEXT,
    p_utm_medium TEXT,
    p_utm_campaign TEXT,
    p_utm_content TEXT,
    p_fbclid TEXT,
    p_consent_versi TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_baru BOOLEAN;
BEGIN
    INSERT INTO leads (
        no_wa, nama, sumber, assessment_id, anonymous_trial_id, user_id,
        utm_source, utm_medium, utm_campaign, utm_content, fbclid,
        consent_wa, consent_versi, consent_at
    ) VALUES (
        p_no_wa, NULLIF(btrim(p_nama), ''), p_sumber, p_assessment_id, p_anonymous_trial_id, p_user_id,
        p_utm_source, p_utm_medium, p_utm_campaign, p_utm_content, p_fbclid,
        true, p_consent_versi, now()
    )
    ON CONFLICT (no_wa) DO UPDATE SET
        assessment_id      = COALESCE(EXCLUDED.assessment_id, leads.assessment_id),
        nama               = COALESCE(leads.nama, EXCLUDED.nama),
        user_id            = COALESCE(leads.user_id, EXCLUDED.user_id),
        anonymous_trial_id = COALESCE(leads.anonymous_trial_id, EXCLUDED.anonymous_trial_id),
        jumlah_submit      = leads.jumlah_submit + 1,
        updated_at         = now()
    RETURNING (xmax = 0) INTO v_baru;

    RETURN jsonb_build_object('baru', v_baru);
END;
$$;

REVOKE ALL ON FUNCTION simpan_lead(TEXT, TEXT, TEXT, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION simpan_lead(TEXT, TEXT, TEXT, UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
    TO service_role;

-- ============================================================================
-- STUDIO SOAL SNBT TAHAP 1 (PRD 7.7 revisi, BR-37, Bagian 13)
-- ============================================================================
-- Disalin APA ADANYA dari db/add_studio_soal.sql (sumber utama — ubah di sana
-- dulu, lalu salin ulang ke sini). Desain: docs/design/studio-soal-snbt-tahap1.md.

-- ============================================================================
-- 1. TABEL
-- ============================================================================

-- Topik/bab per subtes — opsional dipakai di soal. Nama unik per subtes
-- (tanpa membedakan huruf besar-kecil & spasi tepi).
CREATE TABLE IF NOT EXISTS soal_topik (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subtes_id UUID NOT NULL REFERENCES subtes(id),
    nama VARCHAR(100) NOT NULL,
    dibuat_oleh_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Stimulus (bacaan/tabel; gambar menyusul di PR 7) yang dipakai banyak soal.
-- Satu baris = satu VERSI; keluarga_id sama untuk semua versi.
CREATE TABLE IF NOT EXISTS soal_stimulus (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    keluarga_id UUID NOT NULL DEFAULT gen_random_uuid(),
    versi INT NOT NULL DEFAULT 1,
    menggantikan_id UUID REFERENCES soal_stimulus(id),
    subtes_id UUID NOT NULL REFERENCES subtes(id),
    judul_internal VARCHAR(150) NOT NULL,             -- hanya untuk mentor, tidak tampil ke siswa
    konten JSONB NOT NULL DEFAULT '{"v": 1, "blok": []}'::jsonb,
    sumber_rujukan TEXT NOT NULL DEFAULT '',          -- WAJIB saat diajukan: "Buatan sendiri" / nama sumber (BR-18)
    status TEXT NOT NULL DEFAULT 'draf',
    penulis_id UUID NOT NULL REFERENCES users(id),
    peninjau_id UUID REFERENCES users(id),
    diajukan_pada TIMESTAMPTZ,
    ditinjau_pada TIMESTAMPTZ,
    alasan_tolak TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bank soal. Satu baris = satu VERSI soal. `konten` = bagian yang boleh dilihat
-- siswa; `kunci` = RAHASIA (Tahap 2: API siswa tidak pernah memilih kolom ini).
CREATE TABLE IF NOT EXISTS soal_bank (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    keluarga_id UUID NOT NULL DEFAULT gen_random_uuid(),
    versi INT NOT NULL DEFAULT 1,
    menggantikan_id UUID REFERENCES soal_bank(id),
    subtes_id UUID NOT NULL REFERENCES subtes(id),
    topik_id UUID REFERENCES soal_topik(id) ON DELETE SET NULL,
    stimulus_id UUID REFERENCES soal_stimulus(id),    -- NULL = soal mandiri
    urutan_dalam_stimulus SMALLINT,
    tipe TEXT NOT NULL,                               -- pilihan_ganda | majemuk_kompleks | isian
    redaksi TEXT NOT NULL DEFAULT '',
    konten JSONB NOT NULL DEFAULT '{"v": 1}'::jsonb,
    kunci JSONB NOT NULL DEFAULT '{"v": 1}'::jsonb,
    pembahasan TEXT NOT NULL DEFAULT '',
    sumber_rujukan TEXT,                              -- opsional untuk soal (K4)
    tingkat_kesulitan TEXT NOT NULL DEFAULT 'sedang',
    level_kognitif SMALLINT,                          -- TKA 1/2/3, opsional, tidak tampil di UI Tahap 1
    estimasi_waktu_detik INT,
    aturan_skor TEXT NOT NULL DEFAULT 'semua_benar',  -- diperluas nanti (skor parsial) cukup lewat CHECK
    bobot NUMERIC(5,2) NOT NULL DEFAULT 1,
    sumber TEXT NOT NULL DEFAULT 'manual',            -- diperluas nanti ('ai') cukup lewat CHECK
    status TEXT NOT NULL DEFAULT 'draf',
    penulis_id UUID NOT NULL REFERENCES users(id),
    peninjau_id UUID REFERENCES users(id),
    diajukan_pada TIMESTAMPTZ,
    ditinjau_pada TIMESTAMPTZ,
    alasan_tolak TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Paket = kumpulan soal berurutan (satu subtes). Satu baris = satu VERSI paket.
CREATE TABLE IF NOT EXISTS paket_soal (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    keluarga_id UUID NOT NULL DEFAULT gen_random_uuid(),
    versi INT NOT NULL DEFAULT 1,
    menggantikan_id UUID REFERENCES paket_soal(id),
    subtes_id UUID NOT NULL REFERENCES subtes(id),
    judul VARCHAR(150) NOT NULL,
    deskripsi TEXT,
    durasi_menit SMALLINT,                            -- opsional
    status TEXT NOT NULL DEFAULT 'draf',
    pembuat_id UUID NOT NULL REFERENCES users(id),
    dipublikasikan_pada TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Isi paket. Menunjuk VERSI soal spesifik (paket terbit tetap memakai versi
-- lama walau soalnya punya versi baru).
CREATE TABLE IF NOT EXISTS paket_soal_item (
    paket_id UUID NOT NULL REFERENCES paket_soal(id) ON DELETE CASCADE,
    soal_id UUID NOT NULL REFERENCES soal_bank(id) ON DELETE RESTRICT,
    urutan SMALLINT NOT NULL,
    PRIMARY KEY (paket_id, soal_id)
);

-- Log audit semua aksi tinjau/publikasi. Tanpa FK ke objek supaya log tetap
-- ada walau objeknya dihapus (draf yang pernah diajukan memang tidak bisa
-- dihapus, lihat trigger).
CREATE TABLE IF NOT EXISTS soal_tinjauan_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    objek_jenis TEXT NOT NULL,
    objek_id UUID NOT NULL,
    aktor_id UUID NOT NULL REFERENCES users(id),
    peran TEXT NOT NULL,
    aksi TEXT NOT NULL,
    alasan TEXT,
    jumlah_peninjau_eligible INT,                     -- diisi untuk ajukan & publikasi_admin
    snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 2. CONSTRAINT
-- ============================================================================
-- Panjang teks: Postgres length() pada UTF-8 menghitung karakter (code point)
-- = [...str].length di JS (lib/shared/studio-soal). Trim memakai spasi, tab,
-- CR, LF.
--
-- Kelengkapan isi (5 opsi, kunci, 2–6 pernyataan, 1–5 rumpang, pembahasan,
-- sumber rujukan stimulus) hanya DIWAJIBKAN untuk status yang sudah melewati
-- pengajuan (diajukan/terpublikasi/digantikan) — draf, ditolak, diarsipkan
-- boleh belum lengkap. Validasi lengkap ada di validator aplikasi
-- (lib/shared/studio-soal/validasiSoal.ts); CHECK di sini jaring pengaman.
-- CASE dipakai supaya jsonb_array_length tidak pernah dipanggil pada non-array.

-- ---- soal_topik ----
ALTER TABLE soal_topik DROP CONSTRAINT IF EXISTS soal_topik_nama_valid;
ALTER TABLE soal_topik ADD CONSTRAINT soal_topik_nama_valid
    CHECK (length(btrim(nama, E' \t\r\n')) BETWEEN 2 AND 100);

-- ---- soal_stimulus ----
ALTER TABLE soal_stimulus DROP CONSTRAINT IF EXISTS soal_stimulus_keluarga_versi_unik;
ALTER TABLE soal_stimulus ADD CONSTRAINT soal_stimulus_keluarga_versi_unik UNIQUE (keluarga_id, versi);

ALTER TABLE soal_stimulus DROP CONSTRAINT IF EXISTS soal_stimulus_versi_valid;
ALTER TABLE soal_stimulus ADD CONSTRAINT soal_stimulus_versi_valid
    CHECK (versi >= 1 AND (versi = 1) = (menggantikan_id IS NULL));

ALTER TABLE soal_stimulus DROP CONSTRAINT IF EXISTS soal_stimulus_status_valid;
ALTER TABLE soal_stimulus ADD CONSTRAINT soal_stimulus_status_valid
    CHECK (status IN ('draf', 'diajukan', 'terpublikasi', 'ditolak', 'digantikan', 'diarsipkan'));

ALTER TABLE soal_stimulus DROP CONSTRAINT IF EXISTS soal_stimulus_judul_valid;
ALTER TABLE soal_stimulus ADD CONSTRAINT soal_stimulus_judul_valid
    CHECK (length(btrim(judul_internal, E' \t\r\n')) BETWEEN 3 AND 150);

ALTER TABLE soal_stimulus DROP CONSTRAINT IF EXISTS soal_stimulus_sumber_rujukan_valid;
ALTER TABLE soal_stimulus ADD CONSTRAINT soal_stimulus_sumber_rujukan_valid
    CHECK (length(sumber_rujukan) <= 300
           AND (status NOT IN ('diajukan', 'terpublikasi', 'digantikan') OR length(btrim(sumber_rujukan, E' \t\r\n')) >= 3));

ALTER TABLE soal_stimulus DROP CONSTRAINT IF EXISTS soal_stimulus_konten_bentuk;
ALTER TABLE soal_stimulus ADD CONSTRAINT soal_stimulus_konten_bentuk
    CHECK (CASE WHEN jsonb_typeof(konten) = 'object' AND jsonb_typeof(konten->'blok') = 'array'
                THEN jsonb_array_length(konten->'blok') <= 20
                     AND (status NOT IN ('diajukan', 'terpublikasi', 'digantikan') OR jsonb_array_length(konten->'blok') >= 1)
                ELSE false END);

ALTER TABLE soal_stimulus DROP CONSTRAINT IF EXISTS soal_stimulus_alasan_tolak;
ALTER TABLE soal_stimulus ADD CONSTRAINT soal_stimulus_alasan_tolak
    CHECK (status <> 'ditolak' OR length(btrim(coalesce(alasan_tolak, ''), E' \t\r\n')) >= 10);

ALTER TABLE soal_stimulus DROP CONSTRAINT IF EXISTS soal_stimulus_diajukan_valid;
ALTER TABLE soal_stimulus ADD CONSTRAINT soal_stimulus_diajukan_valid
    CHECK (status <> 'diajukan' OR diajukan_pada IS NOT NULL);

ALTER TABLE soal_stimulus DROP CONSTRAINT IF EXISTS soal_stimulus_peninjau_bukan_penulis;
ALTER TABLE soal_stimulus ADD CONSTRAINT soal_stimulus_peninjau_bukan_penulis
    CHECK (peninjau_id IS NULL OR peninjau_id <> penulis_id);

ALTER TABLE soal_stimulus DROP CONSTRAINT IF EXISTS soal_stimulus_terbit_ditinjau;
ALTER TABLE soal_stimulus ADD CONSTRAINT soal_stimulus_terbit_ditinjau
    CHECK (status NOT IN ('terpublikasi', 'digantikan') OR (peninjau_id IS NOT NULL AND ditinjau_pada IS NOT NULL));

-- ---- soal_bank ----
ALTER TABLE soal_bank DROP CONSTRAINT IF EXISTS soal_bank_keluarga_versi_unik;
ALTER TABLE soal_bank ADD CONSTRAINT soal_bank_keluarga_versi_unik UNIQUE (keluarga_id, versi);

ALTER TABLE soal_bank DROP CONSTRAINT IF EXISTS soal_bank_versi_valid;
ALTER TABLE soal_bank ADD CONSTRAINT soal_bank_versi_valid
    CHECK (versi >= 1 AND (versi = 1) = (menggantikan_id IS NULL));

ALTER TABLE soal_bank DROP CONSTRAINT IF EXISTS soal_bank_status_valid;
ALTER TABLE soal_bank ADD CONSTRAINT soal_bank_status_valid
    CHECK (status IN ('draf', 'diajukan', 'terpublikasi', 'ditolak', 'digantikan', 'diarsipkan'));

ALTER TABLE soal_bank DROP CONSTRAINT IF EXISTS soal_bank_tipe_valid;
ALTER TABLE soal_bank ADD CONSTRAINT soal_bank_tipe_valid
    CHECK (tipe IN ('pilihan_ganda', 'majemuk_kompleks', 'isian'));

ALTER TABLE soal_bank DROP CONSTRAINT IF EXISTS soal_bank_kesulitan_valid;
ALTER TABLE soal_bank ADD CONSTRAINT soal_bank_kesulitan_valid
    CHECK (tingkat_kesulitan IN ('mudah', 'sedang', 'hots'));

ALTER TABLE soal_bank DROP CONSTRAINT IF EXISTS soal_bank_level_kognitif_valid;
ALTER TABLE soal_bank ADD CONSTRAINT soal_bank_level_kognitif_valid
    CHECK (level_kognitif IS NULL OR level_kognitif BETWEEN 1 AND 3);

ALTER TABLE soal_bank DROP CONSTRAINT IF EXISTS soal_bank_estimasi_valid;
ALTER TABLE soal_bank ADD CONSTRAINT soal_bank_estimasi_valid
    CHECK (estimasi_waktu_detik IS NULL OR estimasi_waktu_detik BETWEEN 10 AND 1800);

ALTER TABLE soal_bank DROP CONSTRAINT IF EXISTS soal_bank_aturan_skor_valid;
ALTER TABLE soal_bank ADD CONSTRAINT soal_bank_aturan_skor_valid
    CHECK (aturan_skor IN ('semua_benar'));

ALTER TABLE soal_bank DROP CONSTRAINT IF EXISTS soal_bank_bobot_valid;
ALTER TABLE soal_bank ADD CONSTRAINT soal_bank_bobot_valid CHECK (bobot > 0);

ALTER TABLE soal_bank DROP CONSTRAINT IF EXISTS soal_bank_sumber_valid;
ALTER TABLE soal_bank ADD CONSTRAINT soal_bank_sumber_valid CHECK (sumber IN ('manual'));

ALTER TABLE soal_bank DROP CONSTRAINT IF EXISTS soal_bank_sumber_rujukan_valid;
ALTER TABLE soal_bank ADD CONSTRAINT soal_bank_sumber_rujukan_valid
    CHECK (sumber_rujukan IS NULL OR length(sumber_rujukan) <= 300);

ALTER TABLE soal_bank DROP CONSTRAINT IF EXISTS soal_bank_redaksi_valid;
ALTER TABLE soal_bank ADD CONSTRAINT soal_bank_redaksi_valid
    CHECK (length(redaksi) <= 5000
           AND (status NOT IN ('diajukan', 'terpublikasi', 'digantikan') OR length(btrim(redaksi, E' \t\r\n')) >= 1));

ALTER TABLE soal_bank DROP CONSTRAINT IF EXISTS soal_bank_pembahasan_valid;
ALTER TABLE soal_bank ADD CONSTRAINT soal_bank_pembahasan_valid
    CHECK (length(pembahasan) <= 10000
           AND (status NOT IN ('diajukan', 'terpublikasi', 'digantikan') OR length(btrim(pembahasan, E' \t\r\n')) >= 10));

ALTER TABLE soal_bank DROP CONSTRAINT IF EXISTS soal_bank_stimulus_urutan;
ALTER TABLE soal_bank ADD CONSTRAINT soal_bank_stimulus_urutan
    CHECK ((stimulus_id IS NULL) = (urutan_dalam_stimulus IS NULL)
           AND (urutan_dalam_stimulus IS NULL OR urutan_dalam_stimulus BETWEEN 1 AND 50));

ALTER TABLE soal_bank DROP CONSTRAINT IF EXISTS soal_bank_json_objek;
ALTER TABLE soal_bank ADD CONSTRAINT soal_bank_json_objek
    CHECK (jsonb_typeof(konten) = 'object' AND jsonb_typeof(kunci) = 'object');

ALTER TABLE soal_bank DROP CONSTRAINT IF EXISTS soal_bank_bentuk_pg;
ALTER TABLE soal_bank ADD CONSTRAINT soal_bank_bentuk_pg
    CHECK (tipe <> 'pilihan_ganda' OR status NOT IN ('diajukan', 'terpublikasi', 'digantikan') OR (
        CASE WHEN jsonb_typeof(konten->'opsi') = 'array'
             THEN jsonb_array_length(konten->'opsi') = 5
                  AND coalesce(kunci->>'opsi', '') IN ('A', 'B', 'C', 'D', 'E')
             ELSE false END));

ALTER TABLE soal_bank DROP CONSTRAINT IF EXISTS soal_bank_bentuk_majemuk;
ALTER TABLE soal_bank ADD CONSTRAINT soal_bank_bentuk_majemuk
    CHECK (tipe <> 'majemuk_kompleks' OR status NOT IN ('diajukan', 'terpublikasi', 'digantikan') OR (
        CASE WHEN jsonb_typeof(konten->'label_kolom') = 'array'
                  AND jsonb_typeof(konten->'pernyataan') = 'array'
                  AND jsonb_typeof(kunci->'per_baris') = 'object'
             THEN jsonb_array_length(konten->'label_kolom') = 2
                  AND length(btrim(coalesce(konten->'label_kolom'->>0, ''), E' \t\r\n')) > 0
                  AND length(btrim(coalesce(konten->'label_kolom'->>1, ''), E' \t\r\n')) > 0
                  AND jsonb_array_length(konten->'pernyataan') BETWEEN 2 AND 6
             ELSE false END));

ALTER TABLE soal_bank DROP CONSTRAINT IF EXISTS soal_bank_bentuk_isian;
ALTER TABLE soal_bank ADD CONSTRAINT soal_bank_bentuk_isian
    CHECK (tipe <> 'isian' OR status NOT IN ('diajukan', 'terpublikasi', 'digantikan') OR (
        CASE WHEN jsonb_typeof(konten->'rumpang') = 'array' AND jsonb_typeof(kunci->'rumpang') = 'object'
             THEN jsonb_array_length(konten->'rumpang') BETWEEN 1 AND 5
             ELSE false END));

ALTER TABLE soal_bank DROP CONSTRAINT IF EXISTS soal_bank_alasan_tolak;
ALTER TABLE soal_bank ADD CONSTRAINT soal_bank_alasan_tolak
    CHECK (status <> 'ditolak' OR length(btrim(coalesce(alasan_tolak, ''), E' \t\r\n')) >= 10);

ALTER TABLE soal_bank DROP CONSTRAINT IF EXISTS soal_bank_diajukan_valid;
ALTER TABLE soal_bank ADD CONSTRAINT soal_bank_diajukan_valid
    CHECK (status <> 'diajukan' OR diajukan_pada IS NOT NULL);

ALTER TABLE soal_bank DROP CONSTRAINT IF EXISTS soal_bank_peninjau_bukan_penulis;
ALTER TABLE soal_bank ADD CONSTRAINT soal_bank_peninjau_bukan_penulis
    CHECK (peninjau_id IS NULL OR peninjau_id <> penulis_id);

ALTER TABLE soal_bank DROP CONSTRAINT IF EXISTS soal_bank_terbit_ditinjau;
ALTER TABLE soal_bank ADD CONSTRAINT soal_bank_terbit_ditinjau
    CHECK (status NOT IN ('terpublikasi', 'digantikan') OR (peninjau_id IS NOT NULL AND ditinjau_pada IS NOT NULL));

-- ---- paket_soal ----
ALTER TABLE paket_soal DROP CONSTRAINT IF EXISTS paket_soal_keluarga_versi_unik;
ALTER TABLE paket_soal ADD CONSTRAINT paket_soal_keluarga_versi_unik UNIQUE (keluarga_id, versi);

ALTER TABLE paket_soal DROP CONSTRAINT IF EXISTS paket_soal_versi_valid;
ALTER TABLE paket_soal ADD CONSTRAINT paket_soal_versi_valid
    CHECK (versi >= 1 AND (versi = 1) = (menggantikan_id IS NULL));

ALTER TABLE paket_soal DROP CONSTRAINT IF EXISTS paket_soal_status_valid;
ALTER TABLE paket_soal ADD CONSTRAINT paket_soal_status_valid
    CHECK (status IN ('draf', 'menunggu_soal', 'terpublikasi', 'digantikan', 'diarsipkan'));

ALTER TABLE paket_soal DROP CONSTRAINT IF EXISTS paket_soal_judul_valid;
ALTER TABLE paket_soal ADD CONSTRAINT paket_soal_judul_valid
    CHECK (length(btrim(judul, E' \t\r\n')) BETWEEN 3 AND 150);

ALTER TABLE paket_soal DROP CONSTRAINT IF EXISTS paket_soal_deskripsi_valid;
ALTER TABLE paket_soal ADD CONSTRAINT paket_soal_deskripsi_valid
    CHECK (deskripsi IS NULL OR length(deskripsi) <= 500);

ALTER TABLE paket_soal DROP CONSTRAINT IF EXISTS paket_soal_durasi_valid;
ALTER TABLE paket_soal ADD CONSTRAINT paket_soal_durasi_valid
    CHECK (durasi_menit IS NULL OR durasi_menit BETWEEN 1 AND 300);

ALTER TABLE paket_soal DROP CONSTRAINT IF EXISTS paket_soal_terbit_valid;
ALTER TABLE paket_soal ADD CONSTRAINT paket_soal_terbit_valid
    CHECK (status NOT IN ('terpublikasi', 'digantikan') OR dipublikasikan_pada IS NOT NULL);

-- ---- paket_soal_item ----
ALTER TABLE paket_soal_item DROP CONSTRAINT IF EXISTS paket_soal_item_urutan_valid;
ALTER TABLE paket_soal_item ADD CONSTRAINT paket_soal_item_urutan_valid
    CHECK (urutan BETWEEN 1 AND 100);

ALTER TABLE paket_soal_item DROP CONSTRAINT IF EXISTS paket_soal_item_urutan_unik;
ALTER TABLE paket_soal_item ADD CONSTRAINT paket_soal_item_urutan_unik
    UNIQUE (paket_id, urutan) DEFERRABLE INITIALLY DEFERRED;

-- ---- soal_tinjauan_log ----
ALTER TABLE soal_tinjauan_log DROP CONSTRAINT IF EXISTS soal_tinjauan_log_objek_valid;
ALTER TABLE soal_tinjauan_log ADD CONSTRAINT soal_tinjauan_log_objek_valid
    CHECK (objek_jenis IN ('soal', 'stimulus', 'paket'));

ALTER TABLE soal_tinjauan_log DROP CONSTRAINT IF EXISTS soal_tinjauan_log_peran_valid;
ALTER TABLE soal_tinjauan_log ADD CONSTRAINT soal_tinjauan_log_peran_valid
    CHECK (peran IN ('mentor', 'admin'));

ALTER TABLE soal_tinjauan_log DROP CONSTRAINT IF EXISTS soal_tinjauan_log_aksi_valid;
ALTER TABLE soal_tinjauan_log ADD CONSTRAINT soal_tinjauan_log_aksi_valid
    CHECK (aksi IN ('ajukan', 'tarik', 'setujui', 'tolak', 'publikasi_admin', 'arsipkan',
                    'publikasi_paket', 'versi_baru'));

ALTER TABLE soal_tinjauan_log DROP CONSTRAINT IF EXISTS soal_tinjauan_log_alasan_tolak;
ALTER TABLE soal_tinjauan_log ADD CONSTRAINT soal_tinjauan_log_alasan_tolak
    CHECK (aksi <> 'tolak' OR length(btrim(coalesce(alasan, ''), E' \t\r\n')) >= 10);

ALTER TABLE soal_tinjauan_log DROP CONSTRAINT IF EXISTS soal_tinjauan_log_publikasi_admin;
ALTER TABLE soal_tinjauan_log ADD CONSTRAINT soal_tinjauan_log_publikasi_admin
    CHECK (aksi <> 'publikasi_admin'
           OR (peran = 'admin'
               AND length(btrim(coalesce(alasan, ''), E' \t\r\n')) >= 10
               AND jumlah_peninjau_eligible = 0));

-- ============================================================================
-- 3. INDEKS
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_soal_topik_nama_unik
    ON soal_topik(subtes_id, lower(btrim(nama, E' \t\r\n')));

CREATE INDEX IF NOT EXISTS idx_soal_stimulus_penulis ON soal_stimulus(penulis_id, status);
CREATE INDEX IF NOT EXISTS idx_soal_stimulus_antrean ON soal_stimulus(subtes_id, diajukan_pada) WHERE status = 'diajukan';
CREATE UNIQUE INDEX IF NOT EXISTS idx_soal_stimulus_satu_terbit ON soal_stimulus(keluarga_id) WHERE status = 'terpublikasi';
CREATE UNIQUE INDEX IF NOT EXISTS idx_soal_stimulus_satu_terbuka ON soal_stimulus(keluarga_id) WHERE status IN ('draf', 'diajukan', 'ditolak');

CREATE INDEX IF NOT EXISTS idx_soal_bank_subtes_status ON soal_bank(subtes_id, status);
CREATE INDEX IF NOT EXISTS idx_soal_bank_penulis ON soal_bank(penulis_id, status);
CREATE INDEX IF NOT EXISTS idx_soal_bank_antrean ON soal_bank(subtes_id, diajukan_pada) WHERE status = 'diajukan';
CREATE INDEX IF NOT EXISTS idx_soal_bank_stimulus ON soal_bank(stimulus_id) WHERE stimulus_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_soal_bank_topik ON soal_bank(topik_id) WHERE topik_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_soal_bank_satu_terbit ON soal_bank(keluarga_id) WHERE status = 'terpublikasi';
CREATE UNIQUE INDEX IF NOT EXISTS idx_soal_bank_satu_terbuka ON soal_bank(keluarga_id) WHERE status IN ('draf', 'diajukan', 'ditolak');

CREATE INDEX IF NOT EXISTS idx_paket_soal_pembuat ON paket_soal(pembuat_id, status);
CREATE INDEX IF NOT EXISTS idx_paket_soal_subtes_status ON paket_soal(subtes_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_paket_soal_satu_terbit ON paket_soal(keluarga_id) WHERE status = 'terpublikasi';
CREATE UNIQUE INDEX IF NOT EXISTS idx_paket_soal_satu_terbuka ON paket_soal(keluarga_id) WHERE status IN ('draf', 'menunggu_soal');

CREATE INDEX IF NOT EXISTS idx_paket_soal_item_soal ON paket_soal_item(soal_id);

CREATE INDEX IF NOT EXISTS idx_soal_tinjauan_log_objek ON soal_tinjauan_log(objek_jenis, objek_id, created_at);

-- ============================================================================
-- 4. FUNGSI BANTU
-- ============================================================================

-- Tahap 1 hanya subtes SNBT. Tidak ada kolom "snbt" di subtes; definisinya
-- kategori TPS + Literasi (Penalaran Matematika termasuk literasi, lihat
-- db/seed_subtes.sql). Saat TKA dibuka, cukup ganti fungsi ini.
CREATE OR REPLACE FUNCTION studio_soal_subtes_snbt(p_subtes_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM subtes WHERE id = p_subtes_id AND kategori IN ('tps', 'literasi')
    );
$$;

-- Mentor eligible untuk subtes = role mentor ACTIVE + mentor_subtes_diampu
-- dengan subtes_id PERSIS (bukan mapel_dasar: PU & PPU ber-mapel_dasar
-- "Bahasa Indonesia", jadi pencocokan mapel_dasar akan salah).
CREATE OR REPLACE FUNCTION studio_soal_mentor_eligible(p_user_id UUID, p_subtes_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM user_roles ur
        JOIN mentor_profiles mp ON mp.user_id = ur.user_id
        JOIN mentor_subtes_diampu msd ON msd.mentor_profile_id = mp.id
        WHERE ur.user_id = p_user_id
          AND ur.role_type = 'mentor'
          AND ur.status = 'active'
          AND msd.subtes_id = p_subtes_id
    );
$$;

-- Jumlah mentor eligible untuk subtes, KECUALI user di p_kecuali (penulis).
-- Dipakai: peringatan "belum ada peninjau" saat ajukan, dan syarat publikasi
-- Admin (harus 0).
CREATE OR REPLACE FUNCTION studio_soal_hitung_peninjau_eligible(p_subtes_id UUID, p_kecuali UUID[])
RETURNS INT
LANGUAGE sql STABLE
SET search_path = public
AS $$
    SELECT count(DISTINCT ur.user_id)::int
    FROM user_roles ur
    JOIN mentor_profiles mp ON mp.user_id = ur.user_id
    JOIN mentor_subtes_diampu msd ON msd.mentor_profile_id = mp.id
    WHERE ur.role_type = 'mentor'
      AND ur.status = 'active'
      AND msd.subtes_id = p_subtes_id
      AND NOT (ur.user_id = ANY (coalesce(p_kecuali, ARRAY[]::UUID[])));
$$;

CREATE OR REPLACE FUNCTION studio_soal_admin_aktif(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_id = p_user_id AND role_type = 'admin' AND status = 'active'
    );
$$;

-- Penanda transaksi: hanya fungsi studio_soal_* yang menyalakannya, dan
-- trigger penjaga hanya mengizinkan perubahan status bila menyala. Nilainya
-- lokal per transaksi (set_config(..., true)) dan TETAP menyala sampai
-- transaksi selesai; tiap request PostgREST (.rpc / .from) adalah transaksi
-- sendiri, jadi tidak bocor ke request lain.
CREATE OR REPLACE FUNCTION studio_soal_mulai_rpc()
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    PERFORM set_config('studio_soal.rpc', 'on', true);
END $$;

CREATE OR REPLACE FUNCTION studio_soal_dalam_rpc()
RETURNS BOOLEAN
LANGUAGE sql STABLE
SET search_path = public
AS $$
    SELECT coalesce(current_setting('studio_soal.rpc', true), '') = 'on';
$$;

CREATE OR REPLACE FUNCTION studio_soal_tulis_log(
    p_objek_jenis TEXT,
    p_objek_id UUID,
    p_aktor_id UUID,
    p_peran TEXT,
    p_aksi TEXT,
    p_alasan TEXT,
    p_jumlah_eligible INT,
    p_snapshot JSONB
) RETURNS VOID
LANGUAGE sql VOLATILE
SET search_path = public
AS $$
    INSERT INTO soal_tinjauan_log (objek_jenis, objek_id, aktor_id, peran, aksi, alasan,
                                   jumlah_peninjau_eligible, snapshot)
    VALUES (p_objek_jenis, p_objek_id, p_aktor_id, p_peran, p_aksi,
            nullif(btrim(coalesce(p_alasan, ''), E' \t\r\n'), ''),
            p_jumlah_eligible, coalesce(p_snapshot, '{}'::jsonb));
$$;

-- ============================================================================
-- 5. TRIGGER PENJAGA
-- ============================================================================

-- (a) soal_bank / soal_stimulus / paket_soal:
--   INSERT : status wajib 'draf', metadata tinjau kosong.
--   UPDATE : kolom identitas (id, keluarga, versi, penulis/pembuat, created_at)
--            tidak boleh berubah; metadata tinjau/status hanya lewat RPC;
--            isi hanya boleh berubah saat status LAMA 'draf'/'ditolak'.
--   DELETE : hanya 'draf' yang belum pernah DIAJUKAN (tidak ada log aksi
--            'ajukan'). Draf versi baru yang belum diajukan boleh dihapus.
--            Selain itu -> arsipkan.
CREATE OR REPLACE FUNCTION studio_soal_jaga_baris()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_meta TEXT[];
    v_tetap TEXT[];
    v_old JSONB;
    v_new JSONB;
    v_kolom TEXT;
BEGIN
    IF TG_TABLE_NAME = 'paket_soal' THEN
        v_meta := ARRAY['status', 'dipublikasikan_pada', 'updated_at'];
        v_tetap := ARRAY['id', 'keluarga_id', 'versi', 'menggantikan_id', 'pembuat_id', 'created_at'];
    ELSE
        v_meta := ARRAY['status', 'peninjau_id', 'diajukan_pada', 'ditinjau_pada', 'alasan_tolak', 'updated_at'];
        v_tetap := ARRAY['id', 'keluarga_id', 'versi', 'menggantikan_id', 'penulis_id', 'created_at'];
    END IF;

    IF TG_OP = 'INSERT' THEN
        v_new := to_jsonb(NEW);
        IF v_new->>'status' <> 'draf' THEN
            RAISE EXCEPTION 'studio_soal: baris baru % wajib berstatus draf', TG_TABLE_NAME;
        END IF;
        FOREACH v_kolom IN ARRAY v_meta LOOP
            IF v_kolom NOT IN ('status', 'updated_at') AND (v_new->>v_kolom) IS NOT NULL THEN
                RAISE EXCEPTION 'studio_soal: kolom % harus kosong pada baris baru %', v_kolom, TG_TABLE_NAME;
            END IF;
        END LOOP;
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        IF OLD.status <> 'draf' THEN
            RAISE EXCEPTION 'studio_soal: hanya draf yang boleh dihapus (status %) — gunakan arsipkan', OLD.status;
        END IF;
        IF EXISTS (SELECT 1 FROM soal_tinjauan_log WHERE objek_id = OLD.id AND aksi = 'ajukan') THEN
            RAISE EXCEPTION 'studio_soal: % ini pernah diajukan — gunakan arsipkan, bukan hapus', TG_TABLE_NAME;
        END IF;
        RETURN OLD;
    END IF;

    -- UPDATE
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);

    FOREACH v_kolom IN ARRAY v_tetap LOOP
        IF (v_old->v_kolom) IS DISTINCT FROM (v_new->v_kolom) THEN
            RAISE EXCEPTION 'studio_soal: kolom % pada % tidak boleh diubah', v_kolom, TG_TABLE_NAME;
        END IF;
    END LOOP;

    FOREACH v_kolom IN ARRAY v_meta LOOP
        IF v_kolom <> 'updated_at'
           AND (v_old->v_kolom) IS DISTINCT FROM (v_new->v_kolom)
           AND NOT studio_soal_dalam_rpc() THEN
            RAISE EXCEPTION 'studio_soal: kolom % pada % hanya boleh diubah lewat fungsi studio_soal_*', v_kolom, TG_TABLE_NAME;
        END IF;
    END LOOP;

    IF (v_old - v_meta - v_tetap) IS DISTINCT FROM (v_new - v_meta - v_tetap)
       AND OLD.status NOT IN ('draf', 'ditolak') THEN
        RAISE EXCEPTION 'studio_soal: isi % berstatus % terkunci — buat versi baru', TG_TABLE_NAME, OLD.status;
    END IF;

    NEW.updated_at := now();
    RETURN NEW;
END $$;

-- (b) Relasi & kelayakan untuk soal_bank, soal_stimulus, paket_soal, soal_topik:
--   * subtes wajib SNBT (dicek saat INSERT / subtes berubah)
--   * penulis/pembuat wajib mentor eligible untuk subtes itu (saat INSERT)
--   * soal_bank: topik se-subtes; stimulus se-subtes, penulisnya SAMA
--     dengan penulis soal (satu penulis per stimulus), dan stimulus tidak
--     sedang ditinjau ('diajukan') atau sudah tidak aktif
--   * paket_soal: subtes tidak boleh diganti bila sudah berisi soal
-- OLD dibaca lewat jsonb (NULL saat INSERT) — tidak pernah OLD.kolom langsung.
CREATE OR REPLACE FUNCTION studio_soal_cek_relasi()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_new JSONB := to_jsonb(NEW);
    v_old JSONB;
    v_subtes_berubah BOOLEAN;
    v_pemilik UUID;
    v_stimulus soal_stimulus%ROWTYPE;
    v_topik_subtes UUID;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        v_old := to_jsonb(OLD);
    END IF;
    v_subtes_berubah := TG_OP = 'INSERT' OR (v_old->>'subtes_id') IS DISTINCT FROM (v_new->>'subtes_id');

    IF v_subtes_berubah AND NOT studio_soal_subtes_snbt((v_new->>'subtes_id')::uuid) THEN
        RAISE EXCEPTION 'studio_soal: Tahap 1 hanya menerima subtes SNBT (kategori tps/literasi)';
    END IF;

    IF TG_OP = 'INSERT' AND TG_TABLE_NAME IN ('soal_bank', 'soal_stimulus', 'paket_soal') THEN
        v_pemilik := coalesce(v_new->>'penulis_id', v_new->>'pembuat_id')::uuid;
        IF NOT studio_soal_mentor_eligible(v_pemilik, (v_new->>'subtes_id')::uuid) THEN
            RAISE EXCEPTION 'studio_soal: pembuat bukan mentor aktif yang mengampu subtes ini';
        END IF;
    END IF;

    IF TG_TABLE_NAME = 'paket_soal' AND TG_OP = 'UPDATE' AND v_subtes_berubah
       AND EXISTS (SELECT 1 FROM paket_soal_item WHERE paket_id = NEW.id) THEN
        RAISE EXCEPTION 'studio_soal: subtes paket tidak bisa diganti selama paket berisi soal';
    END IF;

    IF TG_TABLE_NAME = 'soal_bank' THEN
        IF NEW.topik_id IS NOT NULL
           AND (v_subtes_berubah OR (v_old->>'topik_id') IS DISTINCT FROM (v_new->>'topik_id')) THEN
            SELECT subtes_id INTO v_topik_subtes FROM soal_topik WHERE id = NEW.topik_id;
            IF v_topik_subtes IS DISTINCT FROM NEW.subtes_id THEN
                RAISE EXCEPTION 'studio_soal: topik berasal dari subtes lain';
            END IF;
        END IF;

        IF NEW.stimulus_id IS NOT NULL
           AND (v_subtes_berubah OR (v_old->>'stimulus_id') IS DISTINCT FROM (v_new->>'stimulus_id')) THEN
            SELECT * INTO v_stimulus FROM soal_stimulus WHERE id = NEW.stimulus_id;
            IF v_stimulus.subtes_id IS DISTINCT FROM NEW.subtes_id THEN
                RAISE EXCEPTION 'studio_soal: stimulus berasal dari subtes lain';
            END IF;
            IF v_stimulus.penulis_id IS DISTINCT FROM NEW.penulis_id THEN
                RAISE EXCEPTION 'studio_soal: hanya penulis stimulus yang boleh menambah soal ke stimulus itu';
            END IF;
            IF v_stimulus.status IN ('diajukan', 'digantikan', 'diarsipkan') THEN
                RAISE EXCEPTION 'studio_soal: soal tidak bisa ditambahkan ke stimulus berstatus %', v_stimulus.status;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END $$;

-- (c) paket_soal_item: hanya bisa diubah saat paket 'draf'; soal se-subtes.
CREATE OR REPLACE FUNCTION studio_soal_jaga_item_paket()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_paket_id UUID;
    v_paket paket_soal%ROWTYPE;
    v_soal_subtes UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_paket_id := OLD.paket_id;
    ELSE
        v_paket_id := NEW.paket_id;
    END IF;

    SELECT * INTO v_paket FROM paket_soal WHERE id = v_paket_id;
    -- NOT FOUND = paket sedang dihapus (CASCADE) — paket hanya bisa dihapus
    -- saat draf (trigger jaga_baris), jadi aman diizinkan.
    IF FOUND AND v_paket.status <> 'draf' THEN
        RAISE EXCEPTION 'studio_soal: isi paket hanya bisa diubah saat paket berstatus draf (status %)', v_paket.status;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    SELECT subtes_id INTO v_soal_subtes FROM soal_bank WHERE id = NEW.soal_id;
    IF v_soal_subtes IS DISTINCT FROM v_paket.subtes_id THEN
        RAISE EXCEPTION 'studio_soal: soal berasal dari subtes lain dengan paket';
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_studio_soal_jaga_soal ON soal_bank;
CREATE TRIGGER trg_studio_soal_jaga_soal
    BEFORE INSERT OR UPDATE OR DELETE ON soal_bank
    FOR EACH ROW EXECUTE FUNCTION studio_soal_jaga_baris();

DROP TRIGGER IF EXISTS trg_studio_soal_jaga_stimulus ON soal_stimulus;
CREATE TRIGGER trg_studio_soal_jaga_stimulus
    BEFORE INSERT OR UPDATE OR DELETE ON soal_stimulus
    FOR EACH ROW EXECUTE FUNCTION studio_soal_jaga_baris();

DROP TRIGGER IF EXISTS trg_studio_soal_jaga_paket ON paket_soal;
CREATE TRIGGER trg_studio_soal_jaga_paket
    BEFORE INSERT OR UPDATE OR DELETE ON paket_soal
    FOR EACH ROW EXECUTE FUNCTION studio_soal_jaga_baris();

DROP TRIGGER IF EXISTS trg_studio_soal_relasi_soal ON soal_bank;
CREATE TRIGGER trg_studio_soal_relasi_soal
    BEFORE INSERT OR UPDATE ON soal_bank
    FOR EACH ROW EXECUTE FUNCTION studio_soal_cek_relasi();

DROP TRIGGER IF EXISTS trg_studio_soal_relasi_stimulus ON soal_stimulus;
CREATE TRIGGER trg_studio_soal_relasi_stimulus
    BEFORE INSERT OR UPDATE ON soal_stimulus
    FOR EACH ROW EXECUTE FUNCTION studio_soal_cek_relasi();

DROP TRIGGER IF EXISTS trg_studio_soal_relasi_paket ON paket_soal;
CREATE TRIGGER trg_studio_soal_relasi_paket
    BEFORE INSERT OR UPDATE ON paket_soal
    FOR EACH ROW EXECUTE FUNCTION studio_soal_cek_relasi();

DROP TRIGGER IF EXISTS trg_studio_soal_relasi_topik ON soal_topik;
CREATE TRIGGER trg_studio_soal_relasi_topik
    BEFORE INSERT OR UPDATE ON soal_topik
    FOR EACH ROW EXECUTE FUNCTION studio_soal_cek_relasi();

DROP TRIGGER IF EXISTS trg_studio_soal_jaga_item ON paket_soal_item;
CREATE TRIGGER trg_studio_soal_jaga_item
    BEFORE INSERT OR UPDATE OR DELETE ON paket_soal_item
    FOR EACH ROW EXECUTE FUNCTION studio_soal_jaga_item_paket();

-- ============================================================================
-- 6. RPC TRANSISI STATUS
-- ============================================================================
-- Dipanggil API route lewat service_role saja. p_aktor_id SELALU dari session
-- server (bukan body request). Peran ('mentor'/'admin') juga dari session.

-- (internal) Sinkronkan paket 'menunggu_soal' yang memuat soal-soal ini:
--   ada item draf/ditolak/diarsipkan -> paket kembali 'draf'
--   semua item terpublikasi/digantikan -> paket terbit
CREATE OR REPLACE FUNCTION studio_soal_sinkron_paket(p_soal_ids UUID[])
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_paket paket_soal%ROWTYPE;
    v_terbit UUID[] := ARRAY[]::UUID[];
    v_kembali UUID[] := ARRAY[]::UUID[];
BEGIN
    PERFORM studio_soal_mulai_rpc();
    FOR v_paket IN
        SELECT p.* FROM paket_soal p
        WHERE p.status = 'menunggu_soal'
          AND EXISTS (SELECT 1 FROM paket_soal_item i WHERE i.paket_id = p.id AND i.soal_id = ANY (p_soal_ids))
        ORDER BY p.id
        FOR UPDATE
    LOOP
        IF EXISTS (
            SELECT 1 FROM paket_soal_item i JOIN soal_bank s ON s.id = i.soal_id
            WHERE i.paket_id = v_paket.id AND s.status IN ('draf', 'ditolak', 'diarsipkan')
        ) THEN
            UPDATE paket_soal SET status = 'draf' WHERE id = v_paket.id;
            v_kembali := v_kembali || v_paket.id;
        ELSIF NOT EXISTS (
            SELECT 1 FROM paket_soal_item i JOIN soal_bank s ON s.id = i.soal_id
            WHERE i.paket_id = v_paket.id AND s.status NOT IN ('terpublikasi', 'digantikan')
        ) THEN
            PERFORM studio_soal_terbitkan_paket(v_paket.id, v_paket.pembuat_id);
            v_terbit := v_terbit || v_paket.id;
        END IF;
    END LOOP;
    RETURN jsonb_build_object('paket_terbit', to_jsonb(v_terbit), 'paket_kembali_draf', to_jsonb(v_kembali));
END $$;

-- (internal) Terbitkan paket (semua item sudah dicek terbit oleh pemanggil).
-- Versi lama keluarga -> 'digantikan' DULU (indeks unik satu-terbit).
CREATE OR REPLACE FUNCTION studio_soal_terbitkan_paket(p_paket_id UUID, p_aktor_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_paket paket_soal%ROWTYPE;
BEGIN
    PERFORM studio_soal_mulai_rpc();
    SELECT * INTO v_paket FROM paket_soal WHERE id = p_paket_id FOR UPDATE;
    IF v_paket.menggantikan_id IS NOT NULL THEN
        UPDATE paket_soal SET status = 'digantikan'
        WHERE id = v_paket.menggantikan_id AND status = 'terpublikasi';
    END IF;
    UPDATE paket_soal SET status = 'terpublikasi', dipublikasikan_pada = now() WHERE id = p_paket_id;
    PERFORM studio_soal_tulis_log('paket', p_paket_id, p_aktor_id, 'mentor', 'publikasi_paket', NULL, NULL,
        jsonb_build_object(
            'paket', to_jsonb(v_paket),
            'item', coalesce((SELECT jsonb_agg(jsonb_build_object('soal_id', soal_id, 'urutan', urutan) ORDER BY urutan)
                              FROM paket_soal_item WHERE paket_id = p_paket_id), '[]'::jsonb)
        ));
END $$;

-- (internal) Terbitkan soal tunggal ATAU kelompok stimulus (stimulus + semua
-- soalnya yang 'diajukan'). Pemanggil sudah mengunci baris & memeriksa hak.
-- Urutan: versi lama -> 'digantikan' dulu, baru versi baru -> 'terpublikasi'.
CREATE OR REPLACE FUNCTION studio_soal_terbitkan(
    p_objek_jenis TEXT,
    p_id UUID,
    p_aktor_id UUID,
    p_peran TEXT,
    p_aksi TEXT,                 -- 'setujui' | 'publikasi_admin'
    p_alasan TEXT,
    p_jumlah_eligible INT
) RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_soal_ids UUID[];
    v_stimulus soal_stimulus%ROWTYPE;
    v_soal soal_bank%ROWTYPE;
    v_sinkron JSONB;
BEGIN
    PERFORM studio_soal_mulai_rpc();

    IF p_objek_jenis = 'soal' THEN
        v_soal_ids := ARRAY[p_id];
    ELSE
        SELECT * INTO v_stimulus FROM soal_stimulus WHERE id = p_id;
        SELECT coalesce(array_agg(id ORDER BY urutan_dalam_stimulus, id), ARRAY[]::UUID[]) INTO v_soal_ids
        FROM soal_bank WHERE stimulus_id = p_id AND status = 'diajukan';

        IF v_stimulus.menggantikan_id IS NOT NULL THEN
            UPDATE soal_stimulus SET status = 'digantikan'
            WHERE id = v_stimulus.menggantikan_id AND status = 'terpublikasi';
        END IF;
        UPDATE soal_stimulus
        SET status = 'terpublikasi', peninjau_id = p_aktor_id, ditinjau_pada = now(), alasan_tolak = NULL
        WHERE id = p_id;
        PERFORM studio_soal_tulis_log('stimulus', p_id, p_aktor_id, p_peran, p_aksi, p_alasan, p_jumlah_eligible,
                                      to_jsonb(v_stimulus));
    END IF;

    FOR v_soal IN SELECT * FROM soal_bank WHERE id = ANY (v_soal_ids) ORDER BY id LOOP
        IF v_soal.menggantikan_id IS NOT NULL THEN
            UPDATE soal_bank SET status = 'digantikan'
            WHERE id = v_soal.menggantikan_id AND status = 'terpublikasi';
        END IF;
        UPDATE soal_bank
        SET status = 'terpublikasi', peninjau_id = p_aktor_id, ditinjau_pada = now(), alasan_tolak = NULL
        WHERE id = v_soal.id;
        PERFORM studio_soal_tulis_log('soal', v_soal.id, p_aktor_id, p_peran, p_aksi, p_alasan, p_jumlah_eligible,
                                      to_jsonb(v_soal));
    END LOOP;

    v_sinkron := studio_soal_sinkron_paket(v_soal_ids);
    RETURN jsonb_build_object('status', 'terpublikasi', 'soal_ids', to_jsonb(v_soal_ids)) || v_sinkron;
END $$;

-- Ajukan SATU soal (mandiri, atau soal baru di stimulus yang SUDAH terbit).
-- Status draf/ditolak -> diajukan. Soal di stimulus draf/ditolak diajukan
-- lewat studio_soal_ajukan_stimulus (kelompok).
-- Gagal: tidak_ditemukan | bukan_penulis | status_tidak_valid | tidak_eligible
--        | ajukan_lewat_stimulus | stimulus_tidak_aktif
CREATE OR REPLACE FUNCTION studio_soal_ajukan_soal(p_soal_id UUID, p_aktor_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_soal soal_bank%ROWTYPE;
    v_status_stimulus TEXT;
    v_eligible INT;
BEGIN
    PERFORM studio_soal_mulai_rpc();
    SELECT * INTO v_soal FROM soal_bank WHERE id = p_soal_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'tidak_ditemukan'); END IF;
    IF v_soal.penulis_id <> p_aktor_id THEN RETURN jsonb_build_object('status', 'bukan_penulis'); END IF;
    IF v_soal.status NOT IN ('draf', 'ditolak') THEN
        RETURN jsonb_build_object('status', 'status_tidak_valid', 'status_soal', v_soal.status);
    END IF;
    IF NOT studio_soal_mentor_eligible(p_aktor_id, v_soal.subtes_id) THEN
        RETURN jsonb_build_object('status', 'tidak_eligible');
    END IF;
    IF v_soal.stimulus_id IS NOT NULL THEN
        SELECT status INTO v_status_stimulus FROM soal_stimulus WHERE id = v_soal.stimulus_id;
        IF v_status_stimulus IN ('draf', 'ditolak', 'diajukan') THEN
            RETURN jsonb_build_object('status', 'ajukan_lewat_stimulus', 'stimulus_id', v_soal.stimulus_id);
        END IF;
        IF v_status_stimulus <> 'terpublikasi' THEN
            RETURN jsonb_build_object('status', 'stimulus_tidak_aktif');
        END IF;
    END IF;

    v_eligible := studio_soal_hitung_peninjau_eligible(v_soal.subtes_id, ARRAY[v_soal.penulis_id]);
    UPDATE soal_bank SET status = 'diajukan', diajukan_pada = now() WHERE id = p_soal_id;
    PERFORM studio_soal_tulis_log('soal', p_soal_id, p_aktor_id, 'mentor', 'ajukan', NULL, v_eligible, to_jsonb(v_soal));

    RETURN jsonb_build_object('status', 'diajukan', 'subtes_id', v_soal.subtes_id,
                              'jumlah_peninjau_eligible', v_eligible);
END $$;

-- Ajukan KELOMPOK stimulus: stimulus draf/ditolak + semua soalnya yang
-- draf/ditolak -> diajukan bersama (ditinjau sebagai satu kesatuan).
-- Gagal: tidak_ditemukan | bukan_penulis | status_tidak_valid | tidak_eligible
--        | kelompok_kosong
CREATE OR REPLACE FUNCTION studio_soal_ajukan_stimulus(p_stimulus_id UUID, p_aktor_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_stimulus soal_stimulus%ROWTYPE;
    v_soal soal_bank%ROWTYPE;
    v_jumlah INT := 0;
    v_eligible INT;
BEGIN
    PERFORM studio_soal_mulai_rpc();
    SELECT * INTO v_stimulus FROM soal_stimulus WHERE id = p_stimulus_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'tidak_ditemukan'); END IF;
    IF v_stimulus.penulis_id <> p_aktor_id THEN RETURN jsonb_build_object('status', 'bukan_penulis'); END IF;
    IF v_stimulus.status NOT IN ('draf', 'ditolak') THEN
        RETURN jsonb_build_object('status', 'status_tidak_valid', 'status_stimulus', v_stimulus.status);
    END IF;
    IF NOT studio_soal_mentor_eligible(p_aktor_id, v_stimulus.subtes_id) THEN
        RETURN jsonb_build_object('status', 'tidak_eligible');
    END IF;

    PERFORM 1 FROM soal_bank WHERE stimulus_id = p_stimulus_id AND status IN ('draf', 'ditolak') FOR UPDATE;
    SELECT count(*) INTO v_jumlah FROM soal_bank WHERE stimulus_id = p_stimulus_id AND status IN ('draf', 'ditolak');
    IF v_jumlah = 0 THEN RETURN jsonb_build_object('status', 'kelompok_kosong'); END IF;

    v_eligible := studio_soal_hitung_peninjau_eligible(v_stimulus.subtes_id, ARRAY[v_stimulus.penulis_id]);

    UPDATE soal_stimulus SET status = 'diajukan', diajukan_pada = now() WHERE id = p_stimulus_id;
    PERFORM studio_soal_tulis_log('stimulus', p_stimulus_id, p_aktor_id, 'mentor', 'ajukan', NULL, v_eligible,
                                  to_jsonb(v_stimulus));

    FOR v_soal IN SELECT * FROM soal_bank WHERE stimulus_id = p_stimulus_id AND status NOT IN ('diajukan', 'terpublikasi', 'digantikan') ORDER BY id LOOP
        UPDATE soal_bank SET status = 'diajukan', diajukan_pada = now() WHERE id = v_soal.id;
        PERFORM studio_soal_tulis_log('soal', v_soal.id, p_aktor_id, 'mentor', 'ajukan', NULL, v_eligible, to_jsonb(v_soal));
    END LOOP;

    RETURN jsonb_build_object('status', 'diajukan', 'subtes_id', v_stimulus.subtes_id,
                              'jumlah_soal', v_jumlah, 'jumlah_peninjau_eligible', v_eligible);
END $$;

-- Tarik pengajuan (diajukan -> draf) oleh penulis/pembuat, sebelum ditinjau.
-- p_objek_jenis: 'soal' | 'stimulus' (beserta kelompoknya) | 'paket'
-- (menunggu_soal -> draf; soal di dalamnya tetap diajukan).
-- Gagal: jenis_tidak_valid | tidak_ditemukan | bukan_penulis | bukan_pembuat
--        | status_tidak_valid | tarik_lewat_stimulus
CREATE OR REPLACE FUNCTION studio_soal_tarik(p_objek_jenis TEXT, p_id UUID, p_aktor_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_soal soal_bank%ROWTYPE;
    v_stimulus soal_stimulus%ROWTYPE;
    v_paket paket_soal%ROWTYPE;
    v_soal_ids UUID[];
    v_status_stimulus TEXT;
BEGIN
    PERFORM studio_soal_mulai_rpc();

    IF p_objek_jenis = 'soal' THEN
        SELECT * INTO v_soal FROM soal_bank WHERE id = p_id FOR UPDATE;
        IF NOT FOUND THEN RETURN jsonb_build_object('status', 'tidak_ditemukan'); END IF;
        IF v_soal.penulis_id <> p_aktor_id THEN RETURN jsonb_build_object('status', 'bukan_penulis'); END IF;
        IF v_soal.status <> 'diajukan' THEN RETURN jsonb_build_object('status', 'status_tidak_valid'); END IF;
        IF v_soal.stimulus_id IS NOT NULL THEN
            SELECT status INTO v_status_stimulus FROM soal_stimulus WHERE id = v_soal.stimulus_id;
            IF v_status_stimulus = 'diajukan' THEN
                RETURN jsonb_build_object('status', 'tarik_lewat_stimulus', 'stimulus_id', v_soal.stimulus_id);
            END IF;
        END IF;
        UPDATE soal_bank SET status = 'draf', diajukan_pada = NULL WHERE id = p_id;
        PERFORM studio_soal_tulis_log('soal', p_id, p_aktor_id, 'mentor', 'tarik', NULL, NULL, '{}'::jsonb);
        RETURN jsonb_build_object('status', 'ditarik') || studio_soal_sinkron_paket(ARRAY[p_id]);

    ELSIF p_objek_jenis = 'stimulus' THEN
        SELECT * INTO v_stimulus FROM soal_stimulus WHERE id = p_id FOR UPDATE;
        IF NOT FOUND THEN RETURN jsonb_build_object('status', 'tidak_ditemukan'); END IF;
        IF v_stimulus.penulis_id <> p_aktor_id THEN RETURN jsonb_build_object('status', 'bukan_penulis'); END IF;
        IF v_stimulus.status <> 'diajukan' THEN RETURN jsonb_build_object('status', 'status_tidak_valid'); END IF;
        SELECT coalesce(array_agg(id), ARRAY[]::UUID[]) INTO v_soal_ids
        FROM soal_bank WHERE stimulus_id = p_id AND status = 'diajukan';
        PERFORM 1 FROM soal_bank WHERE id = ANY (v_soal_ids) FOR UPDATE;
        UPDATE soal_stimulus SET status = 'draf', diajukan_pada = NULL WHERE id = p_id;
        UPDATE soal_bank SET status = 'draf', diajukan_pada = NULL WHERE id = ANY (v_soal_ids);
        PERFORM studio_soal_tulis_log('stimulus', p_id, p_aktor_id, 'mentor', 'tarik', NULL, NULL, '{}'::jsonb);
        RETURN jsonb_build_object('status', 'ditarik', 'soal_ids', to_jsonb(v_soal_ids))
               || studio_soal_sinkron_paket(v_soal_ids);

    ELSIF p_objek_jenis = 'paket' THEN
        SELECT * INTO v_paket FROM paket_soal WHERE id = p_id FOR UPDATE;
        IF NOT FOUND THEN RETURN jsonb_build_object('status', 'tidak_ditemukan'); END IF;
        IF v_paket.pembuat_id <> p_aktor_id THEN RETURN jsonb_build_object('status', 'bukan_pembuat'); END IF;
        IF v_paket.status <> 'menunggu_soal' THEN RETURN jsonb_build_object('status', 'status_tidak_valid'); END IF;
        UPDATE paket_soal SET status = 'draf' WHERE id = p_id;
        PERFORM studio_soal_tulis_log('paket', p_id, p_aktor_id, 'mentor', 'tarik', NULL, NULL, '{}'::jsonb);
        RETURN jsonb_build_object('status', 'ditarik');
    END IF;

    RETURN jsonb_build_object('status', 'jenis_tidak_valid');
END $$;

-- Tinjau soal/kelompok stimulus yang 'diajukan'.
--   p_peran 'mentor': setujui/tolak — wajib eligible untuk subtes & bukan penulis.
--   p_peran 'admin' : HANYA tolak (setujui oleh Admin lewat studio_soal_publikasi_admin).
-- Tolak wajib alasan >= 10 karakter (setelah trim).
-- Gagal: input_tidak_valid | bukan_admin | admin_pakai_publikasi_admin | alasan_kurang
--        | tidak_ditemukan | status_tidak_valid | tinjau_sebagai_kelompok
--        | tinjau_sendiri | tidak_eligible
CREATE OR REPLACE FUNCTION studio_soal_tinjau(
    p_objek_jenis TEXT,
    p_id UUID,
    p_aktor_id UUID,
    p_peran TEXT,
    p_aksi TEXT,
    p_alasan TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_soal soal_bank%ROWTYPE;
    v_stimulus soal_stimulus%ROWTYPE;
    v_subtes UUID;
    v_penulis UUID[];
    v_soal_ids UUID[];
    v_status_stimulus TEXT;
    v_alasan TEXT := btrim(coalesce(p_alasan, ''), E' \t\r\n');
    v_baris soal_bank%ROWTYPE;
BEGIN
    PERFORM studio_soal_mulai_rpc();

    IF p_objek_jenis NOT IN ('soal', 'stimulus') OR p_peran NOT IN ('mentor', 'admin')
       OR p_aksi NOT IN ('setujui', 'tolak') THEN
        RETURN jsonb_build_object('status', 'input_tidak_valid');
    END IF;
    IF p_peran = 'admin' AND NOT studio_soal_admin_aktif(p_aktor_id) THEN
        RETURN jsonb_build_object('status', 'bukan_admin');
    END IF;
    IF p_peran = 'admin' AND p_aksi = 'setujui' THEN
        RETURN jsonb_build_object('status', 'admin_pakai_publikasi_admin');
    END IF;
    IF p_aksi = 'tolak' AND length(v_alasan) < 10 THEN
        RETURN jsonb_build_object('status', 'alasan_kurang');
    END IF;

    IF p_objek_jenis = 'soal' THEN
        SELECT * INTO v_soal FROM soal_bank WHERE id = p_id FOR UPDATE;
        IF NOT FOUND THEN RETURN jsonb_build_object('status', 'tidak_ditemukan'); END IF;
        IF v_soal.status <> 'diajukan' THEN
            RETURN jsonb_build_object('status', 'status_tidak_valid', 'status_soal', v_soal.status);
        END IF;
        IF v_soal.stimulus_id IS NOT NULL THEN
            SELECT status INTO v_status_stimulus FROM soal_stimulus WHERE id = v_soal.stimulus_id;
            IF v_status_stimulus = 'diajukan' THEN
                RETURN jsonb_build_object('status', 'tinjau_sebagai_kelompok', 'stimulus_id', v_soal.stimulus_id);
            END IF;
        END IF;
        v_subtes := v_soal.subtes_id;
        v_penulis := ARRAY[v_soal.penulis_id];
        v_soal_ids := ARRAY[p_id];
    ELSE
        SELECT * INTO v_stimulus FROM soal_stimulus WHERE id = p_id FOR UPDATE;
        IF NOT FOUND THEN RETURN jsonb_build_object('status', 'tidak_ditemukan'); END IF;
        IF v_stimulus.status <> 'diajukan' THEN
            RETURN jsonb_build_object('status', 'status_tidak_valid', 'status_stimulus', v_stimulus.status);
        END IF;
        PERFORM 1 FROM soal_bank WHERE stimulus_id = p_id AND status = 'diajukan' FOR UPDATE;
        SELECT coalesce(array_agg(id), ARRAY[]::UUID[]) INTO v_soal_ids
        FROM soal_bank WHERE stimulus_id = p_id AND status = 'diajukan';
        v_subtes := v_stimulus.subtes_id;
        v_penulis := ARRAY[v_stimulus.penulis_id]
                     || coalesce((SELECT array_agg(DISTINCT penulis_id) FROM soal_bank WHERE id = ANY (v_soal_ids)),
                                 ARRAY[]::UUID[]);
    END IF;

    IF p_aktor_id = ANY (v_penulis) THEN
        RETURN jsonb_build_object('status', 'tinjau_sendiri');
    END IF;
    IF p_peran = 'mentor' AND NOT studio_soal_mentor_eligible(p_aktor_id, v_subtes) THEN
        RETURN jsonb_build_object('status', 'tidak_eligible');
    END IF;

    IF p_aksi = 'setujui' THEN
        RETURN studio_soal_terbitkan(p_objek_jenis, p_id, p_aktor_id, p_peran, 'setujui', NULL, NULL);
    END IF;

    -- Tolak
    IF p_objek_jenis = 'stimulus' THEN
        UPDATE soal_stimulus
        SET status = 'ditolak', peninjau_id = p_aktor_id, ditinjau_pada = now(), alasan_tolak = v_alasan
        WHERE id = p_id;
        PERFORM studio_soal_tulis_log('stimulus', p_id, p_aktor_id, p_peran, 'tolak', v_alasan, NULL, to_jsonb(v_stimulus));
    END IF;
    FOR v_baris IN SELECT * FROM soal_bank WHERE id = ANY (v_soal_ids) ORDER BY id LOOP
        UPDATE soal_bank
        SET status = 'ditolak', peninjau_id = p_aktor_id, ditinjau_pada = now(), alasan_tolak = v_alasan
        WHERE id = v_baris.id;
        PERFORM studio_soal_tulis_log('soal', v_baris.id, p_aktor_id, p_peran, 'tolak', v_alasan, NULL, to_jsonb(v_baris));
    END LOOP;

    RETURN jsonb_build_object('status', 'ditolak', 'soal_ids', to_jsonb(v_soal_ids))
           || studio_soal_sinkron_paket(v_soal_ids);
END $$;

-- Publikasi oleh Admin — HANYA bila tidak ada satu pun mentor eligible selain
-- penulis (dihitung di sini, saat aksi). Admin yang juga penulis ditolak.
-- Admin yang juga mentor eligible terhitung (dia harus meninjau sebagai mentor).
-- Gagal: input_tidak_valid | bukan_admin | alasan_kurang | tidak_ditemukan
--        | status_tidak_valid | tinjau_sebagai_kelompok | tinjau_sendiri
--        | masih_ada_peninjau
CREATE OR REPLACE FUNCTION studio_soal_publikasi_admin(
    p_objek_jenis TEXT,
    p_id UUID,
    p_admin_id UUID,
    p_alasan TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_soal soal_bank%ROWTYPE;
    v_stimulus soal_stimulus%ROWTYPE;
    v_subtes UUID;
    v_penulis UUID[];
    v_status_stimulus TEXT;
    v_eligible INT;
    v_alasan TEXT := btrim(coalesce(p_alasan, ''), E' \t\r\n');
BEGIN
    PERFORM studio_soal_mulai_rpc();

    IF p_objek_jenis NOT IN ('soal', 'stimulus') THEN
        RETURN jsonb_build_object('status', 'input_tidak_valid');
    END IF;
    IF NOT studio_soal_admin_aktif(p_admin_id) THEN
        RETURN jsonb_build_object('status', 'bukan_admin');
    END IF;
    IF length(v_alasan) < 10 THEN
        RETURN jsonb_build_object('status', 'alasan_kurang');
    END IF;

    IF p_objek_jenis = 'soal' THEN
        SELECT * INTO v_soal FROM soal_bank WHERE id = p_id FOR UPDATE;
        IF NOT FOUND THEN RETURN jsonb_build_object('status', 'tidak_ditemukan'); END IF;
        IF v_soal.status <> 'diajukan' THEN RETURN jsonb_build_object('status', 'status_tidak_valid'); END IF;
        IF v_soal.stimulus_id IS NOT NULL THEN
            SELECT status INTO v_status_stimulus FROM soal_stimulus WHERE id = v_soal.stimulus_id;
            IF v_status_stimulus = 'diajukan' THEN
                RETURN jsonb_build_object('status', 'tinjau_sebagai_kelompok', 'stimulus_id', v_soal.stimulus_id);
            END IF;
        END IF;
        v_subtes := v_soal.subtes_id;
        v_penulis := ARRAY[v_soal.penulis_id];
    ELSE
        SELECT * INTO v_stimulus FROM soal_stimulus WHERE id = p_id FOR UPDATE;
        IF NOT FOUND THEN RETURN jsonb_build_object('status', 'tidak_ditemukan'); END IF;
        IF v_stimulus.status <> 'diajukan' THEN RETURN jsonb_build_object('status', 'status_tidak_valid'); END IF;
        PERFORM 1 FROM soal_bank WHERE stimulus_id = p_id AND status = 'diajukan' FOR UPDATE;
        v_subtes := v_stimulus.subtes_id;
        v_penulis := ARRAY[v_stimulus.penulis_id]
                     || coalesce((SELECT array_agg(DISTINCT penulis_id) FROM soal_bank
                                  WHERE stimulus_id = p_id AND status = 'diajukan'), ARRAY[]::UUID[]);
    END IF;

    IF p_admin_id = ANY (v_penulis) THEN
        RETURN jsonb_build_object('status', 'tinjau_sendiri');
    END IF;

    v_eligible := studio_soal_hitung_peninjau_eligible(v_subtes, v_penulis);
    IF v_eligible > 0 THEN
        RETURN jsonb_build_object('status', 'masih_ada_peninjau', 'jumlah_peninjau_eligible', v_eligible);
    END IF;

    RETURN studio_soal_terbitkan(p_objek_jenis, p_id, p_admin_id, 'admin', 'publikasi_admin', v_alasan, 0);
END $$;

-- Versi baru dari soal TERBIT (copy-on-write) — hanya penulis (K3). Versi lama
-- tetap terbit sampai versi baru lolos tinjau. Soal di stimulus: versi baru
-- tetap menunjuk stimulus yang sama (yang harus masih terbit).
-- Gagal: tidak_ditemukan | bukan_penulis | status_tidak_valid | ada_versi_terbuka
--        | stimulus_tidak_aktif | tidak_eligible
CREATE OR REPLACE FUNCTION studio_soal_buat_versi_soal(p_soal_id UUID, p_aktor_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_soal soal_bank%ROWTYPE;
    v_terbuka UUID;
    v_baru UUID;
BEGIN
    PERFORM studio_soal_mulai_rpc();
    SELECT * INTO v_soal FROM soal_bank WHERE id = p_soal_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'tidak_ditemukan'); END IF;
    IF v_soal.penulis_id <> p_aktor_id THEN RETURN jsonb_build_object('status', 'bukan_penulis'); END IF;
    IF v_soal.status <> 'terpublikasi' THEN RETURN jsonb_build_object('status', 'status_tidak_valid'); END IF;

    SELECT id INTO v_terbuka FROM soal_bank
    WHERE keluarga_id = v_soal.keluarga_id AND status IN ('draf', 'diajukan', 'ditolak');
    IF FOUND THEN RETURN jsonb_build_object('status', 'ada_versi_terbuka', 'soal_id', v_terbuka); END IF;

    IF v_soal.stimulus_id IS NOT NULL
       AND (SELECT status FROM soal_stimulus WHERE id = v_soal.stimulus_id) <> 'terpublikasi' THEN
        RETURN jsonb_build_object('status', 'stimulus_tidak_aktif');
    END IF;
    IF NOT studio_soal_mentor_eligible(p_aktor_id, v_soal.subtes_id) THEN
        RETURN jsonb_build_object('status', 'tidak_eligible');
    END IF;

    INSERT INTO soal_bank (
        keluarga_id, versi, menggantikan_id, subtes_id, topik_id, stimulus_id, urutan_dalam_stimulus,
        tipe, redaksi, konten, kunci, pembahasan, sumber_rujukan, tingkat_kesulitan, level_kognitif,
        estimasi_waktu_detik, aturan_skor, bobot, sumber, penulis_id
    )
    SELECT keluarga_id,
           (SELECT max(versi) + 1 FROM soal_bank WHERE keluarga_id = v_soal.keluarga_id),
           id, subtes_id, topik_id, stimulus_id, urutan_dalam_stimulus,
           tipe, redaksi, konten, kunci, pembahasan, sumber_rujukan, tingkat_kesulitan, level_kognitif,
           estimasi_waktu_detik, aturan_skor, bobot, sumber, penulis_id
    FROM soal_bank WHERE id = p_soal_id
    RETURNING id INTO v_baru;

    PERFORM studio_soal_tulis_log('soal', v_baru, p_aktor_id, 'mentor', 'versi_baru', NULL, NULL,
                                  jsonb_build_object('dari', p_soal_id));
    RETURN jsonb_build_object('status', 'versi_dibuat', 'soal_id', v_baru);
END $$;

-- Versi baru dari stimulus TERBIT: salinan stimulus + salinan SEMUA soal
-- terbitnya (menunjuk stimulus baru), semuanya draf -> diajukan bersama lewat
-- studio_soal_ajukan_stimulus. Hanya penulis.
-- Gagal: tidak_ditemukan | bukan_penulis | status_tidak_valid | ada_versi_terbuka
--        | tidak_eligible
CREATE OR REPLACE FUNCTION studio_soal_buat_versi_stimulus(p_stimulus_id UUID, p_aktor_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_stimulus soal_stimulus%ROWTYPE;
    v_baru UUID;
    v_soal soal_bank%ROWTYPE;
    v_jumlah INT := 0;
BEGIN
    PERFORM studio_soal_mulai_rpc();
    SELECT * INTO v_stimulus FROM soal_stimulus WHERE id = p_stimulus_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'tidak_ditemukan'); END IF;
    IF v_stimulus.penulis_id <> p_aktor_id THEN RETURN jsonb_build_object('status', 'bukan_penulis'); END IF;
    IF v_stimulus.status <> 'terpublikasi' THEN RETURN jsonb_build_object('status', 'status_tidak_valid'); END IF;
    IF NOT studio_soal_mentor_eligible(p_aktor_id, v_stimulus.subtes_id) THEN
        RETURN jsonb_build_object('status', 'tidak_eligible');
    END IF;

    IF EXISTS (SELECT 1 FROM soal_stimulus
               WHERE keluarga_id = v_stimulus.keluarga_id AND status IN ('draf', 'diajukan', 'ditolak'))
       OR EXISTS (SELECT 1 FROM soal_bank s
                  WHERE s.status IN ('draf', 'diajukan', 'ditolak')
                    AND s.keluarga_id IN (SELECT keluarga_id FROM soal_bank
                                          WHERE stimulus_id = p_stimulus_id AND status = 'terpublikasi')) THEN
        RETURN jsonb_build_object('status', 'ada_versi_terbuka');
    END IF;

    PERFORM 1 FROM soal_bank WHERE stimulus_id = p_stimulus_id AND status = 'terpublikasi' FOR UPDATE;

    INSERT INTO soal_stimulus (keluarga_id, versi, menggantikan_id, subtes_id, judul_internal, konten,
                               sumber_rujukan, penulis_id)
    SELECT keluarga_id,
           (SELECT max(versi) + 1 FROM soal_stimulus WHERE keluarga_id = v_stimulus.keluarga_id),
           id, subtes_id, judul_internal, konten, sumber_rujukan, penulis_id
    FROM soal_stimulus WHERE id = p_stimulus_id
    RETURNING id INTO v_baru;

    FOR v_soal IN SELECT * FROM soal_bank WHERE stimulus_id = p_stimulus_id AND status = 'terpublikasi' ORDER BY urutan_dalam_stimulus, id LOOP
        INSERT INTO soal_bank (
            keluarga_id, versi, menggantikan_id, subtes_id, topik_id, stimulus_id, urutan_dalam_stimulus,
            tipe, redaksi, konten, kunci, pembahasan, sumber_rujukan, tingkat_kesulitan, level_kognitif,
            estimasi_waktu_detik, aturan_skor, bobot, sumber, penulis_id
        ) VALUES (
            v_soal.keluarga_id,
            (SELECT max(versi) + 1 FROM soal_bank WHERE keluarga_id = v_soal.keluarga_id),
            v_soal.id, v_soal.subtes_id, v_soal.topik_id, v_baru, v_soal.urutan_dalam_stimulus,
            v_soal.tipe, v_soal.redaksi, v_soal.konten, v_soal.kunci, v_soal.pembahasan, v_soal.sumber_rujukan,
            v_soal.tingkat_kesulitan, v_soal.level_kognitif, v_soal.estimasi_waktu_detik, v_soal.aturan_skor,
            v_soal.bobot, v_soal.sumber, v_soal.penulis_id
        );
        v_jumlah := v_jumlah + 1;
    END LOOP;

    PERFORM studio_soal_tulis_log('stimulus', v_baru, p_aktor_id, 'mentor', 'versi_baru', NULL, NULL,
                                  jsonb_build_object('dari', p_stimulus_id, 'jumlah_soal', v_jumlah));
    RETURN jsonb_build_object('status', 'versi_dibuat', 'stimulus_id', v_baru, 'jumlah_soal', v_jumlah);
END $$;

-- Arsipkan soal (penulis, atau Admin). Soal 'diajukan' harus ditarik dulu.
-- Ditolak bila dipakai paket terbit/menunggu_soal.
-- Gagal: input_tidak_valid | bukan_admin | tidak_ditemukan | bukan_penulis
--        | status_tidak_valid | dipakai_paket
CREATE OR REPLACE FUNCTION studio_soal_arsipkan_soal(p_soal_id UUID, p_aktor_id UUID, p_peran TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_soal soal_bank%ROWTYPE;
    v_paket UUID[];
BEGIN
    PERFORM studio_soal_mulai_rpc();
    IF p_peran NOT IN ('mentor', 'admin') THEN RETURN jsonb_build_object('status', 'input_tidak_valid'); END IF;
    IF p_peran = 'admin' AND NOT studio_soal_admin_aktif(p_aktor_id) THEN
        RETURN jsonb_build_object('status', 'bukan_admin');
    END IF;
    SELECT * INTO v_soal FROM soal_bank WHERE id = p_soal_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'tidak_ditemukan'); END IF;
    IF p_peran = 'mentor' AND v_soal.penulis_id <> p_aktor_id THEN
        RETURN jsonb_build_object('status', 'bukan_penulis');
    END IF;
    IF v_soal.status NOT IN ('draf', 'ditolak', 'terpublikasi') THEN
        RETURN jsonb_build_object('status', 'status_tidak_valid');
    END IF;

    SELECT coalesce(array_agg(p.id), ARRAY[]::UUID[]) INTO v_paket
    FROM paket_soal p JOIN paket_soal_item i ON i.paket_id = p.id
    WHERE i.soal_id = p_soal_id AND p.status IN ('terpublikasi', 'menunggu_soal');
    IF cardinality(v_paket) > 0 THEN
        RETURN jsonb_build_object('status', 'dipakai_paket', 'paket_ids', to_jsonb(v_paket));
    END IF;

    UPDATE soal_bank SET status = 'diarsipkan' WHERE id = p_soal_id;
    PERFORM studio_soal_tulis_log('soal', p_soal_id, p_aktor_id, p_peran, 'arsipkan', NULL, NULL, to_jsonb(v_soal));
    RETURN jsonb_build_object('status', 'diarsipkan');
END $$;

-- Ganti SELURUH isi paket draf sekaligus (urutan = urutan array).
-- Aturan: maks. 100 soal, tanpa duplikat, se-subtes; tiap soal terbit, ATAU
-- draf/diajukan/ditolak milik pembuat paket sendiri, ATAU sudah ada di paket
-- ini (mis. versi 'digantikan' hasil salinan versi paket); soal berstimulus
-- yang sama wajib berurutan (satu blok).
-- Gagal: tidak_ditemukan | bukan_pembuat | status_tidak_valid | tidak_eligible
--        | terlalu_banyak | soal_duplikat | soal_tidak_ditemukan | beda_subtes
--        | soal_tidak_boleh | stimulus_tidak_berurutan
CREATE OR REPLACE FUNCTION studio_soal_simpan_item_paket(p_paket_id UUID, p_aktor_id UUID, p_soal_ids UUID[])
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_paket paket_soal%ROWTYPE;
    v_ids UUID[] := coalesce(p_soal_ids, ARRAY[]::UUID[]);
    v_n INT;
BEGIN
    PERFORM studio_soal_mulai_rpc();
    SELECT * INTO v_paket FROM paket_soal WHERE id = p_paket_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'tidak_ditemukan'); END IF;
    IF v_paket.pembuat_id <> p_aktor_id THEN RETURN jsonb_build_object('status', 'bukan_pembuat'); END IF;
    IF v_paket.status <> 'draf' THEN RETURN jsonb_build_object('status', 'status_tidak_valid'); END IF;
    IF NOT studio_soal_mentor_eligible(p_aktor_id, v_paket.subtes_id) THEN
        RETURN jsonb_build_object('status', 'tidak_eligible');
    END IF;

    v_n := cardinality(v_ids);
    IF v_n > 100 THEN RETURN jsonb_build_object('status', 'terlalu_banyak'); END IF;
    IF (SELECT count(DISTINCT x) FROM unnest(v_ids) AS x) <> v_n THEN
        RETURN jsonb_build_object('status', 'soal_duplikat');
    END IF;
    IF (SELECT count(*) FROM soal_bank WHERE id = ANY (v_ids)) <> v_n THEN
        RETURN jsonb_build_object('status', 'soal_tidak_ditemukan');
    END IF;
    IF EXISTS (SELECT 1 FROM soal_bank WHERE id = ANY (v_ids) AND subtes_id <> v_paket.subtes_id) THEN
        RETURN jsonb_build_object('status', 'beda_subtes');
    END IF;
    IF EXISTS (
        SELECT 1 FROM soal_bank s
        WHERE s.id = ANY (v_ids)
          AND NOT (
              s.status = 'terpublikasi'
              OR (s.status IN ('draf', 'diajukan', 'ditolak') AND s.penulis_id = p_aktor_id)
              OR EXISTS (SELECT 1 FROM paket_soal_item i WHERE i.paket_id = p_paket_id AND i.soal_id = s.id
                         AND s.status = 'digantikan')
          )
    ) THEN
        RETURN jsonb_build_object('status', 'soal_tidak_boleh');
    END IF;
    IF EXISTS (
        SELECT 1 FROM (
            SELECT s.stimulus_id, min(t.ord) AS mn, max(t.ord) AS mx, count(*) AS c
            FROM unnest(v_ids) WITH ORDINALITY AS t(soal_id, ord)
            JOIN soal_bank s ON s.id = t.soal_id
            WHERE s.stimulus_id IS NOT NULL
            GROUP BY s.stimulus_id
        ) g WHERE g.mx - g.mn + 1 <> g.c
    ) THEN
        RETURN jsonb_build_object('status', 'stimulus_tidak_berurutan');
    END IF;

    DELETE FROM paket_soal_item WHERE paket_id = p_paket_id;
    INSERT INTO paket_soal_item (paket_id, soal_id, urutan)
    SELECT p_paket_id, t.soal_id, t.ord::smallint
    FROM unnest(v_ids) WITH ORDINALITY AS t(soal_id, ord);

    RETURN jsonb_build_object('status', 'disimpan', 'jumlah_soal', v_n);
END $$;

-- Ajukan/publikasikan paket draf.
--   * semua soal terbit/digantikan            -> paket langsung terpublikasi
--   * ada draf milik pembuat                  -> draf itu ikut diajukan (soal
--     mandiri / di stimulus terbit: per soal; di stimulus draf: sekelompok),
--     paket -> 'menunggu_soal', terbit otomatis saat soal terakhir disetujui
-- Semua syarat dicek DULU; kegagalan sesudahnya = RAISE (semua batal).
-- Gagal: tidak_ditemukan | bukan_pembuat | status_tidak_valid | tidak_eligible
--        | paket_kosong | soal_tidak_boleh | ada_soal_ditolak
CREATE OR REPLACE FUNCTION studio_soal_ajukan_paket(p_paket_id UUID, p_aktor_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_paket paket_soal%ROWTYPE;
    v_soal soal_bank%ROWTYPE;
    v_stimulus_id UUID;
    v_hasil JSONB;
    v_diajukan UUID[] := ARRAY[]::UUID[];
    v_stimulus_diajukan UUID[] := ARRAY[]::UUID[];
BEGIN
    PERFORM studio_soal_mulai_rpc();
    SELECT * INTO v_paket FROM paket_soal WHERE id = p_paket_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'tidak_ditemukan'); END IF;
    IF v_paket.pembuat_id <> p_aktor_id THEN RETURN jsonb_build_object('status', 'bukan_pembuat'); END IF;
    IF v_paket.status <> 'draf' THEN RETURN jsonb_build_object('status', 'status_tidak_valid'); END IF;
    IF NOT studio_soal_mentor_eligible(p_aktor_id, v_paket.subtes_id) THEN
        RETURN jsonb_build_object('status', 'tidak_eligible');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM paket_soal_item WHERE paket_id = p_paket_id) THEN
        RETURN jsonb_build_object('status', 'paket_kosong');
    END IF;

    PERFORM 1 FROM soal_bank s JOIN paket_soal_item i ON i.soal_id = s.id
    WHERE i.paket_id = p_paket_id FOR UPDATE OF s;

    -- Item tidak sah: diarsipkan, atau belum terbit tapi milik orang lain.
    IF EXISTS (
        SELECT 1 FROM paket_soal_item i JOIN soal_bank s ON s.id = i.soal_id
        WHERE i.paket_id = p_paket_id
          AND (s.status = 'diarsipkan'
               OR (s.status IN ('draf', 'diajukan', 'ditolak') AND s.penulis_id <> p_aktor_id))
    ) THEN
        RETURN jsonb_build_object('status', 'soal_tidak_boleh');
    END IF;
    -- Soal (atau stimulusnya) ditolak harus diperbaiki & diajukan ulang dulu.
    IF EXISTS (
        SELECT 1 FROM paket_soal_item i JOIN soal_bank s ON s.id = i.soal_id
        LEFT JOIN soal_stimulus st ON st.id = s.stimulus_id
        WHERE i.paket_id = p_paket_id
          AND (s.status = 'ditolak' OR (s.status = 'draf' AND st.status IN ('ditolak', 'digantikan', 'diarsipkan')))
    ) THEN
        RETURN jsonb_build_object('status', 'ada_soal_ditolak');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM paket_soal_item i JOIN soal_bank s ON s.id = i.soal_id
        WHERE i.paket_id = p_paket_id AND s.status NOT IN ('terpublikasi', 'digantikan')
    ) THEN
        PERFORM studio_soal_terbitkan_paket(p_paket_id, p_aktor_id);
        RETURN jsonb_build_object('status', 'terpublikasi', 'paket_id', p_paket_id);
    END IF;

    -- Kelompok stimulus draf: ajukan sekelompok (sekali per stimulus).
    FOR v_stimulus_id IN
        SELECT DISTINCT s.stimulus_id
        FROM paket_soal_item i JOIN soal_bank s ON s.id = i.soal_id
        JOIN soal_stimulus st ON st.id = s.stimulus_id
        WHERE i.paket_id = p_paket_id AND s.status = 'draf' AND st.status = 'draf'
    LOOP
        v_hasil := studio_soal_ajukan_stimulus(v_stimulus_id, p_aktor_id);
        IF v_hasil->>'status' <> 'diajukan' THEN
            RAISE EXCEPTION 'studio_soal: gagal mengajukan stimulus % (%)', v_stimulus_id, v_hasil->>'status';
        END IF;
        v_stimulus_diajukan := v_stimulus_diajukan || v_stimulus_id;
    END LOOP;

    -- Sisa draf: soal mandiri / di stimulus yang sudah terbit.
    FOR v_soal IN
        SELECT s.* FROM paket_soal_item i JOIN soal_bank s ON s.id = i.soal_id
        WHERE i.paket_id = p_paket_id AND s.status = 'draf'
        ORDER BY i.urutan
    LOOP
        v_hasil := studio_soal_ajukan_soal(v_soal.id, p_aktor_id);
        IF v_hasil->>'status' <> 'diajukan' THEN
            RAISE EXCEPTION 'studio_soal: gagal mengajukan soal % (%)', v_soal.id, v_hasil->>'status';
        END IF;
        v_diajukan := v_diajukan || v_soal.id;
    END LOOP;

    UPDATE paket_soal SET status = 'menunggu_soal' WHERE id = p_paket_id;
    PERFORM studio_soal_tulis_log('paket', p_paket_id, p_aktor_id, 'mentor', 'ajukan', NULL, NULL, to_jsonb(v_paket));
    RETURN jsonb_build_object('status', 'menunggu_soal', 'paket_id', p_paket_id,
                              'soal_diajukan', to_jsonb(v_diajukan),
                              'stimulus_diajukan', to_jsonb(v_stimulus_diajukan));
END $$;

-- Versi baru paket TERBIT (salinan metadata + item, status draf). Hanya pembuat.
-- Gagal: tidak_ditemukan | bukan_pembuat | status_tidak_valid | ada_versi_terbuka
--        | tidak_eligible
CREATE OR REPLACE FUNCTION studio_soal_buat_versi_paket(p_paket_id UUID, p_aktor_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_paket paket_soal%ROWTYPE;
    v_baru UUID;
BEGIN
    PERFORM studio_soal_mulai_rpc();
    SELECT * INTO v_paket FROM paket_soal WHERE id = p_paket_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'tidak_ditemukan'); END IF;
    IF v_paket.pembuat_id <> p_aktor_id THEN RETURN jsonb_build_object('status', 'bukan_pembuat'); END IF;
    IF v_paket.status <> 'terpublikasi' THEN RETURN jsonb_build_object('status', 'status_tidak_valid'); END IF;
    IF EXISTS (SELECT 1 FROM paket_soal WHERE keluarga_id = v_paket.keluarga_id AND status IN ('draf', 'menunggu_soal')) THEN
        RETURN jsonb_build_object('status', 'ada_versi_terbuka');
    END IF;
    IF NOT studio_soal_mentor_eligible(p_aktor_id, v_paket.subtes_id) THEN
        RETURN jsonb_build_object('status', 'tidak_eligible');
    END IF;

    INSERT INTO paket_soal (keluarga_id, versi, menggantikan_id, subtes_id, judul, deskripsi, durasi_menit, pembuat_id)
    SELECT keluarga_id,
           (SELECT max(versi) + 1 FROM paket_soal WHERE keluarga_id = v_paket.keluarga_id),
           id, subtes_id, judul, deskripsi, durasi_menit, pembuat_id
    FROM paket_soal WHERE id = p_paket_id
    RETURNING id INTO v_baru;

    INSERT INTO paket_soal_item (paket_id, soal_id, urutan)
    SELECT v_baru, soal_id, urutan FROM paket_soal_item WHERE paket_id = p_paket_id;

    PERFORM studio_soal_tulis_log('paket', v_baru, p_aktor_id, 'mentor', 'versi_baru', NULL, NULL,
                                  jsonb_build_object('dari', p_paket_id));
    RETURN jsonb_build_object('status', 'versi_dibuat', 'paket_id', v_baru);
END $$;

-- Arsipkan paket (pembuat, atau Admin). Status draf/menunggu_soal/terpublikasi.
-- Gagal: input_tidak_valid | bukan_admin | tidak_ditemukan | bukan_pembuat
--        | status_tidak_valid
CREATE OR REPLACE FUNCTION studio_soal_arsipkan_paket(p_paket_id UUID, p_aktor_id UUID, p_peran TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_paket paket_soal%ROWTYPE;
BEGIN
    PERFORM studio_soal_mulai_rpc();
    IF p_peran NOT IN ('mentor', 'admin') THEN RETURN jsonb_build_object('status', 'input_tidak_valid'); END IF;
    IF p_peran = 'admin' AND NOT studio_soal_admin_aktif(p_aktor_id) THEN
        RETURN jsonb_build_object('status', 'bukan_admin');
    END IF;
    SELECT * INTO v_paket FROM paket_soal WHERE id = p_paket_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'tidak_ditemukan'); END IF;
    IF p_peran = 'mentor' AND v_paket.pembuat_id <> p_aktor_id THEN
        RETURN jsonb_build_object('status', 'bukan_pembuat');
    END IF;
    IF v_paket.status NOT IN ('draf', 'menunggu_soal', 'terpublikasi') THEN
        RETURN jsonb_build_object('status', 'status_tidak_valid');
    END IF;
    UPDATE paket_soal SET status = 'diarsipkan' WHERE id = p_paket_id;
    PERFORM studio_soal_tulis_log('paket', p_paket_id, p_aktor_id, p_peran, 'arsipkan', NULL, NULL, to_jsonb(v_paket));
    RETURN jsonb_build_object('status', 'diarsipkan');
END $$;

-- ============================================================================
-- 7. RLS & HAK EXECUTE
-- ============================================================================
-- RLS wajib aktif di semua tabel (CLAUDE.md). TANPA policy: tertutup total
-- dari anon/authenticated, akses hanya lewat service_role di API route.
ALTER TABLE soal_topik ENABLE ROW LEVEL SECURITY;
ALTER TABLE soal_stimulus ENABLE ROW LEVEL SECURITY;
ALTER TABLE soal_bank ENABLE ROW LEVEL SECURITY;
ALTER TABLE paket_soal ENABLE ROW LEVEL SECURITY;
ALTER TABLE paket_soal_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE soal_tinjauan_log ENABLE ROW LEVEL SECURITY;

-- Supabase memberi EXECUTE ke anon/authenticated untuk fungsi baru di schema
-- public secara default — cabut semuanya, beri hanya ke service_role.
DO $$
DECLARE
    f RECORD;
BEGIN
    FOR f IN
        SELECT p.oid::regprocedure AS sig
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname LIKE 'studio_soal_%'
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.sig);
    END LOOP;
END $$;


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