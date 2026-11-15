import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { formatNamaMentor, tentukanMentorKelas, type MentorRef } from "@/lib/shared/namaMentor";

/**
 * SATU-SATUNYA pintu "nama mentor kelas" untuk tampilan siswa (Kelas Saya,
 * detail kelas siswa). Membaca kelas_subtes_mentor + kelas_mentor, hanya mentor
 * AKTIF (user_roles: role mentor, status active), dengan fallback ke
 * kelas.mentor_id (kolom lama) bila kedua tabel tidak punya baris untuk kelas
 * itu — aturannya di lib/shared/namaMentor.ts. Satu kali query untuk banyak
 * kelas (tanpa N+1). Galat DB tidak melempar: dicatat, hasilnya "tanpa nama".
 */

export interface KelasUntukNamaMentor {
  id: string;
  /** kelas.mentor_id (kolom lama) — hanya dipakai sebagai fallback. */
  mentorIdLama: string | null;
}

type RelasiRow = { kelas_id: string; mentor_id: string };

/** id kelas → teks nama mentor siap tampil ("A, B +2 lainnya"), null bila tidak ada. */
export async function getNamaMentorKelas(kelasList: KelasUntukNamaMentor[]): Promise<Map<string, string | null>> {
  const hasil = new Map<string, string | null>();
  if (kelasList.length === 0) return hasil;
  for (const kelas of kelasList) hasil.set(kelas.id, null);

  const kelasIds = kelasList.map((kelas) => kelas.id);

  const [pasanganRes, umumRes] = await Promise.all([
    supabaseServer.from("kelas_subtes_mentor").select("kelas_id, mentor_id").in("kelas_id", kelasIds),
    supabaseServer.from("kelas_mentor").select("kelas_id, mentor_id").in("kelas_id", kelasIds),
  ]);
  if (pasanganRes.error || umumRes.error) {
    console.error("[getNamaMentorKelas] query relasi mentor gagal:", pasanganRes.error ?? umumRes.error);
    return hasil;
  }

  const pasanganRows = (pasanganRes.data ?? []) as unknown as RelasiRow[];
  const umumRows = (umumRes.data ?? []) as unknown as RelasiRow[];

  const mentorIds = new Set<string>();
  for (const row of [...pasanganRows, ...umumRows]) mentorIds.add(row.mentor_id);
  for (const kelas of kelasList) if (kelas.mentorIdLama) mentorIds.add(kelas.mentorIdLama);
  if (mentorIds.size === 0) return hasil;

  const idList = Array.from(mentorIds);
  const [usersRes, rolesRes] = await Promise.all([
    supabaseServer.from("users").select("id, nama").in("id", idList),
    supabaseServer.from("user_roles").select("user_id").eq("role_type", "mentor").eq("status", "active").in("user_id", idList),
  ]);
  if (usersRes.error || rolesRes.error) {
    console.error("[getNamaMentorKelas] query nama/status mentor gagal:", usersRes.error ?? rolesRes.error);
    return hasil;
  }

  const namaById = new Map<string, string>();
  for (const user of (usersRes.data ?? []) as unknown as { id: string; nama: string | null }[]) {
    namaById.set(user.id, user.nama ?? "");
  }
  const aktifIds = new Set(((rolesRes.data ?? []) as unknown as { user_id: string }[]).map((row) => row.user_id));

  const ref = (id: string): MentorRef => ({ id, nama: namaById.get(id) ?? "" });
  const perKelas = (rows: RelasiRow[], kelasId: string) =>
    rows.filter((row) => row.kelas_id === kelasId).map((row) => ref(row.mentor_id));

  for (const kelas of kelasList) {
    const mentor = tentukanMentorKelas({
      pasangan: perKelas(pasanganRows, kelas.id),
      umum: perKelas(umumRows, kelas.id),
      lama: kelas.mentorIdLama ? ref(kelas.mentorIdLama) : null,
      aktifIds,
    });
    hasil.set(kelas.id, formatNamaMentor(mentor.map((m) => m.nama)));
  }
  return hasil;
}
