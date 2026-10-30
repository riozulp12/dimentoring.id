import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { verifySessionToken } from "@/lib/auth/session";
import { getMentorRoleStatus } from "@/lib/mentor/getMentorRoleStatus";
import { urutkanSubtes } from "@/lib/shared/studio-soal/penugasan";
import type { StimulusRingkas } from "@/lib/shared/studio-soal/studioMentor";
import type { FormSoal, FormStimulus } from "@/lib/shared/studio-soal/formSoal";
import type { TipeSoal } from "@/lib/shared/studio-soal/tipe";
import { susunKelengkapan } from "@/lib/shared/studio-soal/kelengkapan";

/**
 * Data layer form Studio Soal (PR 3b) — HANYA BACA. Semua perubahan lewat
 * RPC studio_soal_* (lib/mentor/studioSoalApi.ts). Setiap query soal/stimulus
 * difilter penulis_id = mentor dari session: draf mentor lain tidak pernah
 * terbaca (sama dengan "tidak ada").
 */

export interface SubtesStudio {
  id: string;
  nama: string;
  kategori: string;
}

/** Guard mentor: session ter-signed + role mentor 'active' di DB (BR-27). */
export async function requireMentorAktif(
  cookieValue: string | undefined,
): Promise<{ ok: true; mentorId: string } | { ok: false; status: number; error: string }> {
  const session = verifySessionToken(cookieValue);
  if (!session) return { ok: false, status: 401, error: "Belum login." };
  if (session.role !== "mentor") return { ok: false, status: 403, error: "Cuma Mentor yang bisa menulis soal." };
  if ((await getMentorRoleStatus(session.userId)) !== "active") {
    return { ok: false, status: 403, error: "Studio Soal terkunci selama akun kamu belum aktif." };
  }
  return { ok: true, mentorId: session.userId };
}

/** Subtes yang DITUGASKAN Admin ke mentor ini (studio_soal_penugasan), urut resmi. */
export async function getSubtesDitugaskan(mentorId: string): Promise<SubtesStudio[] | "gagal"> {
  const { data, error } = await supabaseServer
    .from("studio_soal_penugasan")
    .select("subtes_id, subtes:subtes_id(id, nama, kategori)")
    .eq("mentor_id", mentorId);
  if (error) {
    console.error("[studioSoal] query penugasan failed:", error);
    return "gagal";
  }
  type J = { id: string; nama: string; kategori: string };
  const list = (data ?? [])
    .map((row) => {
      const s = row.subtes as unknown as J | J[] | null;
      return Array.isArray(s) ? (s[0] ?? null) : s;
    })
    .filter((s): s is J => s !== null)
    .map((s) => ({ id: s.id, nama: s.nama, kategori: s.kategori }));
  return urutkanSubtes(list);
}

/** Apakah mentor ditugaskan ke subtes ini (dicek ulang di RPC & trigger DB). */
export async function isDitugaskan(mentorId: string, subtesId: string): Promise<SubtesStudio | null | "gagal"> {
  const daftar = await getSubtesDitugaskan(mentorId);
  if (daftar === "gagal") return "gagal";
  return daftar.find((s) => s.id === subtesId) ?? null;
}

/** Nama subtes (untuk tampilan soal di subtes yang penugasannya sudah dicabut). */
export async function getSubtesById(subtesId: string): Promise<SubtesStudio | null | "gagal"> {
  const { data, error } = await supabaseServer.from("subtes").select("id, nama, kategori").eq("id", subtesId).maybeSingle();
  if (error) {
    console.error("[studioSoal] query subtes failed:", error);
    return "gagal";
  }
  return data ? { id: data.id as string, nama: data.nama as string, kategori: data.kategori as string } : null;
}

export interface SoalDetail extends FormSoal {
  id: string;
  status: string;
  versi: number;
  urutan_dalam_stimulus: number | null;
  alasan_tolak: string | null;
  updated_at: string;
}

const KOLOM_SOAL =
  "id, subtes_id, tipe, stimulus_id, urutan_dalam_stimulus, redaksi, konten, kunci, pembahasan, sumber_rujukan, tingkat_kesulitan, level_kognitif, estimasi_waktu_detik, status, versi, alasan_tolak, updated_at";

type Row = Record<string, unknown>;

