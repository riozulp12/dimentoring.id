import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { notifyMentorOfflineDitugaskanAdmin } from "@/lib/notifikasi/notify";
import { validateAlasan } from "@/lib/shared/enrollmentManual";
import {
  SESSION_COOKIE_NAME,
  getMentorOfflineKandidat,
  parseLokasi,
  requireAdminAktif,
} from "@/lib/admin/enrollmentManual";
import { getKelasSubtesOptions } from "@/lib/payment/getKelasForCheckout";

/**
 * Mentor tatap muka per enrollment — PRD 7.5.10.
 * GET   : kandidat mentor untuk satu kelas offline (form Daftarkan Siswa
 *         Manual & aksi Ubah Mentor). lat/lng opsional (cuma urutan jarak).
 * PATCH : ganti enrollments.mentor_offline_id satu siswa, alasan wajib.
 *         Update + log dalam SATU transaksi (fungsi DB
 *         ubah_mentor_offline_manual). Mentor baru langsung dikenali
 *         lib/mentor/aksesMentor.ts (akses "offline"); mentor lama
 *         kehilangan akses ke siswa ini, sesi yang sudah ia tandai tetap
 *         tercatat atas namanya.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminAktif(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

  const params = request.nextUrl.searchParams;
  const kelasId = params.get("kelasId") ?? "";
  if (!kelasId) return NextResponse.json({ success: false, error: "Kelas tidak valid." }, { status: 400 });
  const lokasi = parseLokasi(params.get("lat"), params.get("lng"));
  if (!lokasi.ok) return NextResponse.json({ success: false, error: "Koordinat tidak valid." }, { status: 400 });

  const subtesId = (await getKelasSubtesOptions(kelasId))[0]?.id;
  if (!subtesId) return NextResponse.json({ success: true, mentor: [] });

  const kandidat = await getMentorOfflineKandidat(subtesId, lokasi.value);
  if (kandidat === "gagal") {
    return NextResponse.json({ success: false, error: "Gagal memuat mentor. Coba lagi nanti." }, { status: 500 });
  }
  return NextResponse.json({ success: true, mentor: kandidat });
}

interface UbahMentorBody {
  enrollmentId?: unknown;
  mentorOfflineId?: unknown;
  alasan?: unknown;
}

type UbahHasil =
  | { status: "diubah"; mentor_lama: string | null; kelas_id: string; siswa_id: string }
  | { status: "tidak_ditemukan" | "bukan_offline" | "belum_lunas" | "sama" | "mentor_tidak_valid" };

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdminAktif(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!auth.ok) return errorResponse(auth.error, auth.status);

  let body: UbahMentorBody;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Body request harus JSON yang valid.", 400);
  }

  const enrollmentId = typeof body.enrollmentId === "string" ? body.enrollmentId : "";
  const mentorId = typeof body.mentorOfflineId === "string" ? body.mentorOfflineId : "";
  if (!enrollmentId) return errorResponse("Pendaftar tidak valid.", 400);
  if (!mentorId) return errorResponse("Pilih mentor tatap muka.", 400);
  const alasanError = validateAlasan(body.alasan);
  if (alasanError) return errorResponse(alasanError, 400);
  const alasan = (body.alasan as string).trim();

  const { data: enrollment, error: enrollmentError } = await supabaseServer
    .from("enrollments")
    .select("id, kelas_id, kelas:kelas_id(nama, mode_pembelajaran)")
    .eq("id", enrollmentId)
    .maybeSingle();
  if (enrollmentError) {
    console.error("[admin/mentor-offline PATCH] query enrollment failed:", enrollmentError);
    return errorResponse("Gagal memuat pendaftar. Coba lagi nanti.", 500);
  }
  if (!enrollment) return errorResponse("Pendaftar tidak ditemukan.", 404);
  type KelasJoin = { nama: string; mode_pembelajaran: string };
  const kelasRaw = enrollment.kelas as unknown as KelasJoin | KelasJoin[] | null;
  const kelas = Array.isArray(kelasRaw) ? (kelasRaw[0] ?? null) : kelasRaw;
  if (kelas?.mode_pembelajaran !== "offline") {
    return errorResponse("Mentor per siswa cuma berlaku untuk kelas offline. Mentor kelas online diatur di Kelola Kelas.", 409);
  }

  // Kriteria sama dengan checkout: aktif, bisa_offline, mengampu mapel kelas.
  const subtesId = (await getKelasSubtesOptions(enrollment.kelas_id as string))[0]?.id;
  if (!subtesId) return errorResponse("Kelas offline ini belum punya Subtes. Atur dulu di Kelola Kelas.", 400);
  const kandidat = await getMentorOfflineKandidat(subtesId, null);
  if (kandidat === "gagal") return errorResponse("Gagal memeriksa mentor. Coba lagi nanti.", 500);
  if (!kandidat.some((m) => m.mentorId === mentorId)) {
    return errorResponse("Mentor yang dipilih tidak aktif, tidak bersedia tatap muka, atau tidak mengampu mapel kelas ini.", 400);
  }

  const { data: hasilRaw, error: rpcError } = await supabaseServer.rpc("ubah_mentor_offline_manual", {
    p_admin_id: auth.adminId,
    p_enrollment_id: enrollmentId,
    p_mentor_baru: mentorId,
    p_alasan: alasan,
  });
  if (rpcError) {
    console.error("[admin/mentor-offline PATCH] ubah_mentor_offline_manual failed:", rpcError);
    return errorResponse("Gagal menyimpan mentor. Tidak ada perubahan — coba lagi.", 500);
  }

  const hasil = hasilRaw as UbahHasil | null;
  switch (hasil?.status) {
    case "diubah":
      break;
    case "tidak_ditemukan":
      return errorResponse("Pendaftar tidak ditemukan.", 404);
    case "bukan_offline":
      return errorResponse("Mentor per siswa cuma berlaku untuk kelas offline.", 409);
    case "belum_lunas":
      return errorResponse("Mentor bisa diubah setelah pendaftaran lunas.", 409);
    case "sama":
      return errorResponse("Mentor itu sudah menjadi mentor siswa ini.", 409);
    case "mentor_tidak_valid":
      return errorResponse("Mentor yang dipilih tidak aktif atau tidak bersedia tatap muka.", 400);
    default:
      console.error("[admin/mentor-offline PATCH] hasil RPC tidak dikenal:", hasilRaw);
      return errorResponse("Gagal menyimpan mentor. Coba lagi nanti.", 500);
  }

  await notifyMentorOfflineDitugaskanAdmin(mentorId, enrollment.kelas_id as string, kelas.nama);

  const mentor = kandidat.find((m) => m.mentorId === mentorId);
  return NextResponse.json({ success: true, mentorOffline: { id: mentorId, nama: mentor?.nama ?? "-" } });
}
