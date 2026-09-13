import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { PROGRAM_KATEGORI_ORDER } from "@/lib/shared/kelasLabels";

/**
 * Validasi body request Tambah/Edit Kelas — dipakai bersama oleh
 * app/api/kelola-kelas/route.ts (POST) dan
 * app/api/kelola-kelas/[kelasId]/route.ts (PATCH) supaya aturan sama persis
 * di kedua jalur, tidak duplikasi logic.
 */

const VALID_TINGKAT_KELAS = ["kelas_10", "kelas_11", "kelas_12", "gap_year"];
const VALID_TIPE_KELAS = ["private", "semi_private", "grouping"];
const VALID_HARI = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
const VALID_PROGRAM_KATEGORI: readonly string[] = PROGRAM_KATEGORI_ORDER;
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export interface JadwalEntryInput {
  hari?: string;
  jamMulai?: string;
}

export interface KelasInputBody {
  nama?: string;
  programKategori?: string;
  tingkatKelas?: string;
  tipeKelas?: string;
  subtesId?: string | null;
  /** Multi-select — boleh lebih dari satu mentor per kelas (kelas_mentor). */
  mentorIds?: string[];
  kapasitas?: number | string;
  harga?: number | string;
  jadwalEntries?: JadwalEntryInput[];
  linkMeet?: string;
  linkLynkid?: string;
  deskripsi?: string;
}

export interface ValidatedKelasInput {
  nama: string;
  program_kategori: string;
  tingkat_kelas: string;
  tipe_kelas: string;
  subtes_id: string | null;
  /** DEPRECATED, dipertahankan untuk kompatibilitas lama — diisi mentor
   * PERTAMA yang dipilih. Sumber utama tetap kelas_mentor (mentorIds). */
  mentor_id: string | null;
  /** Dipakai caller (route POST/PATCH) untuk replace penuh baris kelas_mentor. */
  mentor_ids: string[];
  kapasitas: number;
  harga: number;
  /** Array {hari, jam_mulai} — bisa lebih dari satu slot per minggu, null kalau belum diisi. */
  jadwal: { hari: string; jam_mulai: string }[] | null;
  link_meet: string | null;
  /** SEMENTARA (PRD 7.5) — link produk Lynk.id, dipakai selama Payment
   * otomatis belum aktif (NEXT_PUBLIC_PENDAFTARAN_MANUAL). */
  link_lynkid: string | null;
  deskripsi: string | null;
}

export type ValidateKelasResult =
  | { ok: true; data: ValidatedKelasInput }
  | { ok: false; error: string };