function keSoalDetail(row: Row): SoalDetail {
  return {
    id: row.id as string,
    subtes_id: row.subtes_id as string,
    tipe: row.tipe as TipeSoal,
    stimulus_id: (row.stimulus_id as string | null) ?? null,
    urutan_dalam_stimulus: (row.urutan_dalam_stimulus as number | null) ?? null,
    redaksi: (row.redaksi as string) ?? "",
    konten: (row.konten as Row) ?? { v: 1 },
    kunci: (row.kunci as Row) ?? { v: 1 },
    pembahasan: (row.pembahasan as string) ?? "",
    sumber_rujukan: (row.sumber_rujukan as string | null) ?? "",
    tingkat_kesulitan: (row.tingkat_kesulitan as string) ?? "",
    level_kognitif: (row.level_kognitif as number | null) ?? null,
    estimasi_waktu_detik: (row.estimasi_waktu_detik as number | null) ?? null,
    status: row.status as string,
    versi: row.versi as number,
    alasan_tolak: (row.alasan_tolak as string | null) ?? null,
    updated_at: row.updated_at as string,
  };
}

/** Soal milik mentor ini; null bila tidak ada ATAU milik mentor lain. */
export async function getSoalMilik(mentorId: string, soalId: string): Promise<SoalDetail | null | "gagal"> {
  const { data, error } = await supabaseServer
    .from("soal_bank")
    .select(KOLOM_SOAL)
    .eq("id", soalId)
    .eq("penulis_id", mentorId)
    .maybeSingle();
  if (error) {
    console.error("[studioSoal] query soal failed:", error);
    return "gagal";
  }
  return data ? keSoalDetail(data as Row) : null;
}

export interface StimulusDetail extends FormStimulus {
  id: string;
  status: string;
  versi: number;
  alasan_tolak: string | null;
  updated_at: string;
}

/** Stimulus milik mentor ini; null bila tidak ada ATAU milik mentor lain. */
export async function getStimulusMilik(mentorId: string, stimulusId: string): Promise<StimulusDetail | null | "gagal"> {
  const { data, error } = await supabaseServer
    .from("soal_stimulus")
    .select("id, subtes_id, judul_internal, konten, sumber_rujukan, status, versi, alasan_tolak, updated_at")
    .eq("id", stimulusId)
    .eq("penulis_id", mentorId)
    .maybeSingle();
  if (error) {
    console.error("[studioSoal] query stimulus failed:", error);
    return "gagal";
  }
  if (!data) return null;
  const konten = data.konten as FormStimulus["konten"] | null;
  return {
    id: data.id as string,
    subtes_id: data.subtes_id as string,
    judul_internal: (data.judul_internal as string) ?? "",
    sumber_rujukan: (data.sumber_rujukan as string) ?? "",
    konten: konten && Array.isArray(konten.blok) ? { v: 1, blok: konten.blok } : { v: 1, blok: [] },
    status: data.status as string,
    versi: data.versi as number,
    alasan_tolak: (data.alasan_tolak as string | null) ?? null,
    updated_at: data.updated_at as string,
  };
}

/** Soal di dalam stimulus (penulisnya pasti sama, K7), tanpa versi lama, urut. */
export async function getSoalDiStimulus(mentorId: string, stimulusId: string): Promise<SoalDetail[] | "gagal"> {
  const { data, error } = await supabaseServer
    .from("soal_bank")
    .select(KOLOM_SOAL)
    .eq("stimulus_id", stimulusId)
    .eq("penulis_id", mentorId)
    .order("urutan_dalam_stimulus", { ascending: true });
  if (error) {
    console.error("[studioSoal] query soal stimulus failed:", error);
    return "gagal";
  }
  return (data ?? [])
    .map((r) => keSoalDetail(r as Row))
    .filter((s) => s.status !== "digantikan")
    .sort((a, b) => (a.urutan_dalam_stimulus ?? 0) - (b.urutan_dalam_stimulus ?? 0));
}

/** Pernah diajukan (ada log 'ajukan') -> tidak bisa dihapus, hanya diarsipkan. */
export async function pernahDiajukan(jenis: "soal" | "stimulus", id: string): Promise<boolean | "gagal"> {
  const { data, error } = await supabaseServer
    .from("soal_tinjauan_log")
    .select("id")
    .eq("objek_jenis", jenis)
    .eq("objek_id", id)
    .eq("aksi", "ajukan")
    .limit(1);
  if (error) {
    console.error("[studioSoal] query log failed:", error);
    return "gagal";
  }
  return (data ?? []).length > 0;
}

/**
 * Id yang pernah dikirim untuk dicek (ada log 'ajukan') dari daftar `ids` —
 * dipakai halaman daftar untuk menjelaskan kenapa draf tidak bisa dihapus.
 */
