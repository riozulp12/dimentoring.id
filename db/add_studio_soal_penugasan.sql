-- Migration: Studio Soal — penugasan mentor ke subtes oleh Admin (PR 3a;
-- revisi K2 di docs/design/studio-soal-snbt-tahap1.md, BR-37, PRD Bagian 13).
--
-- Kenapa tabel baru (bukan mentor_subtes_diampu):
--   mentor_subtes_diampu adalah PROFIL MENGAJAR yang diisi mentor sendiri
--   (registrasi + Edit Profil mengganti seluruh isinya) dan dipakai fitur lain
--   (landing page, pencocokan mentor offline, validasi Kelola Kelas &
--   Pendaftaran Manual, notifikasi/antrean review konten AI, dashboard).
--   Hak MENULIS/MENINJAU soal kini dipisah: hanya Admin yang menetapkannya,
--   tercatat di log. mentor_subtes_diampu TIDAK disentuh migrasi ini.
--
-- Isi:
--   1. Tabel  : studio_soal_penugasan (mentor x subtes), studio_soal_penugasan_log
--   2. Trigger penjaga: tulis ke dua tabel itu HANYA lewat RPC; log tidak bisa
--      diubah/dihapus
--   3. Fungsi izin diganti (signature sama): studio_soal_mentor_eligible,
--      studio_soal_hitung_peninjau_eligible -> membaca studio_soal_penugasan.
--      Semua RPC studio_soal_* memakai dua fungsi ini, jadi aturan lama tetap
--      berlaku apa adanya: penulis tidak boleh meninjau soalnya sendiri, Admin
--      hanya boleh mempublikasikan bila 0 mentor eligible selain penulis.
--   4. RPC studio_soal_atur_penugasan (Admin; ubah + log dalam satu transaksi)
--   5. RLS aktif TANPA policy (hanya service_role) + hak EXECUTE
--
-- Mencabut penugasan TIDAK menghapus/mengubah soal, stimulus, atau paket —
-- tabel itu tidak disentuh. Akibatnya hanya: mentor itu tidak lagi bisa
-- menulis/mengajukan/meninjau di subtes tersebut sampai ditugaskan lagi.
--
-- Penugasan awal KOSONG (tidak ada isi otomatis dari profil). Setelah migrasi
-- ini tidak ada mentor yang eligible sampai Admin menugaskan.
--
-- Butuh db/add_studio_soal.sql sudah dijalankan lebih dulu. Menjalankan ulang
-- add_studio_soal.sql SESUDAH file ini aman: bagian fungsi izin di sana
-- dilewati bila tabel studio_soal_penugasan sudah ada.
--
-- Idempotent: CREATE ... IF NOT EXISTS, DROP TRIGGER IF EXISTS sebelum CREATE,
-- CREATE OR REPLACE FUNCTION. Tidak ada policy yang dibuat.
--
-- ============================================================================
-- CARA DRY-RUN (SQL Editor Supabase, satu kali eksekusi)
-- ============================================================================
--     BEGIN;
--     <isi file ini>
--     <isi file ini SEKALI LAGI>          -- bukti idempotent
--     <isi db/test_studio_soal_penugasan_DRYRUN.sql>
--     ROLLBACK;
--   Harus selesai tanpa error. Gagal = pesan "DRY-RUN GAGAL [v1]: ...".
--
-- CARA JALAN SUNGGUHAN: jalankan file ini, lalu jalankan SEKALI LAGI (harus
-- tanpa error). Cek dengan query verifikasi di bawah.
--
-- ============================================================================
-- QUERY VERIFIKASI
-- ============================================================================
--   -- (a) 2 tabel, RLS aktif, 0 policy:
--   SELECT tablename, rowsecurity,
--          (SELECT count(*) FROM pg_policies p WHERE p.tablename = t.tablename) AS policy
--   FROM pg_tables t
--   WHERE schemaname = 'public'
--     AND tablename IN ('studio_soal_penugasan', 'studio_soal_penugasan_log');
--                                          -- harapan: 2 baris, true, 0
--
--   -- (b) fungsi izin sudah membaca tabel baru (harapan: 2 baris, true):
--   SELECT proname, prosrc LIKE '%studio_soal_penugasan%' AS pakai_penugasan
--   FROM pg_proc
--   WHERE proname IN ('studio_soal_mentor_eligible', 'studio_soal_hitung_peninjau_eligible');
--
--   -- (c) hak EXECUTE RPC (anon/authenticated harus false):
--   SELECT has_function_privilege('anon', 'studio_soal_atur_penugasan(uuid,uuid,uuid,text)', 'EXECUTE') AS anon,
--          has_function_privilege('authenticated', 'studio_soal_atur_penugasan(uuid,uuid,uuid,text)', 'EXECUTE') AS authenticated;

