import "server-only";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Validasi body request Tambah/Edit Kelas — dipakai bersama oleh
 * app/api/kelola-kelas/route.ts (POST) dan
 * app/api/kelola-kelas/[kelasId]/route.ts (PATCH) supaya aturan sama persis
 * di kedua jalur, tidak duplikasi logic.
 */

const VALID_TINGKAT_KELAS = ["kelas_10", "kelas_11", "kelas_12", "gap_year"];
const VALID_TIPE_KELAS = ["private", "semi_private", "grouping"];
const VALID_HARI = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
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
  tingkatKelas?: string;
  tipeKelas?: string;
  subtesId?: string;
  mentorId?: string | null;
  kapasitas?: number | string;
  harga?: number | string;
  jadwalEntries?: JadwalEntryInput[];
  linkMeet?: string;
  deskripsi?: string;
}

export interface ValidatedKelasInput {
  nama: string;
  tingkat_kelas: string;
  tipe_kelas: string;
  subtes_id: string;
  mentor_id: string | null;
  kapasitas: number;
  harga: number;
  /** Array {hari, jam_mulai} — bisa lebih dari satu slot per minggu, null kalau belum diisi. */
  jadwal: { hari: string; jam_mulai: string }[] | null;
  link_meet: string | null;
  deskripsi: string | null;
}

export type ValidateKelasResult =
  | { ok: true; data: ValidatedKelasInput }
  | { ok: false; error: string };

export async function validateKelasInput(body: KelasInputBody): Promise<ValidateKelasResult> {
  const nama = typeof body.nama === "string" ? body.nama.trim() : "";
  if (!nama) return { ok: false, error: "Nama kelas wajib diisi." };

  if (!body.tingkatKelas || !VALID_TINGKAT_KELAS.includes(body.tingkatKelas)) {
    return { ok: false, error: "Tingkat kelas tidak valid." };
  }
  if (!body.tipeKelas || !VALID_TIPE_KELAS.includes(body.tipeKelas)) {
    return { ok: false, error: "Tipe kelas tidak valid." };
  }
  if (!body.subtesId || typeof body.subtesId !== "string") {
    return { ok: false, error: "Subtes wajib dipilih." };
  }

  const { data: subtes, error: subtesError } = await supabaseServer
    .from("subtes")
    .select("id")
    .eq("id", body.subtesId)
    .maybeSingle();
  if (subtesError) {
    console.error("[validateKelasInput] query subtes failed:", subtesError);
    return { ok: false, error: "Gagal memvalidasi subtes. Coba lagi nanti." };
  }
  if (!subtes) return { ok: false, error: "Subtes tidak ditemukan." };

  const kapasitas = Number(body.kapasitas);
  if (!Number.isInteger(kapasitas) || kapasitas <= 0) {
    return { ok: false, error: "Kapasitas harus angka bulat lebih dari 0." };
  }

  const harga = Number(body.harga);
  if (!Number.isFinite(harga) || harga < 0) {
    return { ok: false, error: "Harga tidak valid." };
  }

  let mentorId: string | null = null;
  if (body.mentorId) {
    const { data: mentorRole, error: mentorRoleError } = await supabaseServer
      .from("user_roles")
      .select("user_id")
      .eq("user_id", body.mentorId)
      .eq("role_type", "mentor")
      .eq("status", "active")
      .maybeSingle();
    if (mentorRoleError) {
      console.error("[validateKelasInput] query mentor role failed:", mentorRoleError);
      return { ok: false, error: "Gagal memvalidasi mentor. Coba lagi nanti." };
    }
    if (!mentorRole) {
      return { ok: false, error: "Mentor tidak ditemukan atau belum aktif." };
    }

    const { data: profile, error: profileError } = await supabaseServer
      .from("mentor_profiles")
      .select("mentor_subtes_diampu(subtes_id)")
      .eq("user_id", body.mentorId)
      .maybeSingle();
    if (profileError) {
      console.error("[validateKelasInput] query mentor_profiles failed:", profileError);
      return { ok: false, error: "Gagal memvalidasi subtes mentor. Coba lagi nanti." };
    }
    const subtesIds = (profile?.mentor_subtes_diampu ?? []).map((r: { subtes_id: string }) => r.subtes_id);
    if (!subtesIds.includes(body.subtesId)) {
      return { ok: false, error: "Mentor ini tidak mengampu subtes yang dipilih." };
    }
    mentorId = body.mentorId;
  }

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

  const deskripsi = typeof body.deskripsi === "string" && body.deskripsi.trim() ? body.deskripsi.trim() : null;

  return {
    ok: true,
    data: {
      nama,
      tingkat_kelas: body.tingkatKelas,
      tipe_kelas: body.tipeKelas,
      subtes_id: body.subtesId,
      mentor_id: mentorId,
      kapasitas,
      harga,
      jadwal,
      link_meet: linkMeet,
      deskripsi,
    },
  };
}
