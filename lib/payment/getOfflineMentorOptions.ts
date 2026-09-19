import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { hitungJarakKm } from "@/lib/shared/haversine";

/**
 * Matching Mentor Offline terdekat — PRD instruksi fitur "Mentor Tatap Muka
 * (Offline)". Dipanggil dari app/api/payment/offline-mentors/route.ts
 * (checkout, tampilkan pilihan ke siswa) DAN app/api/payment/create/route.ts
 * (re-validasi server-side sebelum simpan payment — JANGAN percaya mentorId
 * pilihan siswa dari body mentah-mentah, sama prinsipnya dengan subtesIds).
 *
 * Kriteria kandidat: mentor_profiles.bisa_offline=true, sudah isi lokasi
 * (lokasi_lat/lng), role mentor berstatus 'active' (Pending belum boleh
 * menerima siswa — BR-2), dan mengampu Subtes yang dicari. Cocok lewat
 * mapel_dasar (mapel serumpun) kalau Subtes itu sudah dikelompokkan, fallback
 * ke subtes_id persis sama kalau belum — SAMA dengan logic di
 * lib/admin/validateKelasInput.ts (kelas_subtes_mentor), supaya "siapa
 * mengampu apa" konsisten di seluruh aplikasi.
 */

export interface OfflineMentorOption {
  mentorId: string;
  nama: string;
  asalPtn: string;
  jarakKm: number;
}

interface DiampuJoinRow {
  subtes_id: string;
  subtes: { mapel_dasar: string | null } | { mapel_dasar: string | null }[] | null;
}

interface CandidateRow {
  user_id: string;
  asal_ptn: string;
  lokasi_lat: number | string | null;
  lokasi_lng: number | string | null;
  users: { nama: string } | { nama: string }[] | null;
  mentor_subtes_diampu: DiampuJoinRow[] | null;
}

function firstOrNull<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function getOfflineMentorOptions(
  subtesId: string,
  studentLat: number,
  studentLng: number,
): Promise<OfflineMentorOption[]> {
  const { data: subtes, error: subtesError } = await supabaseServer
    .from("subtes")
    .select("mapel_dasar")
    .eq("id", subtesId)
    .maybeSingle();
  if (subtesError) {
    console.error("[getOfflineMentorOptions] query subtes failed:", subtesError);
    return [];
  }
  const targetMapelDasar = (subtes?.mapel_dasar as string | null) ?? null;

  const { data: candidates, error: candidatesError } = await supabaseServer
    .from("mentor_profiles")
    .select(
      "user_id, asal_ptn, lokasi_lat, lokasi_lng, users:user_id(nama), mentor_subtes_diampu(subtes_id, subtes:subtes_id(mapel_dasar))",
    )
    .eq("bisa_offline", true)
    .not("lokasi_lat", "is", null)
    .not("lokasi_lng", "is", null);

  if (candidatesError) {
    console.error("[getOfflineMentorOptions] query mentor_profiles failed:", candidatesError);
    return [];
  }

  const rows = (candidates ?? []) as unknown as CandidateRow[];
  const cocok = rows.filter((row) => {
    const diampu = row.mentor_subtes_diampu ?? [];
    if (targetMapelDasar) {
      return diampu.some((r) => firstOrNull(r.subtes)?.mapel_dasar === targetMapelDasar);
    }
    return diampu.some((r) => r.subtes_id === subtesId);
  });

  if (cocok.length === 0) return [];

  const candidateUserIds = cocok.map((row) => row.user_id);
  const { data: activeRoles, error: activeRolesError } = await supabaseServer
    .from("user_roles")
    .select("user_id")
    .eq("role_type", "mentor")
    .eq("status", "active")
    .in("user_id", candidateUserIds);

  if (activeRolesError) {
    console.error("[getOfflineMentorOptions] query user_roles failed:", activeRolesError);
    return [];
  }
  const activeUserIds = new Set((activeRoles ?? []).map((r) => r.user_id as string));

  return cocok
    .filter((row) => activeUserIds.has(row.user_id))
    .map((row) => ({
      mentorId: row.user_id,
      nama: firstOrNull(row.users)?.nama ?? "-",
      asalPtn: row.asal_ptn,
      jarakKm: hitungJarakKm(studentLat, studentLng, Number(row.lokasi_lat), Number(row.lokasi_lng)),
    }))
    .sort((a, b) => a.jarakKm - b.jarakKm);
}
