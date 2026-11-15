import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { getMentorRoleStatus } from "@/lib/mentor/getMentorRoleStatus";

/**
 * Mentor "Terima siswa" untuk satu subtes seorang siswa (enrollment_subtes) —
 * aturan siapa-cepat-dia-dapat (lib/shared/penerimaanSiswa.ts). TAHAP A: fungsi
 * ini BELUM dipanggil dari mana pun (tidak ada UI/route), tidak membuat
 * notifikasi, dan tidak menyentuh sesi_kelas.
 *
 * Klaim ATOMIK: satu UPDATE bersyarat `WHERE id = ? AND mentor_id IS NULL ...
 * RETURNING` — bukan baca-lalu-tulis. Dua mentor menekan bersamaan: Postgres
 * menserialkan UPDATE pada baris yang sama, yang kedua melihat mentor_id sudah
 * terisi dan mengubah 0 baris.
 */

export type AlasanTolakTerima =
  | "sudah_diterima_mentor_lain"
  | "bukan_mentor_subtes"
  | "mentor_tidak_aktif"
  | "tidak_ditemukan"
  | "gagal";

export type HasilTerimaSiswa =
  | { ok: true; sudahMilikSendiri?: boolean }
  | { ok: false; alasan: AlasanTolakTerima };

export async function terimaSiswaSubtes(input: { mentorId: string; enrollmentSubtesId: string }): Promise<HasilTerimaSiswa> {
  const { mentorId, enrollmentSubtesId } = input;
  if (!mentorId || !enrollmentSubtesId) return { ok: false, alasan: "tidak_ditemukan" };

  const { data: baris, error: barisError } = await supabaseServer
    .from("enrollment_subtes")
    .select("id, enrollment_id, subtes_id, mentor_id")
    .eq("id", enrollmentSubtesId)
    .maybeSingle();
  if (barisError) {
    console.error("[terimaSiswaSubtes] query enrollment_subtes failed:", barisError);
    return { ok: false, alasan: "gagal" };
  }
  if (!baris) return { ok: false, alasan: "tidak_ditemukan" };

  const { data: enrollment, error: enrollmentError } = await supabaseServer
    .from("enrollments")
    .select("kelas_id")
    .eq("id", baris.enrollment_id as string)
    .maybeSingle();
  if (enrollmentError) {
    console.error("[terimaSiswaSubtes] query enrollments failed:", enrollmentError);
    return { ok: false, alasan: "gagal" };
  }
  if (!enrollment) return { ok: false, alasan: "tidak_ditemukan" };

  // Mentor harus aktif (BR-2: Pending/Rejected tidak boleh mengajar).
  if ((await getMentorRoleStatus(mentorId)) !== "active") return { ok: false, alasan: "mentor_tidak_aktif" };

  // Mentor harus pemegang subtes ini DI KELAS ini (kelas_subtes_mentor).
  const { data: pasangan, error: pasanganError } = await supabaseServer
    .from("kelas_subtes_mentor")
    .select("mentor_id")
    .eq("kelas_id", enrollment.kelas_id as string)
    .eq("subtes_id", baris.subtes_id as string)
    .eq("mentor_id", mentorId)
    .maybeSingle();
  if (pasanganError) {
    console.error("[terimaSiswaSubtes] query kelas_subtes_mentor failed:", pasanganError);
    return { ok: false, alasan: "gagal" };
  }
  if (!pasangan) return { ok: false, alasan: "bukan_mentor_subtes" };

  // Klaim atomik. `.is("mentor_id", null)` = bagian WHERE yang membuat ini aman dari balapan.
  const { data: diklaim, error: klaimError } = await supabaseServer
    .from("enrollment_subtes")
    .update({ mentor_id: mentorId, diterima_pada: new Date().toISOString() })
    .eq("id", enrollmentSubtesId)
    .is("mentor_id", null)
    .select("id");
  if (klaimError) {
    console.error("[terimaSiswaSubtes] klaim enrollment_subtes failed:", klaimError);
    return { ok: false, alasan: "gagal" };
  }
  if (diklaim && diklaim.length > 0) return { ok: true };

  // 0 baris berubah: sudah ada penerima. Baca ulang untuk membedakan "milik saya
  // (tekan dua kali)" dari "diambil mentor lain".
  const { data: kini, error: kiniError } = await supabaseServer
    .from("enrollment_subtes")
    .select("mentor_id")
    .eq("id", enrollmentSubtesId)
    .maybeSingle();
  if (kiniError) {
    console.error("[terimaSiswaSubtes] baca ulang enrollment_subtes failed:", kiniError);
    return { ok: false, alasan: "gagal" };
  }
  if (!kini) return { ok: false, alasan: "tidak_ditemukan" };
  if (kini.mentor_id === mentorId) return { ok: true, sudahMilikSendiri: true };
  return { ok: false, alasan: "sudah_diterima_mentor_lain" };
}
