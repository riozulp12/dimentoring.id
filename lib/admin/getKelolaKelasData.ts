import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { formatJadwal } from "@/lib/shared/formatJadwal";

/**
 * Data layer "Kelola Kelas" (Admin) — PRD Bagian 7.5, 7.5.3 (tipe_kelas &
 * honor), Bagian 13 (kelas, subtes, users/mentor).
 */

export interface JadwalEntry {
  hari: string;
  jamMulai: string;
}

/** Satu pasangan Subtes-Mentor eksplisit dalam kelas paket (kelas_subtes_mentor). */
export interface SubtesMentorPair {
  subtesId: string;
  subtesNama: string;
  mentorId: string;
  mentorNama: string;
}

export interface KelasListItem {
  id: string;
  nama: string;
  programKategori: string;
  tingkatKelas: string;
  tipeKelas: string;
  subtesId: string | null;
  /** Nama semua Subtes kelas ini digabung koma (kelas_subtes) — "-" kalau tidak ada. */
  subtesNama: string;
  /** DEPRECATED, dipertahankan untuk kompatibilitas lama — mentor pertama
   * yang dipilih. Sumber utama sekarang mentorIds/mentorNamaList (kelas_mentor). */
  mentorId: string | null;
  mentorNama: string | null;
  mentorIds: string[];
  mentorNamaList: string[];
  /** Pasangan eksplisit Subtes-Mentor (kelas_subtes_mentor) — kosong kalau kelas
   * ini tidak terikat subtes tertentu (mis. Konsultasi/Pendampingan Mahasiswa),
   * pakai mentorIds/mentorNamaList generik sebagai gantinya. */
  subtesMentorPairs: SubtesMentorPair[];
  kapasitas: number;
  jumlahSiswa: number;
  harga: number;
  /** Dipakai untuk prefill form edit (picker hari+jam). */
  jadwalEntries: JadwalEntry[];
  /** Dipakai untuk tampilan read-only (list/detail) — reuse formatJadwal yang
   * sama dengan halaman Siswa/Mentor. */
  jadwalDisplay: string;
  linkMeet: string | null;
  /** SEMENTARA (PRD 7.5) — link produk Lynk.id, dipakai selama Payment
   * otomatis belum aktif (NEXT_PUBLIC_PENDAFTARAN_MANUAL). */
  linkLynkid: string | null;
  deskripsi: string | null;
}

export interface SubtesOption {
  id: string;
  nama: string;
  /** Pengelompokan mapel serumpun (subtes.mapel_dasar) — null kalau subtes ini
   * belum dikelompokkan. Dipakai untuk cocokkan Mentor lintas varian subtes
   * yang serumpun (mis. Literasi vs biasa), bukan cuma subtes_id persis sama. */
  mapelDasar: string | null;
}

export interface MentorOption {
  id: string;
  nama: string;
  subtesIds: string[];
  /** mapel_dasar (unik, tanpa null) dari semua subtes yang diampu mentor ini. */
  mapelDasarList: string[];
}

type NamaOnly = { nama: string };

function firstOrNull<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/** Ambil jadwal (JSONB array {hari, jam_mulai}) jadi shape form. Entri lama
 * yang belum berupa {hari, jam_mulai} lengkap (mis. teks bebas) dilewati —
 * tampilan read-only tetap benar lewat formatJadwal(), form edit tinggal
 * minta admin isi ulang jadwalnya lewat picker baru. */
function extractJadwalEntries(jadwal: unknown): JadwalEntry[] {
  if (!jadwal) return [];
  const entries = Array.isArray(jadwal) ? jadwal : [jadwal];
  return entries
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const obj = entry as Record<string, unknown>;
      const hari = typeof obj.hari === "string" ? obj.hari : "";
      const jamMulai = typeof obj.jam_mulai === "string" ? obj.jam_mulai : "";
      if (!hari || !jamMulai) return null;
      return { hari, jamMulai };
    })
    .filter((e): e is JadwalEntry => e !== null);
}

interface KelasRow {
  id: string;
  nama: string;
  program_kategori: string;
  tingkat_kelas: string;
  tipe_kelas: string;
  subtes_id: string | null;
  kapasitas: number;
  harga: number;
  jadwal: unknown;
  link_meet: string | null;
  link_lynkid: string | null;
  deskripsi: string | null;
  subtes: NamaOnly | NamaOnly[] | null;
  kelas_subtes: { subtes_id: string; subtes: NamaOnly | NamaOnly[] | null }[] | null;
  kelas_mentor: { mentor_id: string; users: NamaOnly | NamaOnly[] | null }[] | null;
  kelas_subtes_mentor:
    | {
        subtes_id: string;
        mentor_id: string;
        subtes: NamaOnly | NamaOnly[] | null;
        users: NamaOnly | NamaOnly[] | null;
      }[]
    | null;
  enrollments: { status_pembayaran: string }[] | null;
}

/** List semua kelas — dipakai halaman Kelola Kelas. Mentor bersumber dari
 * kelas_mentor (many-to-many, bisa lebih dari satu mentor per kelas); pasangan
 * Subtes-Mentor eksplisit bersumber dari kelas_subtes_mentor. */
