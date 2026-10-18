-- Migration: Studio Soal SNBT Tahap 1 — bank soal manual mentor, stimulus,
-- paket, tinjau sejawat (PRD 7.7 revisi, BR-37, Bagian 13; desain lengkap di
-- docs/design/studio-soal-snbt-tahap1.md).
--
-- Isi:
--   1. Tabel  : soal_topik, soal_stimulus, soal_bank, paket_soal,
--               paket_soal_item, soal_tinjauan_log
--   2. Constraint (DROP IF EXISTS + ADD -> definisi terbaru selalu terpasang)
--   3. Indeks
--   4. Fungsi bantu (subtes SNBT, mentor eligible, hitung peninjau eligible)
--   5. Trigger penjaga (status hanya lewat RPC, isi terbit terkunci, relasi)
--   6. RPC transisi status (studio_soal_*)
--   7. RLS (aktif, TANPA policy -> hanya service_role) + hak EXECUTE
--
-- TIDAK menyentuh tabel/enum yang sudah ada: soal_ai, materi, enum
-- soal_ai_status/konten_sumber/soal_ai_kesulitan, payments, gamifikasi_*,
-- tryout_attempts, mentor_soal_reward_*. Tabel lain hanya DIBACA (subtes,
-- user_roles, mentor_profiles, mentor_subtes_diampu).
--
-- Idempotent: aman dijalankan berkali-kali (CREATE ... IF NOT EXISTS,
-- DROP CONSTRAINT/TRIGGER IF EXISTS sebelum ADD/CREATE, CREATE OR REPLACE
-- FUNCTION). Tidak ada policy yang dibuat, jadi tidak ada policy yang perlu
-- di-DROP.
--
-- ============================================================================
-- CARA DRY-RUN (SQL Editor Supabase)
-- ============================================================================
--   1. Tulis `BEGIN;` di baris pertama editor, tempel SELURUH file ini, lalu
--      (opsional) tempel db/test_studio_soal_DRYRUN.sql, dan akhiri dengan
--      `ROLLBACK;`. Jalankan. Harus selesai tanpa error dan (kalau skenario
--      ikut) memunculkan NOTICE "STUDIO SOAL DRY-RUN: SEMUA SKENARIO LULUS".
--      ROLLBACK membatalkan semuanya — database tidak berubah.
--   2. Jalankan query verifikasi di bawah DI DALAM transaksi yang sama
--      (sebelum ROLLBACK) kalau ingin melihat hasilnya.
--   3. Kalau bersih: jalankan file ini sungguhan (tanpa BEGIN/ROLLBACK dan
--      tanpa skenario uji). Lalu jalankan SEKALI LAGI — harus tanpa error
--      (bukti idempotent).
--
-- ============================================================================
-- QUERY VERIFIKASI
-- ============================================================================
--   -- (a) 6 tabel, semuanya RLS aktif:
--   SELECT tablename, rowsecurity FROM pg_tables
--   WHERE schemaname = 'public'
--     AND tablename IN ('soal_topik','soal_stimulus','soal_bank','paket_soal',
--                       'paket_soal_item','soal_tinjauan_log')
--   ORDER BY tablename;                         -- harapan: 6 baris, rowsecurity = true
--
--   -- (b) 0 policy di tabel baru (akses hanya service_role):
--   SELECT count(*) FROM pg_policies
--   WHERE tablename IN ('soal_topik','soal_stimulus','soal_bank','paket_soal',
--                       'paket_soal_item','soal_tinjauan_log');   -- harapan: 0
--
--   -- (c) fungsi + hak EXECUTE (anon/authenticated harus false):
--   SELECT p.proname,
--          has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon,
--          has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
--          has_function_privilege('service_role', p.oid, 'EXECUTE')  AS service_role
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.proname LIKE '%studio_soal%'
--   ORDER BY p.proname;                         -- harapan: 25 baris, anon/authenticated = false
--
--   -- (d) trigger:
--   SELECT event_object_table, trigger_name FROM information_schema.triggers
--   WHERE trigger_name LIKE 'trg_studio_soal%'
--   GROUP BY 1, 2 ORDER BY 1, 2;                -- harapan: 8 baris
--
--   -- (e) constraint bernama:
--   SELECT conrelid::regclass AS tabel, count(*) FROM pg_constraint
--   WHERE conname LIKE 'soal_%' OR conname LIKE 'paket_soal%'
--   GROUP BY 1 ORDER BY 1;
--
-- ============================================================================
-- ATURAN INTI (ringkas — detail di dokumen desain)
-- ============================================================================
--   * Status (draf -> diajukan -> terpublikasi/ditolak -> digantikan/
--     diarsipkan) HANYA bisa berubah lewat fungsi studio_soal_* (flag
--     transaksi `studio_soal.rpc`). UPDATE langsung ke kolom status ditolak
--     trigger — jaring pengaman kalau ada bug di API.
--   * Isi soal/stimulus/paket hanya bisa diedit saat status 'draf'/'ditolak'.
--     Isi yang sudah diajukan/terbit terkunci; edit = versi baru (copy-on-write).
--   * Peninjau != penulis (CHECK + RPC). Peninjau = mentor active dengan
--     mentor_subtes_diampu untuk subtes_id PERSIS (bukan mapel_dasar).
--   * Admin hanya boleh MEMPUBLIKASIKAN bila 0 mentor eligible selain penulis
--     (dihitung di RPC saat aksi, tercatat di log). Admin boleh MENOLAK kapan saja.
--   * Stimulus + soalnya ditinjau sebagai satu kelompok; satu penulis per
--     stimulus (hanya penulis stimulus yang boleh menambah soal ke dalamnya).
--   * Paket tidak ditinjau ulang; hanya terbit bila semua soalnya terbit.
--   * Tahap 1 hanya subtes SNBT (subtes.kategori IN ('tps','literasi')).
--
-- Hasil RPC: JSONB { "status": "<kode>" , ... }. Kode sukses: 'diajukan',
-- 'ditarik', 'terpublikasi', 'ditolak', 'versi_dibuat', 'diarsipkan',
-- 'disimpan', 'menunggu_soal'. Kode gagal dijelaskan di tiap fungsi. Semua
-- pengecekan dilakukan SEBELUM perubahan apa pun; pelanggaran setelah itu =
-- RAISE (seluruh transaksi batal).

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
