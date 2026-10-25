import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, requireAdminAktif } from "@/lib/admin/enrollmentManual";
import { parsePermintaanPenugasan, terjemahkanHasilRpc } from "@/lib/shared/studio-soal/penugasan";

/**
 * Penugasan mentor ke subtes Studio Soal — PR 3a (revisi K2, BR-37).
 *
 * PATCH { mentorId, subtesId, aksi: "tugaskan" | "cabut" }
 *   Hanya Admin aktif (peran dari session + dicek ulang di database). Ubah +
 *   log audit dalam SATU transaksi lewat fungsi DB studio_soal_atur_penugasan
 *   (db/add_studio_soal_penugasan.sql), yang juga memeriksa ulang Admin aktif,
 *   subtes SNBT, dan mentor aktif. Idempotent: penugasan yang sama dua kali
 *   tidak membuat duplikat dan tidak menambah log.
 *
 * Mencabut penugasan tidak menyentuh soal; soal yang sudah ditulis tetap ada
 * dengan status yang sama.
 */
export async function PATCH(request: NextRequest) {
  const auth = await requireAdminAktif(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Body request harus JSON yang valid." }, { status: 400 });
  }

  const permintaan = parsePermintaanPenugasan(body);
  if (!permintaan.ok) return NextResponse.json({ success: false, error: permintaan.error }, { status: 400 });

  const { data, error } = await supabaseServer.rpc("studio_soal_atur_penugasan", {
    p_admin_id: auth.adminId,
    p_mentor_id: permintaan.mentorId,
    p_subtes_id: permintaan.subtesId,
    p_aksi: permintaan.aksi,
  });
  if (error) {
    console.error("[admin/studio-soal/penugasan] studio_soal_atur_penugasan failed:", error);
    return NextResponse.json({ success: false, error: "Gagal menyimpan penugasan. Coba lagi nanti." }, { status: 500 });
  }

  const hasil = (data ?? {}) as { status?: unknown; jumlah_mentor_eligible?: unknown };
  const terjemahan = terjemahkanHasilRpc(hasil.status);
  if (!terjemahan.success) {
    return NextResponse.json({ success: false, error: terjemahan.pesan }, { status: terjemahan.httpStatus });
  }
  return NextResponse.json({
    success: true,
    berubah: terjemahan.berubah,
    pesan: terjemahan.pesan,
    jumlahMentorEligible: typeof hasil.jumlah_mentor_eligible === "number" ? hasil.jumlah_mentor_eligible : null,
  });
}
