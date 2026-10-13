import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { notifyJadwalDitetapkan } from "@/lib/notifikasi/notify";
import { formatSlot, isJadwalPilihanAktif, parseJadwalSlot, parseJadwalSlots, slotKey } from "@/lib/shared/jadwalPilihan";

/**
 * Tetapkan jadwal akhir satu pendaftar — PRD 7.5.8 (Admin, halaman Pendaftar
 * di Kelola Kelas). Slot WAJIB salah satu slot kelas.jadwal saat ini (bukan
 * harus salah satu pilihan siswa — pilihan siswa cuma preferensi).
 */

function errorResponse(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ kelasId: string; enrollmentId: string }> },
) {
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return errorResponse("Belum login.", 401);
  if (session.role !== "admin") {
    return errorResponse("Cuma Admin yang bisa menetapkan jadwal.", 403);
  }

  const { kelasId, enrollmentId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Body request harus JSON yang valid.", 400);
  }
  const requested = parseJadwalSlot((body as { slot?: unknown } | null)?.slot);
  if (!requested) return errorResponse("Pilih jadwal yang akan ditetapkan.", 400);

  const { data: kelas, error: kelasError } = await supabaseServer
    .from("kelas")
    .select("id, nama, jadwal, jadwal_pilih_siswa, mode_pembelajaran")
    .eq("id", kelasId)
    .maybeSingle();
  if (kelasError) {
    console.error("[pendaftar/jadwal] query kelas failed:", kelasError);
    return errorResponse("Gagal memuat kelas. Coba lagi nanti.", 500);
  }
  if (!kelas) return errorResponse("Kelas tidak ditemukan.", 404);

  const aktif = isJadwalPilihanAktif({
    jadwalPilihSiswa: kelas.jadwal_pilih_siswa === true,
    modePembelajaran: kelas.mode_pembelajaran as string,
    jadwal: kelas.jadwal,
  });
  if (!aktif) {
    return errorResponse("Kelas ini tidak memakai pilihan jadwal oleh siswa.", 409);
  }

  // Salinan dari kelas.jadwal, bukan objek mentah dari body.
  const slot = parseJadwalSlots(kelas.jadwal).find((s) => slotKey(s) === slotKey(requested));
  if (!slot) return errorResponse("Jadwal yang dipilih tidak ada di kelas ini.", 400);

  const { data: updated, error: updateError } = await supabaseServer
    .from("enrollments")
    .update({ jadwal_ditetapkan: slot, jadwal_ditetapkan_at: new Date().toISOString() })
    .eq("id", enrollmentId)
    .eq("kelas_id", kelasId)
    .eq("status_pembayaran", "lunas")
    .select("user_id, jadwal_ditetapkan_at")
    .maybeSingle();
  if (updateError) {
    console.error("[pendaftar/jadwal] update enrollments failed:", updateError);
    return errorResponse("Gagal menyimpan jadwal. Coba lagi nanti.", 500);
  }
  if (!updated) {
    return errorResponse("Pendaftar tidak ditemukan atau pembayarannya belum lunas.", 404);
  }

  await notifyJadwalDitetapkan(updated.user_id as string, kelasId, kelas.nama as string, formatSlot(slot));

  return NextResponse.json({ success: true, slot, ditetapkanAt: updated.jadwal_ditetapkan_at });
}
