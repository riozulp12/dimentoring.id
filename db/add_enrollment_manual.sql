-- Migration: pendaftaran siswa MANUAL oleh Admin & penugasan mentor offline
-- manual (PRD Bagian 7.5.10, Bagian 13 — Enrollment.sumber, EnrollmentManualLog).
--
-- Kasus: siswa sudah bayar DI LUAR website (transfer/tunai/link Mayar lain/
-- beasiswa) — Admin mendaftarkan dari halaman Pendaftar (Kelola Kelas) tanpa
-- SQL manual. Aturan:
--   * TANPA baris payments  -> tidak ada promo, poin, atau reward referral
--     (semuanya hanya dipicu lib/payment/fulfillPayment.ts dari payments).
--   * TANPA override kapasitas -> kelas penuh = ditolak.
--   * Alasan WAJIB (min. 10 karakter), semua aksi tercatat di
--     enrollment_manual_log.
--
-- Jalankan di SQL Editor Supabase SEBELUM deploy kode yang memanggil
-- daftar_siswa_manual / ubah_mentor_offline_manual. Idempotent-safe: aman
-- dijalankan ulang. Baris enrollments lama otomatis sumber = 'checkout'.

-- ---- 1. Kolom baru di enrollments ------------------------------------------
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS sumber TEXT NOT NULL DEFAULT 'checkout';
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS nominal_dibayar INTEGER;  -- rupiah, informasi saja (bukan dasar honor/pendapatan)
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS dibuat_oleh UUID REFERENCES users(id) ON DELETE SET NULL;  -- Admin yang mendaftarkan (NULL = checkout)

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'enrollments_sumber_valid') THEN
        ALTER TABLE enrollments ADD CONSTRAINT enrollments_sumber_valid
            CHECK (sumber IN ('checkout', 'manual'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'enrollments_nominal_dibayar_nonneg') THEN
        ALTER TABLE enrollments ADD CONSTRAINT enrollments_nominal_dibayar_nonneg
            CHECK (nominal_dibayar IS NULL OR nominal_dibayar >= 0);
    END IF;
END $$;

-- ---- 2. Log audit -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS enrollment_manual_log (
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

CREATE INDEX IF NOT EXISTS idx_enrollment_manual_log_enrollment ON enrollment_manual_log(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_enrollment_manual_log_kelas ON enrollment_manual_log(kelas_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_enrollment_manual_log_request
    ON enrollment_manual_log(request_id) WHERE request_id IS NOT NULL;

-- RLS wajib aktif di semua tabel (CLAUDE.md) — tanpa policy: cuma service_role.
ALTER TABLE enrollment_manual_log ENABLE ROW LEVEL SECURITY;

-- ---- 3. Daftarkan siswa manual (SATU transaksi) ----------------------------
-- enrollment 'lunas' (sumber='manual') + enrollment_subtes + sesi_kelas
-- 1..jumlah_sesi + log. Gagal di langkah mana pun = semuanya batal.
-- Baris kelas dikunci FOR UPDATE supaya dua pendaftaran manual bersamaan ke
-- kelas yang sama tidak bisa sama-sama lolos cek kapasitas.
--
-- sesi_kelas dibentuk SAMA PERSIS dengan lib/absensi/generateSesiKelas.ts
-- (enrollment_id, nomor_sesi 1..N, kolom lain default) — diulang di SQL
-- karena helper JS tidak bisa ikut transaksi ini.
--
-- Validasi peran (siswa aktif, mentor offline layak, pool subtes) dilakukan
-- di app/api/admin/enrollment-manual; di sini lapis terakhir yang menyangkut
-- integritas data (duplikat, kapasitas, idempotensi).
--
-- status hasil: 'dibuat' | 'sudah_diproses' (request_id sama) | 'duplikat'
-- | 'penuh' | 'kelas_tidak_ada'.
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
    p_request_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_kelas kelas%ROWTYPE;
    v_existing enrollments%ROWTYPE;
    v_log_enrollment UUID;
    v_lunas INT;
    v_enrollment enrollments%ROWTYPE;
    v_subtes UUID[] := coalesce(p_subtes_ids, ARRAY[]::UUID[]);
BEGIN
    SELECT * INTO v_kelas FROM kelas WHERE id = p_kelas_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'kelas_tidak_ada');
    END IF;

    -- Idempotensi — dicek SETELAH kunci kelas supaya permintaan kembar yang
    -- menunggu kunci melihat log milik permintaan pertama.
    IF p_request_id IS NOT NULL THEN
        SELECT enrollment_id INTO v_log_enrollment
        FROM enrollment_manual_log WHERE request_id = p_request_id;
        IF FOUND THEN
            RETURN jsonb_build_object('status', 'sudah_diproses', 'enrollment_id', v_log_enrollment);
        END IF;
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
            'enrollment', to_jsonb(v_enrollment),
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

REVOKE ALL ON FUNCTION daftar_siswa_manual(UUID, UUID, UUID, UUID[], UUID, DECIMAL, DECIMAL, TEXT, INTEGER, TEXT, UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION daftar_siswa_manual(UUID, UUID, UUID, UUID[], UUID, DECIMAL, DECIMAL, TEXT, INTEGER, TEXT, UUID)
    TO service_role;

-- ---- 4. Ubah mentor offline satu enrollment (SATU transaksi) ---------------
-- Enrollment dikunci FOR UPDATE. Mentor baru wajib role mentor 'active' dan
-- bisa_offline (kecocokan mapel dicek di API). Sesi yang sudah ditandai mentor
-- lama TIDAK diubah (sesi_kelas.mentor_id tetap mencatat siapa yang mengajar).
--
-- status hasil: 'diubah' | 'tidak_ditemukan' | 'bukan_offline' | 'belum_lunas'
-- | 'sama' | 'mentor_tidak_valid'.
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