export async function validateKelasInput(body: KelasInputBody): Promise<ValidateKelasResult> {
  const nama = typeof body.nama === "string" ? body.nama.trim() : "";
  if (!nama) return { ok: false, error: "Nama kelas wajib diisi." };

  if (!body.programKategori || !VALID_PROGRAM_KATEGORI.includes(body.programKategori)) {
    return { ok: false, error: "Kategori Program wajib dipilih." };
  }
  if (!body.tingkatKelas || !VALID_TINGKAT_KELAS.includes(body.tingkatKelas)) {
    return { ok: false, error: "Tingkat kelas tidak valid." };
  }
  if (!body.tipeKelas || !VALID_TIPE_KELAS.includes(body.tipeKelas)) {
    return { ok: false, error: "Tipe kelas tidak valid." };
  }

  // Subtes OPSIONAL (PRD 7.5.4) — Konsultasi & Pendampingan Mahasiswa tidak
  // selalu terikat mapel. Kalau diisi, tetap divalidasi eksis di DB.
  const subtesId = typeof body.subtesId === "string" && body.subtesId ? body.subtesId : null;
  let subtesMapelDasar: string | null = null;
  if (subtesId) {
    const { data: subtes, error: subtesError } = await supabaseServer
      .from("subtes")
      .select("id, mapel_dasar")
      .eq("id", subtesId)
      .maybeSingle();
    if (subtesError) {
      console.error("[validateKelasInput] query subtes failed:", subtesError);
      return { ok: false, error: "Gagal memvalidasi subtes. Coba lagi nanti." };
    }
    if (!subtes) return { ok: false, error: "Subtes tidak ditemukan." };
    subtesMapelDasar = subtes.mapel_dasar;
  }

  const kapasitas = Number(body.kapasitas);
  if (!Number.isInteger(kapasitas) || kapasitas <= 0) {
    return { ok: false, error: "Kapasitas harus angka bulat lebih dari 0." };
  }

  const harga = Number(body.harga);
  if (!Number.isFinite(harga) || harga < 0) {
    return { ok: false, error: "Harga tidak valid." };
  }

  const mentorIds = Array.isArray(body.mentorIds)
    ? Array.from(new Set(body.mentorIds.filter((id): id is string => typeof id === "string" && id.length > 0)))
    : [];

  for (const candidateMentorId of mentorIds) {
    const { data: mentorRole, error: mentorRoleError } = await supabaseServer
      .from("user_roles")
      .select("user_id")
      .eq("user_id", candidateMentorId)
      .eq("role_type", "mentor")
      .eq("status", "active")
      .maybeSingle();
    if (mentorRoleError) {
      console.error("[validateKelasInput] query mentor role failed:", mentorRoleError);
      return { ok: false, error: "Gagal memvalidasi mentor. Coba lagi nanti." };
    }
    if (!mentorRole) {
      return { ok: false, error: "Salah satu mentor yang dipilih tidak ditemukan atau belum aktif." };
    }

    // Cross-check "mentor mengampu subtes ini" cuma relevan kalau Subtes
    // diisi — kelas tanpa subtes (Konsultasi/Pendampingan Mahasiswa) bisa
    // diampu mentor mana pun yang aktif. Cocok lewat mapel_dasar (mapel
    // serumpun) kalau subtes ini sudah dikelompokkan; fallback ke subtes_id
    // persis sama kalau belum (mapel_dasar NULL) — harus SAMA dengan logic
    // filter di client (KelolaKelasForm.tsx) supaya tidak saling menolak.
    if (subtesId) {
      const { data: profile, error: profileError } = await supabaseServer
        .from("mentor_profiles")
        .select("mentor_subtes_diampu(subtes_id, subtes:subtes_id(mapel_dasar))")
        .eq("user_id", candidateMentorId)
        .maybeSingle();
      if (profileError) {
        console.error("[validateKelasInput] query mentor_profiles failed:", profileError);
        return { ok: false, error: "Gagal memvalidasi subtes mentor. Coba lagi nanti." };
      }
      const diampu = (profile?.mentor_subtes_diampu ?? []) as {
        subtes_id: string;
        subtes: { mapel_dasar: string | null } | { mapel_dasar: string | null }[] | null;
      }[];
      const cocok = subtesMapelDasar
        ? diampu.some((r) => {
            const s = Array.isArray(r.subtes) ? (r.subtes[0] ?? null) : r.subtes;
            return s?.mapel_dasar === subtesMapelDasar;
          })
        : diampu.some((r) => r.subtes_id === subtesId);
      if (!cocok) {
        return { ok: false, error: "Salah satu mentor yang dipilih tidak mengampu subtes yang dipilih." };
      }
    }
  }

  // kelas.mentor_id (kolom lama, DEPRECATED) diisi mentor PERTAMA yang dipilih
  // demi kompatibilitas kode lama — kelas_mentor tetap sumber utama.
  const mentorId = mentorIds[0] ?? null;

  let jadwal: { hari: string; jam_mulai: string }[] | null = null;
  if (Array.isArray(body.jadwalEntries) && body.jadwalEntries.length > 0) {
    const cleaned: { hari: string; jam_mulai: string }[] = [];
    for (const entry of body.jadwalEntries) {
      const hari = typeof entry?.hari === "string" ? entry.hari.trim() : "";
      const jamMulai = typeof entry?.jamMulai === "string" ? entry.jamMulai.trim() : "";
      if (!VALID_HARI.includes(hari)) {
        return { ok: false, error: "Hari jadwal tidak valid." };
      }
      if (!TIME_REGEX.test(jamMulai)) {
        return { ok: false, error: "Jam jadwal tidak valid." };
      }
      cleaned.push({ hari, jam_mulai: jamMulai });
    }
    jadwal = cleaned;
  }

  let linkMeet: string | null = null;
  if (typeof body.linkMeet === "string" && body.linkMeet.trim()) {
    const trimmed = body.linkMeet.trim();
    if (!isValidUrl(trimmed)) {
      return { ok: false, error: "Link Meet harus berupa URL yang valid." };
    }
    linkMeet = trimmed;
  }

  let linkLynkid: string | null = null;
  if (typeof body.linkLynkid === "string" && body.linkLynkid.trim()) {
    const trimmed = body.linkLynkid.trim();
    if (!isValidUrl(trimmed)) {
      return { ok: false, error: "Link Lynk.id harus berupa URL yang valid." };
    }
    linkLynkid = trimmed;
  }

  const deskripsi = typeof body.deskripsi === "string" && body.deskripsi.trim() ? body.deskripsi.trim() : null;

  return {
    ok: true,
    data: {
      nama,
      program_kategori: body.programKategori,
      tingkat_kelas: body.tingkatKelas,
      tipe_kelas: body.tipeKelas,
      subtes_id: subtesId,
      mentor_id: mentorId,
      mentor_ids: mentorIds,
      kapasitas,
      harga,
      jadwal,
      link_meet: linkMeet,
      link_lynkid: linkLynkid,
      deskripsi,
    },
  };
}