export async function getKelasList(): Promise<KelasListItem[]> {
  const { data, error } = await supabaseServer
    .from("kelas")
    .select(
      `id, nama, program_kategori, tingkat_kelas, tipe_kelas, subtes_id, kapasitas, harga, jadwal, link_meet, link_lynkid, deskripsi,
       subtes:subtes_id(nama),
       kelas_subtes(subtes_id, subtes:subtes_id(nama)),
       kelas_mentor(mentor_id, users:mentor_id(nama)),
       kelas_subtes_mentor(subtes_id, mentor_id, subtes:subtes_id(nama), users:mentor_id(nama)),
       enrollments(status_pembayaran)`,
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[getKelasList] query failed:", error);
    return [];
  }

  return ((data ?? []) as unknown as KelasRow[]).map((row) => {
    const legacySubtes = firstOrNull(row.subtes);
    const mentors = (row.kelas_mentor ?? []).map((rel) => ({
      id: rel.mentor_id,
      nama: firstOrNull(rel.users)?.nama ?? "-",
    }));
    const subtesList = (row.kelas_subtes ?? []).map((rel) => ({
      id: rel.subtes_id,
      nama: firstOrNull(rel.subtes)?.nama ?? "-",
    }));
    const subtesMentorPairs: SubtesMentorPair[] = (row.kelas_subtes_mentor ?? []).map((rel) => ({
      subtesId: rel.subtes_id,
      subtesNama: firstOrNull(rel.subtes)?.nama ?? "-",
      mentorId: rel.mentor_id,
      mentorNama: firstOrNull(rel.users)?.nama ?? "-",
    }));
    const jumlahSiswa = (row.enrollments ?? []).filter((e) => e.status_pembayaran === "lunas").length;

    // subtesNama tampilan: utamakan kelas_subtes (bisa lebih dari satu), fallback
    // ke kelas.subtes_id lama kalau kelas ini belum pernah disentuh form baru.
    const subtesNama =
      subtesList.length > 0
        ? subtesList.map((s) => s.nama).join(", ")
        : (legacySubtes?.nama ?? "-");

    return {
      id: row.id,
      nama: row.nama,
      programKategori: row.program_kategori,
      tingkatKelas: row.tingkat_kelas,
      tipeKelas: row.tipe_kelas,
      subtesId: row.subtes_id,
      subtesNama,
      mentorId: mentors[0]?.id ?? null,
      mentorNama: mentors[0]?.nama ?? null,
      mentorIds: mentors.map((m) => m.id),
      mentorNamaList: mentors.map((m) => m.nama),
      subtesMentorPairs,
      kapasitas: row.kapasitas,
      jumlahSiswa,
      harga: Number(row.harga),
      jadwalEntries: extractJadwalEntries(row.jadwal),
      jadwalDisplay: formatJadwal(row.jadwal),
      linkMeet: row.link_meet,
      linkLynkid: row.link_lynkid,
      deskripsi: row.deskripsi,
    };
  });
}

/** Opsi dropdown/checklist Subtes — cuma yang ditawarkan=true (subtes elektif
 * langka seperti Antropologi/Bahasa Arab/Bahasa Jepang belum ditawarkan
 * sebagai kelas bimbingan, lihat CLAUDE.md/PRD Bagian 13 subtes.ditawarkan). */
export async function getSubtesOptions(): Promise<SubtesOption[]> {
  const { data, error } = await supabaseServer
    .from("subtes")
    .select("id, nama, mapel_dasar")
    .eq("ditawarkan", true)
    .order("nama", { ascending: true });

  if (error) {
    console.error("[getSubtesOptions] query failed:", error);
    return [];
  }
  return (data ?? []).map((row) => ({
    id: row.id as string,
    nama: row.nama as string,
    mapelDasar: (row.mapel_dasar as string | null) ?? null,
  }));
}

interface DiampuRow {
  subtes_id: string;
  subtes: { mapel_dasar: string | null } | { mapel_dasar: string | null }[] | null;
}

interface MentorSubtesRow {
  user_id: string;
  users: {
    nama: string;
    mentor_profiles: { mentor_subtes_diampu: DiampuRow[] | null } | { mentor_subtes_diampu: DiampuRow[] | null }[] | null;
  } | {
    nama: string;
    mentor_profiles: { mentor_subtes_diampu: DiampuRow[] | null } | { mentor_subtes_diampu: DiampuRow[] | null }[] | null;
  }[] | null;
}

/**
 * Opsi dropdown Mentor — HANYA mentor role_type='mentor' status='active',
 * masing-masing dilengkapi daftar subtesIds & mapelDasarList yang diampunya.
 * Filter "cocok" dilakukan di client (dinamis, tanpa round-trip tiap ganti
 * pilihan) — cocokkan lewat mapel_dasar (mapel serumpun), bukan cuma
 * subtes_id persis sama, lihat CLAUDE.md/PRD Bagian 13 (subtes.mapel_dasar).
 */
export async function getActiveMentorsWithSubtes(): Promise<MentorOption[]> {
  const { data, error } = await supabaseServer
    .from("user_roles")
    .select(
      "user_id, users:user_id(nama, mentor_profiles(mentor_subtes_diampu(subtes_id, subtes:subtes_id(mapel_dasar))))",
    )
    .eq("role_type", "mentor")
    .eq("status", "active");

  if (error) {
    console.error("[getActiveMentorsWithSubtes] query failed:", error);
    return [];
  }

  return ((data ?? []) as unknown as MentorSubtesRow[])
    .map((row) => {
      const user = firstOrNull(row.users);
      if (!user) return null;
      const profile = firstOrNull(user.mentor_profiles);
      const diampu = profile?.mentor_subtes_diampu ?? [];
      const subtesIds = diampu.map((r) => r.subtes_id);
      const mapelDasarList = Array.from(
        new Set(
          diampu
            .map((r) => firstOrNull(r.subtes)?.mapel_dasar ?? null)
            .filter((m): m is string => Boolean(m)),
        ),
      );
      return { id: row.user_id, nama: user.nama, subtesIds, mapelDasarList };
    })
    .filter((m): m is MentorOption => m !== null)
    .sort((a, b) => a.nama.localeCompare(b.nama));
}