export async function getIdPernahDiajukan(jenis: "soal" | "stimulus", ids: string[]): Promise<Set<string> | "gagal"> {
  if (ids.length === 0) return new Set();
  const { data, error } = await supabaseServer
    .from("soal_tinjauan_log")
    .select("objek_id")
    .eq("objek_jenis", jenis)
    .eq("aksi", "ajukan")
    .in("objek_id", ids);
  if (error) {
    console.error("[studioSoal] query log daftar failed:", error);
    return "gagal";
  }
  return new Set((data ?? []).map((r) => r.objek_id as string));
}

/** Stimulus tulisan mentor ini (tanpa versi lama) untuk halaman daftar. */
export async function getStimulusMentor(mentorId: string): Promise<StimulusRingkas[] | "gagal"> {
  const [stRes, soalRes] = await Promise.all([
    supabaseServer
      .from("soal_stimulus")
      .select("id, subtes_id, judul_internal, status, versi, updated_at")
      .eq("penulis_id", mentorId)
      .order("updated_at", { ascending: false }),
    supabaseServer.from("soal_bank").select("id, stimulus_id, status").eq("penulis_id", mentorId),
  ]);
  if (stRes.error || soalRes.error) {
    console.error("[studioSoal] query stimulus mentor failed:", stRes.error ?? soalRes.error);
    return "gagal";
  }
  const jumlah = new Map<string, number>();
  for (const s of soalRes.data ?? []) {
    if (!s.stimulus_id || s.status === "digantikan") continue;
    jumlah.set(s.stimulus_id as string, (jumlah.get(s.stimulus_id as string) ?? 0) + 1);
  }
  const tampil = (stRes.data ?? []).filter((s) => s.status !== "digantikan");
  const pernah = await getIdPernahDiajukan(
    "stimulus",
    tampil.filter((s) => s.status === "draf").map((s) => s.id as string),
  );
  if (pernah === "gagal") return "gagal";
  return tampil.map((s) => ({
      id: s.id as string,
      subtesId: s.subtes_id as string,
      judul: (s.judul_internal as string) ?? "",
      status: s.status as string,
      versi: s.versi as number,
      jumlahSoal: jumlah.get(s.id as string) ?? 0,
      updatedAt: s.updated_at as string,
      pernahDiajukan: pernah.has(s.id as string),
    }));
}

/** Batas baca untuk penanda "Belum lengkap" di halaman daftar (draf/ditolak terbaru). */
export const BATAS_CEK_KELENGKAPAN = { soal: 300, bacaan: 100 } as const;

/**
 * Penanda "Belum lengkap" untuk halaman daftar mentor (revisi UX-3 butir 4):
 * peta "soal:<id>" / "bacaan:<id>" -> alasan pertama. Dihitung dengan fungsi
 * validasi yang SAMA dengan API Ajukan (lib/shared/studio-soal/kelengkapan).
 * Hanya draf/ditolak terbaru sampai BATAS_CEK_KELENGKAPAN; sisanya tanpa
 * penanda (server tetap memeriksa saat dikirim). Gagal baca = tanpa penanda,
 * halaman daftar tetap tampil.
 */
export async function getKelengkapanDraf(mentorId: string): Promise<Record<string, string>> {
  const subtes = await getSubtesDitugaskan(mentorId);
  if (subtes === "gagal" || subtes.length === 0) return {};
  const [soalRes, stRes] = await Promise.all([
    supabaseServer
      .from("soal_bank")
      .select(KOLOM_SOAL)
      .eq("penulis_id", mentorId)
      .in("status", ["draf", "ditolak"])
      .order("updated_at", { ascending: false })
      .limit(BATAS_CEK_KELENGKAPAN.soal),
    supabaseServer
      .from("soal_stimulus")
      .select("id, subtes_id, judul_internal, konten, sumber_rujukan, status")
      .eq("penulis_id", mentorId)
      .in("status", ["draf", "ditolak"])
      .order("updated_at", { ascending: false })
      .limit(BATAS_CEK_KELENGKAPAN.bacaan),
  ]);
  if (soalRes.error || stRes.error) {
    console.error("[studioSoal] query kelengkapan failed:", soalRes.error ?? stRes.error);
    return {};
  }
  const soal = (soalRes.data ?? []).map((r) => keSoalDetail(r as Row));
  const bacaan = (stRes.data ?? []).map((r) => {
    const konten = r.konten as FormStimulus["konten"] | null;
    return {
      id: r.id as string,
      subtes_id: r.subtes_id as string,
      judul_internal: (r.judul_internal as string) ?? "",
      sumber_rujukan: (r.sumber_rujukan as string) ?? "",
      konten: konten && Array.isArray(konten.blok) ? { v: 1 as const, blok: konten.blok } : { v: 1 as const, blok: [] },
      status: r.status as string,
    };
  });
  return susunKelengkapan(soal, bacaan, new Map(subtes.map((s) => [s.id, s.kategori])));
}
