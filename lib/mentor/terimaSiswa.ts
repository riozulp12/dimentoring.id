import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { sebelumPemberlakuan, statusPenerimaanSubtes } from "@/lib/shared/penerimaanSiswa";

/**
 * Mentor "Terima siswa" untuk satu subtes seorang siswa (enrollment_subtes) —
 * aturan siapa-cepat-dia-dapat (lib/shared/penerimaanSiswa.ts). BELUM dipanggil
 * dari mana pun (tidak ada UI/route), tidak membuat notifikasi, dan tidak
 * menyentuh sesi_kelas.
 *
 * Klaim ATOMIK: satu UPDATE bersyarat pada penerima yang TERLIHAT saat validasi
 * (compare-and-swap) + RETURNING — bukan baca-lalu-tulis:
 *   - belum ada penerima    → WHERE id = ? AND mentor_id IS NULL
 *   - penerima lama TIDAK aktif / dilepas dari pasangan
 *                           → WHERE id = ? AND mentor_id = <penerima lama itu>
 * Dua mentor menekan bersamaan: Postgres menserialkan UPDATE pada baris yang
 * sama, yang kedua melihat mentor_id sudah berubah dan mengubah 0 baris.
 */

export type AlasanTolakTerima =
  | "sudah_diterima_mentor_lain"
  | "bukan_mentor_subtes"
  | "mentor_tidak_aktif"
  | "tidak_ditemukan"
  /** Siswa mendaftar sebelum tanggal pemberlakuan — perilaku lama, tidak ada klaim. */
  | "pendaftaran_sebelum_pemberlakuan"
  /** Subtes ini <=1 mentor aktif — pemegangnya langsung boleh, tidak ada yang perlu diklaim. */
  | "tidak_perlu_klaim"
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
    .select("kelas_id, tanggal_daftar")
    .eq("id", baris.enrollment_id as string)
    .maybeSingle();
  if (enrollmentError) {
    console.error("[terimaSiswaSubtes] query enrollments failed:", enrollmentError);
    return { ok: false, alasan: "gagal" };
  }
  if (!enrollment) return { ok: false, alasan: "tidak_ditemukan" };

  // Semua pemegang subtes ini di kelas ini, lalu mana yang AKTIF (BR-2: Pending/Rejected tidak mengajar).
  const { data: pemegangRows, error: pemegangError } = await supabaseServer
    .from("kelas_subtes_mentor")
    .select("mentor_id")
    .eq("kelas_id", enrollment.kelas_id as string)
    .eq("subtes_id", baris.subtes_id as string);
  if (pemegangError) {
    console.error("[terimaSiswaSubtes] query kelas_subtes_mentor failed:", pemegangError);
    return { ok: false, alasan: "gagal" };
  }
  const pemegang = Array.from(new Set((pemegangRows ?? []).map((r) => r.mentor_id as string)));

  // Status mentor yang menekan juga dicek (walau bukan pemegang) supaya urutan
  // alasan tetap: tidak aktif → bukan pemegang.
  const idCek = Array.from(new Set([...pemegang, mentorId]));
  const { data: roleRows, error: roleError } = await supabaseServer
    .from("user_roles")
    .select("user_id")
    .in("user_id", idCek)
    .eq("role_type", "mentor")
    .eq("status", "active");
  if (roleError) {
    console.error("[terimaSiswaSubtes] query user_roles failed:", roleError);
    return { ok: false, alasan: "gagal" };
  }
  const aktifSemua = new Set((roleRows ?? []).map((r) => r.user_id as string));
  if (!aktifSemua.has(mentorId)) return { ok: false, alasan: "mentor_tidak_aktif" };
  if (!pemegang.includes(mentorId)) return { ok: false, alasan: "bukan_mentor_subtes" };

  const penerimaLama = (baris.mentor_id as string | null) ?? null;

  // Idempoten: sudah milik mentor ini → sukses tanpa menulis apa pun.
  if (penerimaLama === mentorId) return { ok: true, sudahMilikSendiri: true };

  if (sebelumPemberlakuan(enrollment.tanggal_daftar as string | null)) {
    return { ok: false, alasan: "pendaftaran_sebelum_pemberlakuan" };
  }
  const mentorAktifSubtes = pemegang.filter((id) => aktifSemua.has(id));
  const status = statusPenerimaanSubtes({
    mentorIdPenerima: penerimaLama,
    mentorAktifSubtes,
    tanggalDaftar: enrollment.tanggal_daftar as string | null,
  });
  if (status === "tidak_perlu_klaim") return { ok: false, alasan: "tidak_perlu_klaim" };
  if (status === "diterima") return { ok: false, alasan: "sudah_diterima_mentor_lain" };

  // status === "menunggu": penerima NULL, atau penerima lama sudah tidak aktif / dilepas dari pasangan.
  const klaim = supabaseServer
    .from("enrollment_subtes")
    .update({ mentor_id: mentorId, diterima_pada: new Date().toISOString() })
    .eq("id", enrollmentSubtesId);
  const { data: diklaim, error: klaimError } = await (penerimaLama === null
    ? klaim.is("mentor_id", null)
    : klaim.eq("mentor_id", penerimaLama)
  ).select("id");
  if (klaimError) {
    console.error("[terimaSiswaSubtes] klaim enrollment_subtes failed:", klaimError);
    return { ok: false, alasan: "gagal" };
  }
  if (diklaim && diklaim.length > 0) {
    // Penerima BERGANTI (bukan klaim pertama): link Meet yang diisi penerima lama tidak boleh dipakai
    // siswa dengan mentor baru. Hanya link milik penerima lama yang dikosongkan (link Admin dibiarkan).
    // Klaim sudah sah — kegagalan reset hanya di-log (link itu pun sudah tidak berlaku lewat resolveLinkMeet).
    if (penerimaLama !== null) {
      const { error: resetError } = await supabaseServer
        .from("enrollments")
        .update({ link_meet: null, link_meet_oleh: null })
        .eq("id", baris.enrollment_id as string)
        .eq("link_meet_oleh", penerimaLama);
      if (resetError) console.error("[terimaSiswaSubtes] reset link_meet gagal:", resetError);
    }
    return { ok: true };
  }

  // 0 baris berubah: penerima berubah sejak validasi. Baca ulang untuk membedakan
  // "milik saya (tekan dua kali)" dari "diambil mentor lain".
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
