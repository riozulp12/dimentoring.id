import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { hitungJarakKm } from "@/lib/shared/haversine";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";

/**
 * Data layer pendaftaran & penugasan mentor MANUAL oleh Admin (PRD 7.5.10).
 * Dipakai app/api/admin/enrollment-manual/**. Peran selalu dibaca dari
 * user_roles di DB (CLAUDE.md: role tidak boleh dari input client).
 */

type Join<T> = T | T[] | null;
function first<T>(value: Join<T> | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/** Role aktif user ini di DB. "gagal" = error DB (sudah di-log). */
export async function hasRoleAktif(userId: string, role: "admin" | "student" | "mentor"): Promise<boolean | "gagal"> {
  const { data, error } = await supabaseServer
    .from("user_roles")
    .select("user_id")
    .eq("user_id", userId)
    .eq("role_type", role)
    .eq("status", "active")
    .maybeSingle();
  if (error) {
    console.error(`[enrollmentManual] query user_roles (${role}) failed:`, error);
    return "gagal";
  }
  return Boolean(data);
}

/**
 * Guard route Admin: session ter-signed DAN role admin masih 'active' di DB
 * (aksi ini membuat pendaftaran lunas tanpa pembayaran — jangan cukup
 * percaya role di cookie yang bisa basi sejak login).
 */
export async function requireAdminAktif(
  cookieValue: string | undefined,
): Promise<{ ok: true; adminId: string } | { ok: false; status: number; error: string }> {
  const session = verifySessionToken(cookieValue);
  if (!session) return { ok: false, status: 401, error: "Belum login." };
  if (session.role !== "admin") return { ok: false, status: 403, error: "Cuma Admin yang bisa melakukan ini." };
  const aktif = await hasRoleAktif(session.userId, "admin");
  if (aktif === "gagal") return { ok: false, status: 500, error: "Gagal memeriksa akun. Coba lagi nanti." };
  if (!aktif) return { ok: false, status: 403, error: "Cuma Admin yang bisa melakukan ini." };
  return { ok: true, adminId: session.userId };
}

export { SESSION_COOKIE_NAME };

export interface SiswaHasilCari {
  id: string;
  nama: string;
  email: string;
}

/** Hapus karakter yang punya arti di filter `or()` PostgREST / pola ilike. */
function bersihkanKataKunci(q: string): string {
  return q.replace(/[,()%*\\:"']/g, " ").replace(/\s+/g, " ").trim();
}

/** Cari siswa (role student 'active') lewat nama atau email, maks. 10 hasil. */
export async function cariSiswaAktif(q: string): Promise<SiswaHasilCari[] | "gagal"> {
  const kata = bersihkanKataKunci(q);
  if (kata.length < 2) return [];
  const pola = `%${kata}%`;
  const { data, error } = await supabaseServer
    .from("users")
    .select("id, nama, email, user_roles!user_roles_user_id_fkey!inner(role_type, status)")
    .eq("user_roles.role_type", "student")
    .eq("user_roles.status", "active")
    .or(`nama.ilike.${pola},email.ilike.${pola}`)
    .order("nama", { ascending: true })
    .limit(10);
  if (error) {
    console.error("[cariSiswaAktif] query users failed:", error);
    return "gagal";
  }
  return ((data ?? []) as unknown as SiswaHasilCari[]).map((row) => ({ id: row.id, nama: row.nama, email: row.email }));
}

export interface MentorOfflineKandidat {
  mentorId: string;
  nama: string;
  asalPtn: string;
  /** null kalau lokasi siswa/mentor tidak diketahui. */
  jarakKm: number | null;
}

interface KandidatRow {
  user_id: string;
  asal_ptn: string;
  lokasi_lat: number | string | null;
  lokasi_lng: number | string | null;
  users: Join<{ nama: string }>;
  mentor_subtes_diampu: { subtes_id: string; subtes: Join<{ mapel_dasar: string | null }> }[] | null;
}

/**
 * Kandidat mentor offline untuk satu Subtes — kriteria SAMA dengan checkout
 * (lib/payment/getOfflineMentorOptions.ts): bisa_offline, role mentor
 * 'active', mengampu Subtes itu (lewat mapel_dasar, fallback subtes_id).
 * Bedanya: lokasi siswa/mentor TIDAK wajib (Admin belum tentu tahu titik
 * GPS siswa) — dipakai cuma untuk mengurutkan berdasar jarak kalau ada.
 */
export async function getMentorOfflineKandidat(
  subtesId: string,
  lokasiSiswa: { lat: number; lng: number } | null,
): Promise<MentorOfflineKandidat[] | "gagal"> {
  const { data: subtes, error: subtesError } = await supabaseServer
    .from("subtes")
    .select("mapel_dasar")
    .eq("id", subtesId)
    .maybeSingle();
  if (subtesError) {
    console.error("[getMentorOfflineKandidat] query subtes failed:", subtesError);
    return "gagal";
  }
  const targetMapelDasar = (subtes?.mapel_dasar as string | null) ?? null;

  const { data: candidates, error: candidatesError } = await supabaseServer
    .from("mentor_profiles")
    .select("user_id, asal_ptn, lokasi_lat, lokasi_lng, users:user_id(nama), mentor_subtes_diampu(subtes_id, subtes:subtes_id(mapel_dasar))")
    .eq("bisa_offline", true);
  if (candidatesError) {
    console.error("[getMentorOfflineKandidat] query mentor_profiles failed:", candidatesError);
    return "gagal";
  }

  const cocok = ((candidates ?? []) as unknown as KandidatRow[]).filter((row) => {
    const diampu = row.mentor_subtes_diampu ?? [];
    if (targetMapelDasar) return diampu.some((r) => first(r.subtes)?.mapel_dasar === targetMapelDasar);
    return diampu.some((r) => r.subtes_id === subtesId);
  });
  if (cocok.length === 0) return [];

  const { data: activeRoles, error: activeRolesError } = await supabaseServer
    .from("user_roles")
    .select("user_id")
    .eq("role_type", "mentor")
    .eq("status", "active")
    .in(
      "user_id",
      cocok.map((row) => row.user_id),
    );
  if (activeRolesError) {
    console.error("[getMentorOfflineKandidat] query user_roles failed:", activeRolesError);
    return "gagal";
  }
  const aktif = new Set((activeRoles ?? []).map((r) => r.user_id as string));

  return cocok
    .filter((row) => aktif.has(row.user_id))
    .map((row) => {
      const punyaLokasi = lokasiSiswa && row.lokasi_lat !== null && row.lokasi_lng !== null;
      return {
        mentorId: row.user_id,
        nama: first(row.users)?.nama ?? "-",
        asalPtn: row.asal_ptn,
        jarakKm: punyaLokasi
          ? hitungJarakKm(lokasiSiswa.lat, lokasiSiswa.lng, Number(row.lokasi_lat), Number(row.lokasi_lng))
          : null,
      };
    })
    .sort((a, b) => {
      if (a.jarakKm === null && b.jarakKm === null) return a.nama.localeCompare(b.nama);
      if (a.jarakKm === null) return 1;
      if (b.jarakKm === null) return -1;
      return a.jarakKm - b.jarakKm;
    });
}

/** Lokasi opsional: dua-duanya kosong -> null; kalau diisi, wajib valid. */
export function parseLokasi(lat: unknown, lng: unknown): { ok: true; value: { lat: number; lng: number } | null } | { ok: false } {
  const kosong = (v: unknown) => v === undefined || v === null || v === "";
  if (kosong(lat) && kosong(lng)) return { ok: true, value: null };
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln) || la < -90 || la > 90 || ln < -180 || ln > 180) return { ok: false };
  return { ok: true, value: { lat: la, lng: ln } };
}
