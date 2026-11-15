import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import {
  hitungPerubahanPasangan,
  pesanMentorTertahan,
  tentukanMentorTertahan,
  type PasanganKelas,
} from "@/lib/shared/lepasMentorKelas";

/**
 * Pemeriksaan sebelum menyimpan mentor-per-subtes sebuah kelas (PATCH /api/kelola-kelas/[id]).
 * Hanya MEMBACA — dipanggil SEBELUM penulisan apa pun supaya penolakan tidak meninggalkan
 * perubahan setengah jalan.
 *
 * Penjaga lepas mentor: mentor yang dilepas dari sebuah subtes di kelas ini ditahan (409) selama
 * masih tercatat sebagai penerima (enrollment_subtes.mentor_id) siswa kelas ini pada subtes itu.
 * Gagal baca di mana pun = 500 fail-closed.
 */

export type HasilPeriksaMentorKelas =
  | { ok: true; lama: PasanganKelas[]; dilepas: PasanganKelas[]; ditambah: PasanganKelas[] }
  | { ok: false; status: 409 | 500; error: string };

const GAGAL_BACA = "Gagal memeriksa mentor kelas. Coba lagi nanti.";

export async function periksaLepasMentorKelas(kelasId: string, pasanganBaru: PasanganKelas[]): Promise<HasilPeriksaMentorKelas> {
  const lamaRes = await supabaseServer.from("kelas_subtes_mentor").select("subtes_id, mentor_id").eq("kelas_id", kelasId);
  if (lamaRes.error) {
    console.error("[rencanaMentorKelas] query kelas_subtes_mentor failed:", lamaRes.error);
    return { ok: false, status: 500, error: GAGAL_BACA };
  }
  const lama: PasanganKelas[] = ((lamaRes.data ?? []) as { subtes_id: string; mentor_id: string }[]).map((r) => ({
    subtesId: r.subtes_id,
    mentorId: r.mentor_id,
  }));

  const { dilepas, ditambah } = hitungPerubahanPasangan(lama, pasanganBaru);
  if (dilepas.length === 0) return { ok: true, lama, dilepas, ditambah };

  // Siswa kelas ini (SEMUA status — konservatif) lalu pilihan-subtes mereka yang penerimanya mentor yang dilepas.
  const enrollmentRes = await supabaseServer.from("enrollments").select("id").eq("kelas_id", kelasId);
  if (enrollmentRes.error) {
    console.error("[rencanaMentorKelas] query enrollments failed:", enrollmentRes.error);
    return { ok: false, status: 500, error: GAGAL_BACA };
  }
  const enrollmentIds = ((enrollmentRes.data ?? []) as { id: string }[]).map((r) => r.id);
  if (enrollmentIds.length === 0) return { ok: true, lama, dilepas, ditambah };

  const mentorDilepas = Array.from(new Set(dilepas.map((p) => p.mentorId)));
  const subtesDilepas = Array.from(new Set(dilepas.map((p) => p.subtesId)));
  const pemegangRes = await supabaseServer
    .from("enrollment_subtes")
    .select("subtes_id, mentor_id")
    .in("enrollment_id", enrollmentIds)
    .in("mentor_id", mentorDilepas)
    .in("subtes_id", subtesDilepas);
  if (pemegangRes.error) {
    console.error("[rencanaMentorKelas] query enrollment_subtes failed:", pemegangRes.error);
    return { ok: false, status: 500, error: GAGAL_BACA };
  }
  const pemegang: PasanganKelas[] = ((pemegangRes.data ?? []) as { subtes_id: string; mentor_id: string }[]).map((r) => ({
    subtesId: r.subtes_id,
    mentorId: r.mentor_id,
  }));

  // Nama dibaca hanya untuk pesan; bila gagal, tetap ditolak (pakai id sebagai nama cadangan).
  const namaMentor = new Map<string, string>();
  const namaSubtes = new Map<string, string>();
  const adaTertahan = tentukanMentorTertahan(dilepas, pemegang, namaMentor, namaSubtes).length > 0;
  if (!adaTertahan) return { ok: true, lama, dilepas, ditambah };

  const [mentorRes, subtesRes] = await Promise.all([
    supabaseServer.from("users").select("id, nama").in("id", mentorDilepas),
    supabaseServer.from("subtes").select("id, nama").in("id", subtesDilepas),
  ]);
  if (mentorRes.error || subtesRes.error) {
    console.error("[rencanaMentorKelas] query nama failed:", mentorRes.error ?? subtesRes.error);
  } else {
    for (const r of (mentorRes.data ?? []) as { id: string; nama: string }[]) namaMentor.set(r.id, r.nama);
    for (const r of (subtesRes.data ?? []) as { id: string; nama: string }[]) namaSubtes.set(r.id, r.nama);
  }

  const tertahan = tentukanMentorTertahan(dilepas, pemegang, namaMentor, namaSubtes);
  return { ok: false, status: 409, error: pesanMentorTertahan(tertahan) };
}
