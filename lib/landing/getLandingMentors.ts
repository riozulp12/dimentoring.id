import "server-only";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Section Mentor (landing page) — PRD Bagian 4.3 #6, direvisi September
 * 2026: BUKAN lagi otomatis dari semua mentor role_type='mentor' status
 * 'active' + avatar_url, sekarang kurasi manual Admin lewat
 * mentor_profiles.tampil_di_landing/foto_landing_url (Bagian 13, BARU) —
 * lihat components/admin/MentorLandingFotoSection.tsx.
 *
 * Kalau kandidat (tampil_di_landing=true DAN foto_landing_url terisi) lebih
 * dari MAX_MENTORS, diacak (bukan diurutkan tetap) supaya bervariasi tiap
 * refresh — dilakukan di JS (Fisher-Yates), bukan ORDER BY RANDOM() di
 * PostgREST (tidak ada dukungan native untuk itu lewat client Supabase JS).
 * Halaman ini sudah dynamic per-request (app/page.tsx pakai cookies()),
 * jadi query ini otomatis re-run tiap refresh, tidak ke-cache.
 *
 * Section disembunyikan TOTAL kalau kandidat kosong (bukan threshold
 * minimum seperti sebelumnya) — lihat components/sections/Mentor.tsx.
 */
const MAX_MENTORS = 9;

export interface LandingMentorItem {
  id: string;
  nama: string;
  fotoLandingUrl: string;
  asalPtn: string | null;
  jurusan: string | null;
  /** Subtes paling relevan (pertama dari mentor_subtes_diampu) untuk badge kecil di card. */
  subtesUtama: string | null;
}

function firstOrNull<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

interface SubtesJoin {
  nama: string;
}

interface UserJoin {
  id: string;
  nama: string;
}

interface Row {
  id: string;
  asal_ptn: string;
  jurusan: string;
  foto_landing_url: string;
  user: UserJoin | UserJoin[] | null;
  mentor_subtes_diampu: { subtes: SubtesJoin | SubtesJoin[] | null }[] | null;
}

/** Fisher-Yates — shuffle in-place, dipakai murni saat kandidat > MAX_MENTORS. */
function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export async function getLandingMentors(): Promise<LandingMentorItem[]> {
  const { data, error } = await supabaseServer
    .from("mentor_profiles")
    .select(
      `id, asal_ptn, jurusan, foto_landing_url,
       user:user_id(id, nama),
       mentor_subtes_diampu(subtes:subtes_id(nama))`,
    )
    .eq("tampil_di_landing", true)
    .not("foto_landing_url", "is", null);

  if (error) {
    console.error("[getLandingMentors] query failed:", JSON.stringify(error, null, 2));
    return [];
  }

  const mentors = ((data ?? []) as unknown as Row[])
    .map((row): LandingMentorItem | null => {
      const user = firstOrNull(row.user);
      if (!user) return null;

      const subtesNama = (row.mentor_subtes_diampu ?? [])
        .map((r) => firstOrNull(r.subtes)?.nama)
        .filter((nama): nama is string => Boolean(nama));

      return {
        id: user.id,
        nama: user.nama,
        fotoLandingUrl: row.foto_landing_url,
        asalPtn: row.asal_ptn ?? null,
        jurusan: row.jurusan ?? null,
        subtesUtama: subtesNama[0] ?? null,
      };
    })
    .filter((item): item is LandingMentorItem => item !== null);

  if (mentors.length === 0) return [];
  if (mentors.length > MAX_MENTORS) return shuffle(mentors).slice(0, MAX_MENTORS);
  return mentors;
}
