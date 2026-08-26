import "server-only";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Helper INSERT notifikasi — dipanggil dari route yang memicu kejadian nyata
 * (PRD Bagian 8 BR-2/BR-31, Bagian 13: tabel `notifikasi`), bukan diinsert
 * langsung dari tiap route supaya bentuk baris konsisten di satu tempat.
 */

export type NotifikasiTipe = "approval_mentor" | "materi_baru" | "konten_review" | "sistem";

interface NotifikasiInsertRow {
  user_id: string;
  tipe: NotifikasiTipe;
  judul: string;
  pesan?: string | null;
  link_tujuan?: string | null;
}

async function insertNotifikasi(rows: NotifikasiInsertRow[]) {
  if (rows.length === 0) return;
  const { error } = await supabaseServer.from("notifikasi").insert(rows);
  if (error) {
    // Kegagalan insert notifikasi TIDAK BOLEH menggagalkan aksi utama (approve
    // mentor, publish materi, dst.) — cukup log, caller tetap lanjut.
    console.error("[notifikasi] insert failed:", error);
  }
}

/** 2a: Approval Mentor — PRD 8 BR-2 ("Mentor menerima notifikasi approval"). */
export async function notifyApprovalMentor(
  mentorUserId: string,
  approved: boolean,
  alasanTolak: string | null,
) {
  await insertNotifikasi([
    {
      user_id: mentorUserId,
      tipe: "approval_mentor",
      judul: approved ? "Akun Mentor kamu disetujui!" : "Pengajuan Mentor kamu ditolak",
      pesan: approved ? null : alasanTolak,
      link_tujuan: approved ? "/dashboard/mentor" : null,
    },
  ]);
}

/** 2b: Materi Baru Published — notif ke semua siswa dengan enrollment
 * 'lunas' di kelas tsb. Dipanggil dari app/api/materi/route.ts (upload
 * manual, langsung published) dan app/api/review-konten/route.ts (Setujui
 * materi AI-generated). Skala masih kecil — tidak ada batching/optimasi
 * khusus untuk kelas dengan siswa sangat banyak. */
export async function notifyMateriBaruPublished(kelasId: string, materiJudul: string) {
  const { data: enrollments, error } = await supabaseServer
    .from("enrollments")
    .select("user_id")
    .eq("kelas_id", kelasId)
    .eq("status_pembayaran", "lunas");

  if (error) {
    console.error("[notifikasi] query enrollments (materi_baru) failed:", error);
    return;
  }

  const rows: NotifikasiInsertRow[] = (enrollments ?? []).map((row) => ({
    user_id: row.user_id as string,
    tipe: "materi_baru",
    judul: `Materi baru: ${materiJudul}`,
    link_tujuan: `/kelas/${kelasId}`,
  }));

  await insertNotifikasi(rows);
}

/** 2d: Payment Berhasil — PRD Bagian 8 BR-6, dipanggil dari
 * app/api/payment/webhook/route.ts tepat setelah enrollments diupsert 'lunas'. */
export async function notifyPembayaranBerhasil(userId: string, kelasId: string, kelasNama: string) {
  await insertNotifikasi([
    {
      user_id: userId,
      tipe: "sistem",
      judul: "Pembayaran berhasil!",
      pesan: `Kelas ${kelasNama} sudah bisa diakses`,
      link_tujuan: `/kelas/${kelasId}`,
    },
  ]);
}

/**
 * 2c: Konten Menunggu Review — notif ke semua Mentor berstatus Active yang
 * Subtes yang Diampu-nya cocok dengan subtes_id konten baru (soal_ai/materi
 * yang baru masuk status 'draft'). Cuma Mentor Active yang relevan — Mentor
 * Pending tidak bisa buka /review-konten sama sekali (BR-27).
 *
 * CATATAN: belum ada endpoint generate soal/materi AI di codebase ini
 * (fitur AI Pembuat Soal/Materi, PRD Bagian 7.7, belum dibangun) — belum ada
 * pemanggil nyata untuk fungsi ini. Panggil `notifyMentorsKontenMenungguReview`
 * dari endpoint tsb begitu dibuat, tepat setelah INSERT baris soal_ai/materi
 * baru berstatus 'draft'.
 */
export async function notifyMentorsKontenMenungguReview(subtesId: string | null) {
  if (!subtesId) return; // tidak bisa cocokkan mentor tanpa subtes_id konten

  const { data: mentorSubtesRows, error: mentorSubtesError } = await supabaseServer
    .from("mentor_subtes_diampu")
    .select("mentor_profiles:mentor_profile_id(user_id)")
    .eq("subtes_id", subtesId);

  if (mentorSubtesError) {
    console.error("[notifikasi] query mentor_subtes_diampu (konten_review) failed:", mentorSubtesError);
    return;
  }

  type ProfileJoin = { user_id: string } | { user_id: string }[] | null;
  const candidateUserIds = Array.from(
    new Set(
      ((mentorSubtesRows ?? []) as unknown as { mentor_profiles: ProfileJoin }[])
        .map((row) => (Array.isArray(row.mentor_profiles) ? row.mentor_profiles[0] : row.mentor_profiles))
        .filter((p): p is { user_id: string } => Boolean(p))
        .map((p) => p.user_id),
    ),
  );

  if (candidateUserIds.length === 0) return;

  const { data: activeRoleRows, error: activeRoleError } = await supabaseServer
    .from("user_roles")
    .select("user_id")
    .eq("role_type", "mentor")
    .eq("status", "active")
    .in("user_id", candidateUserIds);

  if (activeRoleError) {
    console.error("[notifikasi] query user_roles (konten_review) failed:", activeRoleError);
    return;
  }

  const rows: NotifikasiInsertRow[] = (activeRoleRows ?? []).map((row) => ({
    user_id: row.user_id as string,
    tipe: "konten_review",
    judul: "Ada konten baru menunggu review",
    link_tujuan: "/review-konten",
  }));

  await insertNotifikasi(rows);
}