-- ============================================================================
-- 1. TABEL
-- ============================================================================

-- Satu baris = mentor boleh menulis & meninjau soal subtes itu. PK mencegah
-- penugasan ganda.
CREATE TABLE IF NOT EXISTS studio_soal_penugasan (
    mentor_id UUID NOT NULL REFERENCES users(id),
    subtes_id UUID NOT NULL REFERENCES subtes(id),
    ditugaskan_oleh UUID NOT NULL REFERENCES users(id),   -- Admin
    ditugaskan_pada TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (mentor_id, subtes_id)
);

CREATE INDEX IF NOT EXISTS idx_studio_soal_penugasan_subtes ON studio_soal_penugasan(subtes_id);

-- Log audit: setiap penugasan/pencabutan yang BENAR-BENAR mengubah data.
-- Permintaan yang tidak mengubah apa pun (sudah ditugaskan / memang tidak
-- ditugaskan) tidak dicatat.
CREATE TABLE IF NOT EXISTS studio_soal_penugasan_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL REFERENCES users(id),
    mentor_id UUID NOT NULL REFERENCES users(id),
    subtes_id UUID NOT NULL REFERENCES subtes(id),
    aksi TEXT NOT NULL CHECK (aksi IN ('tugaskan', 'cabut')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_studio_soal_penugasan_log_mentor
    ON studio_soal_penugasan_log(mentor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_studio_soal_penugasan_log_subtes
    ON studio_soal_penugasan_log(subtes_id, created_at DESC);

-- ============================================================================
-- 2. TRIGGER PENJAGA
-- ============================================================================
-- Jaring pengaman kalau ada bug di API: tulis langsung (tanpa RPC) ditolak.
-- Penanda RPC = studio_soal_mulai_rpc()/studio_soal_dalam_rpc() dari
-- db/add_studio_soal.sql (lokal per transaksi).

CREATE OR REPLACE FUNCTION studio_soal_jaga_penugasan()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'studio_soal_penugasan tidak bisa diubah; cabut lalu tugaskan ulang lewat studio_soal_atur_penugasan';
    END IF;
    IF NOT studio_soal_dalam_rpc() THEN
        RAISE EXCEPTION 'studio_soal_penugasan hanya bisa diubah lewat studio_soal_atur_penugasan';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION studio_soal_jaga_penugasan_log()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF TG_OP <> 'INSERT' THEN
        RAISE EXCEPTION 'studio_soal_penugasan_log tidak bisa diubah atau dihapus';
    END IF;
    IF NOT studio_soal_dalam_rpc() THEN
        RAISE EXCEPTION 'studio_soal_penugasan_log hanya diisi lewat studio_soal_atur_penugasan';
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_studio_soal_jaga_penugasan ON studio_soal_penugasan;
CREATE TRIGGER trg_studio_soal_jaga_penugasan
    BEFORE INSERT OR UPDATE OR DELETE ON studio_soal_penugasan
    FOR EACH ROW EXECUTE FUNCTION studio_soal_jaga_penugasan();

DROP TRIGGER IF EXISTS trg_studio_soal_jaga_penugasan_log ON studio_soal_penugasan_log;
CREATE TRIGGER trg_studio_soal_jaga_penugasan_log
    BEFORE INSERT OR UPDATE OR DELETE ON studio_soal_penugasan_log
    FOR EACH ROW EXECUTE FUNCTION studio_soal_jaga_penugasan_log();

-- ============================================================================
-- 3. FUNGSI IZIN (menggantikan versi mentor_subtes_diampu)
-- ============================================================================

-- Mentor eligible untuk subtes = role mentor ACTIVE + DITUGASKAN Admin untuk
-- subtes_id PERSIS. Mentor yang nonaktif (pending/rejected) otomatis tidak
-- eligible walau baris penugasannya masih ada.
CREATE OR REPLACE FUNCTION studio_soal_mentor_eligible(p_user_id UUID, p_subtes_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM user_roles ur
        JOIN studio_soal_penugasan sp ON sp.mentor_id = ur.user_id
        WHERE ur.user_id = p_user_id
          AND ur.role_type = 'mentor'
          AND ur.status = 'active'
          AND sp.subtes_id = p_subtes_id
    );
$$;

-- Jumlah mentor eligible untuk subtes, KECUALI user di p_kecuali (penulis).
-- Dipakai RPC ajukan (peringatan "belum ada peninjau") dan syarat publikasi
-- Admin (harus 0).
CREATE OR REPLACE FUNCTION studio_soal_hitung_peninjau_eligible(p_subtes_id UUID, p_kecuali UUID[])
RETURNS INT
LANGUAGE sql STABLE
SET search_path = public
AS $$
    SELECT count(DISTINCT ur.user_id)::int
    FROM user_roles ur
    JOIN studio_soal_penugasan sp ON sp.mentor_id = ur.user_id
    WHERE ur.role_type = 'mentor'
      AND ur.status = 'active'
      AND sp.subtes_id = p_subtes_id
      AND NOT (ur.user_id = ANY (coalesce(p_kecuali, ARRAY[]::UUID[])));
$$;

-- ============================================================================
-- 4. RPC PENUGASAN
-- ============================================================================
-- p_aksi: 'tugaskan' | 'cabut'. Hasil JSONB { status, jumlah_mentor_eligible }.
-- Sukses : 'ditugaskan' | 'dicabut' (data berubah + 1 baris log)
--          'sudah_ditugaskan' | 'tidak_ditugaskan' (tidak ada perubahan, tanpa log)
-- Gagal  : 'input_tidak_valid' | 'bukan_admin' | 'subtes_tidak_valid'
--          | 'bukan_mentor_aktif' (hanya untuk tugaskan; mencabut mentor
--          nonaktif tetap boleh)
CREATE OR REPLACE FUNCTION studio_soal_atur_penugasan(
    p_admin_id UUID,
    p_mentor_id UUID,
    p_subtes_id UUID,
    p_aksi TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_status TEXT;
    v_n INT;
BEGIN
    PERFORM studio_soal_mulai_rpc();

    IF p_admin_id IS NULL OR p_mentor_id IS NULL OR p_subtes_id IS NULL
       OR p_aksi IS NULL OR p_aksi NOT IN ('tugaskan', 'cabut') THEN
        RETURN jsonb_build_object('status', 'input_tidak_valid');
    END IF;
    IF NOT studio_soal_admin_aktif(p_admin_id) THEN
        RETURN jsonb_build_object('status', 'bukan_admin');
    END IF;
    IF NOT studio_soal_subtes_snbt(p_subtes_id) THEN
        RETURN jsonb_build_object('status', 'subtes_tidak_valid');
    END IF;

    IF p_aksi = 'tugaskan' THEN
        IF NOT EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_id = p_mentor_id AND role_type = 'mentor' AND status = 'active'
        ) THEN
            RETURN jsonb_build_object('status', 'bukan_mentor_aktif');
        END IF;
        INSERT INTO studio_soal_penugasan (mentor_id, subtes_id, ditugaskan_oleh)
        VALUES (p_mentor_id, p_subtes_id, p_admin_id)
        ON CONFLICT (mentor_id, subtes_id) DO NOTHING;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        v_status := CASE WHEN v_n = 1 THEN 'ditugaskan' ELSE 'sudah_ditugaskan' END;
    ELSE
        DELETE FROM studio_soal_penugasan WHERE mentor_id = p_mentor_id AND subtes_id = p_subtes_id;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        v_status := CASE WHEN v_n = 1 THEN 'dicabut' ELSE 'tidak_ditugaskan' END;
    END IF;

    IF v_n = 1 THEN
        INSERT INTO studio_soal_penugasan_log (admin_id, mentor_id, subtes_id, aksi)
        VALUES (p_admin_id, p_mentor_id, p_subtes_id, p_aksi);
    END IF;

    RETURN jsonb_build_object(
        'status', v_status,
        'jumlah_mentor_eligible', studio_soal_hitung_peninjau_eligible(p_subtes_id, NULL)
    );
END $$;

-- ============================================================================
-- 5. RLS + HAK EXECUTE
-- ============================================================================
-- RLS wajib aktif di semua tabel (CLAUDE.md) — tanpa policy: cuma service_role.
ALTER TABLE studio_soal_penugasan ENABLE ROW LEVEL SECURITY;
ALTER TABLE studio_soal_penugasan_log ENABLE ROW LEVEL SECURITY;

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
